# Bassanggum Design Specification

## Purpose

Bassanggum (배스상금) is an English-first, Korean-localized progressive web app and open-source MCP server that turns Gyeongsangbuk-do invasive-species public data into citizen action. Its primary experience is a location-based bounty and competition platform: users find invasive-species hotspots, join an official removal event or a Bassanggum area challenge, submit evidence of a sighting or removal, and see verified contribution rankings.

The project must demonstrate both tracks of the hackathon challenge:

1. A reusable, open-source MCP server that makes normalized Gyeongbuk ecological data accessible to AI agents.
2. A public-facing service that uses that data and AI-assisted identification to help solve a regional invasive-species problem.

The initial scope is deliberately limited to invasive **fish** and **plants**. It does not include invasive mammals, reptiles, insects, or Dokdo rats in the first release.

## Product Principles

- **Evidence before excitement.** Official, community-verified, and AI-assisted data are visibly different states.
- **Action only where appropriate.** Users can report sightings broadly, but removal competition is limited to an active Bassanggum challenge or verified official removal area.
- **Data provenance is a product feature.** Every public-data-derived result names its dataset, source URL, import date, and licence/attribution.
- **Open infrastructure, not a closed dashboard.** The PWA and MCP server share normalized source data but are separately runnable products.
- **Demo reliability over live dependency.** The repository ships a versioned data snapshot and fixture classifier. Live source refreshes and future classifiers are optional adapters.
- **English is canonical; Korean is complete.** The default UI is English (`/en`); Korean (`/ko`) has the same keys and functionality. Species labels show English, Korean, and scientific names when available.

## Users and Core Journeys

### Citizen participant

1. Opens the map and filters fish or plants.
2. Selects a named hotspot/area and sees its top invasive species, evidence, action policy, restrictions, active event/challenge, and leaderboard.
3. Opens an identification card to compare the species photo, distinguishing traits, and possible look-alikes.
4. Joins an active area challenge or follows a verified official event.
5. Submits a sighting or removal report.
6. Receives a transparent verification status and, when verified, sees score, leaderboard, and hotspot changes.

### AI agent or developer

1. Starts the MCP server from the README.
2. Queries public occurrence records, hotspots, area profiles, events, guidance, and provenance using standard MCP tools/resources.
3. Receives normalized, source-attributed data without requiring knowledge of the original EcoBank formats.

### Organizer or reviewer (demo role)

1. Uses seeded verified events and challenge areas.
2. Reviews `needs_review` reports in the API/admin data flow when a live classifier is unavailable or uncertain.
3. Does not process payment: official bounty payment remains with the named event organizer.

## Public Data Scope and Provenance

### Required source datasets

| Source | Use in Bassanggum | Ingestion form |
|---|---|---|
| National Institute of Ecology EcoBank ecological information, Data.go.kr ID `15022461` | GIS habitat areas, species occurrence frequency, and spatial baseline | Versioned source download; convert SHP/DBF data to normalized GeoJSON |
| National Institute of Ecology natural-environment fish survey points, Data.go.kr ID `15101290` | Official fish observation coordinates, Korean names, scientific names | API adapter and bundled snapshot |
| National Institute of Ecology natural-environment flora survey points, Data.go.kr ID `15101287` | Official plant observation coordinates, Korean names, scientific names | API adapter and bundled snapshot |
| Gyeongbuk river information | Human-readable waterbody context for fish areas | Bundled normalized source or adapter |
| Local fishing-restriction/protected-area data when available | Report-only/restricted overlays and safety warnings | Bundled normalized source or adapter |

The source registry records: dataset ID, title, provider, source URL, licence text, attribution text, snapshot filename, checksum, source-record ID mapping, import timestamp, and parser version.

### Verified events

Verified removal/bounty events are a separate curated dataset containing 3–5 official local-government or organizer notices for the demo. Every event stores organizer, title, URL, area geometry, dates, eligible species, reward wording exactly as published, eligibility notes, and validation date. Generic festivals are never represented as removal events.

### Normalized evidence models

