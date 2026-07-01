from flask import Flask, render_template, abort, request, Response
import os
import markdown
from datetime import datetime, timezone
from email.utils import format_datetime
import json
import glob
import requests
import secrets
import time
from concurrent.futures import ThreadPoolExecutor

# Cache for chess games (5 minute TTL)
_games_cache = {'data': None, 'timestamp': 0}
CACHE_TTL = 300  # 5 minutes
CHESS_API_TIMEOUT = 3  # seconds per external request
CHESS_FETCH_DEADLINE = 8  # max seconds a page load waits for game data overall

app = Flask(__name__)

_secret_key = os.environ.get('SECRET_KEY')
if not _secret_key:
    if __name__ == '__main__':
        # Local dev (`python app.py`): use a throwaway key. Sessions won't
        # survive a restart, which is fine for development.
        _secret_key = secrets.token_hex(32)
    else:
        # Production servers (e.g. `gunicorn app:app`) import this module,
        # so fail loudly instead of running with a missing key.
        raise RuntimeError(
            'SECRET_KEY environment variable is not set. '
            'Set it before starting the server in production.'
        )
app.config['SECRET_KEY'] = _secret_key

@app.context_processor
def inject_ga_measurement_id():
    return {'ga_measurement_id': os.environ.get('GA_MEASUREMENT_ID')}

# Configuration
BLOG_DIR = 'content/blog'
PROJECTS_FILE = 'content/projects.json'

# Parsed blog posts keyed by file path, invalidated per-file by mtime so
# edits show up without a restart. Values are (mtime, post_dict_or_None).
_post_cache = {}

