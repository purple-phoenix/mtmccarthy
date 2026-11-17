"""Unpublished drafts must stay unpublished.

Posts in content/drafts/ are waiting for the author's review. Nothing in that
folder may be reachable on the site: not at its own address, and not through
the blog list, the home page, the feed or the sitemap.

DRAFT_SLUGS is written out by hand on purpose. If a draft is moved into
content/blog/ by mistake, the folder no longer matches this list and the
tests below fail. Publishing a draft on purpose means removing its slug from
this list in the same change.
"""
import pytest
from markupsafe import escape

import app as site
from conftest import PROJECT_ROOT

DRAFTS_DIR = PROJECT_ROOT / 'content' / 'drafts'
BLOG_DIR = PROJECT_ROOT / 'content' / 'blog'

DRAFT_SLUGS = [
    'at-most-once-delivery-social-publisher',
    'content-scouting-agent-claude-subscription',
    'job-queue-in-a-table',
    'proving-a-chart-engine-swap',
    'tests-that-dont-expire',
    'x-space-to-podcast-feed',
]

# Every place a published post is listed or linked from.
LISTING_PATHS = ['/', '/blog', '/feed.xml', '/sitemap.xml']


def _draft_title(slug):
    """The draft's front-matter title, without importing a YAML parser."""
    for line in (DRAFTS_DIR / f'{slug}.md').read_text(encoding='utf-8').splitlines():
        if line.startswith('title:'):
            return line.split(':', 1)[1].strip().strip('"')
    raise AssertionError(f'{slug} has no title in its front matter')


def test_draft_list_matches_the_drafts_folder():
    on_disk = sorted(p.stem for p in DRAFTS_DIR.glob('*.md') if p.name != 'README.md')
    assert on_disk == sorted(DRAFT_SLUGS), (
        'content/drafts/ and DRAFT_SLUGS disagree. A draft that was moved or '
        'renamed by mistake belongs back in content/drafts/; a draft published '
        'on purpose, or a new one, needs DRAFT_SLUGS updated to match.'
    )


@pytest.mark.parametrize('slug', DRAFT_SLUGS)
def test_draft_is_not_in_the_published_folder(slug):
    assert not (BLOG_DIR / f'{slug}.md').exists(), (
        f'{slug}.md is in content/blog/, which publishes it on the next deploy'
    )


def test_drafts_are_not_loaded_as_posts():
    loaded = {post['slug'] for post in site.load_blog_posts()}
    assert loaded, 'expected real posts in content/blog'
    assert not loaded & set(DRAFT_SLUGS)


@pytest.mark.parametrize('slug', DRAFT_SLUGS)
def test_draft_address_returns_404(client, slug):
    assert client.get(f'/blog/{slug}').status_code == 404


@pytest.mark.parametrize('path', LISTING_PATHS)
def test_drafts_are_not_listed_or_linked(client, path):
    response = client.get(path)
    assert response.status_code == 200
    body = response.get_data(as_text=True)
    for slug in DRAFT_SLUGS:
        assert slug not in body, f'{path} links the draft {slug}'
        title = _draft_title(slug)
        assert title not in body, f'{path} shows the draft title {title!r}'
        assert str(escape(title)) not in body, f'{path} shows the draft title {title!r}'
