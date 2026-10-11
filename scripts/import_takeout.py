#!/usr/bin/env python3
"""Propose trips from a Google Takeout export (or any photo folder), then ingest them.

Google Photos has no API a website can read, but Google Takeout
(https://takeout.google.com -> deselect all -> Google Photos -> export) gives
you every photo plus a JSON sidecar per photo carrying the capture time and GPS
even when the image's own EXIF has been stripped. This script turns such a
folder into trips without any network access:

    python scripts/import_takeout.py ~/Downloads/Takeout/Google\\ Photos
    #   -> writes content/travel-proposal.json; review and edit it
    python scripts/import_takeout.py --apply
    #   -> runs scripts/add_trip.py for every proposed trip

Step by step:
  1. For every photo (jpg/jpeg/png/webp/tif), read the capture time and location
     from the Takeout sidecar (<photo>.json, <photo>.supplemental-metadata.json,
     or <stem>.json) first, then fall back to the image EXIF. Photos with no
     location are skipped (listed in the proposal under "skipped").
  2. Reverse-geocode OFFLINE to the nearest of ~400 bundled places
     (scripts/places.json: major cities, capitals, well-known destinations).
  3. Sort by time and cluster into trips: a photo joins the current trip when it
     is within 150 km of the trip's first photo and less than 5 days after the
     previous photo; otherwise it starts a new trip.
  4. Write content/travel-proposal.json: one entry per trip with a suggested
     slug, name, country, lat/lng, dates, photo count, a few sample filenames,
     a placeholder summary, and the full photo list used by --apply.
     Edit names, summaries, slugs, or delete trips you don't want, then:
  5. --apply reads the proposal and calls add_trip for each trip, which resizes
     the photos, strips metadata, and updates content/travel.json. Sample trips
     with a matching slug are replaced.

Options: --proposal PATH (default content/travel-proposal.json), --root PATH
(repo root for --apply), --max-km (default 150), --gap-days (default 5).
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import add_trip  # noqa: E402  (same folder; shared EXIF reader and ingestion)

REPO_ROOT = SCRIPT_DIR.parent
PLACES_FILE = SCRIPT_DIR / 'places.json'
DEFAULT_PROPOSAL = REPO_ROOT / 'content' / 'travel-proposal.json'
PHOTO_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'}
DEFAULT_MAX_KM = 150.0
DEFAULT_GAP_DAYS = 5.0
EARTH_RADIUS_KM = 6371.0


# ------------------------------------------------------------ geography

def haversine_km(lat1, lng1, lat2, lng2) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def load_places(path: Path = PLACES_FILE) -> list:
    return json.loads(path.read_text(encoding='utf-8'))


def nearest_place(lat: float, lng: float, places: list) -> dict:
    """The bundled place closest to (lat, lng), with its distance in km."""
    best = min(places, key=lambda p: haversine_km(lat, lng, p['lat'], p['lng']))
    return dict(best, distance_km=round(haversine_km(lat, lng, best['lat'], best['lng']), 1))


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', ascii_text.lower()).strip('-') or 'trip'


# ------------------------------------------------------------- metadata

def _sidecar_candidates(photo: Path):
    yield photo.with_name(photo.name + '.json')
    yield photo.with_name(photo.name + '.supplemental-metadata.json')
    yield photo.with_suffix('.json')
    # Takeout truncates long names; match any json starting with the stem.
    for candidate in sorted(photo.parent.glob(photo.stem[:40] + '*.json')):
        yield candidate


def read_sidecar(photo: Path) -> dict | None:
    """Capture time and GPS from a Google Takeout JSON sidecar, if one exists."""
    for candidate in _sidecar_candidates(photo):
        if not candidate.is_file():
            continue
        try:
            data = json.loads(candidate.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        taken = None
        stamp = (data.get('photoTakenTime') or {}).get('timestamp')
        if stamp is not None:
            try:
                taken = datetime.fromtimestamp(int(stamp), tz=timezone.utc).replace(tzinfo=None)
            except (TypeError, ValueError, OverflowError):
                taken = None
        lat = lng = None
        for key in ('geoData', 'geoDataExif'):
            geo = data.get(key) or {}
            glat, glng = geo.get('latitude'), geo.get('longitude')
            if isinstance(glat, (int, float)) and isinstance(glng, (int, float)) and (glat, glng) != (0, 0):
                lat, lng = float(glat), float(glng)
                break
        return {'lat': lat, 'lng': lng, 'taken': taken}
    return None


def read_photo_metadata(photo: Path) -> dict:
    """{'path', 'lat', 'lng', 'taken'}: sidecar values first, EXIF fills the gaps."""
    meta = {'path': photo, 'lat': None, 'lng': None, 'taken': None}
    sidecar = read_sidecar(photo)
    if sidecar:
        meta.update({k: v for k, v in sidecar.items() if v is not None})
    if meta['lat'] is None or meta['taken'] is None:
        try:
            exif = add_trip.read_exif(photo)
        except Exception:  # unreadable/unsupported image: keep whatever the sidecar gave
            exif = {}
        if meta['lat'] is None and exif.get('lat') is not None:
            meta['lat'], meta['lng'] = exif['lat'], exif['lng']
        if meta['taken'] is None and exif.get('taken'):
            meta['taken'] = exif['taken']
    return meta


def scan_folder(folder: Path) -> list:
    photos = sorted(p for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in PHOTO_EXTENSIONS)
    return [read_photo_metadata(p) for p in photos]


# ------------------------------------------------------------ clustering

def cluster_trips(photos: list, max_km: float = DEFAULT_MAX_KM, gap_days: float = DEFAULT_GAP_DAYS) -> list:
    """Group located, dated photo metadata into trips.

    Photos are sorted by capture time. A photo joins the open trip when it is
    within max_km of that trip's first photo and no more than gap_days after
    the trip's previous photo; otherwise it starts a new trip. Photos without
    a location or time are left out (callers report them as skipped).
    """
    usable = sorted((p for p in photos if p.get('lat') is not None and p.get('taken')),
                    key=lambda p: p['taken'])
    trips = []
    for photo in usable:
        if trips:
            trip = trips[-1]
            anchor = trip[0]
            same_place = haversine_km(photo['lat'], photo['lng'], anchor['lat'], anchor['lng']) <= max_km
            recent = (photo['taken'] - trip[-1]['taken']).total_seconds() <= gap_days * 86400
            if same_place and recent:
                trip.append(photo)
                continue
        trips.append([photo])
    return trips


def _centroid(photos: list) -> tuple:
    lat = sum(p['lat'] for p in photos) / len(photos)
    lng = sum(p['lng'] for p in photos) / len(photos)
    return round(lat, 5), round(lng, 5)


def build_proposal(photos: list, places: list, max_km: float = DEFAULT_MAX_KM,
                   gap_days: float = DEFAULT_GAP_DAYS, base: Path | None = None) -> dict:
    """Trip proposals (newest first) plus the photos that could not be placed."""
    clusters = cluster_trips(photos, max_km=max_km, gap_days=gap_days)
    trips = []
    used_slugs = set()
    for cluster in clusters:
        lat, lng = _centroid(cluster)
        place = nearest_place(lat, lng, places)
        start, end = cluster[0]['taken'], cluster[-1]['taken']
        slug = f"{slugify(place['name'])}-{start.year}"
        candidate, n = slug, 2
        while candidate in used_slugs:
            candidate = f'{slug}-{n}'
            n += 1
        used_slugs.add(candidate)
        files = [_display_path(p['path'], base) for p in cluster]
        trip = {
            'slug': candidate,
            'name': place['name'],
            'country': place['country'],
            'lat': lat,
            'lng': lng,
            'date_start': start.strftime('%Y-%m-%d'),
            'date_end': end.strftime('%Y-%m-%d') if end.date() != start.date() else None,
            'summary': f"TODO: a sentence or two about {place['name']}.",
            'nearest_place_km': place['distance_km'],
            'photo_count': len(cluster),
            'sample_photos': files[:3],
            'photos': files,
        }
        trips.append(trip)
    trips.sort(key=lambda t: t['date_start'], reverse=True)
    skipped = [_display_path(p['path'], base) for p in photos
               if p.get('lat') is None or not p.get('taken')]
    return {'generated': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'base_folder': str(base) if base else None,
            'max_km': max_km, 'gap_days': gap_days,
            'trips': trips, 'skipped': skipped}


def _display_path(path: Path, base: Path | None) -> str:
    if base:
        try:
            return path.resolve().relative_to(base.resolve()).as_posix()
        except ValueError:
            pass
    return str(path)


# ------------------------------------------------------------------ apply

def apply_proposal(proposal: dict, root: Path) -> int:
    """Run add_trip for every proposed trip; returns the number ingested."""
    base = Path(proposal.get('base_folder') or '.')
    count = 0
    for trip in proposal.get('trips', []):
        photos = [str(base / p) if not Path(p).is_absolute() else p for p in trip['photos']]
        argv = ['--root', str(root), '--slug', trip['slug'], '--name', trip['name'],
                '--country', trip['country'], '--lat', str(trip['lat']), '--lng', str(trip['lng']),
                '--start', trip['date_start'], '--summary', trip['summary']]
        if trip.get('date_end'):
            argv += ['--end', trip['date_end']]
        if trip.get('album_url'):
            argv += ['--album-url', trip['album_url']]
        add_trip.main(argv + photos)
        count += 1
    return count


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__.split('\n\n', 1)[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split('\n\n', 1)[1])
    parser.add_argument('folder', nargs='?', type=Path,
                        help='Unzipped Takeout "Google Photos" folder (or any folder of photos)')
    parser.add_argument('--apply', action='store_true',
                        help='Ingest every trip in the proposal file via add_trip.py')
    parser.add_argument('--proposal', type=Path, default=DEFAULT_PROPOSAL,
                        help='Proposal file to write, or to read with --apply')
    parser.add_argument('--root', type=Path, default=REPO_ROOT,
                        help='Repo root containing static/ and content/ (default: this repo)')
    parser.add_argument('--max-km', type=float, default=DEFAULT_MAX_KM,
                        help='Photos farther than this from a trip start a new trip')
    parser.add_argument('--gap-days', type=float, default=DEFAULT_GAP_DAYS,
                        help='A gap longer than this between photos starts a new trip')
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.apply:
        if not args.proposal.is_file():
            raise SystemExit(f'no proposal at {args.proposal}; run without --apply first')
        proposal = json.loads(args.proposal.read_text(encoding='utf-8'))
        count = apply_proposal(proposal, args.root.resolve())
        print(f'Ingested {count} trip(s) from {args.proposal}.')
        return 0
    if not args.folder or not args.folder.is_dir():
        raise SystemExit('pass the unzipped Takeout "Google Photos" folder (or --apply)')
    photos = scan_folder(args.folder)
    if not photos:
        raise SystemExit(f'no photos found under {args.folder}')
    proposal = build_proposal(photos, load_places(), max_km=args.max_km,
                              gap_days=args.gap_days, base=args.folder)
    args.proposal.parent.mkdir(parents=True, exist_ok=True)
    args.proposal.write_text(json.dumps(proposal, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f"{len(photos)} photo(s) scanned, {len(proposal['trips'])} trip(s) proposed, "
          f"{len(proposal['skipped'])} skipped (no location/time).")
    for trip in proposal['trips']:
        span = trip['date_start'] + (f" – {trip['date_end']}" if trip['date_end'] else '')
        print(f"  {trip['slug']:<28} {trip['name']}, {trip['country']} ({span}, {trip['photo_count']} photos)")
    print(f'Review/edit {args.proposal}, then run: python scripts/import_takeout.py --apply')
    return 0


if __name__ == '__main__':
    sys.exit(main())
