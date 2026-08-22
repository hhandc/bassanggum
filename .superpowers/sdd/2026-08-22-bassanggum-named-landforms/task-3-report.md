# Task 3 Report: Gyeongbuk Forest Habitat Zones

## Result

Added deterministic, bounded forest-habitat context from the supplied
`47_1` and `47_2` EPSG:5179 Polygon/CP949 DBF shards.  The committed
snapshot has 96 simplified features (48 from each shard). It preserves
`FRTP_CD`, `FRTP_NM`, `KOFTR_GROU`, `KOFTR_NM`, and `updatedYear`; it has
no place-name field. `MAP_LABEL` is intentionally excluded because it is a
map-sheet identifier, not a place name.

Forest context is normalized only into `forest_habitat` action zones. Those
zones preserve the sourced `FRTP_NM`, `KOFTR_NM`, and `updatedYear` as
`sourceAttributes`. Forest geometry is not passed to hotspot calculation.

## RED / GREEN evidence

RED:

- Added forest source-prep tests before the forest generator/snapshot existed;
  the initial focused run failed because the forest snapshot and
  `--forests-only` path did not exist.
- Added an action-zone test for propagation of forest type/species/update
  attributes before schema/action-zone support existed.

GREEN:

- `pnpm --filter @bassanggum/data-core build` passed.
- `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/import-demo.test.ts -t forest --reporter=verbose` passed: 3 passed.
  - Verifies both real shards, source attributes, no official place names, and
    deterministic regeneration.
  - Uses a controlled binary SHP/DBF fixture with an exact duplicate polygon
    in both shards plus a distinct second-shard polygon; result is two features
    and `deduplicatedOverlappingRecords: 2`.
- `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/action-zones.test.ts --reporter=dot` passed: 10 passed.

## Files changed

- `scripts/prepare-demo-snapshots.py`
- `data/raw/demo/gyeongbuk-forest-habitat-zones-2025.geojson`
- `packages/data-core/src/schema.ts`
- `packages/data-core/src/action-zones.ts`
- `packages/data-core/src/normalize.ts`
- `packages/data-core/test/import-demo.test.ts`
- `packages/data-core/test/action-zones.test.ts`

## Self-review

- Both required source shards are included in source-component checksums.
- Exact source geometry is deduplicated before snapshot publication.
- Public snapshot has no precise community observations, media, profiles, or
  device fields.
- Forest context remains separate from fish/plant occurrence scoring; action
  zones only regroup already-scored cells.
- No place names are presented as official. Optional point associations were
  not imported because `N3P_H0040000` was not needed; any future association
  must use `nameSource: derived` rather than an official label.

## Verification concern

`pnpm test` was attempted twice after a successful build, but both full-suite
runs failed when parallel workers launched nested Node processes and the
worktree's `vitest/suppress-warnings.cjs` path disappeared mid-run. The file
existed immediately before each run and focused Vitest commands passed. This
is an environment/shared-worktree dependency-link race, not a test assertion
failure. Per parent instruction, no further dependency operations were run.

## Fix round 1

- Forest action zones now preserve public `OfficialProvenance`: dataset URL,
  licence, attribution, import-run ID, source-record ID, snapshot checksum,
  and source-component checksum.
- Forest geometry deduplication canonicalizes ring start, direction, and
  polygon ordering before comparison.
