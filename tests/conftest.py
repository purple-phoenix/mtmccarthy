import os
from pathlib import Path

# app.py raises at import time when SECRET_KEY is unset (production safety),
# so it must be in the environment before the module is imported anywhere.
os.environ.setdefault('SECRET_KEY', 'test-secret-key')

import pytest

import app as site

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True, scope='session')
def project_root_cwd():
    """The app reads content/ and static/ via relative paths."""
    os.chdir(PROJECT_ROOT)


@pytest.fixture(autouse=True)
def no_real_network(monkeypatch):
    """Fail any outbound HTTP call that a test didn't explicitly mock.

    The chess fetchers swallow exceptions by design, so an unmocked call
    degrades to the empty-result path instead of hitting the real APIs.
    """
    def blocked(*args, **kwargs):
        raise AssertionError(f'blocked outbound HTTP request during tests: {args} {kwargs}')

    monkeypatch.setattr(site.requests, 'get', blocked)


@pytest.fixture(autouse=True)
def reset_caches():
    site._post_cache.clear()
    site._games_cache['data'] = None
    site._games_cache['timestamp'] = 0
    yield
    site._post_cache.clear()
    site._games_cache['data'] = None
    site._games_cache['timestamp'] = 0


@pytest.fixture
def client():
    site.app.config['TESTING'] = True
    return site.app.test_client()


@pytest.fixture
def blog_dir(tmp_path, monkeypatch):
    """Point the app at an empty temporary blog directory."""
    monkeypatch.setattr(site, 'BLOG_DIR', str(tmp_path))
    return tmp_path


@pytest.fixture
def make_post(blog_dir):
    """Write a markdown post with front matter into the temp blog dir."""
    def _make(slug, title='A Post', date='2024-05-01', image_url=None,
              body='Hello **world**.', extra_front_matter=()):
        lines = [
            f'title: "{title}"',
            f'date: "{date}"',
            'category: "Testing"',
            'excerpt: "An excerpt"',
            'read_time: "3"',
        ]
        if image_url:
            lines.append(f'image_url: "{image_url}"')
        lines.extend(extra_front_matter)
        path = blog_dir / f'{slug}.md'
        path.write_text('---\n' + '\n'.join(lines) + '\n---\n\n' + body + '\n',
                        encoding='utf-8')
        return path
    return _make
