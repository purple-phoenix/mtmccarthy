"""The /travel page, its data file, and the add_trip ingestion script."""
import json
import sys
from pathlib import Path

import pytest
from PIL import Image

from conftest import PROJECT_ROOT

import app as site

sys.path.insert(0, str(PROJECT_ROOT / 'scripts'))
import add_trip  # noqa: E402


def real_trips():
    return json.loads((PROJECT_ROOT / 'content' / 'travel.json').read_text(encoding='utf-8'))


# ---------------------------------------------------------------- page

def test_travel_page_lists_every_trip(client):
    html = client.get('/travel').get_data(as_text=True)
    trips = real_trips()
    assert trips, 'expected seed trips in content/travel.json'
    for trip in trips:
        assert trip['name'] in html
        assert f'data-trip="{trip["slug"]}"' in html
    countries = {t['country'] for t in trips}
    assert f'{len(trips)} places across {len(countries)} countr' in html
    assert 'id="travel-map"' in html
    assert 'vendor/leaflet/leaflet.js' in html
    assert 'js/travel-map.js' in html


def test_travel_page_marks_sample_trips(client):
    html = client.get('/travel').get_data(as_text=True)
    assert any(t.get('sample') for t in real_trips())
    assert '>sample</span>' in html


def test_travel_page_has_no_cdn_or_api_dependencies(client):
    body = client.get('/travel').data
    for token in (b'unpkg.com', b'cdn.jsdelivr', b'leafletjs.com/dist', b'googleapis.com/photos',
                  b'api_key', b'apiKey'):
        assert token not in body


def test_travel_in_sitemap_and_nav(client):
    assert f'{site.SITE_URL}/travel</loc>' in client.get('/sitemap.xml').get_data(as_text=True)
    home = client.get('/').get_data(as_text=True)
    assert home.count('href="/travel"') >= 2  # desktop + mobile nav


def test_travel_meta_description_present(client):
    html = client.get('/travel').get_data(as_text=True)
    assert site.PAGE_META_DESCRIPTIONS['travel'] in html


# ------------------------------------------------------------- loading

def test_load_trips_sorts_newest_first_and_adds_thumb():
    trips = site.load_trips()
    starts = [t['start'] for t in trips]
    assert starts == sorted(starts, reverse=True)
    for trip in trips:
        assert trip['thumb'].startswith('images/travel/')
        assert trip['dates'] if 'dates' in trip else True


def test_format_trip_dates():
    def trip(start, end=None):
        return {'start': site.datetime(*start), 'end': site.datetime(*end) if end else None}
    assert site.format_trip_dates(trip((2025, 5, 10), (2025, 5, 17))) == 'May 10 – 17, 2025'
    assert site.format_trip_dates(trip((2024, 12, 28), (2025, 1, 3))) == 'Dec 28, 2024 – Jan 3, 2025'
    assert site.format_trip_dates(trip((2025, 4, 28), (2025, 5, 2))) == 'Apr 28 – May 2, 2025'
    assert site.format_trip_dates(trip((2025, 5, 10))) == 'May 10, 2025'


@pytest.mark.parametrize('mutate, message', [
    (lambda t: t.pop('lat'), 'missing lat'),
    (lambda t: t.update(lat=123.4), 'out-of-range lat'),
    (lambda t: t.update(date_start='10/05/2025'), 'ISO date'),
    (lambda t: t.update(date_end='2020-01-01'), 'ends before it starts'),
    (lambda t: t.update(photos=[]), 'at least one photo'),
    (lambda t: t.update(photos=[{'alt': 'x'}]), 'without a src'),
    (lambda t: t.update(photos=[{'src': '/static/images/x.webp'}]), 'relative to static/'),
    (lambda t: t.update(slug='Bad Slug'), 'invalid slug'),
    (lambda t: t.update(album_url='photos.google.com/x'), 'absolute http'),
])
def test_invalid_trip_is_rejected(tmp_path, monkeypatch, mutate, message):
    trip = json.loads(json.dumps(real_trips()[0]))
    mutate(trip)
    path = tmp_path / 'travel.json'
    path.write_text(json.dumps([trip]), encoding='utf-8')
    monkeypatch.setattr(site, 'TRAVEL_FILE', str(path))
    with pytest.raises(ValueError, match=message):
        site.load_trips()


def test_duplicate_slug_is_rejected(tmp_path, monkeypatch):
    trip = real_trips()[0]
    path = tmp_path / 'travel.json'
    path.write_text(json.dumps([trip, trip]), encoding='utf-8')
    monkeypatch.setattr(site, 'TRAVEL_FILE', str(path))
    with pytest.raises(ValueError, match='duplicate slug'):
        site.load_trips()


