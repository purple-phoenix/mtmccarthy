# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Running the app

- Flask app, entry point `app.py`; it serves on **port 8000** (`python app.py`), not Flask's default 5000. Production uses gunicorn on Render (Start Command in the Render dashboard — there is intentionally no `Procfile`, `runtime.txt`, or `vercel.json`).
- Dependencies are in `requirements.txt`; install into a venv (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`).

## Content pipeline

- Blog posts are Markdown files in `content/blog/` with YAML front-matter (`title`, `date`, `category`, `excerpt`, `read_time`, optional `image_url`). The slug is the filename.
- Projects come from `content/projects.json`.
- `image_url` values (and inline `![...](...)` image paths in post bodies) must point at real files under `static/images/` — the templates hide missing images via `onerror` fallbacks, but don't rely on that; some posts' interactive visualizations are wired up by slug in `templates/blog_post.html`.
- Footer copyright year is set client-side (`#footer-year` in `templates/base.html`); don't hardcode a year there.
