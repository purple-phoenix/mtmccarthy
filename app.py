from flask import Flask, render_template, abort
import os
import markdown
from datetime import datetime
import json
import glob
import requests
from functools import lru_cache
import time

# Cache for chess games (5 minute TTL)
_games_cache = {'data': None, 'timestamp': 0}
CACHE_TTL = 300  # 5 minutes

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
        response = requests.get(archives_url, headers=headers, timeout=5)
        
        if response.status_code != 200:
            return []
        
        archives = response.json().get('archives', [])
        if not archives:
            return []
        
        # Get games from the most recent archives (last 2 months)
        all_games = []
        for archive_url in archives[-2:]:
            try:
                games_response = requests.get(f"{archive_url}/pgn", headers=headers, timeout=5)
                if games_response.status_code == 200:
                    # Parse PGN to extract game info
                    pgn_text = games_response.text
                    games = parse_pgn_games(pgn_text)
                    all_games.extend(games)
            except:
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
                except:
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
        
        response = requests.get(url, headers=headers, params=params, timeout=5)
        
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
                except:
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

@app.route('/resume')
def resume():
    return render_template('resume.html')

@app.route('/chess')
def chess():
    # Check cache
    current_time = time.time()
    if _games_cache['data'] and (current_time - _games_cache['timestamp']) < CACHE_TTL:
        recent_games = _games_cache['data']
    else:
        # Fetch recent games from both platforms
        chess_com_games = fetch_chess_com_games('mtmccarthy14', max_games=5)
        lichess_games = fetch_lichess_games('midnightconquer', max_games=5)
        
        # Combine and sort by date
        all_games = chess_com_games + lichess_games
        all_games.sort(key=lambda x: x.get('date', ''), reverse=True)
        recent_games = all_games[:10]
        
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

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs(BLOG_DIR, exist_ok=True)
    os.makedirs('content', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    
    app.run(debug=True, host='0.0.0.0', port=8000)