`official_occurrence` represents a source record with species, point location, observation date where available, source record ID, and import metadata.

`habitat_area` represents a source GIS polygon with species, frequency/habitat attributes, geometry, and source metadata.

`community_report` represents a citizen report and is never rewritten as an official occurrence. It includes status, exact private coordinate, public approximate coordinate, submitter token, submission time, media hashes, selected species, classifier result, and verification result.

## Species Catalogue and Action Policy

The catalogue is data-driven rather than hard-coded to bass and bluegill. It imports/curates fish and plant entries present in the chosen Gyeongbuk public-data snapshot, then marks each record with:

- `id`, English name, Korean name, scientific name, and `category` (`fish` or `plant`)
- official invasion/status reference
- identification image assets, image credits/licences, visual traits, and look-alike notes
- `actionPolicy`: `community_removal`, `official_event_only`, or `report_only`
- source-linked disposal guidance
- optional cooking guidance only for reviewed fish content; never for plants

The catalogue supports a broad set of relevant invasive fish and plants while preventing the UI from encouraging removal of every introduced species. A person may submit a sighting for a catalogue species. A removal report can earn platform points only inside an active compatible challenge or verified official event, and never inside restricted/protected zones.

## Hotspot Model

### Spatial unit

Use a roughly 1 km map-cell grid across Gyeongbuk. Score each **species within each cell**, rather than combining all species before scoring. Cells are an internal analytical unit, not the primary citizen-facing destination.

### Score

For each `speciesId` and cell:

| Evidence | Points |
|---|---:|
| Official occurrence dated within the last 12 months | +10 |
| Official occurrence dated 1–3 years ago | +6 |
| Older official occurrence | +3 |
| Official EcoBank habitat/frequency area overlaps the cell | +5 to +15, mapped transparently from source frequency bands |
| Verified community sighting | +4 |
| Verified community removal | +6 |
| Same species strongly present in an adjacent cell | +2 |

An event never increases a hotspot score: events are action opportunities, not biological evidence.

### Labels

- **Known hotspot:** score at least 25 and contains official evidence.
- **Watch area:** score from 10 through 24.
- **Emerging hotspot:** at least three verified community sightings of the same species within 1 km in the last 30 days, submitted by at least two distinct anonymous profile tokens.
- **No signal:** does not satisfy another label.

An emerging hotspot remains separately styled and worded as community-verified evidence. It never masquerades as an official observation. An organizer may review it and create a challenge area; the application does not automatically create an official event or pay bounty.

### Landform-based action zones

The PWA translates scored cells into named, landform-based **action zones** whenever a reliable boundary exists. A zone can be a lake, a practical river segment, a forest/habitat polygon, or another named official ecological area.

1. Intersect hotspot cells with normalized waterbody, forest/habitat, and other official-area geometries.
2. Aggregate the intersecting cells' per-species evidence and scores into the named zone.
3. Render the real landform boundary and name in the citizen-facing map and challenge UI.
4. For a river, create a practical segment (such as a 2 km reach) rather than treating the entire river as one competition area.
5. When there is no reliable named boundary, display the evidence as an **emerging hotspot zone** using a transparent 1 km cell/cluster and say why it exists.

This preserves reproducible scoring while letting users act on meaningful destinations such as “Andong Lake” instead of opaque grid coordinates. Each named action-zone card displays its label, why it earned the label, top three invasive species and scores, record counts, species identification cards, nearby waterbody context for fish, restrictions, active verified event, active platform challenge, and current leaderboard owner.

## PWA Experience

### Navigation

The PWA uses four primary tabs:

1. **Map:** hotspot cells, evidence layers, waterbody context, restrictions, events, and challenges.
2. **Report:** camera/upload, location capture/manual pin, report type, AI-assisted species confirmation, evidence submission, and report status.
3. **Events:** verified official removal/bounty notices with source links, claim instructions, and map location.
4. **My Impact:** verified counts, points, badges, challenges, and leaderboards.

The first run generates an anonymous profile token and a default display name that can be changed. Full account registration is out of scope.

