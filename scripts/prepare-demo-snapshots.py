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
import unicodedata
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


DOWNLOADS = Path('/Users/hyeonhongchang/Downloads')
OUTPUT_DIRECTORY = Path(__file__).resolve().parents[1] / 'data' / 'raw' / 'demo'
WORKBOOK_SNAPSHOT = 'ecosystem-disturbing-organisms-gyeongbuk-2016-2024.json'
NIE_SNAPSHOT = 'nie-alien-fish-gyeongbuk-2015-2022.json'
PLANT_SNAPSHOT = 'nie-alien-plants-gyeongbuk-2015-2021.json'
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


def main() -> None:
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
