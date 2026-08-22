# Viewport Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a real tiled base map and load only official overlays that intersect the visible map viewport.

**Architecture:** The API validates a `bbox` and `zoom`, filters stored geometry by its calculated bounding box, and simplifies protected-area rings based on zoom. The web app uses React Leaflet for OpenStreetMap tiles and sends an overlay request after the initial map load and each settled movement.

**Tech Stack:** TypeScript, Fastify, Zod, React 19, Next.js, React Leaflet, Leaflet, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-viewport-map-design.md`

## Global Constraints

- The source data bundle must remain unchanged; simplification applies only to map responses.
- `bbox` uses `west,south,east,north` longitude/latitude order and malformed or inverted values return `400 { status: 'invalid_request' }`.
- `zoom` is an optional integer from 0 through 22.
- OpenStreetMap is the base-map visual provider only; evidence overlays remain API-provided official data.
- Wide zoom uses 12 protected-area positions per ring, zoom 9–11 uses 24, and zoom 12+ uses 80.

---

### Task 1: Viewport-aware map API

**Files:**
- Modify: `apps/api/src/routes/map.ts`
- Modify: `apps/api/test/map.test.ts`

**Interfaces:**
- Consumes: `GET /map/layers` query filters and `PublicDataBundle` geometry.
- Produces: `GET /map/layers?bbox=west,south,east,north&zoom=integer`, returning only intersecting feature collections.

- [ ] **Step 1: Write failing API tests**

```ts
it('rejects malformed viewport bounds', async () => {
  const response = await app.inject('/map/layers?bbox=128,36,bad,37');
  expect(response.statusCode).toBe(400);
});

it('omits map features outside the requested viewport', async () => {
  const body = (await app.inject('/map/layers?bbox=127.9,35.6,128.0,35.7&zoom=9')).json();
  expect(body.actionZones.features).toHaveLength(0);
  expect(body.restrictedAreas.features).toHaveLength(0);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @bassanggum/api test -- test/map.test.ts`

Expected: the malformed bound is accepted or an off-screen feature remains in the response.

- [ ] **Step 3: Implement viewport parsing and geometry bounds filtering**

```ts
const bbox = parseBbox(query.bbox);
const zoom = query.zoom ?? 9;
const visible = (geometry: unknown) => bbox === undefined || geometryBounds(geometry).intersects(bbox);
```

Apply `visible` before generating action-zone and restricted-area features. Choose the protected-area ring cap from `zoom` before calling the existing map-only simplifier.

- [ ] **Step 4: Run focused API tests to verify they pass**

Run: `pnpm --filter @bassanggum/api test -- test/map.test.ts`

Expected: all map route tests pass.

- [ ] **Step 5: Commit the API task**

```bash
git add apps/api/src/routes/map.ts apps/api/test/map.test.ts
git commit -m "feat: filter map layers by viewport"
```

### Task 2: Leaflet viewport client

**Files:**
- Create: `apps/web/components/map/LeafletEvidenceMap.tsx`
- Modify: `apps/web/components/map/BassanggumMap.tsx`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/test/api.test.ts`
- Create: `apps/web/test/leaflet-evidence-map.test.tsx`

**Interfaces:**
- Consumes: `fetchMapLayers({ bbox: [number, number, number, number], zoom: number })` and the API response from Task 1.
- Produces: a React Leaflet map with OpenStreetMap tiles, current-viewport overlay requests, and action/protected area click callbacks.

- [ ] **Step 1: Write failing web tests**

```ts
it('adds viewport bounds and zoom to the map request', async () => {
  await fetchMapLayers({ bbox: [128, 36, 129, 37], zoom: 9 });
  expect(fetch).toHaveBeenCalledWith('http://localhost:3001/map/layers?bbox=128%2C36%2C129%2C37&zoom=9');
});
```

```tsx
it('renders a tile layer and passes a selected action feature to its callback', () => {
  render(<LeafletEvidenceMap layers={layers} onActionZoneClick={onActionZoneClick} onRestrictedAreaClick={onRestrictedAreaClick} onViewportChange={() => undefined} />);
  expect(screen.getByLabelText('OpenStreetMap base map')).toBeVisible();
});
```

- [ ] **Step 2: Run focused web tests to verify they fail**

Run: `pnpm --filter @bassanggum/web test -- test/api.test.ts test/leaflet-evidence-map.test.tsx`

Expected: `fetchMapLayers` accepts no viewport argument and the Leaflet component does not exist.

- [ ] **Step 3: Implement the Leaflet map and viewport requests**

```tsx
<MapContainer center={[36.4, 128.85]} zoom={9}>
  <TileLayer attribution="© OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  <ViewportListener onViewportChange={onViewportChange} />
  <GeoJSON data={layers.actionZones} onEachFeature={bindActionClick} />
  <GeoJSON data={layers.restrictedAreas} onEachFeature={bindRestrictedClick} />
</MapContainer>
```

`ViewportListener` calls `map.getBounds()` and `map.getZoom()` on initial load and `moveend`. `BassanggumMap` stores the last successful layer response, preserving it if a later request fails.

- [ ] **Step 4: Run focused web tests and typecheck to verify they pass**

Run: `pnpm --filter @bassanggum/web test -- test/api.test.ts test/leaflet-evidence-map.test.tsx && pnpm --filter @bassanggum/web typecheck`

Expected: all selected tests and TypeScript compilation pass.

- [ ] **Step 5: Commit the web task**

```bash
git add apps/web/components/map/LeafletEvidenceMap.tsx apps/web/components/map/BassanggumMap.tsx apps/web/lib/api.ts apps/web/test/api.test.ts apps/web/test/leaflet-evidence-map.test.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat: render viewport-aware leaflet map"
```

### Task 3: End-to-end verification

**Files:**
- Modify: none unless a verification failure requires the smallest relevant correction.

**Interfaces:**
- Consumes: completed API and web map implementations.
- Produces: evidence that base tiles and official visible overlays render together.

- [ ] **Step 1: Run the complete web suite**

Run: `pnpm --filter @bassanggum/web test && pnpm --filter @bassanggum/web build`

Expected: zero failed tests and a successful Next.js production build.

- [ ] **Step 2: Run the complete API suite**

Run: `pnpm --filter @bassanggum/api test && pnpm --filter @bassanggum/api build`

Expected: zero failed tests and a successful TypeScript build.

- [ ] **Step 3: Run both local services and verify visually**

Run: `pnpm dev:api` and `pnpm dev:web`

Expected: `http://localhost:3000/en` shows OpenStreetMap tiles underneath blue bounty zones and red restricted areas. Panning changes the request `bbox` visible in the API log.

- [ ] **Step 4: Commit final verification corrections only if needed**

```bash
git add <only files changed by a verified correction>
git commit -m "fix: complete viewport map verification"
```