### Map implementation

Use MapLibre GL only. It renders a neutral open basemap plus the project's own GeoJSON layers:

- official fish and plant occurrence points
- named lake, river-segment, forest/habitat, and other action-zone polygons derived from hotspot cells
- fallback hotspot cell polygons only where no reliable named landform boundary exists
- community-verified and emerging hotspot markers
- waterbody features
- verified events and Bassanggum challenge boundaries
- restricted/protected areas

Filters are provided for species, category, evidence state, and actionability. Points cluster at low zoom. Exact community coordinates are not publicly rendered.

### Bilingual interface

`/en` is canonical and default. `/ko` is fully supported. Every user-facing string is keyed in both locales; CI fails if a locale key is missing. Data names are not machine-translated at request time. The catalogue stores official Korean/common names and curated English translations.

## Reporting, Verification, and Competition

### Report types

**Sighting report:** a user observed a target species. It can become verified community evidence and influence a candidate/emerging hotspot, but awards no competition points.

**Removal report:** a user asserts that they removed a target species. It may earn points only in an active, compatible area challenge or verified event and only after verification.

### Evidence requirements

| Type | Required evidence | Verified unit |
|---|---|---|
| Fish removal | One whole fish visible in one photo, captured/uploaded with location and time | One approved fish per approved photo |
| Plant removal | Removed plant photo plus a readable scale showing weight, location, and time | Approved kilograms rounded to 0.1 kg |

The app never turns a pile of fish into an inferred count. A manual pin is allowed if device geolocation is denied, but requires review.

### Status machine

`submitted` → `classifying` → `auto_verified`, `needs_review`, or `rejected`.

Auto-verification requires: Gyeongbuk location; active challenge/event boundary and dates for removals; no restricted-zone intersection; target catalogue species; sufficient classifier confidence when a live model is configured; valid evidence; and no duplicate suspicion. The seeded fixture classifier permits deterministic demo auto-verification. Low confidence, missing/exif-conflicting location, unreadable plant scale, or duplicate suspicion routes to `needs_review`. Non-target, invalid evidence, expired/out-of-bound challenge, or restricted location routes to `rejected` with a user-readable reason.

### Classifier boundary

The API owns the `Classifier` interface. It accepts an uploaded image and returns ordered candidate species, confidences, and model metadata. No third-party classifier is currently selected or integrated. The default local fixture classifier is used for the hackathon demo. A future evaluated vision API or custom-trained model can replace the adapter without changing client, scoring, or persistence interfaces. No provider key is sent to the browser.

### Points and ownership

- verified fish removal: 30 points
- verified plant removal: 20 points
- first verified removal at a hotspot: +10 points
- sightings: 0 points

Each challenge has a fixed area, eligible species, start/end dates, and leaderboard period. Its top verified contributor receives a symbolic, time-bound title such as “August Bluegill Guardian of Andong Lake.” This is a leaderboard title only and never implies ownership of land, water, fishery rights, or government reward.

## System Architecture

```text
                  raw source snapshots / optional source APIs
                                   |
                         data-core importers
                                   |
       normalized GeoJSON + PostGIS records + provenance manifests
                    /                               \\
          read-only MCP server                     PWA API
                    |                               |
                 AI agents                 Next.js bilingual PWA
                                                    |
                                      citizen reports and rankings
```

### Repository layout

```text
apps/
  web/                 Next.js PWA
  api/                 Fastify API
packages/
  data-core/           schemas, source adapters, normalizers, hotspot engine
  mcp-server/          standard MCP server
  ui/                  shared bilingual UI components
data/
  raw/                 attributed public-data snapshots
  normalized/          generated data bundles and manifests
docs/
  superpowers/specs/   design specifications
  superpowers/plans/   execution plans
```

### Technologies

- TypeScript throughout
- Next.js PWA with Tailwind CSS
- MapLibre GL for map rendering and GeoJSON layers
- Fastify API
- PostgreSQL with PostGIS
- Drizzle ORM/migrations
- MCP TypeScript SDK with stdio transport
- `next-intl` for locales
- Vitest for unit/API testing and Playwright for PWA browser testing

