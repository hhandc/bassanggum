# Viewport Map Design

## Goal

Show Bassanggum users a real, pannable base map with official bounty and protected-area overlays, without downloading all of Gyeongbuk's geometry at once.

## Decisions

- Use Leaflet with OpenStreetMap raster tiles as the visual base map. OpenStreetMap provides only roads, terrain, and place labels; all Bassanggum evidence overlays still come from the local API.
- Replace the SVG-only `EvidenceMap` renderer with a Leaflet map component.
- The client requests `/map/layers` with `bbox=west,south,east,north` and an integer `zoom` after map movement settles.
- The API returns only action zones and restricted areas whose geometry bounding boxes intersect that viewport.
- Geometry is simplified for lower zoom levels and retains more positions at close zoom. The source data bundle is never modified.
- Existing category, species, and evidence filters remain valid alongside the new viewport parameters.

## API contract

`GET /map/layers?bbox=127.9,35.7,129.3,37.0&zoom=9`

- `bbox` is optional, four finite longitude/latitude numbers in west, south, east, north order. The API rejects malformed or inverted bounds with `400 { status: 'invalid_request' }`.
- `zoom` is optional, an integer from 0 through 22. The API rejects other values with the same `400` response.
- A returned feature must intersect the requested viewport. Intersections may be determined from a geometry bounding box; exact clipping is not required for this MVP.
- Protected-area rings are reduced to a zoom-dependent maximum position count. At zoom 8 or lower use 12 positions, zoom 9–11 use 24, and zoom 12+ use 80.

## Client behavior

- Initial view fits Gyeongbuk's operational extent.
- Leaflet obtains the initial bounds and calls the API. Later `moveend` events issue a fresh viewport query.
- The currently visible action zones are blue and protected/restricted areas are red. Clicking either retains the existing information sheet behavior.
- A failed viewport request keeps the last successful overlays on screen and shows a non-blocking map status message.
- The My location button calls browser geolocation and pans the map to the user when permission is granted.

## Verification

- API tests prove malformed bounding-box input is rejected, off-screen features are omitted, and close zoom returns at least as much ring detail as wide zoom.
- Web tests prove viewport query URL construction and area click behavior.
- A local visual check proves that OpenStreetMap tiles, blue zones, and red protected areas are visible together, and that panning triggers a new viewport request.
