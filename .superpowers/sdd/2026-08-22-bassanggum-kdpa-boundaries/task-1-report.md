# Task 1 report: KDPA Gyeongbuk screening boundaries

## RED

- Added data-core contracts for a nonempty KDPA `KR-47` GeoJSON snapshot,
  KDPA URL/attribution/source record identifiers, bundle normalization,
  generated `restricted-areas.geojson` and `source-catalog.json`, and checksum
  rejection after a feature is tampered with.
- Ran the focused importer test before implementation. It failed because
  `kdpa-protected-areas-oecm-gyeongbuk-2025.geojson` did not yet exist and the
  bundle still contained no restricted areas.

## GREEN

- Added a deterministic standard-library SHP/DBF parser. It validates the
  WGS84 projection, closed valid rings, matching SHP/DBF record counts, and
  filters only `SUB_LOC=KR-47`.
- Committed snapshot contains 246 KDPA Polygon/MultiPolygon features, preserves
  `WDPA_PID` as `sourceRecordId`, KDPA provenance, and SHA-256 checksums.
- Imported features normalize to `RestrictedArea`; the restriction wording says
  KDPA is safety screening only, never authorizes removal, and does not affect
  hotspot scoring. Occurrence inputs and the three NIE source behaviours are
  unchanged.
- Extended the public bundle and MCP dataset-resource expectations with KDPA
  provenance.

## Verification

- `python3 scripts/prepare-demo-snapshots.py` — generated the deterministic
  KDPA snapshot (246 published records).
- `pnpm demo:data` — passed.
- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm build && pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/import-demo.test.ts packages/mcp-server/test/resources.test.ts` — passed: 2 files, 13 tests.
- `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/bundle.test.ts` — passed: 1 file, 5 tests.

The normal `pnpm test` / full MCP smoke invocation was attempted, but the
desktop execution window interrupts it after 30 seconds; this leaves pnpm's
virtual store incomplete and prevents a trustworthy complete-suite result in
this worktree. The focused MCP resource verification above is fresh; the
real-stdio MCP smoke requires a run outside that execution limit.

## Commit

`feat: add KDPA protected-area screening layer`