### MCP server

The MCP server is read-only and contains no anonymous profiles, original community report photos, or exact community-report coordinates. It provides:

- `list_species(category?: "fish" | "plant")`
- `search_occurrences(speciesId?, bbox?, source?: "official" | "community_verified")`
- `get_hotspots(speciesId?, areaName?, minStatus?)`
- `get_area_profile(areaId)`
- `find_removal_events(areaName?, dateFrom?, dateTo?)`
- `get_species_guidance(speciesId)`
- `get_data_provenance(datasetId?)`

It publishes these resources:

- `bassanggum://catalog/species`
- `bassanggum://catalog/datasets`
- `bassanggum://geo/hotspots`
- `bassanggum://events/verified`

Every tool/resource response includes evidence type and provenance metadata. The PWA uses the HTTP API directly; it does not depend on an MCP client in production.

### HTTP API

- `GET /map/layers`
- `GET /areas/:areaId`
- `GET /species/:speciesId`
- `GET /events`
- `POST /reports`
- `GET /reports/:id`
- `GET /leaderboards?areaId=&period=`
- `POST /challenges/:areaId/join`

## Data Storage

Core tables: `species`, `species_media`, `species_guidance`, `data_sources`, `import_runs`, `official_occurrences`, `habitat_areas`, `waterbodies`, `restricted_areas`, `areas`, `hotspot_scores`, `verified_events`, `challenges`, `anonymous_profiles`, `reports`, `report_media`, `verification_results`, and `leaderboard_entries`.

Raw public source files are immutable. Each normalized record retains source record ID and import run ID. Exact report locations and media stay private; the public map uses an approximate coordinate only after verification.

## Resilience and Safety

- When an external source API fails, use the committed snapshot and show its import date.
- When the classifier fails or exceeds eight seconds, save the report as `needs_review`; do not block submission or score it.
- Upload/EXIF errors produce explicit retry instructions.
- Duplicate suspicion uses perceptual image hash, location/time proximity, and anonymous profile token; it routes to review rather than deletion.
- Hotspot recomputation is queued after verification.
- Official event cards link to the organizer's notice and make no payout promise.
- Restricted/protected areas accept sightings but reject removal submissions with a safety message and official link.

## Testing and Acceptance Criteria

### Automated tests

- Unit tests cover public-source normalization, provenance preservation, fish/plant filtering, hotspot scoring and label thresholds, locale key parity, duplicate detection, and points calculations.
- API integration tests cover report status transitions, restricted-area behavior, challenge boundary/date validation, leaderboard updates, and source metadata in MCP output.
- Playwright tests cover English/Korean switching, map filters, report happy path, low-confidence review flow, and area-guardian rendering.
- CI starts the MCP server with the bundled data and calls every tool/resource, validating schemas and provenance fields.

### Demo acceptance

1. A fresh clone starts locally with one documented command and no external API key.
2. The map shows source-attributed official fish/plant records and hotspot explanations for Gyeongbuk.
3. A user can switch between English and Korean without missing UI strings.
4. A seeded removal report becomes verified, updates a challenge leaderboard, and affects the relevant hotspot data.
5. A low-confidence report becomes `needs_review` and gains no score.
6. An MCP client can retrieve a hotspot and its official-source provenance through the documented stdio configuration.

## README Requirements

The README includes prerequisites, local startup, no-key mode, optional real-source sync configuration, data licences/attribution, source-refresh command, MCP-client configuration, test commands, and a 3-minute judge demo script: find a hotspot, identify a species, join a challenge, submit a removal, view verified impact, and query the same area through MCP.

## Explicit Non-Goals for the Hackathon MVP

- Monetary payout processing or guaranteeing any official bounty.
- Real account registration, payments, notifications, or a production moderation dashboard.
- Real-time nationwide data synchronization.
- Custom model training or an unvalidated third-party classifier integration.
- Citizen removal of species outside fish/plants, restricted areas, or active compatible challenges.
