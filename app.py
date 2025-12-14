from flask import Flask, render_template, abort
import os
import markdown
from datetime import datetime
import json
import glob

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-in-production'

# Configuration
BLOG_DIR = 'content/blog'
PROJECTS_FILE = 'content/projects.json'

def load_blog_posts():
    """Load all blog posts from markdown files"""
    posts = []
    if not os.path.exists(BLOG_DIR):
        return posts
    
    for file_path in glob.glob(os.path.join(BLOG_DIR, '*.md')):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Parse front matter
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                front_matter = parts[1].strip()
                body = parts[2].strip()
                
                # Simple front matter parsing
                metadata = {}
                for line in front_matter.split('\n'):
                    if ':' in line:
                        key, value = line.split(':', 1)
                        metadata[key.strip()] = value.strip().strip('"\'')
                
                metadata['slug'] = os.path.splitext(os.path.basename(file_path))[0]
                # Configure markdown with extensions
                md = markdown.Markdown(extensions=[
                    'fenced_code',
                    'tables',
                    'codehilite',
                    'nl2br',
                    'sane_lists'
                ], extension_configs={
                    'codehilite': {
                        'css_class': 'codehilite',
                        'use_pygments': True,
                        'noclasses': False
                    }
                })
                metadata['body'] = md.convert(body)
                metadata['date'] = datetime.strptime(metadata.get('date', '2024-01-01'), '%Y-%m-%d')
                posts.append(metadata)
    
    # Sort by date, newest first
    posts.sort(key=lambda x: x['date'], reverse=True)
    return posts

def load_projects():
    """Load projects from JSON file"""
    if not os.path.exists(PROJECTS_FILE):
        return []
    
    with open(PROJECTS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.route('/')
def index():
    posts = load_blog_posts()[:3]  # Latest 3 posts
    all_projects = load_projects()
    projects = [p for p in all_projects if p.get('featured', False)]  # All featured projects
    return render_template('index.html', posts=posts, projects=projects)

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/blog')
def blog():
    posts = load_blog_posts()
    return render_template('blog.html', posts=posts)

@app.route('/blog/<slug>')
def blog_post(slug):
    posts = load_blog_posts()
    post = next((p for p in posts if p['slug'] == slug), None)
    
    if not post:
        abort(404)
    
    # Get previous and next posts
    current_index = next((i for i, p in enumerate(posts) if p['slug'] == slug), -1)
    prev_post = posts[current_index + 1] if current_index < len(posts) - 1 else None
    next_post = posts[current_index - 1] if current_index > 0 else None
    
    return render_template('blog_post.html', post=post, prev_post=prev_post, next_post=next_post)

@app.route('/projects')
def projects():
    projects_list = load_projects()
    return render_template('projects.html', projects=projects_list)

@app.route('/resume')
def resume():
    return render_template('resume.html')

@app.route('/chess')
def chess():
    return render_template('chess.html')

@app.route('/jiu-jitsu')
def jiu_jitsu():
    return render_template('jiu-jitsu.html')

@app.route('/strength-training')
def strength_training():
    return render_template('strength-training.html')

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs(BLOG_DIR, exist_ok=True)
    os.makedirs('content', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    
    app.run(debug=True, host='0.0.0.0', port=8000)

