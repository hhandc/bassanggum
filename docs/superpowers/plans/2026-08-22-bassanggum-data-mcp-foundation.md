# Bassanggum Data and MCP Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reproducible public-data pipeline, landform-aware hotspot engine, and read-only MCP server that make Gyeongbuk invasive fish/plant information usable by AI agents.

**Architecture:** A TypeScript pnpm workspace owns normalized source records, provenance manifests, a 1 km cell scoring engine, and named landform action-zone aggregation in `packages/data-core`. The stdio MCP server reads only this generated data bundle and exposes schema-validated tools and resources; it never reads citizen media or exact community-report coordinates.

**Tech Stack:** Node.js 22, TypeScript, pnpm workspaces, Zod, Turf, H3, Vitest, `@modelcontextprotocol/sdk`, JSON/GeoJSON, ESLint, Prettier.

**Spec:** `docs/superpowers/specs/2026-08-22-bassanggum-design.md`

## Global Constraints

- Support fish and plant catalogue entries only in the hackathon MVP.
- Bundle a source-attributed snapshot so `pnpm demo:data` and the MCP server run without external credentials.
- Preserve dataset ID, source URL, licence/attribution, import run ID, and source record ID through every normalization and MCP response.
- Compute evidence by 1 km H3 cell per species; present named action zones whenever official landform geometry overlaps scored cells.
- Never let events change biological hotspot scores.
- Community data accepted by the engine must already be marked `verified`; exact community coordinates and report media never enter the MCP bundle.
- Every code task follows test-first development and commits a focused, passing change.

---

## File Structure

```text
package.json                         # root scripts and engine constraints
pnpm-workspace.yaml                  # workspace packages
tsconfig.base.json                   # strict shared TypeScript settings
vitest.workspace.ts                  # package test discovery
.env.example                         # optional source endpoint/key configuration only
data/
  raw/README.md                       # source-file placement, licence, and checksum rules
  raw/demo/                           # small attributed fixture snapshots committed to Git
  normalized/                         # generated demo GeoJSON/JSON, ignored except .gitkeep
packages/data-core/
  package.json
  src/schema.ts                       # Zod schemas and TypeScript types
  src/provenance.ts                   # manifests and source attribution helpers
  src/normalize.ts                    # EcoBank-like row/feature normalizers
  src/catalog.ts                      # fish/plant catalogue assembly
  src/hotspots.ts                     # H3 evidence score and label calculation
  src/action-zones.ts                 # cell-to-landform aggregation
  src/bundle.ts                       # writes normalized public bundle
  src/index.ts
  scripts/import-demo.ts              # no-key source snapshot import
  scripts/sync-ecobank.ts             # optional authenticated refresh
  test/*.test.ts
packages/mcp-server/
  package.json
  src/bundle-reader.ts                # validates generated public bundle
  src/tools.ts                        # pure implementations of MCP queries
  src/resources.ts                    # resource URI loaders
  src/index.ts                        # stdio MCP server registration
  test/*.test.ts
README.md                             # local setup, source attribution, MCP configuration
LICENSE                               # Apache-2.0 text
```

## Task 1: Create the strict TypeScript workspace

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.workspace.ts`, `.gitignore`, `.env.example`, `LICENSE`
- Create: `packages/data-core/package.json`, `packages/mcp-server/package.json`
- Test: `packages/data-core/test/workspace.test.ts`

**Interfaces:**
- Produces package names `@bassanggum/data-core` and `@bassanggum/mcp-server` with Node 22 ESM output.

- [ ] **Step 1: Write a failing workspace resolution test**

```ts
import { describe, expect, it } from 'vitest';

