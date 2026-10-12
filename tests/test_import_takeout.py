"""Clustering, sidecar parsing, offline reverse geocoding, and --apply for import_takeout.py."""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from PIL import Image

from conftest import PROJECT_ROOT

sys.path.insert(0, str(PROJECT_ROOT / 'scripts'))
import import_takeout as takeout  # noqa: E402
import add_trip  # noqa: E402

PLACES = takeout.load_places()


def meta(lat, lng, when, name='p.jpg'):
    return {'path': Path(name), 'lat': lat, 'lng': lng, 'taken': when}


T0 = datetime(2025, 5, 10, 9, 0)


# ------------------------------------------------------------ clustering

def test_cluster_groups_by_place_and_splits_on_time_gap():
    photos = [
        meta(38.72, -9.14, T0, 'lisbon1.jpg'),
        meta(38.70, -9.20, T0 + timedelta(days=2), 'lisbon2.jpg'),      # same trip
        meta(41.15, -8.61, T0 + timedelta(days=3), 'porto.jpg'),        # 270 km away -> new trip
        meta(42.36, -71.06, T0 + timedelta(days=40), 'boston1.jpg'),    # new trip
        meta(42.40, -71.00, T0 + timedelta(days=41), 'boston2.jpg'),
        meta(42.36, -71.06, T0 + timedelta(days=50), 'boston3.jpg'),    # 9-day gap -> new trip
    ]
    trips = takeout.cluster_trips(photos)
    assert [[p['path'].name for p in t] for t in trips] == [
        ['lisbon1.jpg', 'lisbon2.jpg'], ['porto.jpg'], ['boston1.jpg', 'boston2.jpg'], ['boston3.jpg']]


def test_cluster_sorts_by_time_and_skips_unlocated_or_undated():
    photos = [
        meta(42.36, -71.06, T0 + timedelta(days=1), 'later.jpg'),
        meta(42.36, -71.06, T0, 'earlier.jpg'),
        meta(None, None, T0, 'nogps.jpg'),
        meta(42.36, -71.06, None, 'notime.jpg'),
    ]
    (trip,) = takeout.cluster_trips(photos)
    assert [p['path'].name for p in trip] == ['earlier.jpg', 'later.jpg']


def test_cluster_distance_is_measured_from_the_trips_first_photo():
    # A slow drift of 100 km/day must not chain into one endless trip.
    photos = [meta(40.0, -3.7 + 1.2 * i, T0 + timedelta(days=i), f'{i}.jpg') for i in range(4)]
    trips = takeout.cluster_trips(photos, max_km=150)
    assert len(trips) == 2 and len(trips[0]) == 2


def test_cluster_thresholds_are_configurable():
    photos = [meta(38.72, -9.14, T0), meta(38.72, -9.14, T0 + timedelta(days=3))]
    assert len(takeout.cluster_trips(photos, gap_days=5)) == 1
    assert len(takeout.cluster_trips(photos, gap_days=2)) == 2


# ----------------------------------------------------------- geography

def test_haversine_and_offline_reverse_geocode():
    assert takeout.haversine_km(38.72, -9.14, 41.15, -8.61) == pytest.approx(274, abs=5)
    place = takeout.nearest_place(42.34, -71.10, PLACES)
    assert (place['name'], place['country']) == ('Boston', 'United States')
    assert place['distance_km'] < 10
    place = takeout.nearest_place(38.75, -9.10, PLACES)
    assert (place['name'], place['country']) == ('Lisbon', 'Portugal')


def test_bundled_places_are_well_formed():
    assert len(PLACES) >= 300
    assert len({(p['name'], p['country']) for p in PLACES}) == len(PLACES)
    for p in PLACES:
        assert -90 <= p['lat'] <= 90 and -180 <= p['lng'] <= 180
        assert p['name'] and p['country']


def test_slugify_strips_accents_and_punctuation():
    assert takeout.slugify("Xi'an") == 'xi-an'
    assert takeout.slugify('São Paulo') == 'sao-paulo'
    assert takeout.slugify('Kraków') == 'krakow'


# ------------------------------------------------------------ proposal

def test_build_proposal_names_trips_and_dedupes_slugs(tmp_path):
    photos = [
        meta(38.72, -9.14, T0, 'a.jpg'), meta(38.72, -9.14, T0 + timedelta(days=4), 'b.jpg'),
        meta(38.72, -9.14, T0 + timedelta(days=60), 'c.jpg'),   # Lisbon again, same year
        meta(None, None, T0, 'nogps.jpg'),
    ]
    for p in photos:
        p['path'] = tmp_path / p['path'].name
    proposal = takeout.build_proposal(photos, PLACES, base=tmp_path)
    assert [t['slug'] for t in proposal['trips']] == ['lisbon-2025-2', 'lisbon-2025']  # newest first
    first = proposal['trips'][1]
    assert first['name'] == 'Lisbon' and first['country'] == 'Portugal'
    assert first['date_start'] == '2025-05-10' and first['date_end'] == '2025-05-14'
    assert first['photo_count'] == 2 and first['sample_photos'] == ['a.jpg', 'b.jpg']
    assert first['photos'] == ['a.jpg', 'b.jpg']
    assert 'TODO' in first['summary']
    assert proposal['trips'][0]['date_end'] is None
    assert proposal['skipped'] == ['nogps.jpg']


# ------------------------------------------------------------- sidecars

