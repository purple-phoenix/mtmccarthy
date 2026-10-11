"""Browser smoke test for the /travel map and gallery.

OpenStreetMap tile requests (and CDNs) are stubbed like the other e2e tests,
so this exercises the vendored Leaflet, the trip cards, and the lightbox
without any network access.
"""
import pytest

from test_smoke import offline_page  # noqa: F401  (fixture re-export)

pytestmark = pytest.mark.e2e


@pytest.mark.parametrize('width', [390, 1440])
def test_travel_gallery_opens_from_card_and_closes_with_escape(offline_page, app_server, width):
    page, errors = offline_page
    page.set_viewport_size({'width': width, 'height': 900})

    response = page.goto(app_server + '/travel', wait_until='load')
    assert response.status == 200

    # Vendored Leaflet initialised: markers exist and the map is at least 60vh tall on phones.
    page.wait_for_selector('.leaflet-marker-icon')
    assert page.locator('.leaflet-marker-icon').count() >= 2
    map_height = page.evaluate("document.getElementById('travel-map').getBoundingClientRect().height")
    assert map_height >= 0.6 * 900 - 1
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')

    gallery = page.locator('.travel-gallery')
    assert gallery.count() == 0 or not gallery.is_visible()

    first_card = page.locator('[data-trip]').first
    slug = first_card.get_attribute('data-trip')
    first_card.click()

    dialog = page.locator('.travel-gallery[role="dialog"]')
    assert dialog.is_visible()
    assert page.locator('#travel-gallery-title').inner_text().strip()
    assert page.locator('.travel-gallery-stage img').get_attribute('src').endswith('.webp')
    assert page.locator('.travel-gallery-thumbs button').count() >= 1
    assert page.evaluate('location.hash') == f'#{slug}'

    page.keyboard.press('ArrowRight')
    assert page.locator('.travel-gallery-counter').inner_text().startswith('2 /')

    page.keyboard.press('Escape')
    assert not dialog.is_visible()
    assert page.evaluate('location.hash') == ''
    assert errors == [], f'console errors: {errors}'


def test_travel_deep_link_opens_gallery(offline_page, app_server):
    page, errors = offline_page
    page.goto(app_server + '/travel#lisbon-2025', wait_until='load')
    dialog = page.locator('.travel-gallery[role="dialog"]')
    dialog.wait_for(state='visible')
    assert 'Lisbon' in page.locator('#travel-gallery-title').inner_text()
    page.locator('.travel-gallery-close').click()
    assert not dialog.is_visible()
    assert errors == []
