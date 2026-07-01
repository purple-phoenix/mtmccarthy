# Personal Website

A modern, professional personal website built with Flask featuring a blog, projects showcase, and interactive resume.

## Features

- 🏠 **Homepage**: Beautiful landing page with hero section and featured content
- 📝 **Blog**: Markdown-based blog system with syntax highlighting
- 🚀 **Projects**: Showcase your work with detailed project cards
- 📄 **Resume**: Professional resume with timeline view
- 📱 **Responsive Design**: Mobile-first design using Tailwind CSS
- 🎨 **Modern UI**: Polished interface with smooth animations and gradients
- 🔍 **SEO**: Per-page meta descriptions, canonical URLs, Open Graph/Twitter tags, JSON-LD structured data, plus dynamically generated `/sitemap.xml`, `/robots.txt`, and `/feed.xml` (RSS)

## Tech Stack

- **Backend**: Python 3.8+, Flask
- **Frontend**: HTML5, Tailwind CSS, JavaScript
- **Content**: Markdown for blog posts, JSON for projects
- **Icons**: Font Awesome

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/purple-phoenix/mtmccarthy.git
   cd mtmccarthy
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**
   ```bash
   python app.py
   ```

   The app reads its Flask session key from the `SECRET_KEY` environment
   variable. When running locally with `python app.py` you can leave it
   unset and an ephemeral key is generated for you. In production (e.g.
   `gunicorn app:app`) it is required — the app refuses to start without it:
   ```bash
   export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
   ```

5. **Visit the website**
   Open your browser and navigate to `http://localhost:8000`

## Running Tests

Install the dev dependencies, then run pytest:

```bash
pip install -r requirements-dev.txt
pytest -m "not e2e"   # fast unit/integration tests (no network needed)
```

The browser smoke tests need a Playwright browser installed once:

```bash
python -m playwright install chromium
pytest -m e2e         # boots the app and checks key pages in a real browser
pytest                # everything
```

All tests are offline and deterministic: external HTTP (Chess.com, Lichess)
is mocked in the unit tests, and the smoke tests stub CDN requests. CI
(`.github/workflows/ci.yml`) runs both suites on every pull request and on
pushes to `main`.

## Project Structure

```
.
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── README.md             # This file
├── content/
│   ├── blog/            # Blog post markdown files
│   └── projects.json    # Projects data
├── templates/           # Jinja2 HTML templates
│   ├── base.html        # Base template
│   ├── index.html       # Homepage
│   ├── about.html       # About page
│   ├── blog.html        # Blog listing
│   ├── blog_post.html   # Individual blog post
│   ├── projects.html    # Projects showcase
│   ├── resume.html      # Interactive resume
│   ├── sitemap.xml      # Sitemap template (served at /sitemap.xml)
│   └── feed.xml         # RSS feed template (served at /feed.xml)
└── static/              # Static files (CSS, JS, images)
    ├── css/
    ├── images/          # Blog hero images and other assets
    └── js/
```

## Customization

### Adding Blog Posts

Create a new markdown file in `content/blog/` with the following front matter:

```markdown
---
title: "Your Blog Post Title"
date: "2024-01-15"
category: "Category Name"
excerpt: "Short description of the post"
read_time: "5"
---

Your blog content here in markdown...
```

You can also add an optional `image_url` for a hero image — only if it points at a real file under `static/images/` (posts without one render fine without an image). The `excerpt` doubles as the post's meta description, social-share (OG/Twitter) description, and RSS summary; a non-SVG `image_url` also becomes the post's social-share image.

### Adding Projects

Edit `content/projects.json` to add or modify projects:

```json
{
  "title": "Project Name",
  "description": "Project description",
  "tags": ["Tag1", "Tag2"],
  "status": "Active",
  "featured": true,
  "github_url": "https://github.com/username/repo",
  "demo_url": "https://demo-url.com",
  "highlights": [
    "Feature 1",
    "Feature 2"
  ]
}
```

### Customizing Personal Information

1. **About Page**: Edit `templates/about.html`
2. **Resume**: Edit `templates/resume.html`
3. **Contact Info**: Update links in `templates/base.html` footer
4. **Navigation**: Modify the navigation menu in `templates/base.html`

### Styling

The website uses Tailwind CSS via CDN. To customize colors, gradients, or styles:

- Modify the `gradient-text` and other CSS classes in `templates/base.html`
- Update Tailwind utility classes in templates
- Or include your own custom CSS in the `static/css/` directory

## Deployment

The app refuses to start in production without the `SECRET_KEY` environment
variable (see step 4 of Installation) — set it on whichever platform you use.

### Deploying to Render (Production)

This site is deployed on Render with gunicorn. There is no `Procfile` or `runtime.txt` — the Start Command (`gunicorn app:app`) and Python version are configured in the Render dashboard. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full guide.

Absolute URLs (canonicals, OG tags, sitemap, RSS feed) are built from `SITE_URL`, which defaults to `https://mattmccarthy.dev` — set the `SITE_URL` environment variable if the site is served from a different origin.

### Deploying to PythonAnywhere

1. Upload your files to PythonAnywhere
2. Set up a web app using Flask
3. Point it to your `app.py` file
4. Reload the web app

### Deploying to VPS

1. Install dependencies on your server
2. Use a WSGI server like Gunicorn:
   ```bash
   pip install gunicorn
   gunicorn -w 4 -b 0.0.0.0:8000 app:app
   ```
3. Set up nginx as a reverse proxy
4. Configure SSL with Let's Encrypt

## License

This project is open source and available under the MIT License.

## Contact

Feel free to reach out if you have questions or suggestions!

- Email: matttmccarthy66@gmail.com
- GitHub: [@purple-phoenix](https://github.com/purple-phoenix)
- LinkedIn: [Matt McCarthy](https://www.linkedin.com/in/matt-mccarthy-96b64598/)

---

Built with ❤️ using Flask and Tailwind CSS


