# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Running the app

- Flask app, entry point `app.py`; it serves on **port 8000** (`python app.py`), not Flask's default 5000. Production uses gunicorn on Render (Start Command in the Render dashboard — there is intentionally no `Procfile`, `runtime.txt`, or `vercel.json`).
- Dependencies are in `requirements.txt`; install into a venv (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`).
- `SECRET_KEY` env var is required whenever `app.py` is *imported* (gunicorn, `flask run`, tests); only `python app.py` (`__main__`) generates an ephemeral dev key. Set `SECRET_KEY=anything` when importing the app in scripts/tests.
- Port 8000 is often already occupied on the dev machine by a long-running instance of this site. For testing, run `flask --app app run --no-reload -p <other-port>` — a 200 from port 8000 may be coming from the old process, not your code.

## Content pipeline

- Blog posts are Markdown files in `content/blog/` with YAML front-matter (`title`, `date`, `category`, `excerpt`, `read_time`, optional `image_url`). The slug is the filename.
- Projects come from `content/projects.json`.
- `image_url` values (and inline `![...](...)` image paths in post bodies) must point at real files under `static/images/` — the templates hide missing images via `onerror` fallbacks, but don't rely on that; some posts' interactive visualizations are wired up by slug in `templates/blog_post.html`.
- Footer copyright year is set client-side (`#footer-year` in `templates/base.html`); don't hardcode a year there.

## Sharp edges

- Blog posts are parsed markdown cached in-process per file, invalidated by mtime (`_post_cache` in `app.py`); edits to `content/blog/*.md` show up without a restart.
- `/chess` calls Chess.com and Lichess with per-request timeout `CHESS_API_TIMEOUT` and an overall deadline `CHESS_FETCH_DEADLINE`; results (including empty on failure) are cached for 5 minutes. To test the failure path, run with `https_proxy=http://127.0.0.1:9`.

## SEO / discoverability

- The canonical production origin is `SITE_URL` in `app.py` (env-overridable, default `https://mattmccarthy.dev`). All absolute URLs (canonicals, OG tags, sitemap, feed) derive from it.
- Per-page meta descriptions live in `PAGE_META_DESCRIPTIONS` in `app.py`, keyed by Flask endpoint — add an entry when adding a new page route. Blog posts and project pages derive descriptions from their own content (excerpt / `description` field) instead.
- `base.html` builds OG/Twitter tags by reusing the `title`, `meta_description`, `canonical_url`, and `og_image` Jinja blocks via `self.blockname()` — child templates only override the blocks, never the meta tags directly. `blog_post.html` overrides them per post and emits BlogPosting JSON-LD.
- `/sitemap.xml`, `/robots.txt`, and `/feed.xml` (RSS 2.0) are generated dynamically: sitemap page list comes from `app.url_map` (zero-argument GET rules, minus `SITEMAP_EXCLUDED_ENDPOINTS`) plus project, post, and blog-category slugs, so new fixed routes appear automatically. XML is rendered from `templates/sitemap.xml` / `templates/feed.xml` (Flask autoescapes `.xml` templates).
- Blog category pages live at `/blog/category/<slug>`; categories are derived from post front-matter (`get_blog_categories` in `app.py`, slugs via the `category_slug` template filter) — there is no hand-maintained category list, and unknown slugs 404. Their meta description is built in `templates/blog_category.html`, and they appear in the sitemap with `lastmod` = newest post in the category. The post card and category pill bar are shared partials (`templates/_blog_post_card.html`, `templates/_blog_category_nav.html`) used by both `blog.html` and `blog_category.html` — edit the partials, not per-page copies.
