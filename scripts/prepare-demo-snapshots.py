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
import sys
import unicodedata
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


def write_kdpa_snapshot(source_directory: Path = KDPA_DIRECTORY, output_directory: Path = OUTPUT_DIRECTORY) -> None:
    shapefile = source_directory / KDPA_SHAPEFILE.name
    dbf = shapefile.with_suffix('.dbf')
    projection = shapefile.with_suffix('.prj')
    code_page = shapefile.with_suffix('.cpg')
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
        'sourceFileChecksum': component_checksum((shapefile, dbf, projection, code_page)),
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


def main() -> None:
    if len(sys.argv) > 1:
        if len(sys.argv) != 4 or sys.argv[1] != '--kdpa-only':
            raise SystemExit('Usage: prepare-demo-snapshots.py [--kdpa-only <source-directory> <output-directory>]')
        write_kdpa_snapshot(Path(sys.argv[2]), Path(sys.argv[3]))
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
