import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BundleManifestSchema,
  PublicDataBundleSchema,
  PublicSourceCatalogSchema,
  PublicSpeciesCatalogSchema,
  type PublicDataBundle,
} from '@bassanggum/data-core';

export type PublicBundleFiles = {
  bundle: PublicDataBundle;
  sourceCatalog: ReturnType<typeof PublicSourceCatalogSchema.parse>;
  speciesCatalog: ReturnType<typeof PublicSpeciesCatalogSchema.parse>;
};

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBundleDirectory = join(packageDirectory, '../../../data/normalized');

/** Reads only the generated, public bundle and verifies its manifest before MCP starts. */
export function loadPublicBundle(bundleDirectory = defaultBundleDirectory): PublicBundleFiles {
  const manifest = readJson(join(bundleDirectory, 'manifest.json'), BundleManifestSchema);
  for (const filename of manifest.files) {
    const content = readFileSync(join(bundleDirectory, filename));
    const actual = `sha256:${createHash('sha256').update(content).digest('hex')}`;
    if (actual !== manifest.hashes[filename]) {
      throw new Error(`Public bundle checksum mismatch for ${filename}.`);
    }
  }

  return {
    bundle: readJson(join(bundleDirectory, 'public-bundle.json'), PublicDataBundleSchema),
    sourceCatalog: readJson(join(bundleDirectory, 'source-catalog.json'), PublicSourceCatalogSchema),
    speciesCatalog: readJson(join(bundleDirectory, 'species-catalog.json'), PublicSpeciesCatalogSchema),
  };
}

function readJson<T>(filename: string, schema: { parse(value: unknown): T }): T {
  return schema.parse(JSON.parse(readFileSync(filename, 'utf8')) as unknown);
}
