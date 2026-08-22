# Bounded raw ecological-source snapshots

`data/raw/demo/` contains the actual, bounded Gyeongbuk rows used by the
credential-free demo. It does not contain the full external downloads, and it
does not contain repository-authored EcoBank-like occurrence or habitat data.
The imported records are source snapshots, not official API exports.

| Snapshot | Source and publisher | Coverage and exact filter | Integrity |
| --- | --- | --- | --- |
| `ecosystem-disturbing-organisms-gyeongbuk-2016-2024.json` | National Institute of Ecology (국립생태원), [생태계교란생물 통합데이터 record](https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012894), dataset `RSD_0000000000012894`. | 2016–2024; `시도명=경상북도`, `분류군명=어류|식물`, valid WGS84 coordinates, and the committed Gyeongbuk boundary. 4,780 retained source rows. | Full supplied workbook: `sha256:090f97e42d3157cb37b4cb68a1d548f03387f3d2f77c27af10c9704fe6c570f9`; committed snapshot file: `sha256:7870f11e7ea5b288c4fa4592e5933c1bd32af71c8de0af5607a84bb44bed7882`. |
| `nie-alien-fish-gyeongbuk-2015-2022.json` | National Institute of Ecology (국립생태원), [외래생물_2015_2022 record](https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012824), dataset `RSD_0000000000012824`, DOI `10.22756/ASD.20240000000888`, published 2024-09-20. | 2015–2022; `시도명=경상북도`, valid WGS84 coordinates, and the committed Gyeongbuk boundary. 251 retained source rows. | UTF-8-sig supplied CSV: `sha256:f606443c122380949f9785876b60c48762f88e3f4cf8c8e6101f9eceb5628558`; committed snapshot file: `sha256:a0420fc342014bffd779cef05627ca9b3da1a7d47ce1a901da0af97546a66678`. |
| `nie-alien-plants-gyeongbuk-2015-2021.json` | National Institute of Ecology (국립생태원), [외래식물_2015_2021 record](https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012705), dataset `RSD_0000000000012705`. | 2015–2021; standalone UTF-8-sig CSV only; `시도명=경상북도`, valid WGS84 coordinates, and the committed Gyeongbuk boundary. 25,357 retained source rows. | Supplied CSV: `sha256:6301e0902f81433f6f3cb94f9251f3bf85814b54b91d6c400e7767c674ff471c`; committed snapshot file: `sha256:7eea8e71c5c34b9f2ac5e9e2c9b6be447c19528bb573c2b67ff34b48fa1ff04a`. |
| `kdpa-protected-areas-oecm-gyeongbuk-2025.geojson` | [Korea Database on Protected Areas (KDPA)](https://www.kdpa.kr/), supplied 2025 protected-areas/OECM export. | 2025; `SUB_LOC=KR-47` only. 246 valid WGS84 Polygon/MultiPolygon source records. | Source bundle (`.shp`, `.shx`, `.dbf`, `.prj`, `.cpg`): `sha256:38cd7d091c0b57eccc8ca942394c631e26b2bd3f0bcfff93fc087bd555300cd2`; the GeoJSON source object carries the deterministic feature-payload checksum. |

## Licence and attribution

No exact redistribution licence was verified for the supplied workbook or the
available EcoBank record `RSD_0000000000012894`; the snapshot says so rather
than inventing a licence type. Licence wording was likewise not verified for
the standalone `RSD_0000000000012705` source record. The fish record supplies
KOGL terms, but does not identify a KOGL type; the snapshot preserves that
wording exactly as `KOGL terms (type unspecified on the EcoBank record)`.

Each JSON source object records its dataset ID, title, provider, source URL,
source-file checksum, snapshot checksum, and, where supplied, DOI and
publication date. Every normalized occurrence keeps the provider's source row
identifier in `sourceRecordId` and has a stable
`official:<datasetId>:<sourceRecordId>` ID.

The KDPA snapshot is published as `restrictedAreas` and preserves `WDPA_PID`
as `sourceRecordId`, KDPA attribution, the authoritative KDPA URL, and the
deterministic checksum of its `.shp`, `.shx`, `.dbf`, `.prj`, and `.cpg` components.
User-confirmed permission allows reuse of the supplied KDPA
export. These boundaries are a conservative safety-screening layer only: an
overlap does not contribute to hotspot scores, does not establish a legal
restriction, and never authorizes removal. Removal still requires an official
event or an agency determination.

## Scope and audit

There are no habitat polygons in any source, so the no-key public bundle
always has an empty `habitatAreas` array. The workbook publishes all 4,780
source rows across its 15 reviewed fish/plant species. Bass and bluegill have
`official_event_only` policies; each of the 13 plants has `report_only` and no
unverified removal, cooking, disposal, or identification-card claim. The NIE
snapshot preserves all 251 Gyeongbuk fish rows but publishes only its 231
catalogue-confirmed bass/bluegill rows. Its audit block records the 20 rejected
rows: 18 crucian carp (`떡붕어`) and 2 carp (`잉어`). Those fish are survey
evidence only, not removal, bounty, or cooking targets.

The standalone plant snapshot contains all 25,357 valid `경상북도`-labelled
rows after the local boundary gate; none was rejected by geography alone. It
publishes only 2,553 rows for the 13 reviewed plant species. Its audit retains
the remaining 22,804 rows (668 species) as source evidence outside the
platform catalogue; they are not removal targets. It preserves `OBJECTID` as
`sourceRecordId` and uses the valid `조사일자` as the occurrence date. The
overlapping `외래식물상_2015_2023.csv` from the older `외래생물_2015_2022`
folder is deliberately neither copied nor ingested, and is not attributed to
`RSD_0000000000012705`.

When a matching curated fish or plant observation appears across sources with the
same normalized species, survey date/year, and coordinate, both provenance
records remain in the bundle. `observedAtPrecision` records whether the source
provided a year, date, or timestamp without changing the original normalized
`observedAt`. Scoring uses the year when at least one source has year-only
precision; otherwise it requires the exact date/timestamp. The 2,561
cross-source yearly coordinate groups therefore score as 4,986 observations,
while a single annual record paired with two dated observations in the same year
still contributes two scores. The scorer rounds each WGS84 longitude and
latitude to six decimal places (about 0.11 m) before pairing only cross-source
matches; points separated by at least one six-decimal unit remain distinct.
Repeated records within one source remain distinct evidence.

The committed boundary requires both the exact `경상북도` label and a point
inside the local polygon. Its southeast coastal segment was corrected to include
the supplied Gyeongju points that the original coarse segment excluded; no
source rows are rejected solely by the geographic gate after that correction.

## Regeneration and integrity

`python3 scripts/prepare-demo-snapshots.py` discovers the supplied decomposed
Unicode filenames under `/Users/hyeonhongchang/Downloads/` and recreates these
bounded snapshots without editing the originals. It parses the KDPA Polygon
SHP and CP949 DBF with Python's standard library, checks the WGS84 `.prj`,
requires matching SHP/DBF counts and valid closed rings, and then retains only
`SUB_LOC=KR-47`; it does not rely on a system GIS library. `source.checksum` is the
SHA-256 digest of `JSON.stringify(records)` (not the enclosing JSON file); the
importer verifies it before normalization. KDPA uses the same checksum rule
over `features`. KDPA `sourceFileChecksum` is a SHA-256 digest of sorted
`filename\0component-sha256\n` entries for the `.shp`, `.shx`, `.dbf`, `.prj`,
and `.cpg` source files, so any component change changes provenance. `--kdpa-only
<source-directory> <output-directory>` regenerates and validates just that
snapshot for source-integrity regression checks.
