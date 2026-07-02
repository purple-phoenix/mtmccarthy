"""Blog post loading, front-matter parsing, and the mtime-based cache."""
import os

import app as site


def _set_mtime(path, epoch):
    os.utime(path, (epoch, epoch))


def test_parses_front_matter_and_markdown(make_post):
    make_post('first-post', title='First Post', date='2024-05-01',
              image_url='/static/images/profile.jpg',
              body='Intro paragraph.\n\nSome **bold** text.')

    posts = site.load_blog_posts()

    assert len(posts) == 1
    post = posts[0]
    assert post['slug'] == 'first-post'
    assert post['title'] == 'First Post'
    assert post['category'] == 'Testing'
    assert post['excerpt'] == 'An excerpt'
    assert post['image_url'] == '/static/images/profile.jpg'
    assert (post['date'].year, post['date'].month, post['date'].day) == (2024, 5, 1)
    assert '<strong>bold</strong>' in post['body']


def test_posts_sorted_newest_first(make_post):
    make_post('older', title='Older', date='2023-01-15')
    make_post('newest', title='Newest', date='2025-12-31')
    make_post('middle', title='Middle', date='2024-06-01')

    slugs = [p['slug'] for p in site.load_blog_posts()]

    assert slugs == ['newest', 'middle', 'older']


def test_file_without_front_matter_is_skipped(blog_dir, make_post):
    (blog_dir / 'no-front-matter.md').write_text('Just plain markdown, no fences.\n',
                                                 encoding='utf-8')
    (blog_dir / 'unclosed-front-matter.md').write_text('---\ntitle: "Broken"\n',
                                                       encoding='utf-8')
    make_post('valid-post')

    slugs = [p['slug'] for p in site.load_blog_posts()]

    assert slugs == ['valid-post']


def test_missing_blog_dir_returns_empty_list(monkeypatch, tmp_path):
    monkeypatch.setattr(site, 'BLOG_DIR', str(tmp_path / 'does-not-exist'))
    assert site.load_blog_posts() == []


def test_cache_hit_skips_reparse(make_post, monkeypatch):
    path = make_post('cached-post')
    _set_mtime(path, 1_700_000_000)

    calls = []
    original = site._parse_blog_post

    def counting_parse(file_path):
        calls.append(file_path)
        return original(file_path)

    monkeypatch.setattr(site, '_parse_blog_post', counting_parse)

    site.load_blog_posts()
    site.load_blog_posts()

    assert len(calls) == 1


def test_mtime_change_invalidates_cache(make_post):
    path = make_post('edited-post', title='Before Edit')
    _set_mtime(path, 1_700_000_000)
    assert site.load_blog_posts()[0]['title'] == 'Before Edit'

    make_post('edited-post', title='After Edit')
    _set_mtime(path, 1_700_000_100)

    assert site.load_blog_posts()[0]['title'] == 'After Edit'


def test_invalid_post_is_negatively_cached(blog_dir, monkeypatch):
    path = blog_dir / 'invalid.md'
    path.write_text('no front matter here\n', encoding='utf-8')
    _set_mtime(path, 1_700_000_000)

    calls = []
    original = site._parse_blog_post

    def counting_parse(file_path):
        calls.append(file_path)
        return original(file_path)

    monkeypatch.setattr(site, '_parse_blog_post', counting_parse)

    assert site.load_blog_posts() == []
    assert site.load_blog_posts() == []
    assert len(calls) == 1
