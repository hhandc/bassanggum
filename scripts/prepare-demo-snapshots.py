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
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


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
            fields.append((field[:11].split(b'\0', 1)[0].decode('ascii'), chr(field[11]), field[16]))
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


def main() -> None:
    if len(sys.argv) > 1:
        if len(sys.argv) != 4 or sys.argv[1] not in {'--kdpa-only', '--lakes-only'}:
            raise SystemExit('Usage: prepare-demo-snapshots.py [--kdpa-only|--lakes-only <source-directory> <output-directory>]')
        if sys.argv[1] == '--kdpa-only':
            write_kdpa_snapshot(Path(sys.argv[2]), Path(sys.argv[3]))
        else:
            write_lake_snapshot(Path(sys.argv[2]), Path(sys.argv[3]))
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
