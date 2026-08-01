"""Discovery, metadata, ordering, and publication-safety checks for AstroAI series."""
import json
from pathlib import Path

import app as site


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SERIES_SLUG = 'astroai-building-for-trust'
SERIES_PATH = f'/blog/series/{SERIES_SLUG}'


def test_astroai_series_has_all_five_posts_in_editorial_order():
    series = site.get_blog_series(SERIES_SLUG)

    assert series is not None
    assert [post['slug'] for post in series['posts']] == series['post_slugs']
    assert len(series['posts']) == 5
    assert [post['date'].strftime('%Y-%m-%d') for post in series['posts']] == [
        '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01'
    ]


def test_series_is_discoverable_from_home_blog_and_sitemap(client):
    for path in ('/', '/blog'):
        html = client.get(path).get_data(as_text=True)
        assert SERIES_PATH in html
        assert 'Building AstroAI for Trust and User Value' in html

    sitemap = client.get('/sitemap.xml').get_data(as_text=True)
    assert f'https://mattmccarthy.dev{SERIES_PATH}' in sitemap
    assert '<lastmod>2026-08-01</lastmod>' in sitemap


def test_series_hub_has_canonical_social_metadata_and_structured_list(client):
    html = client.get(SERIES_PATH).get_data(as_text=True)

    assert '<title>Building AstroAI for Trust and User Value - Matt McCarthy</title>' in html
    assert f'<link rel="canonical" href="https://mattmccarthy.dev{SERIES_PATH}">' in html
    assert '<meta property="og:title" content="Building AstroAI for Trust and User Value - Matt McCarthy">' in html
    assert '<meta name="twitter:description" content="How I approached trust, delivery evidence, human-reviewed content, product valuation, and beta-first growth while building AstroAI.">' in html

    marker = '<script type="application/ld+json">'
    blocks = html.split(marker)[1:]
    payloads = [json.loads(block.split('</script>', 1)[0]) for block in blocks]
    collection = next(item for item in payloads if item.get('@type') == 'CollectionPage')
    assert [item['position'] for item in collection['mainEntity']['itemListElement']] == [1, 2, 3, 4, 5]


def test_every_series_post_links_to_hub_and_adjacent_part(client):
    series = site.get_blog_series(SERIES_SLUG)

    for index, post in enumerate(series['posts']):
        html = client.get(f"/blog/{post['slug']}").get_data(as_text=True)
        assert SERIES_PATH in html
        assert f'Part {index + 1} of 5' in html
        if index > 0:
            assert f"/blog/{series['posts'][index - 1]['slug']}" in html
        if index < 4:
            assert f"/blog/{series['posts'][index + 1]['slug']}" in html
        assert '"isPartOf":' in html


def test_every_series_post_has_canonical_and_social_metadata(client):
    series = site.get_blog_series(SERIES_SLUG)

    for post in series['posts']:
        path = f"/blog/{post['slug']}"
        html = client.get(path).get_data(as_text=True)
        title = f"{post['title']} - Matt McCarthy"
        assert f'<title>{title}</title>' in html
        assert f'<link rel="canonical" href="https://mattmccarthy.dev{path}">' in html
        assert f'<meta property="og:title" content="{title}">' in html
        assert f'<meta property="og:description" content="{post["excerpt"]}">' in html
        assert f'<meta name="twitter:description" content="{post["excerpt"]}">' in html
        assert '<meta property="og:type" content="article">' in html


def test_series_sources_do_not_contain_private_publication_details():
    slugs = site.BLOG_SERIES[SERIES_SLUG]['post_slugs'] + ['ai-brand-image-feedback-loop']
    text = '\n'.join(
        (PROJECT_ROOT / 'content' / 'blog' / f'{slug}.md').read_text(encoding='utf-8')
        for slug in slugs
    )
    forbidden = (
        '127.0.0.1', 'localhost', '/Users/', '192.168.', '10.0.', '100.',
        'feedback.json', 'OpenClaw', 'Karl', 'tailnet', 'API key',
    )
    for token in forbidden:
        assert token not in text
