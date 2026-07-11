"""Browser smoke tests: key pages render without console errors.

External CDN requests (Tailwind, Font Awesome, Google Fonts) are stubbed
with empty responses so the suite is fast, deterministic, and offline;
the assertions check DOM structure and that inline scripts ran cleanly,
not pixel-perfect styling.
"""
from pathlib import Path

import pytest

pytestmark = pytest.mark.e2e

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

STUB_CONTENT_TYPES = {
    'stylesheet': 'text/css',
    'script': 'application/javascript',
    'font': 'font/woff2',
    'image': 'image/png',
}


def first_post_slug():
    posts = sorted((PROJECT_ROOT / 'content' / 'blog').glob('*.md'))
    assert posts, 'expected posts in content/blog'
    return posts[0].stem


def smoke_paths():
    return ['/', '/blog', f'/blog/{first_post_slug()}', '/resume']


@pytest.fixture
def offline_page(page, app_server):
    """A page that stubs all non-local requests and records console errors."""
    errors = []
    page.on('console',
            lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.on('pageerror', lambda exc: errors.append(str(exc)))

    def handle(route):
        if route.request.url.startswith(app_server):
            route.continue_()
        else:
            content_type = STUB_CONTENT_TYPES.get(
                route.request.resource_type, 'text/plain')
            route.fulfill(status=200, content_type=content_type, body='')

    page.route('**/*', handle)
    return page, errors


@pytest.mark.parametrize('path', smoke_paths())
def test_page_renders_without_console_errors(offline_page, app_server, path):
    page, errors = offline_page

    response = page.goto(app_server + path, wait_until='load')

    assert response.status == 200
    assert page.title(), f'{path} has an empty <title>'
    # Layout basics: nav, main content, and footer are all present and non-empty.
    assert page.locator('nav').first.is_visible()
    assert page.evaluate("document.querySelector('main').innerText.trim().length") > 0
    assert page.locator('footer').first.is_visible()
    assert page.evaluate('document.body.scrollHeight') > 400
    # The footer year is set by inline JS, so this proves scripts executed.
    assert page.locator('#footer-year').inner_text().isdigit()
    assert errors == [], f'console errors on {path}: {errors}'


@pytest.mark.parametrize(
    ('path', 'prepare'),
    [
        ('/study/constraint-satisfaction',
         "document.querySelector('input[name=csp-domains][value=c]').click()"),
        ('/study/bayesian-networks',
         "document.querySelector('input[type=number]').value='24'"),
        ('/study/bayes-nash-equilibrium',
         "document.querySelectorAll('.matrix-input').forEach((el, i) => "
         "el.value=['3,(2,0)','2,(2,3)','2,(1,0)','1,(1,3)',"
         "'0,(0,2)','1,(0,1)','1,(3,2)','2,(3,1)'][i])"),
        ('/study/first-order-logic',
         "document.querySelectorAll('.exercise select')[0].value='a-fol'; "
         "document.querySelectorAll('.exercise select')[1].value='a-cnf'"),
    ],
)
def test_study_tool_checks_answers_without_external_requests(
        page, app_server, path, prepare):
    errors = []
    external_requests = []
    page.on('console',
            lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.on('request', lambda request: external_requests.append(request.url)
            if not request.url.startswith(app_server) else None)

    response = page.goto(app_server + path, wait_until='load')
    assert response.status == 200
    page.evaluate(prepare)
    page.locator('.exercise button[type=submit]').first.click()

    assert page.locator('.exercise .feedback.correct').first.is_visible()
    assert 'Correct.' in page.locator('.exercise .feedback.correct').first.inner_text()
    assert external_requests == []
    assert errors == []
