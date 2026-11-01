# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Running the app

- Flask app, entry point `app.py`; it serves on **port 8000** (`python app.py`), not Flask's default 5000. Production uses Vercel's **Flask** Framework Preset, which runs `app.py`'s `app` with zero configuration. No `vercel.json`, `Procfile`, or `runtime.txt` is needed; gunicorn remains in `requirements.txt` but is not the production server.
- Dependencies are in `requirements.txt`; install into a venv (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`).
- `SECRET_KEY` env var is required whenever `app.py` is *imported* (gunicorn, `flask run`, tests); only `python app.py` (`__main__`) generates an ephemeral dev key. Set `SECRET_KEY=anything` when importing the app in scripts/tests.
- Port 8000 is often already occupied on the dev machine by a long-running instance of this site. For testing, run `flask --app app run --no-reload -p <other-port>` — a 200 from port 8000 may be coming from the old process, not your code.

## Deploy

- **Merging to `main` is a production deploy**: Vercel auto-deploys `main` on push to `matt-mccarthys-projects/mtmccarthy` (Hobby plan; see DEPLOYMENT.md). Python dependencies come from `requirements.txt`. In Vercel → Project → Settings → Environment Variables, `SECRET_KEY` is sensitive and required for Production + Preview; `GA_MEASUREMENT_ID` and `SITE_URL` are optional and currently unset (`SITE_URL` defaults to `https://mattmccarthy.dev`). Never merge or push to `main` without the owner's go-ahead; work on a branch and open a PR (CI runs both test jobs on it).
- Quick render check of every page before a PR: start the app on a spare port, then request each `<loc>` from `/sitemap.xml` and expect 200 (it lists every fixed route plus all project, post, category, series, and study-tool pages).
- **Every PR links a preview that opens on the changed page, plus 2–4 numbered steps to see the change.** Vercel builds a branch preview for each PR (the `vercel[bot]` comment has the URL). With the Flask preset, previews now render application pages; link the changed page on it (e.g. `…vercel.app/projects/<slug>`), not the home page. Previews sit behind Vercel Authentication (Matt is signed in), so check the preview itself with `vercel curl <path> --deployment <url-or-id>` before linking it. For the quick render check against a preview, request `/sitemap.xml`, then each `<loc>` path on that same deployment (the sitemap uses the canonical production origin). Keep local `.vercel/` project metadata uncommitted.

## Testing

- `pip install -r requirements-dev.txt`, then `pytest -m "not e2e"` for the fast suite; `python -m playwright install chromium` once, then `pytest -m e2e` for the browser smoke tests. CI (`.github/workflows/ci.yml`) runs both on PRs and pushes to main.
- Tests must stay offline: an autouse fixture in `tests/conftest.py` patches `requests.get` to raise, so chess tests monkeypatch `app.requests` per-test with fakes; the Playwright suite stubs all non-localhost requests (CDNs) with empty bodies keyed by resource type.
- `tests/conftest.py` sets `SECRET_KEY` before importing `app` and resets `_post_cache`/`_games_cache` around every test; blog tests point `app.BLOG_DIR` at a tmp dir and control mtimes with `os.utime` (never sleep for cache invalidation).
- `tests/test_static_refs.py` fails on any template/front-matter/projects.json reference to a file missing under `static/` — add the asset before referencing it.
- Route tests assert known pages return 200 but deliberately don't enumerate the route inventory or exact head contents, so new routes/meta tags can land without breaking them. Keep it that way.

## Content pipeline

- Blog posts are Markdown files in `content/blog/` with YAML front-matter (`title`, `date`, `category`, `excerpt`, `read_time`, optional `image_url`). The slug is the filename.
- Projects come from `content/projects.json`, validated on load by `_validate_project()` in `app.py` (bad entries raise). Entries with a `case_study` object are the portfolio's case studies (problem / constraints / built / verification / results, plus optional metrics, delivery, `todos`); the field reference is in the README's "Adding Projects". Rules: every metric must trace to a source repo, CI run, or doc, and unknown numbers go in `todos` (rendered as a visible TODO box, so fill or remove them before a merge to main publishes them). `github_url` is only allowed with `repo_visibility: "public"`; private or local repos are described, never linked. Describe people only as their own public sites do.
- Curated blog series are declared in `BLOG_SERIES` in `app.py`; that ordered slug list drives the series hub, per-post series navigation, home/blog discovery banner, and structured data.
- Study-tool metadata and slugs live in `STUDY_TOOLS` in `app.py`; the index uses `templates/study.html`, while all four self-contained exercise pages share `templates/study_tool.html`. Keep tool pages free of external requests and preserve deterministic client-side feedback and the privacy scrub asserted in `tests/test_routes.py`.
- `image_url` values (and inline `![...](...)` image paths in post bodies) must point at real files under `static/images/` — the templates hide missing images via `onerror` fallbacks, but don't rely on that; some posts' interactive visualizations are wired up by slug in `templates/blog_post.html`.
- **Interactive-viz posts follow one pattern** (see the max-flow/min-cut/secretary/bloom-filter/astar-heuristic posts): (1) drop the JS in `static/js/<name>-viz.js` as an IIFE that finds its own `document.getElementById('<name>-viz')` container and no-ops if absent; (2) add a `{% if post.slug == '<slug>' %}` block near the end of the `blog_post.html` content (a `mt-12 p-6 bg-gray-50 rounded-xl border` card with an `<h3 class="gradient-text">`, a `<div id="<name>-viz">`, and a `<script src="{{ url_for('static', filename='js/<name>-viz.js') }}">`). The viz JS builds DOM with **inline `style.cssText`** (not Tailwind utility classes), so adding one needs **no Tailwind rebuild** — and the card's Tailwind classes are already shared with the sibling viz blocks, so they're already in the committed build.
- **Travel page** (`/travel`): trips come from `content/travel.json`, validated on load by `load_trips()` in `app.py` (bad entries raise, so tests catch them); photos are committed WebP copies under `static/images/travel/<slug>/` (Google Photos has no usable read API, so nothing is fetched at runtime). Add trips with `scripts/add_trip.py` (one trip from a folder of exports; strips EXIF/GPS) or `scripts/import_takeout.py` (clusters a Google Takeout export into trips offline via `scripts/places.json`, writes a git-ignored `content/travel-proposal.json`, then `--apply`); usage is in each script's docstring and README. Both need Pillow from `requirements-dev.txt` only. The two shipped trips are `"sample": true` placeholders meant to be replaced by re-running the script with the same slug. The map is vendored Leaflet (`static/vendor/leaflet/`, version in `VERSION`) with OSM tiles, the only external request on the page; the gallery lives in `static/js/travel-map.js` with page-scoped styles in `templates/travel.html`.
- Footer copyright year is set client-side (`#footer-year` in `templates/base.html`); don't hardcode a year there.

## Sharp edges

- Blog posts are parsed markdown cached in-process per file, invalidated by mtime (`_post_cache` in `app.py`); edits to `content/blog/*.md` show up without a restart.
- `/chess` calls Chess.com and Lichess with per-request timeout `CHESS_API_TIMEOUT` and an overall deadline `CHESS_FETCH_DEADLINE`; results (including empty on failure) are cached for 5 minutes. To test the failure path, run with `https_proxy=http://127.0.0.1:9`.

## CSS / Tailwind build

- Tailwind is a **committed, prebuilt** stylesheet: `static/css/main.css`, built by the Tailwind CLI (v3) from `assets/css/tailwind.css`, with no CDN script and no Node on the server. The Vercel Flask deployment serves the committed file without a Node build, so **rebuild and commit `static/css/main.css` whenever you add/change Tailwind classes or edit `assets/css/tailwind.css`**: `npm install && npm run build:css` (`npm run watch:css` while developing).
- Purge content globs live in `tailwind.config.js` and cover `templates/`, `static/js/` (the visualizations build HTML with utility classes in JS strings), `content/blog/*.md` (posts can embed raw HTML), and `content/projects.json`. If Tailwind classes start appearing somewhere new, add the path there — a class missing from the globs silently renders unstyled.
- Class names must appear as complete string literals to survive purging — never build them by concatenation (`'bg-' + color` breaks; `condition ? 'bg-green-400' : 'bg-orange-400'` is fine).
- Site-wide custom CSS (`.blog-content`, `.gradient-text`, codehilite colors, viz styles) lives in `assets/css/tailwind.css` after the `@tailwind` directives — not in a `<style>` block in `base.html`. Page-scoped styles (e.g. resume timeline) stay in that template's `extra_head` block.

## SEO / discoverability

- The canonical production origin is `SITE_URL` in `app.py` (env-overridable, default `https://mattmccarthy.dev`). All absolute URLs (canonicals, OG tags, sitemap, feed) derive from it.
- Per-page meta descriptions live in `PAGE_META_DESCRIPTIONS` in `app.py`, keyed by Flask endpoint — add an entry when adding a new page route. Blog posts and project pages derive descriptions from their own content (excerpt / `description` field) instead.
- `base.html` builds OG/Twitter tags by reusing the `title`, `meta_description`, `canonical_url`, and `og_image` Jinja blocks via `self.blockname()` — child templates only override the blocks, never the meta tags directly. `blog_post.html` overrides them per post and emits BlogPosting JSON-LD.
- `/sitemap.xml`, `/robots.txt`, and `/feed.xml` (RSS 2.0) are generated dynamically: sitemap page list comes from `app.url_map` (zero-argument GET rules, minus `SITEMAP_EXCLUDED_ENDPOINTS`) plus project, post, blog-category, and blog-series slugs, so new fixed routes appear automatically. XML is rendered from `templates/sitemap.xml` / `templates/feed.xml` (Flask autoescapes `.xml` templates).
- Blog category pages live at `/blog/category/<slug>`; categories are derived from post front-matter (`get_blog_categories` in `app.py`, slugs via the `category_slug` template filter) — there is no hand-maintained category list, and unknown slugs 404. Their meta description is built in `templates/blog_category.html`, and they appear in the sitemap with `lastmod` = newest post in the category. The post card and category pill bar are shared partials (`templates/_blog_post_card.html`, `templates/_blog_category_nav.html`) used by both `blog.html` and `blog_category.html` — edit the partials, not per-page copies.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
