# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Running the app

- Flask app, entry point `app.py`; it serves on **port 8000** (`python app.py`), not Flask's default 5000. Production uses gunicorn on Render (Start Command in the Render dashboard — there is intentionally no `Procfile`, `runtime.txt`, or `vercel.json`).
- Dependencies are in `requirements.txt`; install into a venv (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`).
- `SECRET_KEY` env var is required whenever `app.py` is *imported* (gunicorn, `flask run`, tests); only `python app.py` (`__main__`) generates an ephemeral dev key. Set `SECRET_KEY=anything` when importing the app in scripts/tests.
- Port 8000 is often already occupied on the dev machine by a long-running instance of this site. For testing, run `flask --app app run --no-reload -p <other-port>` — a 200 from port 8000 may be coming from the old process, not your code.

## Testing

- `pip install -r requirements-dev.txt`, then `pytest -m "not e2e"` for the fast suite; `python -m playwright install chromium` once, then `pytest -m e2e` for the browser smoke tests. CI (`.github/workflows/ci.yml`) runs both on PRs and pushes to main.
- Tests must stay offline: an autouse fixture in `tests/conftest.py` patches `requests.get` to raise, so chess tests monkeypatch `app.requests` per-test with fakes; the Playwright suite stubs all non-localhost requests (CDNs) with empty bodies keyed by resource type.
- `tests/conftest.py` sets `SECRET_KEY` before importing `app` and resets `_post_cache`/`_games_cache` around every test; blog tests point `app.BLOG_DIR` at a tmp dir and control mtimes with `os.utime` (never sleep for cache invalidation).
- `tests/test_static_refs.py` fails on any template/front-matter/projects.json reference to a file missing under `static/` — add the asset before referencing it.
- Route tests assert known pages return 200 but deliberately don't enumerate the route inventory or exact head contents, so new routes/meta tags can land without breaking them. Keep it that way.

## Content pipeline

- Blog posts are Markdown files in `content/blog/` with YAML front-matter (`title`, `date`, `category`, `excerpt`, `read_time`, optional `image_url`). The slug is the filename.
- Projects come from `content/projects.json`.
- Curated blog series are declared in `BLOG_SERIES` in `app.py`; that ordered slug list drives the series hub, per-post series navigation, home/blog discovery banner, structured data, and sitemap entry.
- Study-tool metadata and slugs live in `STUDY_TOOLS` in `app.py`; the index uses `templates/study.html`, while all four self-contained exercise pages share `templates/study_tool.html`. Keep tool pages free of external requests and preserve deterministic client-side feedback and the privacy scrub asserted in `tests/test_routes.py`.
- `image_url` values (and inline `![...](...)` image paths in post bodies) must point at real files under `static/images/` — the templates hide missing images via `onerror` fallbacks, but don't rely on that; some posts' interactive visualizations are wired up by slug in `templates/blog_post.html`.
- **Interactive-viz posts follow one pattern** (see the max-flow/min-cut/secretary/bloom-filter/astar-heuristic posts): (1) drop the JS in `static/js/<name>-viz.js` as an IIFE that finds its own `document.getElementById('<name>-viz')` container and no-ops if absent; (2) add a `{% if post.slug == '<slug>' %}` block near the end of the `blog_post.html` content (a `mt-12 p-6 bg-gray-50 rounded-xl border` card with an `<h3 class="gradient-text">`, a `<div id="<name>-viz">`, and a `<script src="{{ url_for('static', filename='js/<name>-viz.js') }}">`). The viz JS builds DOM with **inline `style.cssText`** (not Tailwind utility classes), so adding one needs **no Tailwind rebuild** — and the card's Tailwind classes are already shared with the sibling viz blocks, so they're already in the committed build.
- Footer copyright year is set client-side (`#footer-year` in `templates/base.html`); don't hardcode a year there.

## Sharp edges

- Blog posts are parsed markdown cached in-process per file, invalidated by mtime (`_post_cache` in `app.py`); edits to `content/blog/*.md` show up without a restart.
- `/chess` calls Chess.com and Lichess with per-request timeout `CHESS_API_TIMEOUT` and an overall deadline `CHESS_FETCH_DEADLINE`; results (including empty on failure) are cached for 5 minutes. To test the failure path, run with `https_proxy=http://127.0.0.1:9`.

## CSS / Tailwind build

- Tailwind is a **committed, prebuilt** stylesheet: `static/css/main.css`, built by the Tailwind CLI (v3) from `assets/css/tailwind.css` — no CDN script, and no Node on the server. The deploy (Render, pip-only Build Command) serves the committed file, so **rebuild and commit `static/css/main.css` whenever you add/change Tailwind classes or edit `assets/css/tailwind.css`**: `npm install && npm run build:css` (`npm run watch:css` while developing).
- Purge content globs live in `tailwind.config.js` and cover `templates/`, `static/js/` (the visualizations build HTML with utility classes in JS strings), `content/blog/*.md` (posts can embed raw HTML), and `content/projects.json`. If Tailwind classes start appearing somewhere new, add the path there — a class missing from the globs silently renders unstyled.
- Class names must appear as complete string literals to survive purging — never build them by concatenation (`'bg-' + color` breaks; `condition ? 'bg-green-400' : 'bg-orange-400'` is fine).
- Site-wide custom CSS (`.blog-content`, `.gradient-text`, codehilite colors, viz styles) lives in `assets/css/tailwind.css` after the `@tailwind` directives — not in a `<style>` block in `base.html`. Page-scoped styles (e.g. resume timeline) stay in that template's `extra_head` block.

## SEO / discoverability

- The canonical production origin is `SITE_URL` in `app.py` (env-overridable, default `https://mattmccarthy.dev`). All absolute URLs (canonicals, OG tags, sitemap, feed) derive from it.
- Per-page meta descriptions live in `PAGE_META_DESCRIPTIONS` in `app.py`, keyed by Flask endpoint — add an entry when adding a new page route. Blog posts and project pages derive descriptions from their own content (excerpt / `description` field) instead.
- `base.html` builds OG/Twitter tags by reusing the `title`, `meta_description`, `canonical_url`, and `og_image` Jinja blocks via `self.blockname()` — child templates only override the blocks, never the meta tags directly. `blog_post.html` overrides them per post and emits BlogPosting JSON-LD.
- `/sitemap.xml`, `/robots.txt`, and `/feed.xml` (RSS 2.0) are generated dynamically: sitemap page list comes from `app.url_map` (zero-argument GET rules, minus `SITEMAP_EXCLUDED_ENDPOINTS`) plus project, post, and blog-category slugs, so new fixed routes appear automatically. XML is rendered from `templates/sitemap.xml` / `templates/feed.xml` (Flask autoescapes `.xml` templates).
- Blog category pages live at `/blog/category/<slug>`; categories are derived from post front-matter (`get_blog_categories` in `app.py`, slugs via the `category_slug` template filter) — there is no hand-maintained category list, and unknown slugs 404. Their meta description is built in `templates/blog_category.html`, and they appear in the sitemap with `lastmod` = newest post in the category. The post card and category pill bar are shared partials (`templates/_blog_post_card.html`, `templates/_blog_category_nav.html`) used by both `blog.html` and `blog_category.html` — edit the partials, not per-page copies.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
