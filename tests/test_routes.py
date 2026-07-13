"""Status codes for the public pages, using the real content/ directory.

These assert that known pages work; they deliberately do not enumerate the
full route inventory, so new routes (sitemap, feeds, ...) can land freely.
"""
import json

import pytest

from conftest import PROJECT_ROOT

PUBLIC_PAGES = [
    '/',
    '/about',
    '/blog',
    '/projects',
    '/resume',
    '/chess',
    '/jiu-jitsu',
    '/strength-training',
]


@pytest.mark.parametrize('path', PUBLIC_PAGES)
def test_public_page_returns_200(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert 'text/html' in response.content_type


def test_every_real_blog_post_page_returns_200(client):
    slugs = sorted(p.stem for p in (PROJECT_ROOT / 'content' / 'blog').glob('*.md'))
    assert slugs, 'expected real posts in content/blog'
    for slug in slugs:
        response = client.get(f'/blog/{slug}')
        assert response.status_code == 200, f'/blog/{slug} failed'


def test_unknown_blog_post_returns_404(client):
    assert client.get('/blog/definitely-not-a-real-post').status_code == 404


def test_real_project_detail_returns_200(client):
    projects = json.loads((PROJECT_ROOT / 'content' / 'projects.json').read_text())
    slugs = [p['slug'] for p in projects if p.get('slug')]
    assert slugs, 'expected projects with slugs in content/projects.json'
    for slug in slugs:
        response = client.get(f'/projects/{slug}')
        assert response.status_code == 200, f'/projects/{slug} failed'


def test_unknown_project_returns_404(client):
    assert client.get('/projects/definitely-not-a-real-project').status_code == 404


def test_chess_page_renders_even_with_no_network(client):
    """With outbound HTTP blocked (conftest), /chess must still render."""
    response = client.get('/chess')
    assert response.status_code == 200


def test_study_pages_render_and_unknown_tool_404(client):
    pages = [
        '/study',
        '/study/constraint-satisfaction',
        '/study/bayesian-networks',
        '/study/bayes-nash-equilibrium',
        '/study/first-order-logic',
    ]
    for path in pages:
        response = client.get(path)
        assert response.status_code == 200
        assert b'Study' in response.data or b'study' in response.data

    assert client.get('/study/not-a-tool').status_code == 404


def test_study_tools_are_self_contained_and_privacy_scrubbed(client):
    forbidden = (
        b'cdn.', b'fonts.googleapis.com', b'fetch(', b'XMLHttpRequest',
        b'localhost', b'127.0.0.1', b'lavish', b'queuePrompt', b'COMPSCI',
        b'final20', b'/Users/', b'Paula', b'Vignesh',
    )
    for slug in ('constraint-satisfaction', 'bayesian-networks',
                 'bayes-nash-equilibrium', 'first-order-logic'):
        body = client.get(f'/study/{slug}').data
        for token in forbidden:
            assert token not in body
