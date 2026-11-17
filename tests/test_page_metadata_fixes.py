"""Visitor recovery and share metadata regressions, using real content."""
import re
from html.parser import HTMLParser

import pytest
import app as site


class HeadAndLinks(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.meta = {}
        self.links = set()
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            self.meta[attrs.get('name') or attrs.get('property')] = attrs.get('content')
        if tag == 'a':
            self.links.add(attrs.get('href'))


@pytest.mark.parametrize('path', [
    '/missing-page', '/blog/missing-post', '/projects/missing-project',
    '/blog/category/missing-category', '/blog/series/missing-series',
    '/study/missing-tool',
])
def test_not_found_recovers_with_links_and_noindex(client, path):
    response = client.get(path)
    assert response.status_code == 404
    html = response.get_data(as_text=True)
    parsed = HeadAndLinks(html)
    assert 'Page not found' in html
    assert parsed.meta.get('robots') == 'noindex'
    assert {'/', '/blog', '/projects'} <= parsed.links
    assert '/static/css/main.css' in html


def test_real_post_read_times_are_plain_numbers():
    posts = site.load_blog_posts()
    assert posts
    for post in posts:
        assert re.fullmatch(r'[0-9]+', str(post['read_time'])), post['slug']


def test_read_time_renders_once_in_post_card_and_series(client, monkeypatch):
    slug = 'turning-ai-exam-tutors-into-study-tools'
    monkeypatch.setitem(site.BLOG_SERIES, 'read-time-regression', {
        'title': 'Read time regression', 'description': 'Test series',
        'eyebrow': 'Test series', 'post_slugs': [slug],
    })
    for path in [f'/blog/{slug}', '/blog', '/blog/series/read-time-regression']:
        response = client.get(path)
        assert response.status_code == 200
        html = response.get_data(as_text=True)
        assert '7 min read' in html
        assert 'min read min read' not in html


@pytest.mark.parametrize(('image', 'expected_image', 'card'), [
    ('/static/images/personal-website-feature.png', '/static/images/personal-website-feature.png', 'summary_large_image'),
    (None, '/static/images/profile.jpg', 'summary'),
    ('/static/images/example.SVG', '/static/images/profile.jpg', 'summary'),
    ('https://example.com/project.png', 'https://example.com/project.png', 'summary_large_image'),
])
def test_project_share_image_and_card(client, monkeypatch, image, expected_image, card):
    project = dict(site.load_projects()[0], image_url=image, related=[])
    monkeypatch.setattr(site, 'load_projects', lambda: [project])
    response = client.get('/projects/' + project['slug'])
    assert response.status_code == 200
    meta = HeadAndLinks(response.get_data(as_text=True)).meta
    expected = expected_image if expected_image.startswith('http') else site.SITE_URL + expected_image
    assert meta['og:image'] == expected
    assert meta['twitter:image'] == expected
    assert meta['twitter:card'] == card
