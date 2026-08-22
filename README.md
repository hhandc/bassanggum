# Bassanggum data and MCP foundation

Bassanggum is a read-only, source-attributed data foundation for exploring
reviewed invasive fish and plant occurrence evidence in Gyeongbuk, Republic of
Korea. It generates a deterministic public bundle and serves that bundle through
the Model Context Protocol (MCP). The repository code is licensed under
[Apache-2.0](LICENSE); that licence does not replace the terms attached to the
source data below.

## Requirements

- Node.js `>=22` (the repository is tested with Node.js 22)
- pnpm `11.19.0` (the version pinned in `packageManager`)
- Python 3 only when refreshing the bounded raw snapshots

## No-key demo

The demo has no API key, account, or environment-variable requirement. From the
repository root, run:

```bash
pnpm install
pnpm demo:data
pnpm mcp
```

`pnpm demo:data` validates the committed raw snapshots and writes a fresh public
bundle to `data/normalized/`. `pnpm mcp` builds the MCP server and serves the
validated bundle over standard input/output; run it from an MCP client rather
than expecting terminal output. For a non-blocking command check, use:

```bash
pnpm mcp --help
```

Configure an MCP host with the repository's absolute path in place of
`<repo-path>`:

```json
{
  "mcpServers": {
    "bassanggum": {
      "command": "pnpm",
      "args": ["--dir", "<repo-path>", "mcp"]
    }
  }
}
```

The server exposes read-only tools for species, occurrences, hotspots, area
profiles, verified events, guidance, and provenance, plus catalog, hotspot, and
event resources. It never exposes mutation tools or private user data.

## Tests

Run the full suite without an API key:

```bash
pnpm test
```

For the complete local verification sequence, run:

```bash
pnpm install
pnpm demo:data
pnpm lint
pnpm typecheck
pnpm test
```

## Bundled source snapshots and attribution

The bundled records are a dated, bounded Gyeongbuk snapshot, not a live API
export. The current bundle contains records only from these three National
Institute of Ecology (국립생태원) sources:

| Dataset | Attribution | Source and licence notice |
| --- | --- | --- |
| `RSD_0000000000012894` | National Institute of Ecology (국립생태원), 생태계교란생물 통합데이터 (2016-2024). | [생태계교란생물 통합데이터 record](https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012894). No exact licence was verified from the supplied workbook or the available EcoBank record. |
| `RSD_0000000000012824` | National Institute of Ecology (국립생태원), 외래생물_2015_2022. | [외래생물_2015_2022 record](https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012824), DOI `10.22756/ASD.20240000000888`, published 2024-09-20. `KOGL terms (type unspecified on the EcoBank record)`. |
| `RSD_0000000000012705` | National Institute of Ecology (국립생태원), 외래식물_2015_2021. | [외래식물_2015_2021 record](https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012705). Licence wording was not verified from the supplied source record. |

Each raw snapshot and generated record retains source attribution, source URL,
and integrity checksums; normalized official occurrences also retain the
provider record identifier. See [data/raw/README.md](data/raw/README.md) for
the exact filters, coverage, checksums, and audit totals.

Any verified-event records are curated, source-linked demo data. They are not
live official notices, eligibility determinations, or payout promises.

## Refreshing raw source snapshots

The full external originals are deliberately not committed. To prepare a new
bounded snapshot, obtain the three source files through their respective source
records, preserve the originals unchanged, and verify that redistribution is
permitted for the intended release. Place the supplied workbook and CSV files
under `/Users/hyeonhongchang/Downloads/` with the filenames expected by
`scripts/prepare-demo-snapshots.py`, then run:

```bash
pnpm sync:ecobank
pnpm demo:data
pnpm test
```

`pnpm sync:ecobank` applies the documented Gyeongbuk, category, coordinate, and
boundary filters, updates only `data/raw/demo/`, and records new checksums.
Review the generated snapshot metadata, source terms, and audit counts before
committing it. The refresh script is intentionally local and does not download
from an API or use credentials.

## Generated public bundle

`pnpm demo:data` replaces the ignored `data/normalized/` directory with a
validated manifest and deterministic public files:

```
manifest.json
public-bundle.json
source-catalog.json
species-catalog.json
official-occurrences.geojson
habitat-areas.geojson
waterbodies.geojson
restricted-areas.geojson
verified-community-signals.geojson
verified-events.geojson
hotspots.geojson
action-zones.geojson
```

Every generated file is schema-validated and hashed in `manifest.json`. The
writer rejects private community coordinates, profile/device material, and
identification-media URLs before publishing the bundle.

## Current demo limits and planned PWA scope

The no-key demo has occurrence-derived H3 fallback action zones only. It has no
named official lake, river, forest, waterbody, or restriction geometry, and an
area profile therefore cannot assert an official landform name or restriction
status. Empty `habitatAreas`, `waterbodies`, and `restrictedAreas` outputs mean
that this geometry is not bundled—not that an area is unrestricted.

A future PWA may add named official landforms and restriction overlays only
after separately verified redistributable data or permission is available. It
must keep source-linked evidence, official restrictions, and curated demo events
visibly distinct.