def test_missing_travel_file_renders_empty_page(tmp_path, monkeypatch, client):
    monkeypatch.setattr(site, 'TRAVEL_FILE', str(tmp_path / 'nope.json'))
    html = client.get('/travel').get_data(as_text=True)
    assert '0 places across 0 countries' in html
    assert 'No trips yet' in html


# -------------------------------------------------------- add_trip.py

def make_photo(path, size=(3000, 2000), gps=None, taken=None, orientation=None):
    img = Image.new('RGB', size, (120, 40, 200))
    exif = Image.Exif()
    exif[0x010F] = 'TestCam'
    exif[0x0110] = 'Model X'
    if orientation:
        exif[0x0112] = orientation
    if taken:
        exif.get_ifd(add_trip.EXIF_IFD)[add_trip.DATETIME_ORIGINAL] = taken
    if gps:
        ifd = exif.get_ifd(add_trip.GPS_IFD)
        lat, lng = gps
        ifd[1] = 'N' if lat >= 0 else 'S'
        ifd[2] = _dms(abs(lat))
        ifd[3] = 'E' if lng >= 0 else 'W'
        ifd[4] = _dms(abs(lng))
    img.save(path, exif=exif.tobytes())
    return path


def _dms(value):
    degrees = int(value)
    minutes = int((value - degrees) * 60)
    seconds = round((value - degrees - minutes / 60) * 3600, 2)
    return (float(degrees), float(minutes), seconds)


@pytest.fixture
def repo(tmp_path):
    """A fake repo root with the folders add_trip writes to."""
    (tmp_path / 'static' / 'images' / 'travel').mkdir(parents=True)
    (tmp_path / 'content').mkdir()
    return tmp_path


def run(repo, *args, photos):
    argv = ['--root', str(repo), *args, *[str(p) for p in photos]]
    assert add_trip.main(argv) == 0
    return json.loads((repo / 'content' / 'travel.json').read_text(encoding='utf-8'))


def test_add_trip_resizes_and_strips_exif(repo, tmp_path):
    src = make_photo(tmp_path / 'big.jpg', size=(3200, 2000),
                     gps=(38.7223, -9.1393), taken='2025:05:11 10:00:00')
    trips = run(repo, '--slug', 'lisbon-2025', '--name', 'Lisbon', '--country', 'Portugal',
                '--lat', '38.72', '--lng', '-9.14', '--start', '2025-05-10', '--end', '2025-05-17',
                '--summary', 'Tiles.', photos=[src])

    (trip,) = trips
    (photo,) = trip['photos']
    full = repo / 'static' / photo['src']
    thumb = repo / 'static' / photo['thumb']
    assert full.is_file() and thumb.is_file()
    assert photo['src'] == 'images/travel/lisbon-2025/01.webp'
    with Image.open(full) as out:
        assert out.format == 'WEBP'
        assert out.size == (1600, 1000)
        assert dict(out.getexif()) == {}
        assert not out.getexif().get_ifd(add_trip.GPS_IFD)
        assert 'exif' not in out.info and 'icc_profile' not in out.info and 'xmp' not in out.info
    with Image.open(thumb) as out:
        assert out.size[0] == 400
        assert dict(out.getexif()) == {}
    assert b'TestCam' not in full.read_bytes()
    assert trip['date_start'] == '2025-05-10' and trip['date_end'] == '2025-05-17'
    assert trip['lat'] == 38.72 and trip['lng'] == -9.14
    assert 'sample' not in trip


def test_add_trip_does_not_upscale_small_photos(repo, tmp_path):
    src = make_photo(tmp_path / 'small.jpg', size=(800, 600))
    trips = run(repo, '--slug', 'tiny', '--name', 'Tiny', '--country', 'X', '--lat', '1', '--lng', '2',
                '--start', '2024-01-01', '--summary', 's', photos=[src])
    with Image.open(repo / 'static' / trips[0]['photos'][0]['src']) as out:
        assert out.size == (800, 600)
    assert 'date_end' not in trips[0]


def test_add_trip_applies_exif_orientation(repo, tmp_path):
    # Orientation 6 = rotate 90° CW, so a 3000x2000 landscape file is really a portrait photo.
    src = make_photo(tmp_path / 'rotated.jpg', size=(3000, 2000), orientation=6)
    trips = run(repo, '--slug', 'rot', '--name', 'Rot', '--country', 'X', '--lat', '1', '--lng', '2',
                '--start', '2024-01-01', '--summary', 's', photos=[src])
    with Image.open(repo / 'static' / trips[0]['photos'][0]['src']) as out:
        assert out.size == (1067, 1600)
        assert 0x0112 not in out.getexif()