def write_photo(path, size=(1200, 800), **exif_kwargs):
    img = Image.new('RGB', size, (10, 120, 90))
    exif = Image.Exif()
    if exif_kwargs.get('taken'):
        exif.get_ifd(add_trip.EXIF_IFD)[add_trip.DATETIME_ORIGINAL] = exif_kwargs['taken']
    if exif_kwargs.get('gps'):
        lat, lng = exif_kwargs['gps']
        ifd = exif.get_ifd(add_trip.GPS_IFD)
        ifd[1], ifd[2] = ('N' if lat >= 0 else 'S'), (float(int(abs(lat))), 0.0, (abs(lat) % 1) * 3600)
        ifd[3], ifd[4] = ('E' if lng >= 0 else 'W'), (float(int(abs(lng))), 0.0, (abs(lng) % 1) * 3600)
    img.save(path, exif=exif.tobytes())
    return path


def test_sidecar_is_preferred_over_exif_and_zero_geo_is_ignored(tmp_path):
    photo = write_photo(tmp_path / 'IMG_1.jpg', gps=(1.0, 1.0), taken='2020:01:01 00:00:00')
    stamp = int(datetime(2025, 5, 10, 12, 0, tzinfo=timezone.utc).timestamp())
    (tmp_path / 'IMG_1.jpg.json').write_text(json.dumps({
        'photoTakenTime': {'timestamp': str(stamp)},
        'geoData': {'latitude': 0.0, 'longitude': 0.0},
        'geoDataExif': {'latitude': 38.72, 'longitude': -9.14},
    }))
    m = takeout.read_photo_metadata(photo)
    assert (m['lat'], m['lng']) == (38.72, -9.14)
    assert m['taken'] == datetime(2025, 5, 10, 12, 0)


def test_supplemental_metadata_sidecar_and_exif_fallback(tmp_path):
    photo = write_photo(tmp_path / 'IMG_2.jpg', gps=(42.36, -71.06), taken='2024:10:05 09:00:00')
    (tmp_path / 'IMG_2.jpg.supplemental-metadata.json').write_text(json.dumps({
        'photoTakenTime': {'timestamp': '1728118800'}}))  # 2024-10-05 09:00 UTC, no geo
    m = takeout.read_photo_metadata(photo)
    assert m['taken'] == datetime(2024, 10, 5, 9, 0)
    assert m['lat'] == pytest.approx(42.36, abs=1e-3) and m['lng'] == pytest.approx(-71.06, abs=1e-3)


def test_photo_without_any_metadata_is_unlocated(tmp_path):
    m = takeout.read_photo_metadata(write_photo(tmp_path / 'plain.jpg'))
    assert m['lat'] is None and m['taken'] is None


# -------------------------------------------------------------- end to end

def test_main_writes_proposal_then_apply_ingests_trips(tmp_path):
    export = tmp_path / 'Takeout' / 'Google Photos' / 'Photos from 2025'
    export.mkdir(parents=True)
    for i, day in enumerate((10, 11, 12)):
        write_photo(export / f'lisbon_{i}.jpg', gps=(38.72, -9.14), taken=f'2025:05:{day} 10:00:00')
    write_photo(export / 'boston.jpg', gps=(42.36, -71.06), taken='2024:10:05 10:00:00')
    write_photo(export / 'nowhere.jpg')
    repo = tmp_path / 'repo'
    (repo / 'static' / 'images' / 'travel').mkdir(parents=True)
    (repo / 'content').mkdir()
    (repo / 'content' / 'travel.json').write_text(json.dumps([{
        'slug': 'lisbon-2025', 'name': 'Lisbon', 'country': 'Portugal', 'lat': 1, 'lng': 2,
        'date_start': '2025-05-10', 'summary': 'Sample', 'sample': True,
        'photos': [{'src': 'images/travel/lisbon-2025/01.webp'}]}]))
    proposal_path = repo / 'content' / 'travel-proposal.json'

    assert takeout.main([str(export.parent), '--proposal', str(proposal_path), '--root', str(repo)]) == 0
    proposal = json.loads(proposal_path.read_text())
    assert [t['slug'] for t in proposal['trips']] == ['lisbon-2025', 'boston-2024']
    assert proposal['skipped'] == ['Photos from 2025/nowhere.jpg']
    assert proposal['trips'][0]['photos'] == [f'Photos from 2025/lisbon_{i}.jpg' for i in range(3)]

    # The captain edits the proposal, then applies it.
    proposal['trips'][0]['summary'] = 'A week in Lisbon.'
    proposal_path.write_text(json.dumps(proposal))
    assert takeout.main(['--apply', '--proposal', str(proposal_path), '--root', str(repo)]) == 0

    trips = json.loads((repo / 'content' / 'travel.json').read_text())
    assert [t['slug'] for t in trips] == ['lisbon-2025', 'boston-2024']
    lisbon = trips[0]
    assert lisbon['summary'] == 'A week in Lisbon.' and 'sample' not in lisbon
    assert lisbon['date_start'] == '2025-05-10' and lisbon['date_end'] == '2025-05-12'
    assert len(lisbon['photos']) == 3
    for trip in trips:
        for photo in trip['photos']:
            assert (repo / 'static' / photo['src']).is_file()
            with Image.open(repo / 'static' / photo['src']) as out:
                assert dict(out.getexif()) == {}


def test_apply_without_proposal_fails_clearly(tmp_path):
    with pytest.raises(SystemExit, match='no proposal'):
        takeout.main(['--apply', '--proposal', str(tmp_path / 'missing.json')])