def _parse_blog_post(file_path):
    """Parse a single markdown blog post, or return None if it has no front matter."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Parse front matter
    if not content.startswith('---'):
        return None
    parts = content.split('---', 2)
    if len(parts) < 3:
        return None
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
    return metadata

# Canonical production origin (see content/projects.json entry for this site).
# Override with the SITE_URL environment variable if the deployed origin changes.
SITE_URL = os.environ.get('SITE_URL', 'https://mattmccarthy.dev').rstrip('/')

DEFAULT_META_DESCRIPTION = ('Software engineer focused on automation, reliability, and thoughtful '
                            'system design. Interested in building durable software, teaching, and '
                            'long-term growth.')

# Per-endpoint meta descriptions; blog posts and project pages derive theirs
# from their own content instead.
PAGE_META_DESCRIPTIONS = {
    'index': 'Personal site of Matt McCarthy, a software engineer writing about automation, '
             'reliability, AI tooling, and thoughtful system design.',
    'about': 'About Matt McCarthy: software engineering background, experience, and the '
             'interests that shape how he builds software.',
    'blog': 'Articles by Matt McCarthy on software engineering, AI tooling, algorithms, and '
            'lessons learned building real systems.',
    'projects': 'Selected software projects by Matt McCarthy, from machine learning '
                'experiments to production web applications.',
    'resume': 'Resume of Matt McCarthy: professional experience, skills, and education in '
              'software engineering.',
    'chess': 'Matt McCarthy on chess: recent rated games from Chess.com and Lichess.',
    'jiu_jitsu': 'Matt McCarthy on Brazilian Jiu Jitsu: training, progress, and what the mat '
                 'teaches about learning hard things.',
    'strength_training': 'Matt McCarthy on strength training: programming, consistency, and '
                         'long-term physical development.',
}

@app.context_processor
def inject_seo():
    """Expose the canonical origin and a per-page meta description to templates."""
    description = PAGE_META_DESCRIPTIONS.get(request.endpoint, DEFAULT_META_DESCRIPTION)
    return {'site_url': SITE_URL, 'page_description': description}

def load_blog_posts():
    """Load all blog posts from markdown files"""
    posts = []
    if not os.path.exists(BLOG_DIR):
        return posts

    for file_path in glob.glob(os.path.join(BLOG_DIR, '*.md')):
        try:
            mtime = os.path.getmtime(file_path)
        except OSError:
            continue  # file removed between glob and stat
        cached = _post_cache.get(file_path)
        if cached is None or cached[0] != mtime:
            try:
                cached = (mtime, _parse_blog_post(file_path))
            except OSError:
                continue  # file removed between stat and open
            _post_cache[file_path] = cached
        if cached[1] is not None:
            posts.append(cached[1])

    # Sort by date, newest first
    posts.sort(key=lambda x: x['date'], reverse=True)
    return posts

def load_projects():
    """Load projects from JSON file"""
    if not os.path.exists(PROJECTS_FILE):
        return []
    
    with open(PROJECTS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def format_time_control(time_control_str):
    """Convert time control to minutes format (e.g., 900+10 -> 15+10)
    Note: Increment is always kept in seconds as per standard chess notation
    """
    if not time_control_str or time_control_str == 'Unknown':
        return 'Unknown'
    
    try:
        # Handle formats like "900+10" or "5+0"
        if '+' in time_control_str:
            parts = time_control_str.split('+')
            initial = int(parts[0])
            increment = int(parts[1])
            
            # Convert initial time from seconds to minutes if >= 60
            if initial >= 60:
                initial = initial // 60
            
            # Keep increment in seconds (standard chess notation: minutes+seconds)
            return f"{initial}+{increment}"
        else:
            # Handle single number format (just initial time)
            initial = int(time_control_str)
            if initial >= 60:
                initial = initial // 60
            return str(initial)
    except (ValueError, IndexError):
        return time_control_str

def fetch_chess_com_games(username='mtmccarthy14', max_games=10):
    """Fetch recent games from Chess.com"""
    try:
        # Get available archives
        archives_url = f'https://api.chess.com/pub/player/{username}/games/archives'
        headers = {'User-Agent': 'MattMcCarthy.dev/1.0'}
        response = requests.get(archives_url, headers=headers, timeout=CHESS_API_TIMEOUT)
        
        if response.status_code != 200:
            return []
        
        archives = response.json().get('archives', [])
        if not archives:
            return []
        
        # Get games from the most recent archives (last 2 months)
        all_games = []
        for archive_url in archives[-2:]:
            try:
                games_response = requests.get(f"{archive_url}/pgn", headers=headers, timeout=CHESS_API_TIMEOUT)
                if games_response.status_code == 200:
                    # Parse PGN to extract game info
                    pgn_text = games_response.text
                    games = parse_pgn_games(pgn_text)
                    all_games.extend(games)
            except Exception:
                continue
        
        # Sort by date and return most recent
        all_games.sort(key=lambda x: x.get('date', ''), reverse=True)
        return all_games[:max_games]
    except Exception as e:
        print(f"Error fetching Chess.com games: {e}")
        return []

def parse_pgn_games(pgn_text):
    """Parse PGN text to extract game information"""
    games = []
    # Split by double newlines to separate games
    game_blocks = pgn_text.split('\n\n\n')
    
    for block in game_blocks:
        if not block.strip():
            continue
            
        current_game = {}
        lines = block.split('\n')
        
        for line in lines:
            line = line.strip()
            if line.startswith('[') and ']' in line:
                # Parse tag
                try:
                    tag = line[1:line.index(']')]
                    if ' "' in tag:
                        key, value = tag.split(' "', 1)
                        key = key.strip()
                        value = value.rstrip('"')
                        
                        if key == 'White':
                            current_game['white'] = value
                        elif key == 'Black':
                            current_game['black'] = value
                        elif key == 'Result':
                            current_game['result'] = value
                        elif key == 'Date':
                            # Format: YYYY.MM.DD
                            current_game['date'] = value.replace('.', '.')
                        elif key == 'TimeControl':
                            current_game['time_control'] = format_time_control(value)
                        elif key == 'ECO':
                            current_game['eco'] = value
                        elif key == 'Opening':
                            current_game['opening'] = value
                        elif key == 'Site' and 'chess.com' in value.lower():
                            # Extract game ID for URL
                            if '/live/' in value:
                                game_id = value.split('/live/')[-1].split('?')[0]
                                current_game['url'] = f"https://www.chess.com/game/live/{game_id}"
                except Exception:
                    continue
        
        # Store game if we have the required info
        if 'white' in current_game and 'black' in current_game:
            current_game['platform'] = 'Chess.com'
            if 'url' not in current_game:
                # Try to construct URL from game data if available
                pass
            games.append(current_game)
    
    return games

def fetch_lichess_games(username='midnightconquer', max_games=10):
    """Fetch recent games from Lichess"""
    try:
        # Lichess public API endpoint
        url = f'https://lichess.org/api/games/user/{username}'
        headers = {
            'Accept': 'application/x-ndjson',
            'User-Agent': 'MattMcCarthy.dev/1.0'
        }
        params = {
            'max': max_games,
            'rated': 'true',
            'perfType': 'blitz,rapid,classical'
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=CHESS_API_TIMEOUT)
        
        if response.status_code != 200:
            return []
        
        games = []
        for line in response.text.strip().split('\n'):
            if line:
                try:
                    game_data = json.loads(line)
                    game = {
                        'platform': 'Lichess',
                        'white': game_data.get('players', {}).get('white', {}).get('user', {}).get('name', 'Unknown'),
                        'black': game_data.get('players', {}).get('black', {}).get('user', {}).get('name', 'Unknown'),
                        'result': get_lichess_result(game_data),
                        'date': datetime.fromtimestamp(game_data.get('createdAt', 0) / 1000).strftime('%Y.%m.%d') if game_data.get('createdAt') else '',
                        'time_control': format_time_control(f"{game_data.get('clock', {}).get('initial', 0)}+{game_data.get('clock', {}).get('increment', 0)}") if game_data.get('clock') else 'Unknown',
                        'opening': game_data.get('opening', {}).get('name', 'Unknown') if game_data.get('opening') else 'Unknown',
                        'url': f"https://lichess.org/{game_data.get('id', '')}"
                    }
                    games.append(game)
                except Exception:
                    continue
        
        return games
    except Exception as e:
        print(f"Error fetching Lichess games: {e}")
        return []

def get_lichess_result(game_data):
    """Extract result from Lichess game data"""
    winner = game_data.get('winner')
    if winner == 'white':
        return '1-0'
    elif winner == 'black':
        return '0-1'
    else:
        return '1/2-1/2'

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

@app.route('/projects/<slug>')
def project_detail(slug):
    projects_list = load_projects()
    project = next((p for p in projects_list if p.get('slug') == slug), None)
    if not project:
        abort(404)
    return render_template('project_detail.html', project=project)

@app.route('/resume')
def resume():
    return render_template('resume.html')

def fetch_recent_games(max_games=10):
    """Fetch recent games from both platforms in parallel with a hard deadline.

    Returns whatever arrived in time; a slow or unreachable API just
    contributes no games, so the page always renders promptly.
    """
    executor = ThreadPoolExecutor(max_workers=2)
    futures = [
        executor.submit(fetch_chess_com_games, 'mtmccarthy14', 5),
        executor.submit(fetch_lichess_games, 'midnightconquer', 5),
    ]
    deadline = time.monotonic() + CHESS_FETCH_DEADLINE
    all_games = []
    for future in futures:
        try:
            all_games.extend(future.result(timeout=max(0, deadline - time.monotonic())))
        except Exception as e:
            print(f"Error fetching chess games: {e}")
    executor.shutdown(wait=False, cancel_futures=True)

    # Combine and sort by date
    all_games.sort(key=lambda x: x.get('date', ''), reverse=True)
    return all_games[:max_games]

@app.route('/chess')
def chess():
    # Check cache (empty results are cached too, so a down API
    # isn't re-queried on every request)
    current_time = time.time()
    if _games_cache['data'] is not None and (current_time - _games_cache['timestamp']) < CACHE_TTL:
        recent_games = _games_cache['data']
    else:
        recent_games = fetch_recent_games(max_games=10)

        # Update cache
        _games_cache['data'] = recent_games
        _games_cache['timestamp'] = current_time

    return render_template('chess.html', recent_games=recent_games)

@app.route('/jiu-jitsu')
def jiu_jitsu():
    return render_template('jiu-jitsu.html')

@app.route('/strength-training')
def strength_training():
    return render_template('strength-training.html')

# Endpoints that should not appear in the sitemap
SITEMAP_EXCLUDED_ENDPOINTS = {'static', 'robots_txt', 'sitemap_xml', 'feed_xml'}

@app.route('/robots.txt')
def robots_txt():
    body = f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n"
    return Response(body, mimetype='text/plain')

@app.route('/sitemap.xml')
def sitemap_xml():
    posts = load_blog_posts()
    latest = posts[0]['date'].strftime('%Y-%m-%d') if posts else None

    pages = []
    # Fixed public pages, discovered from the routing table (zero-argument GET rules)
    static_paths = sorted(
        str(rule) for rule in app.url_map.iter_rules()
        if rule.endpoint not in SITEMAP_EXCLUDED_ENDPOINTS
        and 'GET' in rule.methods and not rule.arguments
    )
    for path in static_paths:
        # Homepage and blog index surface the latest posts, so use the newest post date
        lastmod = latest if path in ('/', '/blog') else None
        pages.append({'loc': f'{SITE_URL}{path}', 'lastmod': lastmod})

    for project in load_projects():
        if project.get('slug'):
            pages.append({'loc': f"{SITE_URL}/projects/{project['slug']}", 'lastmod': None})

    for post in posts:
        pages.append({'loc': f"{SITE_URL}/blog/{post['slug']}",
                      'lastmod': post['date'].strftime('%Y-%m-%d')})

    xml = render_template('sitemap.xml', pages=pages)
    return Response(xml, mimetype='application/xml')

@app.route('/feed.xml')
def feed_xml():
    posts = load_blog_posts()
    items = []
    for post in posts:
        items.append({
            'title': post.get('title', post['slug']),
            'link': f"{SITE_URL}/blog/{post['slug']}",
            'description': post.get('excerpt', ''),
            'category': post.get('category'),
            'pub_date': format_datetime(post['date'].replace(tzinfo=timezone.utc)),
        })
    last_build = items[0]['pub_date'] if items else format_datetime(datetime.now(timezone.utc))
    xml = render_template('feed.xml', items=items, last_build=last_build)
    return Response(xml, mimetype='application/rss+xml')

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs(BLOG_DIR, exist_ok=True)
    os.makedirs('content', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    
    app.run(debug=True, host='0.0.0.0', port=8000)

