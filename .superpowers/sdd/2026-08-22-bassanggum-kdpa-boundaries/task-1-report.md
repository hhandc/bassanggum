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

## Review round 1

### RED

- Added `regenerates KDPA provenance when only the DBF component is tampered
  with`. Before the parser change, this invoked the non-existent `--kdpa-only`
  regeneration mode and failed with `ENOENT` for the expected temporary
  GeoJSON output.
- Added a hotspot/action-zone invariance regression and real stdio MCP
  assertions for KDPA provenance in both `get_data_provenance` and
  `bassanggum://catalog/datasets` through `pnpm --dir <repo> mcp`.

### GREEN

- `sourceFileChecksum` now hashes a deterministic sorted manifest of the KDPA
  `.shp`, `.dbf`, `.prj`, and `.cpg` component digests. A DBF-only change now
  changes source provenance even when geometry is untouched.
- `--kdpa-only <source-directory> <output-directory>` regenerates just the
  KDPA snapshot for reproducible source-integrity testing.
- The current complete-source checksum is
  `sha256:1086e4a90eb1dba1d8682f0d536606cd7ceb337d12a8bbdfbfe75fdde79e3af7`.
- The score regression proves the nonempty KDPA restricted-area layer is
  absent from the `calculateHotspotCells` input; generated action zones equal
  the score/action-zone result calculated without restricted areas.

### Verification

- RED: `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/import-demo.test.ts -t "regenerates KDPA provenance"` — failed as expected before adding `--kdpa-only`.
- GREEN: same focused command — passed: 1 test.
- `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/import-demo.test.ts -t "keeps KDPA restricted areas out"` — passed: 1 test.
- `pnpm demo:data` — passed.
- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- External stdio smoke command attempted:
  `pnpm exec vitest --config vitest.workspace.ts run packages/mcp-server/test/mcp-cli.test.ts`.
  It starts the documented `pnpm --dir <repo> mcp` transport with the new
  KDPA-visible tool/resource assertions, but the desktop command runner
  forcibly stops it at 30 seconds while it rebuilds/loads the full boundary
  bundle. It did not produce a reliable pass/fail result; no success claim is
  made for this smoke or the full suite in this environment.

### Commit

`fix: harden KDPA source bundle integrity`

## Verification-gate follow-up

No repository code was changed for this verification-only follow-up.

I ran a direct Node SDK client that starts the real documented child process:

```text
pnpm --dir /Users/hyeonhongchang/Documents/ChatGPT/junctionX/.worktrees/bassanggum mcp
```

The client waits for MCP initialization, calls `get_data_provenance`, and reads
`bassanggum://catalog/datasets`; both assertions require dataset
`KDPA-PROTECTED-AREAS-OECM-KR-2025` with `https://www.kdpa.kr/`.

Result: the desktop command runner terminated the direct SDK smoke at 30.2
seconds with no SDK response and no server stdout/stderr. To isolate public
bundle volume, I repeated the identical documented child command against a
temporary, freshly generated minimal public bundle containing one real KDPA
restricted-area record. It was also terminated at 30.2 seconds, both with the
SDK's default child environment and with the inherited shell environment. Thus
there is no reproducible application failure to fix; the gate remains
unproven solely because the runner kills the real stdio process before it
returns. The original full generated `data/normalized` bundle was restored
after each attempt.

## Review round 2: SHX source integrity

- RED: `pnpm exec vitest --config vitest.workspace.ts run packages/data-core/test/import-demo.test.ts -t "only the SHX component"` failed as expected because a `.shx`-only change did not alter `sourceFileChecksum`.
- GREEN: the same focused command passed after adding `.shx` to the sorted component manifest.
- The documented source-bundle manifest now covers `.shp`, `.shx`, `.dbf`, `.prj`, and `.cpg`; regenerated checksum:
  `sha256:38cd7d091c0b57eccc8ca942394c631e26b2bd3f0bcfff93fc087bd555300cd2`.

### Commit

`fix: include KDPA SHX checksum`
