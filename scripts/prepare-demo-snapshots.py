#!/usr/bin/env python3
"""Create the committed Gyeongbuk-only raw snapshots from the supplied files.

The external originals are read-only inputs and are intentionally not copied
into Git. Run this from the repository root with no arguments; it discovers
the decomposed-Unicode filenames under the local Downloads directory.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import sys
import unicodedata
from itertools import zip_longest
from pathlib import Path
from struct import unpack
from xml.etree import ElementTree as ET
from zipfile import ZipFile


DOWNLOADS = Path('/Users/hyeonhongchang/Downloads')
OUTPUT_DIRECTORY = Path(__file__).resolve().parents[1] / 'data' / 'raw' / 'demo'
WORKBOOK_SNAPSHOT = 'ecosystem-disturbing-organisms-gyeongbuk-2016-2024.json'
NIE_SNAPSHOT = 'nie-alien-fish-gyeongbuk-2015-2022.json'
PLANT_SNAPSHOT = 'nie-alien-plants-gyeongbuk-2015-2021.json'
KDPA_SNAPSHOT = 'kdpa-protected-areas-oecm-gyeongbuk-2025.geojson'
KDPA_DIRECTORY = DOWNLOADS / '2025_ver'
KDPA_SHAPEFILE = KDPA_DIRECTORY / 'Protected_areas_OECM_Republic_of_Korea_ver_2025.shp'
KDPA_DBF = KDPA_SHAPEFILE.with_suffix('.dbf')
KDPA_PRJ = KDPA_SHAPEFILE.with_suffix('.prj')
KDPA_CPG = KDPA_SHAPEFILE.with_suffix('.cpg')
KDPA_SHX = KDPA_SHAPEFILE.with_suffix('.shx')
LAKE_SNAPSHOT = 'national-base-map-lakes-gyeongbuk-2024.geojson'
LAKE_DIRECTORY = DOWNLOADS / 'N3A_E0052114'
LAKE_SHAPEFILE = LAKE_DIRECTORY / 'N3A_E0052114.shp'
RIVER_SNAPSHOT = 'national-base-map-rivers-gyeongbuk-2024.geojson'
RIVER_DIRECTORY = DOWNLOADS / 'N3L_E0020000'
RIVER_SHAPEFILE = RIVER_DIRECTORY / 'N3L_E0020000.shp'
FOREST_SNAPSHOT = 'gyeongbuk-forest-habitat-zones-2025.geojson'
FOREST_DIRECTORY = DOWNLOADS / '47'
FOREST_SHARDS = ('47_1', '47_2')
MAX_FOREST_FEATURES_PER_SHARD = 48
MAX_RIVER_REACH_LENGTH_METRES = 2000.0
# Conservative projected envelope around the committed Gyeongbuk boundary.
# It is only an early-out; every published vertex still passes the WGS84 gate.
GYEONGBUK_EPSG5179_ENVELOPE = (900000.0, 1650000.0, 1220000.0, 2000000.0)
SPREADSHEET_NS = {
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}
GYEONGBUK_BOUNDARY = [
    (127.2, 36.95), (127.45, 36.6), (127.35, 36.05), (127.55, 35.72),
    (128.15, 35.55), (128.55, 35.55), (128.9, 35.55), (129.63, 35.55),
    (129.63, 36.15), (129.55, 36.75), (129.5, 37.13), (128.95, 37.25),
    (128.25, 37.1), (127.9, 37.25), (127.2, 36.95),
]


def normalized_name(path: Path) -> str:
    return unicodedata.normalize('NFC', path.name)


def discover_inputs() -> tuple[Path, Path, Path]:
    paths = list(DOWNLOADS.rglob('*'))
    workbook = next(
        path
        for path in paths
        if path.suffix == '.xlsx' and normalized_name(path).endswith('(2016-2024).xlsx')
    )
    fish_csv = next(
        path
        for path in paths
        if path.suffix == '.csv' and '외래어류_2015_2022.csv' in normalized_name(path)
    )
    plant_csv = next(
        path
        for path in paths
        if path.suffix == '.csv' and normalized_name(path) == '외래식물_2015_2021.csv'
    )
    return workbook, fish_csv, plant_csv


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source_file:
        while chunk := source_file.read(1024 * 1024):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def component_checksum(paths: tuple[Path, ...]) -> str:
    """Hash a complete named source bundle, independent of filesystem order."""
    payload = ''.join(
        f"{path.name}\0{sha256_file(path)}\n"
        for path in sorted(paths, key=lambda item: item.name)
    )
    return f"sha256:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


def json_payload_checksum(records: list[dict[str, str]]) -> str:
    payload = json.dumps(records, ensure_ascii=False, separators=(',', ':'))
    return f"sha256:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


def xlsx_rows(path: Path, sheet_name: str) -> list[dict[str, str]]:
    with ZipFile(path) as archive:
        shared_strings: list[str] = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared_root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            shared_strings = [
                ''.join(node.text or '' for node in item.iterfind('.//m:t', SPREADSHEET_NS))
                for item in shared_root.findall('m:si', SPREADSHEET_NS)
            ]
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        relationship_targets = {relationship.attrib['Id']: relationship.attrib['Target'] for relationship in relationships}
        selected_sheet = next(
            sheet
            for sheet in workbook.findall('m:sheets/m:sheet', SPREADSHEET_NS)
            if sheet.attrib['name'] == sheet_name
        )
        relationship_id = selected_sheet.attrib[
            '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
        ]
        worksheet = ET.fromstring(archive.read(f"xl/{relationship_targets[relationship_id]}"))

    rows: list[list[str]] = []
    for row in worksheet.findall('.//m:sheetData/m:row', SPREADSHEET_NS):
        values: list[str] = []
        for cell in row.findall('m:c', SPREADSHEET_NS):
            value = cell.find('m:v', SPREADSHEET_NS)
            raw = '' if value is None else value.text or ''
            values.append(shared_strings[int(raw)] if cell.attrib.get('t') == 's' and raw else raw)
        rows.append(values)
    headers = rows[0]
    return [dict(zip(headers, row, strict=False)) for row in rows[1:]]


def valid_coordinates(record: dict[str, str], latitude: str, longitude: str) -> bool:
    try:
        lat = float(record[latitude])
        lng = float(record[longitude])
    except (KeyError, TypeError, ValueError):
        return False
    return -90 <= lat <= 90 and -180 <= lng <= 180


def is_within_gyeongbuk(record: dict[str, str], latitude: str, longitude: str) -> bool:
    """Mirror the committed TypeScript boundary gate for snapshot generation."""
    lat = float(record[latitude])
    lng = float(record[longitude])
    inside = False
    for (start_lng, start_lat), (end_lng, end_lat) in zip(GYEONGBUK_BOUNDARY, GYEONGBUK_BOUNDARY[1:]):
        if (start_lat > lat) != (end_lat > lat) and lng < (end_lng - start_lng) * (lat - start_lat) / (end_lat - start_lat) + start_lng:
            inside = not inside
    return inside


def write_snapshot(filename: str, source: dict[str, str], records: list[dict[str, str]], audit: dict[str, object]) -> None:
    source['checksum'] = json_payload_checksum(records)
    payload = {'source': source, 'records': records, 'audit': audit}
    (OUTPUT_DIRECTORY / filename).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )


def dbf_rows(path: Path) -> list[dict[str, str]]:
    """Read the supplied KDPA DBF with the encoding declared in its .cpg file."""
    with path.open('rb') as source_file:
        header = source_file.read(32)
        record_count = unpack('<I', header[4:8])[0]
        header_length = unpack('<H', header[8:10])[0]
        record_length = unpack('<H', header[10:12])[0]
        fields: list[tuple[str, int]] = []
        while True:
            field = source_file.read(32)
            if field[0] == 0x0D:
                break
            fields.append((field[:11].split(b'\0', 1)[0].decode('ascii'), field[16]))
        source_file.seek(header_length)
        rows: list[dict[str, str]] = []
        for _ in range(record_count):
            record = source_file.read(record_length)
            if record[:1] == b'*':
                continue
            offset = 1
            row: dict[str, str] = {}
            for name, length in fields:
                row[name] = record[offset:offset + length].decode('cp949').strip()
                offset += length
            rows.append(row)
    return rows


def dbf_row_iterator(path: Path):
    """Stream CP949 DBF rows so nationwide National Base Map inputs stay bounded."""
    with path.open('rb') as source_file:
        header = source_file.read(32)
        record_count = unpack('<I', header[4:8])[0]
        header_length = unpack('<H', header[8:10])[0]
        record_length = unpack('<H', header[10:12])[0]
        fields: list[tuple[str, str, int]] = []
        while True:
            field = source_file.read(32)
            if field[0] == 0x0D:
                break
            fields.append((field[:11].split(b'\0', 1)[0].decode('cp949'), chr(field[11]), field[16]))
        source_file.seek(header_length)
        for _ in range(record_count):
            record = source_file.read(record_length)
            if record[:1] == b'*':
                yield None
                continue
            offset = 1
            row: dict[str, str | float] = {}
            for name, field_type, length in fields:
                text = record[offset:offset + length].decode('cp949').strip()
                row[name] = float(text) if field_type in {'F', 'N'} and text else (0.0 if field_type in {'F', 'N'} else text)
                offset += length
            yield row


def river_dbf_row_iterator(path: Path):
    """Read only river NAME bytes until a record is eligible for publication."""
    with path.open('rb') as source_file:
        header = source_file.read(32)
        record_count = unpack('<I', header[4:8])[0]
        header_length = unpack('<H', header[8:10])[0]
        record_length = unpack('<H', header[10:12])[0]
        fields: dict[str, tuple[int, int]] = {}
        offset = 1
        while True:
            field = source_file.read(32)
            if field[0] == 0x0D:
                break
            fields[field[:11].split(b'\0', 1)[0].decode('ascii')] = (offset, field[16])
            offset += field[16]
        source_file.seek(header_length)
        for _ in range(record_count):
            record = source_file.read(record_length)
            if record[:1] == b'*':
                yield None
                continue
            name_offset, name_length = fields['NAME']
            name = record[name_offset:name_offset + name_length].decode('cp949').strip()
            if not name:
                yield {'NAME': ''}
                continue
            row: dict[str, str | float] = {'NAME': name}
            for field_name in ('UFID', 'DIVI', 'TYPE', 'STAT', 'SCLS', 'FMTA'):
                field_offset, field_length = fields[field_name]
                row[field_name] = record[field_offset:field_offset + field_length].decode('cp949').strip()
            rvnu_offset, rvnu_length = fields['RVNU']
            rvnu_text = record[rvnu_offset:rvnu_offset + rvnu_length].decode('cp949').strip()
            row['RVNU'] = int(float(rvnu_text)) if rvnu_text else 0
            yield row


def signed_ring_area(ring: list[list[float]]) -> float:
    return sum(
        start[0] * end[1] - end[0] * start[1]
        for start, end in zip(ring, ring[1:])
    ) / 2


def shp_polygons(path: Path) -> list[list[list[list[float]]]]:
    """Read WGS84 Polygon records using only the published SHP binary format."""
    with path.open('rb') as source_file:
        header = source_file.read(100)
        if unpack('<i', header[32:36])[0] != 5:
            raise ValueError('KDPA source must be a Polygon SHP file.')
        polygons: list[list[list[list[float]]]] = []
        while record_header := source_file.read(8):
            content_length = unpack('>i', record_header[4:8])[0] * 2
            content = source_file.read(content_length)
            if unpack('<i', content[:4])[0] != 5:
                raise ValueError('KDPA source contains a non-Polygon record.')
            part_count, point_count = unpack('<2i', content[36:44])
            starts = list(unpack(f'<{part_count}i', content[44:44 + part_count * 4]))
            coordinate_offset = 44 + part_count * 4
            points = [
                list(unpack('<2d', content[coordinate_offset + index * 16:coordinate_offset + (index + 1) * 16]))
                for index in range(point_count)
            ]
            starts.append(point_count)
            rings = [points[start:end] for start, end in zip(starts, starts[1:])]
            if not rings or any(len(ring) < 4 or ring[0] != ring[-1] for ring in rings):
                raise ValueError('KDPA source contains an invalid linear ring.')
            if any(not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90) for ring in rings for point in ring):
                raise ValueError('KDPA source contains coordinates outside WGS84 bounds.')

            grouped: list[list[list[float]]] = []
            for ring in rings:
                if signed_ring_area(ring) < 0 or not grouped:
                    grouped.append([ring])
                else:
                    grouped[-1].append(ring)
            polygons.append(grouped)
    return polygons


def inverse_epsg5179(point: tuple[float, float]) -> list[float]:
    """Convert Korea 2000 Unified TM coordinates (EPSG:5179) to WGS84.

    The National Base Map PRJ declares GRS80, central meridian 127.5, scale
    0.9996, false easting 1,000,000, and false northing 2,000,000.  Keeping
    this reader local avoids a runtime GIS dependency and makes the transform
    reproducible in the source-preparation command.
    """
    easting, northing = point
    semi_major = 6378137.0
    flattening = 1 / 298.257222101
    eccentricity_squared = flattening * (2 - flattening)
    second_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    scale = 0.9996
    latitude_origin = 38.0 * 3.141592653589793 / 180
    central_meridian = 127.5 * 3.141592653589793 / 180
    eccentricity_fourth = eccentricity_squared * eccentricity_squared
    eccentricity_sixth = eccentricity_fourth * eccentricity_squared
    meridional_origin = semi_major * (
        (1 - eccentricity_squared / 4 - 3 * eccentricity_fourth / 64 - 5 * eccentricity_sixth / 256) * latitude_origin
        - (3 * eccentricity_squared / 8 + 3 * eccentricity_fourth / 32 + 45 * eccentricity_sixth / 1024) * math.sin(2 * latitude_origin)
        + (15 * eccentricity_fourth / 256 + 45 * eccentricity_sixth / 1024) * math.sin(4 * latitude_origin)
        - (35 * eccentricity_sixth / 3072) * math.sin(6 * latitude_origin)
    )
    meridional_arc = meridional_origin + (northing - 2000000.0) / scale
    mu = meridional_arc / (semi_major * (1 - eccentricity_squared / 4 - 3 * eccentricity_fourth / 64 - 5 * eccentricity_sixth / 256))
    e1 = (1 - math.sqrt(1 - eccentricity_squared)) / (1 + math.sqrt(1 - eccentricity_squared))
    footprint = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
        + (151 * e1**3 / 96) * math.sin(6 * mu)
    )
    sin_footprint = math.sin(footprint)
    cos_footprint = math.cos(footprint)
    tangent_squared = math.tan(footprint) ** 2
    curvature = second_eccentricity_squared * cos_footprint**2
    radius = semi_major / math.sqrt(1 - eccentricity_squared * sin_footprint**2)
    meridian_radius = semi_major * (1 - eccentricity_squared) / (1 - eccentricity_squared * sin_footprint**2) ** 1.5
    distance = (easting - 1000000.0) / (radius * scale)
    latitude = footprint - (radius * math.tan(footprint) / meridian_radius) * (
        distance**2 / 2
        - (5 + 3 * tangent_squared + 10 * curvature - 4 * curvature**2 - 9 * second_eccentricity_squared) * distance**4 / 24
        + (61 + 90 * tangent_squared + 298 * curvature + 45 * tangent_squared**2 - 252 * second_eccentricity_squared - 3 * curvature**2) * distance**6 / 720
    )
    longitude = central_meridian + (
        distance
        - (1 + 2 * tangent_squared + curvature) * distance**3 / 6
        + (5 - 2 * curvature + 28 * tangent_squared - 3 * curvature**2 + 8 * second_eccentricity_squared + 24 * tangent_squared**2) * distance**5 / 120
    ) / cos_footprint
    return [longitude * 180 / math.pi, latitude * 180 / math.pi]


def simplify_ring(ring: list[list[float]], tolerance_metres: float = 10.0) -> list[list[float]]:
    """Deterministically simplify a closed projected ring before reprojection."""
    if len(ring) <= 4:
        return ring

    def distance(point: list[float], start: list[float], end: list[float]) -> float:
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        if dx == 0 and dy == 0:
            return ((point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2) ** 0.5
        return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / (dx * dx + dy * dy) ** 0.5

    def simplify(points: list[list[float]]) -> list[list[float]]:
        if len(points) <= 2:
            return points
        index, maximum = max(
            ((index, distance(point, points[0], points[-1])) for index, point in enumerate(points[1:-1], 1)),
            key=lambda item: item[1],
            default=(0, 0.0),
        )
        if maximum <= tolerance_metres:
            return [points[0], points[-1]]
        return simplify(points[:index + 1])[:-1] + simplify(points[index:])

    open_ring = ring[:-1]
    pivot = min(range(len(open_ring)), key=lambda index: (open_ring[index][0], open_ring[index][1]))
    rotated = open_ring[pivot:] + open_ring[:pivot]
    opposite = max(
        range(1, len(rotated)),
        key=lambda index: (rotated[index][0] - rotated[0][0]) ** 2 + (rotated[index][1] - rotated[0][1]) ** 2,
    )
    # Douglas-Peucker requires distinct endpoints.  A closed ring therefore
    # needs two arcs meeting at a deterministic opposite vertex.
    first_arc = simplify(rotated[:opposite + 1])
    second_arc = simplify(rotated[opposite:] + [rotated[0]])
    simplified = first_arc[:-1] + second_arc
    # A polygon needs at least three distinct vertices.  Keep its original
    # valid ring when the configured tolerance would collapse a small lake.
    return simplified if len(simplified) >= 4 else ring


def epsg5179_polygon_records(path: Path):
    """Stream Polygon SHP records transformed from declared EPSG:5179 to WGS84."""
    with path.open('rb') as source_file:
        header = source_file.read(100)
        if unpack('<i', header[32:36])[0] != 5:
            raise ValueError('National Base Map lake source must be a Polygon SHP file.')
        while record_header := source_file.read(8):
            content_length = unpack('>i', record_header[4:8])[0] * 2
            content = source_file.read(content_length)
            shape_type = unpack('<i', content[:4])[0]
            if shape_type == 0:
                yield None
                continue
            if shape_type != 5:
                raise ValueError('National Base Map lake source contains a non-Polygon record.')
            min_x, min_y, max_x, max_y = unpack('<4d', content[4:36])
            boundary_min_x, boundary_min_y, boundary_max_x, boundary_max_y = GYEONGBUK_EPSG5179_ENVELOPE
            if max_x < boundary_min_x or min_x > boundary_max_x or max_y < boundary_min_y or min_y > boundary_max_y:
                yield []
                continue
            part_count, point_count = unpack('<2i', content[36:44])
            starts = list(unpack(f'<{part_count}i', content[44:44 + part_count * 4]))
            coordinate_offset = 44 + part_count * 4
            points = [
                list(unpack('<2d', content[coordinate_offset + index * 16:coordinate_offset + (index + 1) * 16]))
                for index in range(point_count)
            ]
            starts.append(point_count)
            rings = [simplify_ring(points[start:end]) for start, end in zip(starts, starts[1:])]
            if any(len(ring) < 4 or ring[0] != ring[-1] for ring in rings):
                raise ValueError('National Base Map lake source contains an invalid linear ring.')
            transformed = [[inverse_epsg5179((point[0], point[1])) for point in ring] for ring in rings]
            if any(not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90) for ring in transformed for point in ring):
                raise ValueError('EPSG:5179 transform returned coordinates outside WGS84 bounds.')
            grouped: list[list[list[list[float]]]] = []
            for ring in transformed:
                if signed_ring_area(ring) < 0 or not grouped:
                    grouped.append([ring])
                else:
                    grouped[-1].append(ring)
            yield grouped


def point_in_gyeongbuk(point: list[float]) -> bool:
    longitude, latitude = point
    inside = False
    for (start_longitude, start_latitude), (end_longitude, end_latitude) in zip(GYEONGBUK_BOUNDARY, GYEONGBUK_BOUNDARY[1:]):
        if (start_latitude > latitude) != (end_latitude > latitude) and longitude < (end_longitude - start_longitude) * (latitude - start_latitude) / (end_latitude - start_latitude) + start_longitude:
            inside = not inside
    return inside


def segment_intersection(start: list[float], end: list[float], boundary_start: tuple[float, float], boundary_end: tuple[float, float]) -> list[float] | None:
    denominator = (end[0] - start[0]) * (boundary_end[1] - boundary_start[1]) - (end[1] - start[1]) * (boundary_end[0] - boundary_start[0])
    if abs(denominator) <= 1e-12:
        return None
    offset_x = boundary_start[0] - start[0]
    offset_y = boundary_start[1] - start[1]
    segment_fraction = (offset_x * (boundary_end[1] - boundary_start[1]) - offset_y * (boundary_end[0] - boundary_start[0])) / denominator
    boundary_fraction = (offset_x * (end[1] - start[1]) - offset_y * (end[0] - start[0])) / denominator
    if not (0.0 <= segment_fraction <= 1.0 and 0.0 <= boundary_fraction <= 1.0):
        return None
    return [start[0] + (end[0] - start[0]) * segment_fraction, start[1] + (end[1] - start[1]) * segment_fraction]


def clip_line_to_gyeongbuk(line: list[list[float]]) -> list[list[list[float]]]:
    """Clip a WGS84 centerline to the committed boundary without naming it."""
    clipped: list[list[list[float]]] = []
    current: list[list[float]] = []
    for start, end in zip(line, line[1:]):
        cuts = [start, end]
        for boundary_start, boundary_end in zip(GYEONGBUK_BOUNDARY, GYEONGBUK_BOUNDARY[1:]):
            intersection = segment_intersection(start, end, boundary_start, boundary_end)
            if intersection is not None:
                cuts.append(intersection)
        cuts.sort(key=lambda point: (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2)
        for segment_start, segment_end in zip(cuts, cuts[1:]):
            midpoint = [(segment_start[0] + segment_end[0]) / 2, (segment_start[1] + segment_end[1]) / 2]
            if not point_in_gyeongbuk(midpoint):
                if len(current) > 1:
                    clipped.append(current)
                current = []
                continue
            # Boundary intersections can fall a few floating-point ulps outside
            # the shared TypeScript containment predicate. Nudge only those
            # endpoints toward an already-inside midpoint.
            if not point_in_gyeongbuk(segment_start):
                segment_start = [segment_start[0] + (midpoint[0] - segment_start[0]) * 1e-9, segment_start[1] + (midpoint[1] - segment_start[1]) * 1e-9]
            if not point_in_gyeongbuk(segment_end):
                segment_end = [segment_end[0] + (midpoint[0] - segment_end[0]) * 1e-9, segment_end[1] + (midpoint[1] - segment_end[1]) * 1e-9]
            if not current:
                current = [segment_start]
            elif current[-1] != segment_start:
                current.append(segment_start)
            current.append(segment_end)
    if len(current) > 1:
        clipped.append(current)
    return clipped


def haversine_metres(start: list[float], end: list[float]) -> float:
    longitude_delta = math.radians(end[0] - start[0])
    latitude_delta = math.radians(end[1] - start[1])
    start_latitude = math.radians(start[1])
    end_latitude = math.radians(end[1])
    a = math.sin(latitude_delta / 2) ** 2 + math.cos(start_latitude) * math.cos(end_latitude) * math.sin(longitude_delta / 2) ** 2
    return 6371008.8 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def interpolate_geodesic(start: list[float], end: list[float], fraction: float) -> list[float]:
    start_longitude, start_latitude = map(math.radians, start)
    end_longitude, end_latitude = map(math.radians, end)
    angle = 2 * math.asin(math.sqrt(math.sin((end_latitude - start_latitude) / 2) ** 2 + math.cos(start_latitude) * math.cos(end_latitude) * math.sin((end_longitude - start_longitude) / 2) ** 2))
    if angle == 0:
        return start
    start_weight = math.sin((1 - fraction) * angle) / math.sin(angle)
    end_weight = math.sin(fraction * angle) / math.sin(angle)
    x = start_weight * math.cos(start_latitude) * math.cos(start_longitude) + end_weight * math.cos(end_latitude) * math.cos(end_longitude)
    y = start_weight * math.cos(start_latitude) * math.sin(start_longitude) + end_weight * math.cos(end_latitude) * math.sin(end_longitude)
    z = start_weight * math.sin(start_latitude) + end_weight * math.sin(end_latitude)
    return [math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.sqrt(x * x + y * y)))]


def split_line_into_reaches(line: list[list[float]]) -> list[list[list[float]]]:
    reaches: list[list[list[float]]] = []
    current = [line[0]]
    capacity = MAX_RIVER_REACH_LENGTH_METRES
    for segment_start, segment_end in zip(line, line[1:]):
        start = segment_start
        remaining = haversine_metres(start, segment_end)
        while remaining > 1e-9:
            if remaining <= capacity + 1e-9:
                current.append(segment_end)
                capacity -= remaining
                if capacity <= 1e-9:
                    reaches.append(current)
                    current = [segment_end]
                    capacity = MAX_RIVER_REACH_LENGTH_METRES
                break
            cut = interpolate_geodesic(start, segment_end, capacity / remaining)
            current.append(cut)
            reaches.append(current)
            current = [cut]
            start = cut
            remaining = haversine_metres(start, segment_end)
            capacity = MAX_RIVER_REACH_LENGTH_METRES
    if len(current) > 1:
        reaches.append(current)
    return reaches


def epsg5179_polyline_contents(path: Path):
    """Stream raw PolyLine record content so unnamed rows avoid reprojection."""
    with path.open('rb') as source_file:
        header = source_file.read(100)
        if unpack('<i', header[32:36])[0] != 3:
            raise ValueError('National Base Map river source must be a PolyLine SHP file.')
        while record_header := source_file.read(8):
            content_length = unpack('>i', record_header[4:8])[0] * 2
            yield source_file.read(content_length)


def epsg5179_polyline_components(content: bytes) -> list[list[list[float]]]:
    shape_type = unpack('<i', content[:4])[0]
    if shape_type == 0:
        return []
    if shape_type != 3:
        raise ValueError('National Base Map river source contains a non-PolyLine record.')
    min_x, min_y, max_x, max_y = unpack('<4d', content[4:36])
    boundary_min_x, boundary_min_y, boundary_max_x, boundary_max_y = GYEONGBUK_EPSG5179_ENVELOPE
    if max_x < boundary_min_x or min_x > boundary_max_x or max_y < boundary_min_y or min_y > boundary_max_y:
        return []
    part_count, point_count = unpack('<2i', content[36:44])
    starts = list(unpack(f'<{part_count}i', content[44:44 + part_count * 4]))
    coordinate_offset = 44 + part_count * 4
    points = [
        list(unpack('<2d', content[coordinate_offset + index * 16:coordinate_offset + (index + 1) * 16]))
        for index in range(point_count)
    ]
    starts.append(point_count)
    return [[inverse_epsg5179((point[0], point[1])) for point in points[start:end]] for start, end in zip(starts, starts[1:])]


def write_kdpa_snapshot(source_directory: Path = KDPA_DIRECTORY, output_directory: Path = OUTPUT_DIRECTORY) -> None:
    shapefile = source_directory / KDPA_SHAPEFILE.name
    dbf = shapefile.with_suffix('.dbf')
    projection = shapefile.with_suffix('.prj')
    code_page = shapefile.with_suffix('.cpg')
    index = shapefile.with_suffix('.shx')
    if 'WGS_1984' not in projection.read_text(encoding='ascii'):
        raise ValueError('KDPA source projection must be WGS84.')
    rows = dbf_rows(dbf)
    polygons = shp_polygons(shapefile)
    if len(rows) != len(polygons):
        raise ValueError('KDPA SHP and DBF record counts differ.')

    features = []
    for row, polygons_for_record in zip(rows, polygons):
        if row.get('SUB_LOC') != 'KR-47':
            continue
        geometry = {
            'type': 'Polygon' if len(polygons_for_record) == 1 else 'MultiPolygon',
            'coordinates': polygons_for_record[0] if len(polygons_for_record) == 1 else polygons_for_record,
        }
        features.append({
            'type': 'Feature',
            'properties': {
                'sourceRecordId': row['WDPA_PID'],
                'name': row['NAME'],
                'originalName': row['ORIG_NAME'],
                'designation': row['DESIG'],
                'subLocation': row['SUB_LOC'],
            },
            'geometry': geometry,
        })

    source = {
        'datasetId': 'KDPA-PROTECTED-AREAS-OECM-KR-2025',
        'title': 'KDPA protected areas and OECMs, Republic of Korea (2025)',
        'provider': 'Korea Database on Protected Areas (KDPA)',
        'sourceUrl': 'https://www.kdpa.kr/',
        'licence': 'User-confirmed no-reuse-restriction for the supplied KDPA export.',
        'attribution': 'Korea Database on Protected Areas (KDPA), Protected areas and OECMs, Republic of Korea, 2025.',
        'snapshotFilename': KDPA_SNAPSHOT,
        'sourceFileChecksum': component_checksum((shapefile, dbf, projection, code_page, index)),
        'checksum': json_payload_checksum(features),
    }
    payload = {
        'type': 'FeatureCollection',
        'source': source,
        'features': features,
        'audit': {
            'sourceRecords': len(rows),
            'publishedRecords': len(features),
            'filter': 'SUB_LOC=KR-47; Polygon SHP; WGS84 coordinates; KDPA screening overlay only',
            'limitation': 'KDPA boundaries are safety screening only. An overlap does not change hotspot scores and never authorizes legal removal; an official event or agency determination is required.',
        },
    }
    (output_directory / KDPA_SNAPSHOT).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )


def geometry_is_within_gyeongbuk(polygons: list[list[list[list[float]]]]) -> bool:
    return all(
        is_within_gyeongbuk({'위도': point[1], '경도': point[0]}, '위도', '경도')
        for polygon in polygons
        for ring in polygon
        for point in ring
    )


def write_lake_snapshot(source_directory: Path = LAKE_DIRECTORY, output_directory: Path = OUTPUT_DIRECTORY) -> None:
    """Create named, source-attributed National Base Map lake context for Gyeongbuk.

    Full polygon containment is deliberately conservative at the supplied
    Gyeongbuk boundary: it prevents partial cross-boundary geometries from
    leaking into the bounded snapshot without inventing clipped labels.
    """
    shapefile = source_directory / LAKE_SHAPEFILE.name
    dbf = shapefile.with_suffix('.dbf')
    projection = shapefile.with_suffix('.prj')
    index = shapefile.with_suffix('.shx')
    spatial_index = shapefile.with_suffix('.sbn')
    spatial_index_metadata = shapefile.with_suffix('.sbx')
    metadata = shapefile.with_suffix('.xml')
    projection_text = projection.read_text(encoding='ascii')
    if 'Korea_2000_Korea_Unified_Coordinate_System' not in projection_text or 'Central_Meridian",127.5' not in projection_text:
        raise ValueError('National Base Map lake source projection must be EPSG:5179.')

    features = []
    source_records = 0
    excluded_unnamed_records = 0
    excluded_outside_gyeongbuk_records = 0
    for row, polygons in zip_longest(dbf_row_iterator(dbf), epsg5179_polygon_records(shapefile)):
        if row is None and polygons is None:
            continue
        if row is None or polygons is None:
            raise ValueError('National Base Map lake SHP and DBF record counts differ.')
        source_records += 1
        name = str(row['NAME']).strip()
        if not name:
            excluded_unnamed_records += 1
            continue
        if not polygons:
            excluded_outside_gyeongbuk_records += 1
            continue
        if not geometry_is_within_gyeongbuk(polygons):
            excluded_outside_gyeongbuk_records += 1
            continue
        geometry = {
            'type': 'Polygon' if len(polygons) == 1 else 'MultiPolygon',
            'coordinates': polygons[0] if len(polygons) == 1 else polygons,
        }
        features.append({
            'type': 'Feature',
            'properties': {
                'sourceRecordId': str(row['UFID']).strip(),
                'name': name,
                'UFID': str(row['UFID']).strip(),
                'SERV': str(row['SERV']).strip(),
                'MARA': row['MARA'],
                'MNGT': str(row['MNGT']).strip(),
                'FMTA': str(row['FMTA']).strip(),
            },
            'geometry': geometry,
        })

    features.sort(key=lambda feature: str(feature['properties']['sourceRecordId']))
    source = {
        'datasetId': 'N3A_E0052114',
        'title': 'National Base Map lake and reservoir polygons (N3A_E0052114)',
        'provider': 'National Geographic Information Institute (NGII)',
        'sourceUrl': 'https://map.ngii.go.kr/ms/map/NlipMap.do',
        'licence': 'Source licence terms were not supplied with the National Base Map shapefile.',
        'attribution': 'National Geographic Information Institute (NGII), National Base Map N3A_E0052114.',
        'snapshotFilename': LAKE_SNAPSHOT,
        'sourceFileChecksum': component_checksum((shapefile, dbf, projection, index, spatial_index, spatial_index_metadata, metadata)),
        'checksum': json_payload_checksum(features),
    }
    payload = {
        'type': 'FeatureCollection',
        'source': source,
        'features': features,
        'audit': {
            'sourceRecords': source_records,
            'publishedRecords': len(features),
            'excludedUnnamedRecords': excluded_unnamed_records,
            'excludedOutsideGyeongbukRecords': excluded_outside_gyeongbuk_records,
            'sourceProjection': 'EPSG:5179',
            'filter': 'National Base Map N3A_E0052114 Polygon SHP; EPSG:5179 transformed to WGS84; named official NAME only; full transformed geometry within committed Gyeongbuk boundary; 10 m projected-ring simplification.',
            'limitation': 'Lake geometry and official names provide context only. They never create or change biological hotspot scores and do not authorize removal.',
        },
    }
    (output_directory / LAKE_SNAPSHOT).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )


def write_river_snapshot(source_directory: Path = RIVER_DIRECTORY, output_directory: Path = OUTPUT_DIRECTORY) -> None:
    """Create named, bounded National Base Map river reaches for action-zone context."""
    shapefile = source_directory / RIVER_SHAPEFILE.name
    dbf = shapefile.with_suffix('.dbf')
    projection = shapefile.with_suffix('.prj')
    index = shapefile.with_suffix('.shx')
    spatial_index = shapefile.with_suffix('.sbn')
    spatial_index_metadata = shapefile.with_suffix('.sbx')
    metadata = shapefile.with_suffix('.xml')
    projection_text = projection.read_text(encoding='ascii')
    if 'Korea_2000_Korea_Unified_Coordinate_System' not in projection_text or 'Central_Meridian",127.5' not in projection_text:
        raise ValueError('National Base Map river source projection must be EPSG:5179.')

    features = []
    source_records = 0
    excluded_unnamed_records = 0
    excluded_outside_gyeongbuk_records = 0
    for row, content in zip_longest(river_dbf_row_iterator(dbf), epsg5179_polyline_contents(shapefile)):
        if row is None and content is None:
            continue
        if row is None or content is None:
            raise ValueError('National Base Map river SHP and DBF record counts differ.')
        source_records += 1
        name = str(row['NAME']).strip()
        if not name:
            excluded_unnamed_records += 1
            continue
        components = epsg5179_polyline_components(content)
        if not components:
            excluded_outside_gyeongbuk_records += 1
            continue
        source_record_id = str(row['UFID']).strip()
        reaches = [reach for component in components for clipped in clip_line_to_gyeongbuk(component) for reach in split_line_into_reaches(clipped)]
        if not reaches:
            excluded_outside_gyeongbuk_records += 1
            continue
        for ordinal, reach in enumerate(reaches, 1):
            reach_id = f'{source_record_id}:reach:{ordinal:02d}'
            features.append({
                'type': 'Feature',
                'properties': {
                    'sourceRecordId': source_record_id,
                    'parentSourceRecordId': source_record_id,
                    'reachId': reach_id,
                    'name': name,
                    'RVNU': row['RVNU'],
                    'DIVI': str(row['DIVI']).strip(),
                    'TYPE': str(row['TYPE']).strip(),
                    'STAT': str(row['STAT']).strip(),
                    'SCLS': str(row['SCLS']).strip(),
                    'FMTA': str(row['FMTA']).strip(),
                },
                'geometry': {'type': 'LineString', 'coordinates': reach},
            })

    features.sort(key=lambda feature: (str(feature['properties']['name']), str(feature['properties']['sourceRecordId']), str(feature['properties']['reachId'])))
    eligible_reach_records = len(features)
    # The full Gyeongbuk clip contains tens of thousands of short centerline
    # records.  The no-key demo keeps one reproducible representative reach
    # per official CP949 NAME, rather than shipping a nationwide-scale layer.
    # It is context for matching hotspots, not a complete navigable network.
    representative_features = []
    published_names: set[str] = set()
    for feature in features:
        name = str(feature['properties']['name'])
        if name in published_names:
            continue
        published_names.add(name)
        representative_features.append(feature)
    features = sorted(representative_features, key=lambda feature: str(feature['properties']['reachId']))
    source = {
        'datasetId': 'N3L_E0020000',
        'title': 'National Base Map named river centerlines (N3L_E0020000)',
        'provider': 'National Geographic Information Institute (NGII)',
        'sourceUrl': 'https://map.ngii.go.kr/ms/map/NlipMap.do',
        'licence': 'Source licence terms were not supplied with the National Base Map shapefile.',
        'attribution': 'National Geographic Information Institute (NGII), National Base Map N3L_E0020000.',
        'snapshotFilename': RIVER_SNAPSHOT,
        'sourceFileChecksum': component_checksum((shapefile, dbf, projection, index, spatial_index, spatial_index_metadata, metadata)),
        'checksum': json_payload_checksum(features),
    }
    payload = {
        'type': 'FeatureCollection',
        'source': source,
        'features': features,
        'audit': {
            'sourceRecords': source_records,
            'eligibleReachRecords': eligible_reach_records,
            'publishedRecords': len(features),
            'excludedUnnamedRecords': excluded_unnamed_records,
            'excludedOutsideGyeongbukRecords': excluded_outside_gyeongbuk_records,
            'sourceProjection': 'EPSG:5179',
            'sourceEncoding': 'CP949',
            'maximumReachLengthMetres': MAX_RIVER_REACH_LENGTH_METRES,
            'filter': 'National Base Map N3L_E0020000 PolyLine SHP; CP949 NAME only; EPSG:5179 transformed to WGS84; clipped to committed Gyeongbuk boundary; deterministic geodesic reaches no longer than 2,000 m; one lowest (sourceRecordId, reachId) representative reach per official NAME.',
            'limitation': 'This bounded demo snapshot is representative river context, not a complete river network. River centerlines and official names never create or change biological hotspot scores and do not authorize removal.',
        },
    }
    (output_directory / RIVER_SNAPSHOT).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )


def write_forest_snapshot(source_directory: Path = FOREST_DIRECTORY, output_directory: Path = OUTPUT_DIRECTORY) -> None:
    """Create a small, deterministic forest-habitat context layer from both shards.

    MAP_LABEL is a map-sheet identifier, not a place name.  The forest map has
    no place-name authority, so published features deliberately omit `name`.
    """
    source_components: list[Path] = []
    features = []
    seen_geometries: set[str] = set()
    source_records = 0
    excluded_outside_gyeongbuk_records = 0
    deduplicated_overlapping_records = 0
    for shard in FOREST_SHARDS:
        shapefile = source_directory / f'{shard}.shp'
        dbf = shapefile.with_suffix('.dbf')
        projection = shapefile.with_suffix('.prj')
        index = shapefile.with_suffix('.shx')
        projection_text = projection.read_text(encoding='ascii')
        if 'KGD2002_Unified_Coordinate_System' not in projection_text or 'Central_Meridian",127.5' not in projection_text:
            raise ValueError('Forest habitat source projection must be EPSG:5179.')
        source_components.extend((shapefile, dbf, projection, index))
        published_from_shard = 0
        for record_number, (row, polygons) in enumerate(zip_longest(dbf_row_iterator(dbf), epsg5179_polygon_records(shapefile)), 1):
            if row is None and polygons is None:
                continue
            if row is None or polygons is None:
                raise ValueError('Forest habitat SHP and DBF record counts differ.')
            source_records += 1
            if published_from_shard >= MAX_FOREST_FEATURES_PER_SHARD:
                break
            if not polygons or not geometry_is_within_gyeongbuk(polygons):
                excluded_outside_gyeongbuk_records += 1
                continue
            geometry = {
                'type': 'Polygon' if len(polygons) == 1 else 'MultiPolygon',
                'coordinates': polygons[0] if len(polygons) == 1 else polygons,
            }
            geometry_key = json.dumps(geometry, ensure_ascii=False, separators=(',', ':'))
            if geometry_key in seen_geometries:
                deduplicated_overlapping_records += 1
                continue
            forest_type = str(row['FRTP_NM']).strip()
            dominant_species = str(row['KOFTR_NM']).strip()
            if not forest_type or not dominant_species:
                continue
            seen_geometries.add(geometry_key)
            features.append({
                'type': 'Feature',
                'properties': {
                    'sourceRecordId': f'{shard}:{record_number:06d}',
                    'sourceShard': shard,
                    'FRTP_CD': str(row['FRTP_CD']).strip(),
                    'FRTP_NM': forest_type,
                    'KOFTR_GROU': str(row['KOFTR_GROU']).strip(),
                    'KOFTR_NM': dominant_species,
                    'updatedYear': str(row['갱신년도']).strip(),
                },
                'geometry': geometry,
            })
            published_from_shard += 1
        if published_from_shard == 0:
            raise ValueError(f'Forest habitat shard {shard} did not yield a Gyeongbuk feature.')

    features.sort(key=lambda feature: str(feature['properties']['sourceRecordId']))
    source = {
        'datasetId': 'GYEONGBUK-FOREST-HABITAT-47-2025',
        'title': 'Gyeongbuk forest-habitat polygons (47_1 and 47_2)',
        'provider': 'Korea Forest Service',
        'sourceUrl': 'https://map.forest.go.kr/',
        'licence': 'Source licence terms were not supplied with the forest-map shapefiles.',
        'attribution': 'Korea Forest Service, Gyeongbuk forest map shards 47_1 and 47_2.',
        'snapshotFilename': FOREST_SNAPSHOT,
        'sourceFileChecksum': component_checksum(tuple(source_components)),
        'checksum': json_payload_checksum(features),
    }
    payload = {
        'type': 'FeatureCollection',
        'source': source,
        'features': features,
        'audit': {
            'sourceShards': list(FOREST_SHARDS),
            'sourceRecordsRead': source_records,
            'publishedRecords': len(features),
            'excludedOutsideGyeongbukRecords': excluded_outside_gyeongbuk_records,
            'deduplicatedOverlappingRecords': deduplicated_overlapping_records,
            'sourceProjection': 'EPSG:5179',
            'filter': 'Forest map Polygon SHP shards 47_1 and 47_2; CP949 attributes; EPSG:5179 transformed to WGS84; full transformed geometry within committed Gyeongbuk boundary; 10 m projected-ring simplification; first 48 unique eligible features per shard.',
            'limitation': 'Forest geometry and forest-type/species attributes provide context only. They never create or change biological hotspot scores. MAP_LABEL is not a place name and no official place name is published.',
        },
    }
    (output_directory / FOREST_SNAPSHOT).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )


def main() -> None:
    if len(sys.argv) > 1:
        if len(sys.argv) != 4 or sys.argv[1] not in {'--kdpa-only', '--lakes-only', '--rivers-only', '--forests-only'}:
            raise SystemExit('Usage: prepare-demo-snapshots.py [--kdpa-only|--lakes-only|--rivers-only|--forests-only <source-directory> <output-directory>]')
        if sys.argv[1] == '--kdpa-only':
            write_kdpa_snapshot(Path(sys.argv[2]), Path(sys.argv[3]))
        elif sys.argv[1] == '--lakes-only':
            write_lake_snapshot(Path(sys.argv[2]), Path(sys.argv[3]))
        elif sys.argv[1] == '--rivers-only':
            write_river_snapshot(Path(sys.argv[2]), Path(sys.argv[3]))
        else:
            write_forest_snapshot(Path(sys.argv[2]), Path(sys.argv[3]))
        return

    workbook_path, csv_path, plant_csv_path = discover_inputs()
    workbook_rows = [
        row
        for row in xlsx_rows(workbook_path, '생태계교란생물 통합데이터')
        if row.get('시도명') == '경상북도'
        and row.get('분류군명') in {'어류', '식물'}
        and valid_coordinates(row, '위도', '경도')
        and is_within_gyeongbuk(row, '위도', '경도')
    ]
    nie_rows: list[dict[str, str]]
    with csv_path.open(encoding='utf-8-sig', newline='') as source_file:
        nie_rows = [
            row
            for row in csv.DictReader(source_file)
            if row.get('시도명') == '경상북도'
            and valid_coordinates(row, '위도', '경도')
            and is_within_gyeongbuk(row, '위도', '경도')
        ]
    with plant_csv_path.open(encoding='utf-8-sig', newline='') as source_file:
        plant_labelled_rows = [
            row
            for row in csv.DictReader(source_file)
            if row.get('시도명') == '경상북도' and valid_coordinates(row, '위도', '경도')
        ]
    plant_rows = [
        row
        for row in plant_labelled_rows
        if is_within_gyeongbuk(row, '위도', '경도')
    ]

    write_snapshot(
        WORKBOOK_SNAPSHOT,
        {
            'datasetId': 'RSD_0000000000012894',
            'title': '생태계교란생물 통합데이터 (2016-2024)',
            'provider': 'National Institute of Ecology (국립생태원)',
            'sourceUrl': 'https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012894',
            'licence': 'No exact licence was verified from the supplied workbook or the available EcoBank record.',
            'attribution': 'National Institute of Ecology (국립생태원), 생태계교란생물 통합데이터 (2016-2024).',
            'snapshotFilename': WORKBOOK_SNAPSHOT,
            'sourceFileChecksum': sha256_file(workbook_path),
        },
        workbook_rows,
        {
            'rawFilteredRows': len(workbook_rows),
            'filter': '시도명=경상북도; 분류군명=어류|식물; valid WGS84 coordinates; committed Gyeongbuk boundary',
        },
    )
    write_kdpa_snapshot()
    write_lake_snapshot()
    write_river_snapshot()
    write_forest_snapshot()
    accepted_names = {'배스', '블루길'}
    rejected = [row for row in nie_rows if row.get('한글보통명') not in accepted_names]
    write_snapshot(
        NIE_SNAPSHOT,
        {
            'datasetId': 'RSD_0000000000012824',
            'title': '외래생물_2015_2022',
            'provider': 'National Institute of Ecology (국립생태원)',
            'sourceUrl': 'https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012824',
            'licence': 'KOGL terms (type unspecified on the EcoBank record)',
            'attribution': 'National Institute of Ecology (국립생태원), 외래생물_2015_2022.',
            'snapshotFilename': NIE_SNAPSHOT,
            'doi': '10.22756/ASD.20240000000888',
            'publishedAt': '2024-09-20',
            'sourceFileChecksum': sha256_file(csv_path),
        },
        nie_rows,
        {
            'rawFilteredRows': len(nie_rows),
            'filter': '시도명=경상북도; valid WGS84 coordinates; committed Gyeongbuk boundary',
            'publishedRowsAfterCuratedFishFilter': len(nie_rows) - len(rejected),
            'rejectedRowsNotInCuratedDisturbanceCatalogue': len(rejected),
            'rejectedSpeciesCounts': {
                name: sum(1 for row in rejected if row.get('한글보통명') == name)
                for name in sorted({row.get('한글보통명', '') for row in rejected})
            },
        },
    )
    accepted_plant_names = {
        '환삼덩굴', '돼지풀', '미국쑥부쟁이', '가시상추', '가시박', '단풍잎돼지풀', '애기수영',
        '털물참새피', '물참새피', '도깨비가지', '양미역취', '서양금혼초', '물여뀌바늘',
    }
    rejected_plants = [row for row in plant_rows if row.get('한글보통명') not in accepted_plant_names]
    write_snapshot(
        PLANT_SNAPSHOT,
        {
            'datasetId': 'RSD_0000000000012705',
            'title': '외래식물_2015_2021',
            'provider': 'National Institute of Ecology (국립생태원)',
            'sourceUrl': 'https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012705',
            'licence': 'Licence wording was not verified from the supplied source record.',
            'attribution': 'National Institute of Ecology (국립생태원), 외래식물_2015_2021.',
            'snapshotFilename': PLANT_SNAPSHOT,
            'sourceFileChecksum': sha256_file(plant_csv_path),
        },
        plant_rows,
        {
            'rawGyeongbukLabelledRowsBeforeCategoryFilter': len(plant_labelled_rows),
            'rawFilteredRows': len(plant_rows),
            'filter': '시도명=경상북도; valid WGS84 coordinates; committed Gyeongbuk boundary',
            'geographicOnlyRejections': len(plant_labelled_rows) - len(plant_rows),
            'publishedRowsAfterCuratedPlantFilter': len(plant_rows) - len(rejected_plants),
            'rejectedRowsNotInCuratedDisturbanceCatalogue': len(rejected_plants),
            'rejectedSpeciesCount': len({row.get('한글보통명', '') for row in rejected_plants}),
        },
    )


if __name__ == '__main__':
    main()
