# Personal Website

A modern, professional personal website built with Flask featuring a blog, projects showcase, and interactive resume.

## Features

- 🏠 **Homepage**: Beautiful landing page with hero section and featured content
- 📝 **Blog**: Markdown-based blog system with syntax highlighting
- 🚀 **Projects**: Showcase your work with detailed project cards
- 📄 **Resume**: Professional resume with timeline view
- 📱 **Responsive Design**: Mobile-first design using Tailwind CSS
- 🎨 **Modern UI**: Polished interface with smooth animations and gradients

## Tech Stack

- **Backend**: Python 3.8+, Flask
- **Frontend**: HTML5, Tailwind CSS, JavaScript
- **Content**: Markdown for blog posts, JSON for projects
- **Icons**: Font Awesome

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/personal-website.git
   cd personal-website
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

5. **Visit the website**
   Open your browser and navigate to `http://localhost:5000`

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
│   └── resume.html      # Interactive resume
└── static/              # Static files (CSS, JS, images)
    ├── css/
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

### Deploying to Heroku

1. Create a `Procfile`:
   ```
   web: gunicorn app:app
   ```

2. Add `gunicorn` to `requirements.txt`:
   ```
   gunicorn==21.2.0
   ```

3. Deploy:
   ```bash
   heroku create your-app-name
   git push heroku main
   ```

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


