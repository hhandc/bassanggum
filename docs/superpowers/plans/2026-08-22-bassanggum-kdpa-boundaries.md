# Bassanggum KDPA Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Add a reproducible, KDPA-attributed Gyeongbuk protected-area screening layer to the public data bundle.

**Architecture:** Convert the user-supplied KDPA 2025 SHP/Excel export into a bounded, checksum-verified Gyeongbuk GeoJSON snapshot. Normalize each feature as `RestrictedArea`, retain KDPA provenance, and publish the layer in MCP. It is a conservative screening overlay—not a legal determination or removal permission.

**Tech Stack:** TypeScript, GeoJSON, Zod, Vitest, MapLibre-ready output.

**Spec:** `docs/superpowers/specs/2026-08-22-bassanggum-design.md`

## Global Constraints

- Source: user-supplied KDPA export, origin `https://www.kdpa.kr/`.
- Emit only Gyeongbuk features with valid WGS84 Polygon/MultiPolygon geometry and full KDPA provenance/checksum.
- Every KDPA overlap is `report_only / official event required`; never infer legal removal permission.
- No community-private coordinate, media, profile, or device data enters any generated file.
- The three NIE occurrence sources retain their provenance unchanged.

### Task 1: Import and publish KDPA Gyeongbuk screening boundaries

**Files:** Modify the source-preparation/import scripts, `data/raw/README.md`, `packages/data-core/src/normalize.ts`, data-core/MCP tests; create a bounded KDPA GeoJSON snapshot under `data/raw/demo/`.

- [ ] Write failing tests proving the importer publishes only KDPA `KR-47` boundary records, rejects a tampered checksum, retains KDPA URL/attribution/source-record ID, and emits a nonempty `restricted-areas.geojson` plus source-catalog entry.
- [ ] Run those tests RED.
- [ ] Add deterministic SHP-to-bounded-GeoJSON preparation with direct KDPA provenance, WGS84 geometry validation, checksum, record counts, and documented screening limitation.
- [ ] Normalize the snapshot to `RestrictedArea` and include it in `importDemoSnapshots`/public bundle. Preserve current three NIE occurrence-source behavior.
- [ ] Run `pnpm demo:data`, focused tests, lint, typecheck, full test, and real MCP resource/tool smoke. Commit `feat: add KDPA protected-area screening layer`.