describe('workspace', () => {
  it('exports the data-core package name', async () => {
    const module = await import('@bassanggum/data-core');
    expect(module.packageName).toBe('@bassanggum/data-core');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bassanggum/data-core test workspace.test.ts`

Expected: FAIL because the workspace and package export do not exist.

- [ ] **Step 3: Add the root workspace configuration and minimal export**

```json
// pnpm-workspace.yaml
packages:
  - "packages/*"
```

```ts
// packages/data-core/src/index.ts
export const packageName = '@bassanggum/data-core';
```

Set `"type": "module"`, `"engines": { "node": ">=22" }`, strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), and root scripts `lint`, `typecheck`, `test`, `build`, `demo:data`, `sync:ecobank`, and `mcp`. Add Apache-2.0 as the repository license. Ignore `node_modules`, `.env`, generated `data/normalized/*`, and coverage; keep `data/normalized/.gitkeep`.

- [ ] **Step 4: Run format, typecheck, and the focused test**

Run: `pnpm install && pnpm lint && pnpm typecheck && pnpm --filter @bassanggum/data-core test workspace.test.ts`

Expected: all commands PASS.

- [ ] **Step 5: Commit the workspace**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts .gitignore .env.example LICENSE packages
git commit -m "chore: create Bassanggum TypeScript workspace"
```

## Task 2: Define normalized public-data schemas and provenance

**Files:**
- Create: `packages/data-core/src/schema.ts`, `packages/data-core/src/provenance.ts`
- Modify: `packages/data-core/src/index.ts`
- Test: `packages/data-core/test/schema.test.ts`, `packages/data-core/test/provenance.test.ts`

**Interfaces:**
- Produces `DatasetSource`, `ImportRun`, `Species`, `OfficialOccurrence`, `HabitatArea`, `Waterbody`, `RestrictedArea`, `VerifiedCommunitySignal`, `VerifiedEvent`, and `PublicDataBundle` Zod schemas.
- Produces `createProvenance(source, importRun, sourceRecordId)` returning immutable provenance metadata.

- [ ] **Step 1: Write failing schema/provenance tests**

```ts
it('rejects an official occurrence without a source record ID', () => {
  expect(() => OfficialOccurrenceSchema.parse({ speciesId: 'bass', geometry: point })).toThrow();
});

it('retains dataset attribution in normalized provenance', () => {
  expect(createProvenance(source, run, 'eco-42')).toMatchObject({
    datasetId: '15022461',
    sourceRecordId: 'eco-42',
    licence: 'KOGL Type 1',
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm --filter @bassanggum/data-core test schema.test.ts provenance.test.ts`

Expected: FAIL because schemas and helper are undefined.

- [ ] **Step 3: Implement strict Zod schemas**

Use GeoJSON `Point`, `Polygon`, and `MultiPolygon` discriminated schemas. Require `datasetId`, `provider`, `sourceUrl`, `licence`, `attribution`, `importRunId`, and `sourceRecordId` for all official records. Restrict species categories to `fish | plant`; restrict evidence source to `official | community_verified`; exclude media fields and exact private coordinates from `PublicDataBundleSchema`.

- [ ] **Step 4: Run the focused tests and typecheck**

Run: `pnpm --filter @bassanggum/data-core test schema.test.ts provenance.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit provenance contracts**

```bash
git add packages/data-core/src packages/data-core/test
git commit -m "feat: define normalized ecological data contracts"
```

## Task 3: Normalize source snapshots into fish/plant records

**Files:**
- Create: `data/raw/README.md`, `data/raw/demo/ecobank-fish.json`, `data/raw/demo/ecobank-flora.json`, `data/raw/demo/ecobank-habitat.geojson`
- Create: `packages/data-core/src/normalize.ts`, `packages/data-core/scripts/import-demo.ts`
- Test: `packages/data-core/test/normalize.test.ts`, `packages/data-core/test/import-demo.test.ts`

**Interfaces:**
- Produces `normalizeOccurrenceRow(row, source, importRun): OfficialOccurrence | null`.
- Produces `normalizeHabitatFeature(feature, source, importRun): HabitatArea | null`.
- Produces `importDemoSnapshots(inputDirectory): PublicDataBundle`.

- [ ] **Step 1: Write failing normalization tests**

```ts
it('keeps a Gyeongbuk bluegill survey point with provenance', () => {
  const record = normalizeOccurrenceRow(fishRow, fishSource, importRun);
  expect(record).toMatchObject({ speciesId: 'lepomis-macrochirus', evidenceSource: 'official' });
});

it('drops a point outside Gyeongbuk', () => {
  expect(normalizeOccurrenceRow(outsideProvinceRow, fishSource, importRun)).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `pnpm --filter @bassanggum/data-core test normalize.test.ts import-demo.test.ts`

Expected: FAIL because normalizers do not exist.

- [ ] **Step 3: Add source fixtures and normalizers**

Create small, hand-audited fixture records that contain only data permitted by the source licence and include accompanying source URLs in `data/raw/README.md`. Normalize Korean/scientific species names, parse valid WGS84 coordinates, restrict to a committed Gyeongbuk boundary polygon, preserve observation dates, and generate a deterministic `official:${datasetId}:${sourceRecordId}` ID. For SHP/DBF production imports, document `ogr2ogr` conversion to GeoJSON in `data/raw/README.md`; the demo script consumes pre-converted GeoJSON to avoid requiring GIS software.

- [ ] **Step 4: Run importer and verify generated bundle schema**

Run: `pnpm demo:data && pnpm --filter @bassanggum/data-core test normalize.test.ts import-demo.test.ts`

Expected: `data/normalized/public-bundle.json` is generated locally and tests PASS.

- [ ] **Step 5: Commit source ingestion**

```bash
git add data/raw packages/data-core/src/normalize.ts packages/data-core/scripts/import-demo.ts packages/data-core/test
git commit -m "feat: normalize attributed EcoBank demo snapshots"
```

## Task 4: Build the catalogue and licensed identification media registry

**Files:**
- Create: `data/raw/demo/species-catalog.json`, `packages/data-core/src/catalog.ts`
- Test: `packages/data-core/test/catalog.test.ts`

**Interfaces:**
- Produces `buildSpeciesCatalog(records, media): Species[]`.
- `Species.actionPolicy` is exactly `community_removal | official_event_only | report_only`.

- [ ] **Step 1: Write failing catalogue tests**

```ts
it('contains only fish and plant entries', () => {
  expect(buildSpeciesCatalog(records, media).every((item) => ['fish', 'plant'].includes(item.category))).toBe(true);
});

it('requires licence metadata for every identification image', () => {
  expect(() => buildSpeciesCatalog(records, [{ speciesId: 'bass', url: '/bass.jpg' }])).toThrow();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/data-core test catalog.test.ts`

Expected: FAIL because `buildSpeciesCatalog` is undefined.

- [ ] **Step 3: Implement catalogue assembly**

Merge curated bilingual names, visual traits, look-alikes, source-linked disposal guidance, action policy, and media credit/licence fields with observed source species. Allow cooking guidance only if `category === 'fish'` and `cookingGuidance.sourceUrl` is present. Reject a plant with cooking guidance. Keep generated images out of the catalogue unless explicitly marked supplementary; no generated image may be the sole identification reference.

- [ ] **Step 4: Run tests and regenerate bundle**

Run: `pnpm --filter @bassanggum/data-core test catalog.test.ts && pnpm demo:data`

Expected: PASS; `public-bundle.json` contains bilingual catalogue entries.

- [ ] **Step 5: Commit catalogue support**

```bash
git add data/raw/demo/species-catalog.json packages/data-core/src/catalog.ts packages/data-core/test/catalog.test.ts
git commit -m "feat: add bilingual invasive species catalogue"
```

## Task 5: Calculate transparent species-level hotspot cells

**Files:**
- Create: `packages/data-core/src/hotspots.ts`
- Test: `packages/data-core/test/hotspots.test.ts`

**Interfaces:**
- Produces `calculateHotspotCells(input: HotspotInput): HotspotCell[]`.
- `HotspotCell` contains `h3Index`, `speciesId`, `score`, `status`, `evidenceBreakdown`, and public GeoJSON geometry.

- [ ] **Step 1: Write the failing scoring tests**

```ts
it('labels a cell with official evidence and score 25 as known', () => {
  expect(calculateHotspotCells(knownInput)[0]?.status).toBe('known');
});

it('does not add event data to the biological score', () => {
  expect(calculateHotspotCells(withEvent)[0]?.score).toBe(calculateHotspotCells(withoutEvent)[0]?.score);
});

it('labels three verified signals from two profiles in 30 days as emerging', () => {
  expect(calculateHotspotCells(emergingInput)[0]?.status).toBe('emerging');
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/data-core test hotspots.test.ts`

Expected: FAIL because the scoring engine is absent.

- [ ] **Step 3: Implement H3 scoring and labels**

Use H3 resolution 8 (roughly 1 km-scale cells). Assign official evidence weights of 10, 6, or 3 by observation recency; overlap weights of 5–15 from explicit committed habitat-frequency bands; verified sighting/removal weights of 4/6; and +2 for a strongly present adjacent cell. Implement constants in one exported `HOTSPOT_WEIGHTS` object. Compute `known`, `watch`, `emerging`, and `none` exactly as specified; an `emerging` status requires three distinct verified signals within 30 days from two profile IDs. Return all contributing IDs and points in `evidenceBreakdown`.

- [ ] **Step 4: Run hotspot tests and typecheck**

Run: `pnpm --filter @bassanggum/data-core test hotspots.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit hotspot engine**

```bash
git add packages/data-core/src/hotspots.ts packages/data-core/test/hotspots.test.ts
git commit -m "feat: calculate transparent invasive species hotspots"
```

## Task 6: Convert cells into named landform action zones

**Files:**
- Create: `data/raw/demo/waterbodies.geojson`, `data/raw/demo/restricted-areas.geojson`
- Create: `packages/data-core/src/action-zones.ts`
- Test: `packages/data-core/test/action-zones.test.ts`

**Interfaces:**
- Produces `createActionZones(cells, landforms): ActionZone[]`.
- `ActionZone.kind` is `lake | river_segment | forest_habitat | unnamed_cell_cluster`.

- [ ] **Step 1: Write failing zone tests**

```ts
it('merges scored lake cells into a named lake action zone', () => {
  expect(createActionZones(lakeCells, [andongLake])[0]).toMatchObject({ name: 'Andong Lake', kind: 'lake' });
});

it('uses a fallback cell cluster when no landform intersects', () => {
  expect(createActionZones(orphanCells, [])[0]?.kind).toBe('unnamed_cell_cluster');
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/data-core test action-zones.test.ts`

Expected: FAIL because zone aggregation is absent.

- [ ] **Step 3: Implement landform-first aggregation**

Use Turf intersections to associate cell polygons with lake, habitat/forest, and waterbody geometries. Aggregate per-species evidence and scores into an action zone. Split river geometry into deterministic 2 km reaches before aggregation, naming each reach with river name plus ordinal/reach notation. If no reliable landform intersects, union adjacent scored cells into a transparent fallback cluster. Preserve the original cell IDs in every zone for traceability.

- [ ] **Step 4: Run the focused test suite**

Run: `pnpm --filter @bassanggum/data-core test action-zones.test.ts hotspots.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit action zones**

```bash
git add data/raw/demo/waterbodies.geojson data/raw/demo/restricted-areas.geojson packages/data-core/src/action-zones.ts packages/data-core/test/action-zones.test.ts
git commit -m "feat: derive named landform action zones"
```

## Task 7: Generate and validate the public data bundle

**Files:**
- Create: `packages/data-core/src/bundle.ts`
- Modify: `packages/data-core/scripts/import-demo.ts`, `packages/data-core/src/index.ts`
- Test: `packages/data-core/test/bundle.test.ts`

**Interfaces:**
- Produces `writePublicBundle(bundle, outputDirectory): Promise<BundleManifest>`.
- Writes `data/normalized/public-bundle.json`, `hotspots.geojson`, `action-zones.geojson`, and `manifest.json`.

- [ ] **Step 1: Write failing bundle tests**

```ts
it('writes source-attributed public files with no private report fields', async () => {
  const manifest = await writePublicBundle(bundle, tempDir);
  expect(manifest.files).toContain('hotspots.geojson');
  expect(await readFile(`${tempDir}/public-bundle.json`, 'utf8')).not.toContain('exactLocation');
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/data-core test bundle.test.ts`

Expected: FAIL because writer is absent.

- [ ] **Step 3: Implement deterministic bundle output**

Sort all records by stable IDs before JSON serialization. Write source catalog, species catalog, official occurrences, action zones, hotspots, restrictions, and verified events as separate generated files; hash them in `manifest.json`. Validate every file through the exported Zod schema before write and after read-back. Fail if a private coordinate, media URL, or profile token appears in the output.

- [ ] **Step 4: Run demo build and all data-core tests**

Run: `pnpm demo:data && pnpm --filter @bassanggum/data-core test`

Expected: generated bundle validates and all data-core tests PASS.

- [ ] **Step 5: Commit generated-bundle pipeline**

```bash
git add packages/data-core/src/bundle.ts packages/data-core/scripts/import-demo.ts packages/data-core/src/index.ts packages/data-core/test/bundle.test.ts data/normalized/.gitkeep
git commit -m "feat: generate provenance-safe public data bundle"
```

## Task 8: Implement MCP tools, resources, and stdio entrypoint

**Files:**
- Create: `packages/mcp-server/src/bundle-reader.ts`, `packages/mcp-server/src/tools.ts`, `packages/mcp-server/src/resources.ts`, `packages/mcp-server/src/index.ts`
- Test: `packages/mcp-server/test/tools.test.ts`, `packages/mcp-server/test/resources.test.ts`, `packages/mcp-server/test/server-smoke.test.ts`

**Interfaces:**
- Produces functions `listSpecies`, `searchOccurrences`, `getHotspots`, `getAreaProfile`, `findRemovalEvents`, `getSpeciesGuidance`, and `getDataProvenance`.
- Registers MCP tools `list_species`, `search_occurrences`, `get_hotspots`, `get_area_profile`, `find_removal_events`, `get_species_guidance`, and `get_data_provenance`.
- Registers resources documented in the specification.

- [ ] **Step 1: Write failing MCP query tests**

```ts
it('returns official-source provenance with a hotspot result', () => {
  expect(getHotspots(bundle, { speciesId: 'lepomis-macrochirus' })[0]).toMatchObject({
    evidenceType: 'official',
    provenance: { datasetId: expect.any(String), sourceUrl: expect.any(String) },
  });
});

it('never returns an exact community location from occurrence search', () => {
  expect(JSON.stringify(searchOccurrences(bundle, { source: 'community_verified' }))).not.toContain('exactLocation');
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/mcp-server test`

Expected: FAIL because server query functions do not exist.

- [ ] **Step 3: Implement pure query functions and schemas**

Load and validate `data/normalized` once at process startup. Define Zod input schemas for optional species, category, bounding box, dates, and status filters. Apply a bounded default result limit of 100 and include `nextCursor` for larger result sets. Return concise structured content and a human-readable text summary. For `get_area_profile`, include top species, score explanations, restrictions, and matching events. For every result include evidence type and provenance.

- [ ] **Step 4: Register stdio MCP server and resources**

```ts
const server = new McpServer({ name: 'bassanggum-mcp', version });
server.tool('list_species', ListSpeciesInput.shape, async (input) => toMcpResult(listSpecies(bundle, input)));
server.resource('species-catalog', 'bassanggum://catalog/species', async () => jsonResource(speciesCatalog));
await server.connect(new StdioServerTransport());
```

Implement all seven tools and four resources in the same pattern. Do not add any mutation tool or user-data access.

- [ ] **Step 5: Run smoke tests through an in-memory MCP client**

Run: `pnpm demo:data && pnpm --filter @bassanggum/mcp-server test && pnpm --filter @bassanggum/mcp-server typecheck`

Expected: every declared tool/resource is callable; schemas and provenance assertions PASS.

- [ ] **Step 6: Commit MCP server**

```bash
git add packages/mcp-server
git commit -m "feat: expose Bassanggum public data through MCP"
```

## Task 9: Document reproducible setup and open-source release

**Files:**
- Create: `README.md`
- Modify: `.env.example`, `package.json`
- Test: `packages/mcp-server/test/readme-commands.test.ts`

**Interfaces:**
- README documents exact commands `pnpm install`, `pnpm demo:data`, `pnpm mcp`, `pnpm test`, and optional `pnpm sync:ecobank`.

- [ ] **Step 1: Write a failing README command test**

```ts
it('documents all no-key judge commands', async () => {
  const readme = await readFile('../../README.md', 'utf8');
  for (const command of ['pnpm install', 'pnpm demo:data', 'pnpm mcp', 'pnpm test']) {
    expect(readme).toContain(command);
  }
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/mcp-server test readme-commands.test.ts`

Expected: FAIL because README is missing.

- [ ] **Step 3: Write README-first setup and MCP configuration**

Document Node/pnpm versions, no-key setup, exact source attribution and licence notices, raw-source refresh procedure, output files, test commands, known demo limitations, and this MCP configuration:

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

State clearly that bundled records are a dated snapshot and verified events are curated source-linked demo data.

- [ ] **Step 4: Verify README commands on a clean checkout**

Run: `pnpm demo:data && pnpm mcp --help && pnpm test && pnpm --filter @bassanggum/mcp-server test readme-commands.test.ts`

Expected: all commands PASS without an API key.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md .env.example package.json packages/mcp-server/test/readme-commands.test.ts
git commit -m "docs: add README-first MCP setup"
```

## Final Verification

- [ ] Run `pnpm install && pnpm demo:data && pnpm lint && pnpm typecheck && pnpm test`.
- [ ] Start `pnpm mcp` in a clean terminal and call each tool/resource with an MCP inspector or in-memory test client.
- [ ] Inspect generated bundle files to confirm source attribution is present and private fields are absent.
- [ ] Confirm `git status --short` is empty.
