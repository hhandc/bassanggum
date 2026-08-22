# Raw ecological-source snapshots

`data/raw/demo/` is a deliberately tiny, repository-authored demonstration input: one fish occurrence, one plant occurrence, and one habitat polygon. It is **not** an EcoBank export, does not reproduce official source rows, and must never be described as unmodified official raw data. The field shapes and the provider reference are intended only to exercise the normalizer without credentials.

## Attribution and licence

Each demo file carries its own provenance manifest. The fixture content is authored for this repository under **CC0-1.0**. Its reference source is [National Institute of Ecology EcoBank](https://www.nie-ecobank.kr/); attribution in derived demo records is `Bassanggum synthetic EcoBank-like fixture; EcoBank referenced (National Institute of Ecology)`. The reference link identifies the inspiration for the field vocabulary only; no EcoBank licence is asserted for these synthetic rows.

For production imports, preserve the exact source dataset ID, source URL, provider-required attribution, and licence statement from the downloaded data. Do not replace them with this demo's metadata. Check the production provider's current licence and redistribution terms before committing any snapshot.

## Integrity and conversion

The `source.checksum` value in each demo manifest is the SHA-256 digest of its `records` or `features` JSON payload (not the enclosing manifest, which contains the checksum). The importer serializes the parsed payload with JavaScript `JSON.stringify(payload)` in its source-array/property order before hashing; it rejects a snapshot if this exact digest does not match. Recalculate it after changing a fixture. Production snapshots instead use the SHA-256 digest of the downloaded source file.

The importer accepts only a curated fish/plant mapping (the demo's bluegill and bur cucumber) and derives category from that mapping, never from a snapshot filename. An unknown species, including an accidentally appended bird or mammal row, is excluded from the public bundle.

When a production source is delivered as SHP/DBF, convert it before importing; the demo importer deliberately consumes only pre-converted GeoJSON and does not require GIS software:

```sh
ogr2ogr -f GeoJSON habitat.geojson habitat.shp
```

Keep the original SHP/DBF files and any transformation notes outside the public bundle when their licence or size makes committing them inappropriate.
