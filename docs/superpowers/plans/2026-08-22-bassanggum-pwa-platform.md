# Bassanggum PWA Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the English-first/Korean-localized citizen PWA and API for viewing landform-based invasive-species hotspots, submitting evidence, and running transparent area challenges.

**Architecture:** The Fastify API imports the public data bundle produced by the data/MCP foundation plan and persists application data in PostGIS. The Next.js PWA consumes HTTP API GeoJSON layers, renders them with MapLibre GL, and keeps public records, community signals, event opportunities, and verified competition results visibly distinct.

**Tech Stack:** Node.js 22, TypeScript, pnpm, Next.js App Router, next-intl, Tailwind CSS, MapLibre GL, Fastify, PostgreSQL 16 + PostGIS 3.4, Drizzle ORM, Zod, Vitest, Supertest, Playwright, local filesystem object-storage adapter for demo mode.

**Spec:** `docs/superpowers/specs/2026-08-22-bassanggum-design.md`

## Global Constraints

- Execute `docs/superpowers/plans/2026-08-22-bassanggum-data-mcp-foundation.md` first; this plan consumes its `PublicDataBundle` and action-zone interfaces.
- English `/en` is the canonical locale and root redirects to it; `/ko` must contain every UI key and feature.
- Use MapLibre GL only; do not add NAVER, Kakao, Google, VWorld, or other map provider SDKs.
- Fish and plants only. Species display English, Korean, and scientific names when known.
- Official evidence, community-verified evidence, emerging hotspots, and AI-assisted identification must use different labels/styles.
- The default classifier is deterministic local fixture behavior. No third-party classifier or provider key is integrated.
- Removal points are awarded only after verification inside an active compatible challenge/event and outside a restricted area.
- Public map layers never expose exact report coordinates, report media, or anonymous profile tokens.

---

## File Structure

```text
apps/api/
  package.json
  src/server.ts                         # Fastify composition root
  src/db/schema.ts                      # Drizzle tables and geospatial columns
  src/db/client.ts                      # database connection
  src/db/seed.ts                        # seed normalized public bundle, events, challenges
  src/services/classifier.ts             # provider-neutral fixture adapter
  src/services/reports.ts                # submission and status machine
  src/services/hotspots.ts               # queued recalculation bridge
  src/services/leaderboards.ts           # points/rank queries
  src/routes/map.ts
  src/routes/areas.ts
  src/routes/species.ts
  src/routes/events.ts
  src/routes/reports.ts
  src/routes/leaderboards.ts
  src/routes/challenges.ts
  test/*.test.ts
  drizzle.config.ts
  drizzle/*.sql
apps/web/
  package.json
  app/[locale]/layout.tsx
  app/[locale]/page.tsx
  app/[locale]/map/page.tsx
  app/[locale]/report/page.tsx
  app/[locale]/events/page.tsx
  app/[locale]/impact/page.tsx
  app/api/health/route.ts
  components/map/*.tsx
  components/report/*.tsx
  components/species/*.tsx
  components/challenges/*.tsx
  lib/api.ts
  lib/i18n.ts
  messages/en.json
  messages/ko.json
  public/manifest.webmanifest
  public/icons/*
  test/*.test.tsx
  e2e/*.spec.ts
docker-compose.yml                      # local PostGIS only
```

## Task 1: Add the API/PWA packages and local PostGIS runtime

**Files:**
- Create: `apps/api/package.json`, `apps/web/package.json`, `docker-compose.yml`, `apps/api/src/server.ts`, `apps/web/app/[locale]/page.tsx`
- Modify: root `package.json`, `pnpm-workspace.yaml`, `.env.example`
- Test: `apps/api/test/health.test.ts`, `apps/web/test/home.test.tsx`

**Interfaces:**
- Produces `GET /health` returning `{ status: 'ok' }`.
- Produces the English home page at `/en`.

- [ ] **Step 1: Write failing API and PWA smoke tests**

```ts
// apps/api/test/health.test.ts
it('returns service health', async () => {
  const app = buildServer(testDependencies);
  expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
});

// apps/web/test/home.test.tsx
it('renders the English product name', () => {
  render(await HomePage({ params: Promise.resolve({ locale: 'en' }) }));
  expect(screen.getByRole('heading', { name: /Bassanggum/i })).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/api test health.test.ts && pnpm --filter @bassanggum/web test home.test.tsx`

Expected: FAIL because packages and entrypoints do not exist.

