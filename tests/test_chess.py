"""The /chess route's hardened external-fetch behavior.

All external HTTP is mocked; these tests cover the success path, the
timeout/failure fallbacks, the per-request timeout wiring, the overall
fetch deadline, and the 5-minute result cache (including empty results).
"""
import json
import threading
import time

import pytest
import requests

import app as site


class FakeResponse:
    def __init__(self, status_code=200, json_data=None, text=''):
        self.status_code = status_code
        self._json = json_data
        self.text = text

    def json(self):
        return self._json


SAMPLE_PGN = '''[Event "Live Chess"]
[Site "https://www.chess.com/game/live/123456789"]
[Date "2024.03.10"]
[White "mtmccarthy14"]
[Black "opponent1"]
[Result "1-0"]
[TimeControl "900+10"]
[ECO "B01"]

1. e4 d5 2. exd5 1-0


[Event "Live Chess"]
[Site "https://www.chess.com/game/live/987654321"]
[Date "2024.03.12"]
[White "opponent2"]
[Black "mtmccarthy14"]
[Result "0-1"]
[TimeControl "300+0"]

1. d4 Nf6 0-1
'''

SAMPLE_LICHESS_NDJSON = '\n'.join([
    json.dumps({
        'id': 'abcd1234',
        'createdAt': 1710000000000,
        'winner': 'white',
        'players': {'white': {'user': {'name': 'midnightconquer'}},
                    'black': {'user': {'name': 'rival'}}},
        'clock': {'initial': 600, 'increment': 5},
        'opening': {'name': 'Italian Game'},
    }),
    json.dumps({
        'id': 'efgh5678',
        'createdAt': 1710100000000,
        'players': {'white': {'user': {'name': 'rival2'}},
                    'black': {'user': {'name': 'midnightconquer'}}},
    }),
])


@pytest.fixture
def chess_com_api(monkeypatch):
    """Mock requests.get with a working Chess.com API; records calls."""
    calls = []

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        if url.endswith('/games/archives'):
            return FakeResponse(json_data={'archives': [
                'https://api.chess.com/pub/player/mtmccarthy14/games/2024/02',
                'https://api.chess.com/pub/player/mtmccarthy14/games/2024/03',
            ]})
        if url.endswith('/2024/03/pgn'):
            return FakeResponse(text=SAMPLE_PGN)
        if url.endswith('/2024/02/pgn'):
            return FakeResponse(text='')
        raise AssertionError(f'unexpected URL {url}')

    monkeypatch.setattr(site.requests, 'get', fake_get)
    return calls


def test_chess_com_success_parses_games(chess_com_api):
    games = site.fetch_chess_com_games()

    assert games, 'expected parsed games'
    newest = games[0]
    assert newest['white'] == 'opponent2'
    assert newest['black'] == 'mtmccarthy14'
    assert newest['result'] == '0-1'
    assert newest['time_control'] == '5+0'
    assert newest['platform'] == 'Chess.com'
    assert games[1]['url'] == 'https://www.chess.com/game/live/123456789'
    assert games[1]['time_control'] == '15+10'


def test_chess_com_requests_use_configured_timeout(chess_com_api):
    site.fetch_chess_com_games()

    assert chess_com_api, 'expected at least one HTTP call'
    for _url, kwargs in chess_com_api:
        assert kwargs.get('timeout') == site.CHESS_API_TIMEOUT


def test_chess_com_timeout_returns_empty(monkeypatch):
    def timing_out(url, **kwargs):
        raise requests.exceptions.Timeout('simulated timeout')

    monkeypatch.setattr(site.requests, 'get', timing_out)
    assert site.fetch_chess_com_games() == []


def test_chess_com_non_200_returns_empty(monkeypatch):
    monkeypatch.setattr(site.requests, 'get',
                        lambda url, **kwargs: FakeResponse(status_code=503))
    assert site.fetch_chess_com_games() == []


