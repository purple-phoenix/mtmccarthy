"""No dangling static references.

Walks templates, blog front matter, post bodies, and projects.json for
references to files under static/ and asserts each one exists. This is the
class of bug behind previously shipped broken images: templates hide missing
images via onerror fallbacks, so nothing else catches them.
"""
import json
import re

from conftest import PROJECT_ROOT

STATIC_DIR = PROJECT_ROOT / 'static'

URL_FOR_STATIC = re.compile(
    r"""url_for\(\s*['"]static['"]\s*,\s*filename\s*=\s*['"]([^'"]+)['"]""")
LITERAL_STATIC = re.compile(r"""(?:src|href)=["']/static/([^"'{]+)["']""")
FRONT_MATTER_IMAGE = re.compile(r"""^image_url:\s*["']?(/static/([^"'\s]+))["']?\s*$""",
                                re.MULTILINE)
MARKDOWN_STATIC_IMAGE = re.compile(r"""!\[[^\]]*\]\(/static/([^)\s]+)""")


def _assert_static_exists(rel_path, source):
    target = STATIC_DIR / rel_path
    assert target.is_file(), f'{source} references missing static file: static/{rel_path}'


def test_template_static_references_exist():
    templates = sorted((PROJECT_ROOT / 'templates').glob('*.html'))
    assert templates
    checked = 0
    for template in templates:
        text = template.read_text(encoding='utf-8')
        for rel_path in URL_FOR_STATIC.findall(text) + LITERAL_STATIC.findall(text):
            _assert_static_exists(rel_path, template.name)
            checked += 1
    assert checked > 0, 'expected templates to reference static assets'


def test_blog_front_matter_images_exist():
    posts = sorted((PROJECT_ROOT / 'content' / 'blog').glob('*.md'))
    assert posts
    for post in posts:
        text = post.read_text(encoding='utf-8')
        for _full, rel_path in FRONT_MATTER_IMAGE.findall(text):
            _assert_static_exists(rel_path, post.name)


def test_blog_body_inline_images_exist():
    for post in sorted((PROJECT_ROOT / 'content' / 'blog').glob('*.md')):
        text = post.read_text(encoding='utf-8')
        for rel_path in MARKDOWN_STATIC_IMAGE.findall(text):
            _assert_static_exists(rel_path, post.name)


def test_projects_json_static_references_exist():
    projects = json.loads((PROJECT_ROOT / 'content' / 'projects.json').read_text())

    def walk(value, source):
        if isinstance(value, str) and value.startswith('/static/'):
            _assert_static_exists(value[len('/static/'):], source)
        elif isinstance(value, dict):
            for v in value.values():
                walk(v, source)
        elif isinstance(value, list):
            for v in value:
                walk(v, source)

    walk(projects, 'projects.json')
