# Drafts

Posts here are not served. `app.py` only loads `content/blog/*.md`, so nothing in this folder appears on `/blog`, the home page, or at `/blog/<slug>`.

To publish a draft, update its `date`, move it into `content/blog/`, and remove its slug from `DRAFT_SLUGS` in `tests/test_drafts.py`. That test fails while a listed draft is anywhere but this folder, so a draft cannot be published by accident.
