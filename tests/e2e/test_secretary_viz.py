"""Browser tests for the hiring simulation on the secretary problem posts.

A large run is a chain of zero-delay timers, so these tests wrap
``setTimeout`` before the page's own scripts load and wait until no timer is
left pending. That lets every scheduled batch run out without sleeping, and
does not depend on how the simulation tracks its own state.

The page adds one result by itself when it loads, so each test presses Reset
first.
"""
import pytest

from test_smoke import offline_page  # noqa: F401  (fixture re-export)

pytestmark = pytest.mark.e2e

POST_PATHS = ['/blog/secretary-problem-hiring', '/blog/secretary-problem-interview']

TRACK_TIMERS = """
(() => {
    const pending = new Set();
    const realSetTimeout = window.setTimeout.bind(window);
    const realClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => {
        const id = realSetTimeout(() => {
            pending.delete(id);
            fn(...args);
        }, delay);
        pending.add(id);
        return id;
    };
    window.clearTimeout = (id) => {
        pending.delete(id);
        realClearTimeout(id);
    };
    window.__pendingTimers = pending;
})();
"""

# Scores for one scripted simulation of 50 candidates. The first 18 are the
# look-see phase (best score 0.50). Candidates 19 to 24 are interviewed and do
# not beat it, candidate 25 does and is chosen, and 26 to 50 are never reached.
SCRIPTED_SCORES = [0.50] + [0.30] * 17 + [0.10] * 6 + [0.90] + [0.20] * 25


def open_simulation(offline_page, app_server, path=POST_PATHS[0]):
    page, errors = offline_page
    page.add_init_script(TRACK_TIMERS)
    response = page.goto(app_server + path, wait_until='load')
    assert response.status == 200
    page.wait_for_selector('#secretary-problem-viz #reset')
    wait_for_timers(page)
    page.click('#reset')
    wait_for_timers(page)
    assert results_recorded(page) == 0
    return page, errors


def wait_for_timers(page):
    """Let every pending timer run out."""
    page.wait_for_function('window.__pendingTimers.size === 0', timeout=60_000)


def results_recorded(page):
    return page.evaluate('window.secretaryViz.results.length')


def count_shown(page):
    return page.locator('[data-stat="simulations-run"]').inner_text()


@pytest.mark.parametrize('path', POST_PATHS)
def test_second_press_during_a_large_run_is_ignored(offline_page, app_server, path):
    page, errors = open_simulation(offline_page, app_server, path)

    # The first press runs one batch and schedules the rest, so the second
    # press lands while the run is going.
    in_flight = page.evaluate("""() => {
        document.getElementById('run-100000').click();
        document.getElementById('run-100000').click();
        return window.__pendingTimers.size;
    }""")
    assert in_flight > 0, 'expected the large run to still be going'
    wait_for_timers(page)

    assert results_recorded(page) == 100_000
    assert count_shown(page) == '100,000'
    assert errors == []


def test_run_buttons_are_off_while_a_run_is_going(offline_page, app_server):
    page, errors = open_simulation(offline_page, app_server)
    run_buttons = ['run-single', 'run-100', 'run-1000', 'run-10000', 'run-100000']

    during = page.evaluate("""(ids) => {
        document.getElementById('run-100000').click();
        const disabled = ids.map((id) => document.getElementById(id).disabled);
        // Presses on every run button during the run must change nothing.
        ids.forEach((id) => document.getElementById(id).click());
        return {disabled, resetDisabled: document.getElementById('reset').disabled};
    }""", run_buttons)
    assert during['disabled'] == [True] * len(run_buttons)
    assert during['resetDisabled'] is False
    wait_for_timers(page)

    assert results_recorded(page) == 100_000
    after = page.evaluate(
        '(ids) => ids.map((id) => document.getElementById(id).disabled)', run_buttons)
    assert after == [False] * len(run_buttons)
    # The buttons work again once the run is over.
    page.click('#run-100')
    wait_for_timers(page)
    assert results_recorded(page) == 100_100
    assert errors == []


def test_reset_stops_a_running_simulation(offline_page, app_server):
    page, errors = open_simulation(offline_page, app_server)

    rising = page.evaluate("""async () => {
        document.getElementById('run-100000').click();
        const first = window.secretaryViz.results.length;
        // Give the run one more turn so the count is seen to rise.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const second = window.secretaryViz.results.length;
        document.getElementById('reset').click();
        return {first, second, afterReset: window.secretaryViz.results.length};
    }""")
    assert 0 < rising['first'] < rising['second'] < 100_000
    assert rising['afterReset'] == 0
    wait_for_timers(page)

    assert results_recorded(page) == 0
    assert count_shown(page) == '0'
    # Nothing is left to add to the count, and the buttons are live again.
    assert page.evaluate('window.__pendingTimers.size') == 0
    page.click('#run-100')
    wait_for_timers(page)
    assert results_recorded(page) == 100
    assert count_shown(page) == '100'
    assert errors == []


def test_count_updates_in_place_during_a_run_started_from_zero(offline_page, app_server):
    page, errors = open_simulation(offline_page, app_server)

    shown = page.evaluate("""() => {
        document.getElementById('run-100000').click();
        const text = (name) => document.querySelector(`[data-stat="${name}"]`).textContent.trim();
        return {
            simulations: text('simulations-run'),
            candidates: text('total-candidates'),
        };
    }""")
    # After the first batch the running count is on the count, not on a
    # neighbouring figure.
    assert shown == {'simulations': '1,000', 'candidates': '50'}
    wait_for_timers(page)
    assert count_shown(page) == '100,000'
    assert errors == []


def test_passed_over_candidates_are_drawn_apart_from_never_seen(offline_page, app_server):
    page, errors = open_simulation(offline_page, app_server)
    assert len(SCRIPTED_SCORES) == 50

    page.evaluate("""(scores) => {
        const realRandom = Math.random;
        let next = 0;
        Math.random = () => scores[next++];
        try {
            document.getElementById('run-single').click();
        } finally {
            Math.random = realRandom;
        }
    }""", SCRIPTED_SCORES)
    wait_for_timers(page)

    cards = page.evaluate("""() => [...document.querySelectorAll('.candidate-card')].map((card) => {
        const bar = card.querySelector('.candidate-bar');
        const style = getComputedStyle(bar);
        return {
            status: card.dataset.status,
            background: style.backgroundColor,
            border: style.borderTopColor,
            title: bar.title,
        };
    })""")
    statuses = [card['status'] for card in cards]
    assert statuses == (['explored'] * 18 + ['passed_over'] * 6
                        + ['selected'] + ['not_seen'] * 25)

    def looks(status):
        return {(card['background'], card['border'])
                for card in cards if card['status'] == status}

    # Each group is drawn one way, and the interviewed-but-passed-over group
    # does not look like the candidates who were never reached.
    assert len(looks('passed_over')) == 1
    assert len(looks('not_seen')) == 1
    assert looks('passed_over').isdisjoint(looks('not_seen'))
    assert looks('passed_over').isdisjoint(looks('explored'))
    assert looks('passed_over').isdisjoint(looks('selected'))
    assert 'passed over' in cards[18]['title']
    assert 'not seen' in cards[49]['title']
    assert errors == []
