# Task 2 report: named Gyeongbuk river reaches

## Delivered

- Added an attributed `N3L_E0020000` CP949 river-centerline snapshot and import path for river action-zone context.
- Names are accepted only from `N3L_E0020000`. `N3A_E0032111` is not read and cannot supply a river name.
- Source lines are transformed from EPSG:5179, clipped to the committed Gyeongbuk boundary, and split into deterministic geodesic reaches no longer than 2,000 m.
- Parent source IDs and derived reach IDs are retained in the snapshot. The action-zone input uses a stable `river:N3L_E0020000:<sourceRecordId>:<reachId>` ID.
- River context aggregates existing hotspot cells only; it is excluded from biological scoring.

## Bounded snapshot rule

The complete Gyeongbuk clip produced 68,765 eligible reaches (about 96 MB), which is not suitable for the no-key demo. The committed 3.7 MB snapshot contains 1,886 reaches: one representative reach per official CP949 `NAME`, selected by the lowest `(sourceRecordId, reachId)` after clipping and splitting. This is deterministic and preserves source attribution, but is representative context rather than a complete navigable river network. The exact rule and tradeoff are embedded in the snapshot audit metadata.

## TDD evidence

RED: Added focused snapshot/import assertions before production changes, then ran `pnpm test -- packages/data-core/test/import-demo.test.ts`. The test command built successfully but could not execute its worker subprocesses because the workspace had a missing `vitest/suppress-warnings.cjs` preload module. The initial intended failure therefore could not reach the new absent-snapshot assertion.

GREEN:

- `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/action-zones.test.ts --no-file-parallelism` — 8/8 passed.
- `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/import-demo.test.ts --no-file-parallelism -t 'keeps only CP949'` — 1/1 passed.
- `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/import-demo.test.ts --no-file-parallelism -t 'named lakes and river reaches'` — 1/1 passed.
- `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/import-demo.test.ts --no-file-parallelism -t 'named lake and river context'` — 1/1 passed.
- `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/import-demo.test.ts --no-file-parallelism -t 'regenerates the named river snapshot'` — 1/1 passed.
- `pnpm build` and `pnpm demo:data` passed.

## Full-suite evidence

Ran `pnpm test` and `NODE_OPTIONS='' pnpm test`. Both begin with successful TypeScript builds, but fail before completion when concurrent test workers launch nested `pnpm` commands with an injected stale preload path:

```
Cannot find module '.../node_modules/.pnpm/vitest@.../node_modules/vitest/suppress-warnings.cjs'
Require stack: internal/preload
```

This is an environment/test-runner dependency-link failure, not an assertion failure in the change. Restoring the frozen lockfile with `pnpm install --frozen-lockfile` returns focused-test execution to green. It is recorded here as the remaining verification concern.

## Files changed

- `scripts/prepare-demo-snapshots.py`
- `data/raw/demo/national-base-map-rivers-gyeongbuk-2024.geojson`
- `packages/data-core/src/normalize.ts`
- `packages/data-core/test/import-demo.test.ts`

## Self-review

- Confirmed all published river names are nonempty and originate from CP949-decoded `N3L_E0020000` `NAME` values.
- Confirmed every published coordinate passes the shared Gyeongbuk predicate; boundary intersections are nudged only toward the clipped segment interior to avoid floating-point exclusion.
- Confirmed `sourceRecordId`, `parentSourceRecordId`, `reachId`, source URL, licence, attribution, source bundle checksum, snapshot checksum, and import run handling are present.
- Confirmed action-zone score traces equal the no-landform baseline.
- No hotspot scoring logic was changed.

## Fix round 1: direct reach-length regression coverage

Reviewer finding: the prior snapshot test trusted the audit declaration of `maximumReachLengthMetres` and did not calculate geometry lengths.

Added an independent Haversine implementation in the import test and assert that every committed and regenerated `LineString` reach has a total geodesic length of at most 2,000.01 m. Added an action-zone fixture that spans roughly 3.6 km and must produce `Reach 01` and `Reach 02`; it initially failed with a too-short 2.1 km fixture because the H3 cell boundary overlapped the first reach, not because splitting was wrong. The widened fixture proves the public action-zone behavior across the threshold.

Fix verification:

- `packages/data-core/test/action-zones.test.ts --no-file-parallelism` — 9/9 passed.
- `packages/data-core/test/import-demo.test.ts --no-file-parallelism -t 'keeps only CP949'` — 1/1 passed.
- `packages/data-core/test/import-demo.test.ts --no-file-parallelism -t 'regenerates the named river snapshot'` — 1/1 passed, including generated-reach lengths (24.62 s).