def test_add_trip_uses_exif_gps_and_dates_when_flags_omitted(repo, tmp_path):
    first = make_photo(tmp_path / 'a.jpg', gps=(42.3601, -71.0589), taken='2024:10:05 09:00:00')
    second = make_photo(tmp_path / 'b.jpg', gps=(42.4, -71.1), taken='2024:10:04 18:30:00')
    third = make_photo(tmp_path / 'c.jpg', taken='2024:10:06 12:00:00')
    trips = run(repo, '--slug', 'boston-2024', '--name', 'Boston', '--country', 'United States',
                '--summary', 's', photos=[first, second, third])
    trip = trips[0]
    assert trip['lat'] == pytest.approx(42.3601, abs=1e-4)
    assert trip['lng'] == pytest.approx(-71.0589, abs=1e-4)
    assert trip['date_start'] == '2024-10-04'
    assert trip['date_end'] == '2024-10-06'
    assert [p['src'] for p in trip['photos']] == [
        f'images/travel/boston-2024/0{i}.webp' for i in (1, 2, 3)]


def test_add_trip_requires_coordinates_without_gps(repo, tmp_path):
    src = make_photo(tmp_path / 'nogps.jpg', taken='2024:10:05 09:00:00')
    with pytest.raises(SystemExit, match='pass --lat and --lng'):
        add_trip.main(['--root', str(repo), '--slug', 'x', '--name', 'X', '--country', 'Y',
                       '--summary', 's', str(src)])


def test_add_trip_replaces_sample_entry_and_stale_photos(repo, tmp_path):
    sample_dir = repo / 'static' / 'images' / 'travel' / 'lisbon-2025'
    sample_dir.mkdir()
    (sample_dir / '01.webp').write_bytes(b'old')
    (sample_dir / '01-thumb.webp').write_bytes(b'old')
    (sample_dir / '02.webp').write_bytes(b'old')
    sample = {'slug': 'lisbon-2025', 'name': 'Lisbon', 'country': 'Portugal', 'lat': 1, 'lng': 2,
              'date_start': '2025-05-10', 'summary': 'Sample', 'sample': True,
              'photos': [{'src': 'images/travel/lisbon-2025/01.webp'},
                         {'src': 'images/travel/lisbon-2025/02.webp'}]}
    other = {'slug': 'boston-2024', 'name': 'Boston', 'country': 'United States', 'lat': 42, 'lng': -71,
             'date_start': '2024-10-04', 'summary': 'Keep me', 'sample': True,
             'photos': [{'src': 'images/travel/boston-2024/01.webp'}]}
    (repo / 'content' / 'travel.json').write_text(json.dumps([other, sample]), encoding='utf-8')

    src = make_photo(tmp_path / 'real.jpg')
    trips = run(repo, '--slug', 'lisbon-2025', '--name', 'Lisbon', '--country', 'Portugal',
                '--lat', '38.72', '--lng', '-9.14', '--start', '2025-05-10',
                '--summary', 'Real trip.', '--album-url', 'https://photos.app.goo.gl/abc', photos=[src])

    assert [t['slug'] for t in trips] == ['boston-2024', 'lisbon-2025']
    assert trips[0] == other  # untouched
    lisbon = trips[1]
    assert lisbon['sample' if 'sample' in lisbon else 'summary'] == 'Real trip.'
    assert lisbon['album_url'] == 'https://photos.app.goo.gl/abc'
    assert sorted(p.name for p in sample_dir.iterdir()) == ['01-thumb.webp', '01.webp']
    assert (sample_dir / '01.webp').read_bytes() != b'old'


def test_add_trip_output_validates_with_the_site_loader(repo, tmp_path, monkeypatch):
    src = make_photo(tmp_path / 'p.jpg')
    run(repo, '--slug', 'ok-trip', '--name', 'Ok', '--country', 'Nowhere', '--lat', '0', '--lng', '0',
        '--start', '2024-01-01', '--end', '2024-01-02', '--summary', 's', photos=[src])
    monkeypatch.setattr(site, 'TRAVEL_FILE', str(repo / 'content' / 'travel.json'))
    (trip,) = site.load_trips()
    assert trip['slug'] == 'ok-trip'
    assert trip['sample'] is False