def test_lichess_success_parses_games(monkeypatch):
    calls = []

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse(text=SAMPLE_LICHESS_NDJSON)

    monkeypatch.setattr(site.requests, 'get', fake_get)
    games = site.fetch_lichess_games()

    assert len(games) == 2
    assert games[0]['platform'] == 'Lichess'
    assert games[0]['white'] == 'midnightconquer'
    assert games[0]['result'] == '1-0'
    assert games[0]['time_control'] == '10+5'
    assert games[0]['url'] == 'https://lichess.org/abcd1234'
    assert games[1]['result'] == '1/2-1/2'
    assert games[1]['opening'] == 'Unknown'
    assert calls[0][1].get('timeout') == site.CHESS_API_TIMEOUT


def test_lichess_connection_error_returns_empty(monkeypatch):
    def failing(url, **kwargs):
        raise requests.exceptions.ConnectionError('simulated outage')

    monkeypatch.setattr(site.requests, 'get', failing)
    assert site.fetch_lichess_games() == []


def test_fetch_recent_games_enforces_overall_deadline(monkeypatch):
    """A hung platform contributes nothing; the fast one still gets through."""
    monkeypatch.setattr(site, 'CHESS_FETCH_DEADLINE', 0.2)

    release_hung_fetch = threading.Event()

    def hung_fetch(*args, **kwargs):
        release_hung_fetch.wait(timeout=10)
        return [{'platform': 'Chess.com', 'white': 'too', 'black': 'slow', 'date': '2024.01.01'}]

    fast_games = [{'platform': 'Lichess', 'white': 'a', 'black': 'b', 'date': '2024.03.01'}]
    monkeypatch.setattr(site, 'fetch_chess_com_games', hung_fetch)
    monkeypatch.setattr(site, 'fetch_lichess_games', lambda *a, **k: list(fast_games))

    try:
        start = time.monotonic()
        games = site.fetch_recent_games()
        elapsed = time.monotonic() - start
    finally:
        release_hung_fetch.set()

    assert games == fast_games
    assert elapsed < 2, f'deadline not enforced (took {elapsed:.2f}s)'


def test_chess_route_caches_results(client, monkeypatch):
    fetches = []

    def fake_fetch(max_games=10):
        fetches.append(max_games)
        return [{'platform': 'Lichess', 'white': 'a', 'black': 'b',
                 'result': '1-0', 'date': '2024.03.01', 'time_control': '5+0',
                 'opening': 'Sicilian', 'url': 'https://lichess.org/x'}]

    monkeypatch.setattr(site, 'fetch_recent_games', fake_fetch)

    assert client.get('/chess').status_code == 200
    assert client.get('/chess').status_code == 200
    assert len(fetches) == 1, 'second request within TTL must hit the cache'

    site._games_cache['timestamp'] -= site.CACHE_TTL + 1
    assert client.get('/chess').status_code == 200
    assert len(fetches) == 2, 'expired cache must trigger a refetch'


def test_chess_route_caches_empty_result_on_failure(client, monkeypatch):
    calls = []

    def failing(url, **kwargs):
        calls.append(url)
        raise requests.exceptions.ConnectionError('simulated outage')

    monkeypatch.setattr(site.requests, 'get', failing)

    assert client.get('/chess').status_code == 200
    assert site._games_cache['data'] == []

    calls.clear()
    assert client.get('/chess').status_code == 200
    assert calls == [], 'a down API must not be re-queried within the TTL'


@pytest.mark.parametrize('raw,expected', [
    ('900+10', '15+10'),
    ('300+0', '5+0'),
    ('5+3', '5+3'),
    ('600', '10'),
    ('30', '30'),
    ('Unknown', 'Unknown'),
    ('', 'Unknown'),
    (None, 'Unknown'),
    ('weird', 'weird'),
])
def test_format_time_control(raw, expected):
    assert site.format_time_control(raw) == expected


def test_parse_pgn_games_extracts_tags():
    games = site.parse_pgn_games(SAMPLE_PGN)

    assert len(games) == 2
    assert games[0]['white'] == 'mtmccarthy14'
    assert games[0]['eco'] == 'B01'
    assert games[0]['date'] == '2024.03.10'
    assert games[0]['url'] == 'https://www.chess.com/game/live/123456789'


def test_get_lichess_result():
    assert site.get_lichess_result({'winner': 'white'}) == '1-0'
    assert site.get_lichess_result({'winner': 'black'}) == '0-1'
    assert site.get_lichess_result({}) == '1/2-1/2'
