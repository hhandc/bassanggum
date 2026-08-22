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
SPREADSHEET_NS = {
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}


def normalized_name(path: Path) -> str:
    return unicodedata.normalize('NFC', path.name)


def discover_inputs() -> tuple[Path, Path]:
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
    return workbook, fish_csv


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


def write_snapshot(filename: str, source: dict[str, str], records: list[dict[str, str]], audit: dict[str, object]) -> None:
    source['checksum'] = json_payload_checksum(records)
    payload = {'source': source, 'records': records, 'audit': audit}
    (OUTPUT_DIRECTORY / filename).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )


def main() -> None:
    workbook_path, csv_path = discover_inputs()
    workbook_rows = [
        row
        for row in xlsx_rows(workbook_path, '생태계교란생물 통합데이터')
        if row.get('시도명') == '경상북도'
        and row.get('분류군명') in {'어류', '식물'}
        and valid_coordinates(row, '위도', '경도')
    ]
    nie_rows: list[dict[str, str]]
    with csv_path.open(encoding='utf-8-sig', newline='') as source_file:
        nie_rows = [
            row
            for row in csv.DictReader(source_file)
            if row.get('시도명') == '경상북도' and valid_coordinates(row, '위도', '경도')
        ]

    write_snapshot(
        WORKBOOK_SNAPSHOT,
        {
            'datasetId': '15022461',
            'title': '생태계교란생물 통합데이터 (2016-2024)',
            'provider': 'Korean Public Data Portal (data.go.kr); original publisher not identified in the supplied workbook',
            'sourceUrl': 'https://www.data.go.kr/data/15022461/fileData.do',
            'licence': 'No exact licence was verified from the supplied workbook or its data-description file; review the data.go.kr record before redistribution.',
            'attribution': 'Korean Public Data Portal dataset 15022461; bounded Gyeongbuk snapshot from the supplied workbook.',
            'snapshotFilename': WORKBOOK_SNAPSHOT,
            'sourceFileChecksum': sha256_file(workbook_path),
        },
        workbook_rows,
        {
            'rawFilteredRows': len(workbook_rows),
            'filter': '시도명=경상북도; 분류군명=어류|식물; valid WGS84 coordinates',
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
            'filter': '시도명=경상북도; valid WGS84 coordinates',
            'publishedRowsAfterCuratedFishFilter': len(nie_rows) - len(rejected),
            'rejectedRowsNotInCuratedDisturbanceCatalogue': len(rejected),
            'rejectedSpeciesCounts': {
                name: sum(1 for row in rejected if row.get('한글보통명') == name)
                for name in sorted({row.get('한글보통명', '') for row in rejected})
            },
        },
    )


if __name__ == '__main__':
    main()
