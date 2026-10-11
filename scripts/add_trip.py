#!/usr/bin/env python3
"""Add or update a trip on the /travel page from a folder of exported photos.

Usage (from the repo root, with the dev requirements installed):

    python scripts/add_trip.py --slug lisbon-2025 --name "Lisbon" --country "Portugal" \
        --lat 38.72 --lng -9.14 --start 2025-05-10 --end 2025-05-17 \
        --summary "A week of pastel de nata and tiled streets." \
        [--album-url https://photos.app.goo.gl/...] ~/Downloads/lisbon/*.jpg

Getting photos out of Google Photos: open photos.google.com, select the photos
for the trip (shift-click for a range), click the three-dot menu -> Download.
Unzip the download if needed and point this script at the files.

What it does, per photo (in command-line order):
  * applies the EXIF orientation, then resizes to at most 1600px on the long
    edge and saves a WebP (quality 82) plus a 400px-wide thumbnail;
  * strips ALL metadata (EXIF GPS, camera make/model, timestamps, XMP, ICC),
    so nothing about where or how a photo was taken ships publicly;
  * writes them to static/images/travel/<slug>/ as NN.webp and NN-thumb.webp
    (any .webp files already in that folder are removed first, so re-running
    replaces the trip's photos, including the shipped "sample" placeholders);
  * appends the trip to content/travel.json, or replaces the entry with the
    same slug (sample entries lose their "sample" flag when replaced).

--lat/--lng default to the first photo's EXIF GPS; --start defaults to the
earliest EXIF capture date and --end to the latest (omitted when equal).
Captions default to blank; edit content/travel.json afterwards to add them.
Run the test suite (pytest -m "not e2e") to confirm every referenced file exists.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover - friendlier than a traceback
    sys.exit('Pillow is required: pip install -r requirements-dev.txt')

REPO_ROOT = Path(__file__).resolve().parent.parent
MAX_LONG_EDGE = 1600
THUMB_WIDTH = 400
WEBP_QUALITY = 82
SLUG_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')

EXIF_IFD = 0x8769
GPS_IFD = 0x8825
GPS_LAT_REF, GPS_LAT, GPS_LNG_REF, GPS_LNG = 1, 2, 3, 4
DATETIME_ORIGINAL, DATETIME = 36867, 306


def _dms_to_decimal(dms, ref) -> float:
    degrees, minutes, seconds = (float(v) for v in dms)
    value = degrees + minutes / 60 + seconds / 3600
    return -value if ref in ('S', 'W') else value


def read_exif(path: Path) -> dict:
    """Return {'lat', 'lng', 'taken'} where available (values may be None)."""
    info = {'lat': None, 'lng': None, 'taken': None}
    with Image.open(path) as img:
        exif = img.getexif()
        gps = exif.get_ifd(GPS_IFD)
        if all(k in gps for k in (GPS_LAT_REF, GPS_LAT, GPS_LNG_REF, GPS_LNG)):
            try:
                info['lat'] = round(_dms_to_decimal(gps[GPS_LAT], gps[GPS_LAT_REF]), 5)
                info['lng'] = round(_dms_to_decimal(gps[GPS_LNG], gps[GPS_LNG_REF]), 5)
            except (TypeError, ValueError, ZeroDivisionError):
                pass
        raw = exif.get_ifd(EXIF_IFD).get(DATETIME_ORIGINAL) or exif.get(DATETIME)
        if isinstance(raw, str):
            try:
                info['taken'] = datetime.strptime(raw[:19], '%Y:%m:%d %H:%M:%S')
            except ValueError:
                pass
    return info


def _clean_copy(img: Image.Image) -> Image.Image:
    """Orientation applied, RGB, and no metadata at all."""
    img = ImageOps.exif_transpose(img)
    img = img.convert('RGB')
    img.info = {}
    return img


def _save_webp(img: Image.Image, dest: Path) -> None:
    # exif/icc/xmp are only written when passed explicitly; img.info is empty.
    img.save(dest, 'WEBP', quality=WEBP_QUALITY, method=6)


def process_photo(src: Path, dest_dir: Path, index: int) -> dict:
    """Write NN.webp and NN-thumb.webp for one source photo; return its JSON entry."""
    with Image.open(src) as original:
        img = _clean_copy(original)
    full = img.copy()
    full.thumbnail((MAX_LONG_EDGE, MAX_LONG_EDGE), Image.Resampling.LANCZOS)
    thumb = img.copy()
    thumb_height = max(1, round(img.height * THUMB_WIDTH / img.width))
    thumb.thumbnail((THUMB_WIDTH, thumb_height), Image.Resampling.LANCZOS)

    stem = f'{index:02d}'
    full_path = dest_dir / f'{stem}.webp'
    thumb_path = dest_dir / f'{stem}-thumb.webp'
    _save_webp(full, full_path)
    _save_webp(thumb, thumb_path)
    # Paths in travel.json are relative to static/ (like url_for('static', ...)).
    parts = dest_dir.parts
    rel = Path(*parts[len(parts) - 1 - parts[::-1].index('static') + 1:])
    return {
        'src': (rel / full_path.name).as_posix(),
        'thumb': (rel / thumb_path.name).as_posix(),
        'alt': '',
        'caption': '',
    }


def merge_trip(trips: list, trip: dict) -> list:
    """Replace the entry with the same slug (dropping its sample flag) or append."""
    merged = []
    replaced = False
    for existing in trips:
        if existing.get('slug') == trip['slug']:
            merged.append(trip)
            replaced = True
        else:
            merged.append(existing)
    if not replaced:
        merged.append(trip)
    return merged


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__.split('\n\n', 1)[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split('\n\n', 1)[1])
    parser.add_argument('--slug', required=True, help='URL-safe id, e.g. lisbon-2025')
    parser.add_argument('--name', required=True, help='Place name shown on the card')
    parser.add_argument('--country', required=True)
    parser.add_argument('--lat', type=float, help='Defaults to the first photo\'s EXIF GPS')
    parser.add_argument('--lng', type=float, help='Defaults to the first photo\'s EXIF GPS')
    parser.add_argument('--start', help='ISO date; defaults to the earliest EXIF capture date')
    parser.add_argument('--end', help='ISO date; defaults to the latest EXIF capture date')
    parser.add_argument('--summary', required=True, help='One or two sentences')
    parser.add_argument('--album-url', help='Optional Google Photos shared-album link')
    parser.add_argument('--root', type=Path, default=REPO_ROOT,
                        help='Repo root containing static/ and content/ (default: this repo)')
    parser.add_argument('photos', nargs='+', type=Path, help='Original photo files')
    return parser


def _iso(value: str, flag: str) -> str:
    try:
        return datetime.strptime(value, '%Y-%m-%d').strftime('%Y-%m-%d')
    except ValueError:
        raise SystemExit(f'{flag} must be an ISO date (YYYY-MM-DD), got {value!r}')


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if not SLUG_RE.match(args.slug):
        raise SystemExit('--slug must be lowercase letters, digits and hyphens')
    if (args.lat is None) != (args.lng is None):
        raise SystemExit('pass both --lat and --lng, or neither')
    photos = [p for p in args.photos if p.is_file()]
    if not photos:
        raise SystemExit('no photo files found')

    exif_infos = [read_exif(p) for p in photos]
    lat, lng = args.lat, args.lng
    if lat is None:
        first = exif_infos[0]
        if first['lat'] is None:
            raise SystemExit('no EXIF GPS in the first photo; pass --lat and --lng')
        lat, lng = first['lat'], first['lng']
    dates = sorted(info['taken'] for info in exif_infos if info['taken'])
    start = _iso(args.start, '--start') if args.start else (dates[0].strftime('%Y-%m-%d') if dates else None)
    if start is None:
        raise SystemExit('no EXIF dates in the photos; pass --start')
    end = _iso(args.end, '--end') if args.end else (dates[-1].strftime('%Y-%m-%d') if dates else None)
    if end == start:
        end = None
    if end and end < start:
        raise SystemExit('--end is before --start')

    root = args.root.resolve()
    dest_dir = root / 'static' / 'images' / 'travel' / args.slug
    dest_dir.mkdir(parents=True, exist_ok=True)
    for stale in dest_dir.glob('*.webp'):
        stale.unlink()
    entries = [process_photo(path, dest_dir, index) for index, path in enumerate(photos, start=1)]

    trip = {
        'slug': args.slug,
        'name': args.name,
        'country': args.country,
        'lat': lat,
        'lng': lng,
        'date_start': start,
    }
    if end:
        trip['date_end'] = end
    trip['summary'] = args.summary
    if args.album_url:
        trip['album_url'] = args.album_url
    trip['photos'] = entries

    travel_file = root / 'content' / 'travel.json'
    existing = json.loads(travel_file.read_text(encoding='utf-8')) if travel_file.exists() else []
    travel_file.parent.mkdir(parents=True, exist_ok=True)
    travel_file.write_text(json.dumps(merge_trip(existing, trip), indent=2, ensure_ascii=False) + '\n',
                           encoding='utf-8')
    print(f"Wrote {len(entries)} photo(s) to {dest_dir.relative_to(root)} and "
          f"updated {travel_file.relative_to(root)} ({args.slug}).")
    return 0


if __name__ == '__main__':
    sys.exit(main())