- [ ] **Step 3: Create package scaffolding**

Add `apps/*` to `pnpm-workspace.yaml`. Configure `docker-compose.yml` with `postgis/postgis:16-3.4`, database `bassanggum`, port `5432`, and persistent named volume `bassanggum-postgis`. Make Fastify’s `buildServer(dependencies)` injectable for tests. Create Next.js App Router configuration and a minimal `/en` page. Add root scripts `dev`, `dev:api`, `dev:web`, `db:up`, `db:migrate`, and `db:seed`.

- [ ] **Step 4: Run smoke tests**

Run: `pnpm --filter @bassanggum/api test health.test.ts && pnpm --filter @bassanggum/web test home.test.tsx && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit application scaffolding**

```bash
git add apps docker-compose.yml package.json pnpm-workspace.yaml .env.example
git commit -m "chore: scaffold Bassanggum API and PWA"
```

## Task 2: Implement the bilingual routing contract

**Files:**
- Create: `apps/web/lib/i18n.ts`, `apps/web/app/[locale]/layout.tsx`, `apps/web/messages/en.json`, `apps/web/messages/ko.json`, `apps/web/middleware.ts`
- Modify: `apps/web/app/[locale]/page.tsx`
- Test: `apps/web/test/i18n.test.tsx`, `apps/web/test/locale-keys.test.ts`

**Interfaces:**
- Valid locales are exactly `en | ko`.
- `/` redirects to `/en`; `/en` and `/ko` render equivalent feature navigation.

- [ ] **Step 1: Write failing locale tests**

```ts
it('redirects root to English', async () => {
  expect(await middleware(new NextRequest('http://localhost:3000/'))).toHaveProperty('headers');
});

