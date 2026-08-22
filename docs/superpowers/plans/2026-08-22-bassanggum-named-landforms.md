# Bassanggum Named Landforms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Convert supplied Korean government spatial files into source-attributed named lake, river-reach, and forest-habitat action zones for Gyeongbuk hotspot data.

**Architecture:** Reuse the deterministic EPSG:5179 SHP/DBF reader and bounded snapshot pattern. Landform geometries are separate official context inputs: they aggregate already-scored H3 cells but never create or change biological hotspot scores. A named feature must have an authoritative source name; derived place-name associations remain explicitly derived.

**Tech Stack:** TypeScript, GeoJSON, existing SHP/DBF parser, Zod, H3, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-bassanggum-design.md`

## Global Constraints

- Keep fish/plant occurrence scoring separate from water/forest/restriction geometry.
- Preserve dataset URL, licence/attribution, import run, source record ID, and component checksums.
- Lakes use only official nonempty `NAME`; never invent names from nearby places.
- Rivers use official named centerlines, clipped to Gyeongbuk and split into deterministic <=2 km reaches.
- Forest zones expose source forest-type/species attributes; place names are marked derived or omitted.
- Exact community coordinates, media, profile IDs, and device information never enter public data.

### Task 1: Import named lake/reservoir landforms

**Files:** Extend source prep/import/schema tests and create bounded lake snapshot.

- [ ] Add RED tests for EPSG:5179 lake input, Gyeongbuk clipping, nonempty official names, source checksum, and named lake action zones without score changes.
- [ ] Generate an attributed, simplified Gyeongbuk lake/reservoir snapshot from `N3A_E0052114`, retaining `UFID`, `NAME`, `SERV`, `MARA`, `MNGT`, `FMTA`; normalize to waterbody/action-zone input.
- [ ] Run focused tests, demo generation, lint/typecheck/full test; commit `feat: add named Gyeongbuk lake zones`.

### Task 2: Import named river reaches

**Files:** Extend source prep/import/action-zone tests and create bounded river snapshot.

- [ ] Add RED tests for CP949 named centerlines, metric Gyeongbuk clipping, deterministic <=2,000 m reach splitting, and stable parent/source IDs.
- [ ] Generate named reaches from `N3L_E0020000`; use `N3A_E0032111` only for visible width context, never as a source of river names.
- [ ] Verify source provenance, action-zone aggregation, no score impact, then commit `feat: add named Gyeongbuk river reaches`.

### Task 3: Import forest-habitat zones

**Files:** Extend source prep/import/action-zone tests and create bounded forest snapshot.

- [ ] Add RED tests that both Gyeongbuk-clipped forest shards load, dedupe overlapping source geometry, preserve forest type/species/update attributes, and label derived place names distinctly.
- [ ] Generate simplified forest-habitat zones from `47_1`/`47_2`; optionally associate `N3P_H0040000` points only as `derived` labels.
- [ ] Verify provenance/privacy/score isolation and commit `feat: add Gyeongbuk forest habitat zones`.
