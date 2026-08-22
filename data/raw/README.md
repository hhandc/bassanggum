# Bounded raw ecological-source snapshots

`data/raw/demo/` contains the actual, bounded Gyeongbuk rows used by the
credential-free demo. It does not contain the full external downloads, and it
does not contain repository-authored EcoBank-like occurrence or habitat data.
The imported records are source snapshots, not official API exports.

| Snapshot | Source and publisher | Coverage and exact filter | Integrity |
| --- | --- | --- | --- |
| `ecosystem-disturbing-organisms-gyeongbuk-2016-2024.json` | [data.go.kr dataset 15022461](https://www.data.go.kr/data/15022461/fileData.do), supplied ecosystem-disturbing-organism workbook. The original publisher is not identified in the supplied workbook or its data-description workbook. | 2016–2024; `시도명=경상북도`, `분류군명=어류|식물`, valid WGS84 coordinates, and the committed Gyeongbuk boundary. 4,780 retained source rows. | Full supplied workbook: `sha256:090f97e42d3157cb37b4cb68a1d548f03387f3d2f77c27af10c9704fe6c570f9`; committed snapshot file: `sha256:f883c7cdec84a9efe7bd4e3ee9f1bc4a984691d228e087932ba1a516dc14800d`. |
| `nie-alien-fish-gyeongbuk-2015-2022.json` | National Institute of Ecology (국립생태원), [외래생물_2015_2022 record](https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012824), dataset `RSD_0000000000012824`, DOI `10.22756/ASD.20240000000888`, published 2024-09-20. | 2015–2022; `시도명=경상북도`, valid WGS84 coordinates, and the committed Gyeongbuk boundary. 251 retained source rows. | UTF-8-sig supplied CSV: `sha256:f606443c122380949f9785876b60c48762f88e3f4cf8c8e6101f9eceb5628558`; committed snapshot file: `sha256:a0420fc342014bffd779cef05627ca9b3da1a7d47ce1a901da0af97546a66678`. |

## Licence and attribution

The supplied data.go.kr workbook and data-description workbook did not state an
exact redistribution licence. The snapshot therefore records that fact rather
than inferring a licence; check the linked data.go.kr record before wider
redistribution. The NIE record supplies KOGL terms, but does not identify a
KOGL type; the snapshot preserves that wording exactly as
`KOGL terms (type unspecified on the EcoBank record)`.

Each JSON source object records its dataset ID, title, provider, source URL,
source-file checksum, snapshot checksum, and, where supplied, DOI and
publication date. Every normalized occurrence keeps the provider's source row
identifier in `sourceRecordId` and has a stable
`official:<datasetId>:<sourceRecordId>` ID.

## Scope and audit

There are no habitat polygons in either source, so the no-key public bundle
always has an empty `habitatAreas` array. The workbook publishes all 4,780
source rows across its 15 reviewed fish/plant species. Bass and bluegill have
`official_event_only` policies; each of the 13 plants has `report_only` and no
unverified removal, cooking, disposal, or identification-card claim. The NIE
snapshot preserves all 251 Gyeongbuk fish rows but publishes only its 231
catalogue-confirmed bass/bluegill rows. Its audit block records the 20 rejected
rows: 18 crucian carp (`떡붕어`) and 2 carp (`잉어`). Those fish are survey
evidence only, not removal, bounty, or cooking targets.

When a matching bass or bluegill observation appears in both sources with the
same normalized species, survey date/year, and coordinate, both provenance
records remain in the bundle. The hotspot scorer rounds each WGS84 longitude
and latitude to six decimal places (about 0.11 m) before pairing only
cross-source matches; points separated by at least one six-decimal unit remain
distinct. Repeated records within one source remain distinct evidence.

The committed boundary requires both the exact `경상북도` label and a point
inside the local polygon. Its southeast coastal segment was corrected to include
the supplied Gyeongju points that the original coarse segment excluded; no
source rows are rejected solely by the geographic gate after that correction.

## Regeneration and integrity

`python3 scripts/prepare-demo-snapshots.py` discovers the supplied decomposed
Unicode filenames under `/Users/hyeonhongchang/Downloads/` and recreates these
bounded snapshots without editing the originals. `source.checksum` is the
SHA-256 digest of `JSON.stringify(records)` (not the enclosing JSON file); the
importer verifies it before normalization. `sourceFileChecksum` is the SHA-256
digest of the unmodified external source file.