it('has identical English and Korean translation keys', () => {
  expect(flattenKeys(enMessages).sort()).toEqual(flattenKeys(koMessages).sort());
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/web test i18n.test.tsx locale-keys.test.ts`

Expected: FAIL because locale infrastructure is absent.

- [ ] **Step 3: Configure next-intl and canonical strings**

Create messages for all existing navigation, map legends, report states, evidence labels, safety warnings, leaderboard labels, and errors in both JSON files. Configure middleware so unsupported locale routes return 404. Render a locale switcher that changes only the locale prefix and preserves the current page path.

- [ ] **Step 4: Run locale tests**

Run: `pnpm --filter @bassanggum/web test i18n.test.tsx locale-keys.test.ts && pnpm --filter @bassanggum/web typecheck`

Expected: PASS.

- [ ] **Step 5: Commit localization foundation**

```bash
git add apps/web/lib apps/web/app apps/web/messages apps/web/middleware.ts apps/web/test
git commit -m "feat: add English-first Korean localization"
```

## Task 3: Model persistence and seed public/action-zone data

**Files:**
- Create: `apps/api/src/db/schema.ts`, `apps/api/src/db/client.ts`, `apps/api/src/db/seed.ts`, `apps/api/drizzle.config.ts`
- Create: `apps/api/drizzle/0000_initial.sql`
- Test: `apps/api/test/seed.test.ts`, `apps/api/test/schema.test.ts`

**Interfaces:**
- Tables: `species`, `data_sources`, `official_occurrences`, `habitat_areas`, `waterbodies`, `restricted_areas`, `areas`, `hotspot_scores`, `verified_events`, `challenges`, `anonymous_profiles`, `reports`, `report_media`, `verification_results`, `leaderboard_entries`.
- Produces `seedPublicBundle(path): Promise<SeedSummary>`.

- [ ] **Step 1: Write failing seed tests**

```ts
it('imports action zones and their source provenance', async () => {
  const summary = await seedPublicBundle(fixtureBundlePath, db);
  expect(summary).toMatchObject({ areas: expect.any(Number), dataSources: expect.any(Number) });
  expect(await db.query.dataSources.findFirst()).toMatchObject({ datasetId: expect.any(String) });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/api test seed.test.ts schema.test.ts`

Expected: FAIL because database schema and seed functions are absent.

- [ ] **Step 3: Implement PostGIS/Drizzle schema and idempotent seeding**

Store point/polygon geometry as PostGIS `geometry` columns in EPSG:4326 and create GiST indexes on all spatial fields. Store public bundle import ID and source record IDs with unique constraints. Add a `public_location` geometry and a separate nullable `private_location` geometry to reports. Seed official records/action zones only from validated `PublicDataBundle`; use upserts keyed by stable IDs. Seed 3–5 source-linked demo events and matching time-bounded challenges.

- [ ] **Step 4: Run migrations and seed tests**

Run: `pnpm db:up && pnpm db:migrate && pnpm demo:data && pnpm db:seed && pnpm --filter @bassanggum/api test seed.test.ts schema.test.ts`

Expected: migrations apply once; rerunning seed does not duplicate rows; tests PASS.

- [ ] **Step 5: Commit persistence layer**

```bash
git add apps/api/src/db apps/api/drizzle apps/api/drizzle.config.ts apps/api/test
git commit -m "feat: persist public ecology and challenge data"
```

## Task 4: Serve provenance-safe map, area, species, and event APIs

**Files:**
- Create: `apps/api/src/routes/map.ts`, `apps/api/src/routes/areas.ts`, `apps/api/src/routes/species.ts`, `apps/api/src/routes/events.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/map.test.ts`, `apps/api/test/areas.test.ts`, `apps/api/test/species.test.ts`, `apps/api/test/events.test.ts`

**Interfaces:**
- `GET /map/layers?category=&speciesId=&evidence=` returns public GeoJSON layers.
- `GET /areas/:areaId`, `GET /species/:speciesId`, and `GET /events` return Zod-validated JSON.

- [ ] **Step 1: Write failing route tests**

```ts
it('returns an action-zone feature with top species but no private coordinate', async () => {
  const body = (await app.inject('/map/layers?category=fish')).json();
  expect(body.actionZones.features[0].properties.topSpecies).toBeTruthy();
  expect(JSON.stringify(body)).not.toContain('private_location');
});

it('explains a known area score using provenance', async () => {
  const body = (await app.inject('/areas/andong-lake')).json();
  expect(body).toMatchObject({ status: 'known', evidence: expect.any(Array), provenance: expect.any(Array) });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/api test map.test.ts areas.test.ts species.test.ts events.test.ts`

Expected: FAIL because routes are absent.

- [ ] **Step 3: Implement query routes**

Use query schemas that accept only `fish | plant`, known species IDs, and evidence labels. Return action zones as the primary hotspot geometry; include fallback cells only for unnamed clusters. Area responses include top three species, score breakdown, restriction state, applicable events, challenge, leaderboard owner, and source metadata. Species responses include bilingual names, media credit, traits, look-alikes, action policy, disposal guidance, and fish-only reviewed cooking guidance. Event responses include original notice URLs and stated organizer/eligibility without payout promises.

- [ ] **Step 4: Run route tests**

Run: `pnpm --filter @bassanggum/api test map.test.ts areas.test.ts species.test.ts events.test.ts && pnpm --filter @bassanggum/api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit public read API**

```bash
git add apps/api/src/routes apps/api/src/server.ts apps/api/test
git commit -m "feat: serve public map and species data"
```

## Task 5: Build anonymous profiles, classifier fixture, and report verification

**Files:**
- Create: `apps/api/src/services/classifier.ts`, `apps/api/src/services/reports.ts`, `apps/api/src/routes/reports.ts`
- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/server.ts`
- Test: `apps/api/test/reports.test.ts`, `apps/api/test/classifier.test.ts`

**Interfaces:**
- `POST /reports` accepts `sighting | removal`, selected species, location, challenge ID, device token, and media metadata.
- `GET /reports/:id` returns only the caller’s report status.
- `Classifier.classify(input): Promise<ClassificationResult>` remains provider-neutral.

- [ ] **Step 1: Write failing verification tests**

```ts
it('auto-verifies a fixture fish removal inside an active challenge', async () => {
  const response = await app.inject({ method: 'POST', url: '/reports', payload: validFishRemoval });
  expect(response.json()).toMatchObject({ status: 'auto_verified', verifiedUnits: 1 });
});

it('rejects a removal inside a restricted area', async () => {
  const response = await app.inject({ method: 'POST', url: '/reports', payload: restrictedRemoval });
  expect(response.json()).toMatchObject({ status: 'rejected', reason: 'restricted_area' });
});

it('routes a low-confidence classification to review with zero points', async () => {
  expect(await submit(lowConfidencePayload)).toMatchObject({ status: 'needs_review', pointsAwarded: 0 });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/api test reports.test.ts classifier.test.ts`

Expected: FAIL because classifier and report services are absent.

- [ ] **Step 3: Implement fixture classifier and status machine**

Implement the classifier interface with a deterministic fixture adapter selected by a test/demo media token. Create an anonymous profile when a valid device token is first submitted. Check Gyeongbuk boundary, target catalogue species, challenge dates/boundary/category, restriction intersection, duplicate suspicion (perceptual hash plus location/time window and profile token), evidence rules, and classifier confidence. Fish removals require one whole fish photo and verify exactly one unit. Plant removals require a readable scale result and verify kilograms rounded to 0.1. Use the exact status transitions from the specification and return localized reason codes.

- [ ] **Step 4: Run verification tests**

Run: `pnpm --filter @bassanggum/api test reports.test.ts classifier.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit reporting service**

```bash
git add apps/api/src/services apps/api/src/routes/reports.ts apps/api/src/db/schema.ts apps/api/src/server.ts apps/api/test
git commit -m "feat: verify citizen invasive species reports"
```

## Task 6: Update hotspots and leaderboard after verified removal

**Files:**
- Create: `apps/api/src/services/hotspots.ts`, `apps/api/src/services/leaderboards.ts`, `apps/api/src/routes/leaderboards.ts`, `apps/api/src/routes/challenges.ts`
- Modify: `apps/api/src/services/reports.ts`, `apps/api/src/server.ts`
- Test: `apps/api/test/leaderboards.test.ts`, `apps/api/test/hotspot-updates.test.ts`, `apps/api/test/challenges.test.ts`

**Interfaces:**
- `GET /leaderboards?areaId=&period=` returns rank, display name, verified fish count, verified plant kilograms, points, and ownership title.
- `POST /challenges/:areaId/join` records an eligible anonymous profile.

- [ ] **Step 1: Write failing points and update tests**

```ts
it('awards 30 points and one fish for a verified fish removal', async () => {
  expect(await leaderboardFor('andong-lake')).toContainEqual(expect.objectContaining({ points: 30, fishCount: 1 }));
});

it('awards the first-removal hotspot bonus once', async () => {
  expect(await firstRemoval('andong-lake')).toMatchObject({ pointsAwarded: 40 });
  expect(await secondRemoval('andong-lake')).toMatchObject({ pointsAwarded: 30 });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/api test leaderboards.test.ts hotspot-updates.test.ts challenges.test.ts`

Expected: FAIL because scoring and routes are absent.

- [ ] **Step 3: Implement points, rankings, and recalculation queue**

Create a transactional verification hook that adds 30 fish points, 20 plant points, and one +10 first verified removal bonus per profile/challenge hotspot. Update `leaderboard_entries` idempotently. Queue recomputation by affected cell/species; reuse the `@bassanggum/data-core` hotspot calculation and action-zone aggregation functions, then persist refreshed scores/zones. The current rank receives a month-bound `Guardian of <area>` title; ties use highest points, then verified units, then earliest verified report.

- [ ] **Step 4: Run integration tests**

Run: `pnpm --filter @bassanggum/api test leaderboards.test.ts hotspot-updates.test.ts challenges.test.ts`

Expected: PASS; no resubmission creates duplicate points.

- [ ] **Step 5: Commit gamification services**

```bash
git add apps/api/src/services apps/api/src/routes apps/api/test
git commit -m "feat: add action-zone challenges and leaderboards"
```

## Task 7: Build the MapLibre action-zone map

**Files:**
- Create: `apps/web/lib/api.ts`, `apps/web/components/map/BassanggumMap.tsx`, `apps/web/components/map/MapLegend.tsx`, `apps/web/components/map/LayerFilters.tsx`, `apps/web/components/map/AreaSheet.tsx`, `apps/web/app/[locale]/map/page.tsx`
- Test: `apps/web/test/map-legend.test.tsx`, `apps/web/test/layer-filters.test.tsx`, `apps/web/test/area-sheet.test.tsx`

**Interfaces:**
- `fetchMapLayers(filters): Promise<MapLayerResponse>` consumes `GET /map/layers`.
- `BassanggumMap` accepts validated GeoJSON and selected filters; browser-only MapLibre initialization is isolated in this component.

- [ ] **Step 1: Write failing UI tests**

```tsx
it('explains the difference between official and community evidence', () => {
  render(<MapLegend />);
  expect(screen.getByText(/Official evidence/i)).toBeVisible();
  expect(screen.getByText(/Community-verified/i)).toBeVisible();
});

it('shows species common in a selected named action zone', () => {
  render(<AreaSheet area={andongLakeArea} locale="en" />);
  expect(screen.getByText(/Largemouth bass/i)).toBeVisible();
  expect(screen.getByText(/Bluegill/i)).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/web test map-legend.test.tsx layer-filters.test.tsx area-sheet.test.tsx`

Expected: FAIL because map components are absent.

- [ ] **Step 3: Implement MapLibre layers and accessible controls**

Dynamically import MapLibre only on the client. Add sources/layers for official occurrence clusters, named action-zone fills/outlines, fallback cell clusters, community markers, events, restrictions, and waterbody context. Use distinct, color-accessible styles plus text legend labels for official, community-verified, emerging, and restricted states. Filter by fish/plant, species, evidence, and actionability. On zone click, fetch/open the area sheet showing top three species, score explanation, identification cards, event/challenge CTA, restrictions, and current guardian.

- [ ] **Step 4: Run component tests and browser build**

Run: `pnpm --filter @bassanggum/web test map-legend.test.tsx layer-filters.test.tsx area-sheet.test.tsx && pnpm --filter @bassanggum/web build`

Expected: PASS.

- [ ] **Step 5: Commit map experience**

```bash
git add apps/web/lib/api.ts apps/web/components/map apps/web/app/[locale]/map apps/web/test
git commit -m "feat: render landform invasive species hotspots"
```

## Task 8: Build species cards, events, and area-challenge pages

**Files:**
- Create: `apps/web/components/species/SpeciesCard.tsx`, `apps/web/components/events/EventCard.tsx`, `apps/web/components/challenges/Leaderboard.tsx`, `apps/web/app/[locale]/events/page.tsx`, `apps/web/app/[locale]/impact/page.tsx`
- Test: `apps/web/test/species-card.test.tsx`, `apps/web/test/event-card.test.tsx`, `apps/web/test/leaderboard.test.tsx`

**Interfaces:**
- Species cards render bilingual/common/scientific names, attributed image, traits, look-alikes, action policy, and guidance.
- Events always include `sourceUrl` as an external original-notice link.

- [ ] **Step 1: Write failing content tests**

```tsx
it('shows image attribution and report-only policy', () => {
  render(<SpeciesCard species={reportOnlySpecies} locale="en" />);
  expect(screen.getByText(/Image credit/i)).toBeVisible();
  expect(screen.getByText(/Report sightings only/i)).toBeVisible();
});

it('does not promise payout on an official event card', () => {
  render(<EventCard event={event} locale="en" />);
  expect(screen.getByRole('link', { name: /Open original notice/i })).toHaveAttribute('href', event.sourceUrl);
  expect(screen.queryByText(/Guaranteed reward/i)).toBeNull();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/web test species-card.test.tsx event-card.test.tsx leaderboard.test.tsx`

Expected: FAIL because components/pages are absent.

- [ ] **Step 3: Implement education and gamification surfaces**

Make identification images secondary to plain-language traits and explicitly show look-alike warnings. Show disposal guidance with source link; show cooking guidance only for an eligible fish. Events display organizer, dates, species, eligibility, map location, and “Open original notice.” My Impact presents verified units, points, badges, active challenges, and leaderboard title. Mark `needs_review` and rejected reports with zero points and specific explanation.

- [ ] **Step 4: Run UI tests**

Run: `pnpm --filter @bassanggum/web test species-card.test.tsx event-card.test.tsx leaderboard.test.tsx`

Expected: PASS in both locales.

- [ ] **Step 5: Commit supporting surfaces**

```bash
git add apps/web/components/species apps/web/components/events apps/web/components/challenges apps/web/app/[locale]/events apps/web/app/[locale]/impact apps/web/test
git commit -m "feat: add species guidance events and impact pages"
```

## Task 9: Build the evidence-reporting flow

**Files:**
- Create: `apps/web/components/report/ReportForm.tsx`, `apps/web/components/report/LocationPicker.tsx`, `apps/web/components/report/EvidenceRequirements.tsx`, `apps/web/components/report/ReportStatus.tsx`, `apps/web/app/[locale]/report/page.tsx`
- Modify: `apps/web/lib/api.ts`
- Test: `apps/web/test/report-form.test.tsx`, `apps/web/test/report-status.test.tsx`

**Interfaces:**
- `submitReport(payload): Promise<ReportResult>` calls `POST /reports`.
- Client stores only an opaque anonymous device token in local storage; no personal account details.

- [ ] **Step 1: Write failing form tests**

```tsx
it('requires a separate fish photo for one verified fish unit', async () => {
  render(<ReportForm locale="en" />);
  await userEvent.click(screen.getByRole('radio', { name: /Fish removal/i }));
  expect(screen.getByText(/One fish per photo/i)).toBeVisible();
});

it('requires a visible scale for a plant removal', async () => {
  render(<ReportForm locale="en" />);
  await userEvent.click(screen.getByRole('radio', { name: /Plant removal/i }));
  expect(screen.getByText(/visible scale/i)).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/web test report-form.test.tsx report-status.test.tsx`

Expected: FAIL because reporting components are absent.

- [ ] **Step 3: Implement safe report flow**

Let users capture/upload an image, select sighting/removal, use geolocation or manually place a MapLibre pin, select a catalogue species, and optionally join a listed challenge. Warn and prevent removal submission when client-side zone context is restricted or inactive, but let the server remain authoritative. Explain that image analysis is AI-assisted and that a report can require review. Use fixture media choices in demo mode so the judge can demonstrate verified, review, and rejected paths without an external model.

- [ ] **Step 4: Run reporting UI tests**

Run: `pnpm --filter @bassanggum/web test report-form.test.tsx report-status.test.tsx && pnpm --filter @bassanggum/web build`

Expected: PASS.

- [ ] **Step 5: Commit report flow**

```bash
git add apps/web/components/report apps/web/app/[locale]/report apps/web/lib/api.ts apps/web/test
git commit -m "feat: submit sighting and removal evidence"
```

## Task 10: Add PWA manifest, end-to-end coverage, and judge demo instructions

**Files:**
- Create: `apps/web/public/manifest.webmanifest`, `apps/web/public/icons/icon-192.png`, `apps/web/public/icons/icon-512.png`, `apps/web/e2e/bassanggum-demo.spec.ts`
- Modify: `apps/web/app/[locale]/layout.tsx`, root `README.md`
- Test: `apps/web/e2e/bassanggum-demo.spec.ts`

**Interfaces:**
- PWA manifest names the app `Bassanggum` and supports standalone display.
- E2E verifies English/Korean route parity and the seeded judge journey.

- [ ] **Step 1: Write failing Playwright judge-flow test**

```ts
test('judge can find an area, submit a verified catch, and see rank change', async ({ page }) => {
  await page.goto('/en/map');
  await page.getByText('Andong Lake').click();
  await page.getByRole('link', { name: /Report removal/i }).click();
  await page.getByLabel(/Demo verified bass photo/i).check();
  await page.getByRole('button', { name: /Submit report/i }).click();
  await expect(page.getByText(/Verified.*30 points/i)).toBeVisible();
  await page.getByRole('link', { name: /My Impact/i }).click();
  await expect(page.getByText(/Guardian of Andong Lake/i)).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @bassanggum/web exec playwright test e2e/bassanggum-demo.spec.ts`

Expected: FAIL until the complete flow exists.

- [ ] **Step 3: Add installability and demo documentation**

Add viewport/theme metadata, manifest link, and icons. Extend README with local PostGIS startup, migration/seed commands, PWA/API start commands, optional screenshot-free browser test setup, source attribution, no-key demo mode, and the exact 3-minute judge script. The script must include: map filter → landform hotspot explanation → species card → official event link → seeded removal → leaderboard update → MCP query from the foundation plan.

- [ ] **Step 4: Run browser, API, and full workspace verification**

Run: `pnpm db:up && pnpm db:migrate && pnpm demo:data && pnpm db:seed && pnpm test && pnpm --filter @bassanggum/web exec playwright test e2e/bassanggum-demo.spec.ts && pnpm build`

Expected: all commands PASS; the browser test shows a verified report update.

- [ ] **Step 5: Commit PWA delivery readiness**

```bash
git add apps/web/public apps/web/app/[locale]/layout.tsx apps/web/e2e README.md
git commit -m "feat: make Bassanggum installable and demo-ready"
```

## Final Verification

- [ ] Run `pnpm install && pnpm demo:data && pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- [ ] Run the full Playwright judge scenario at `/en`, then repeat locale navigation at `/ko`.
- [ ] Inspect `GET /map/layers` and MCP output to verify neither includes exact report coordinates, media, or profile tokens.
- [ ] Verify an official event card links to its source and does not promise payout.
- [ ] Confirm the public map renders named action zones first and fallback cells only where landform mapping is unavailable.
- [ ] Confirm `git status --short` is empty.
