import {
  importDemoSnapshots,
  writePublicBundle,
  type PublicDataBundle,
} from '@bassanggum/data-core';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const demoDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));

function tempDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'bassanggum-public-bundle-'));
}

function sha256(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function withTemporaryDirectory(test: (directory: string) => Promise<void>): Promise<void> {
  const directory = tempDirectory();
  return test(directory).finally(() => rmSync(directory, { recursive: true, force: true }));
}

describe('public bundle writer', () => {
  it('writes deterministic source-attributed public files for the complete no-key source scope', async () => {
    await withTemporaryDirectory(async (firstDirectory) => {
      await withTemporaryDirectory(async (secondDirectory) => {
        const importedBundle = importDemoSnapshots(demoDirectory);
        const bundle = {
          ...importedBundle,
          species: importedBundle.species.map((species, index) => index === 0
            ? { ...species, visualTraits: [...(species.visualTraits ?? []), 'Ordinary field text can reference profile maps and media literacy.'] }
            : species),
        };
        const first = await writePublicBundle(bundle, firstDirectory);
        const second = await writePublicBundle(bundle, secondDirectory);

        expect(first).toEqual(second);
        expect(first.files).toEqual(expect.arrayContaining([
          'public-bundle.json',
          'source-catalog.json',
          'species-catalog.json',
          'official-occurrences.geojson',
          'hotspots.geojson',
          'action-zones.geojson',
        ]));
        for (const file of first.files.filter((file) => file !== 'manifest.json')) {
          expect(sha256(join(firstDirectory, file))).toBe(first.hashes[file]);
          expect(readFileSync(join(firstDirectory, file), 'utf8')).toBe(readFileSync(join(secondDirectory, file), 'utf8'));
        }

        const sources = JSON.parse(readFileSync(join(firstDirectory, 'source-catalog.json'), 'utf8')) as { sources: unknown[] };
        const publicBundle = JSON.parse(readFileSync(join(firstDirectory, 'public-bundle.json'), 'utf8')) as PublicDataBundle;
        expect(sources.sources).toEqual(expect.arrayContaining([
          expect.objectContaining({ datasetId: '15022461', sourceUrl: expect.any(String), attribution: expect.any(String) }),
          expect.objectContaining({ datasetId: 'RSD_0000000000012824', sourceUrl: expect.any(String), attribution: expect.any(String) }),
        ]));
        expect(publicBundle.species).toHaveLength(15);
        expect(new Set(publicBundle.species.map((species) => species.id)).size).toBe(15);
        expect(readFileSync(join(firstDirectory, 'public-bundle.json'), 'utf8')).not.toContain('identificationMedia');
        expect(readFileSync(join(firstDirectory, 'public-bundle.json'), 'utf8')).toContain('Ordinary field text can reference profile maps and media literacy.');
        expect(publicBundle.habitatAreas).toEqual([]);
        expect(publicBundle.waterbodies).toEqual([]);
        expect(publicBundle.restrictedAreas).toEqual([]);
        expect(publicBundle.actionZones.every((zone) => zone.kind === 'unnamed_cell_cluster' && !('name' in zone))).toBe(true);
        expect(JSON.parse(readFileSync(join(firstDirectory, 'restricted-areas.geojson'), 'utf8'))).toMatchObject({ features: [] });
      });
    });
  }, 15_000);

  it('refuses private fields and raw serialized private content without leaving a partial bundle', async () => {
    await withTemporaryDirectory(async (directory) => {
      const safeBundle = importDemoSnapshots(demoDirectory);
      const unsafeBundle = {
        ...safeBundle,
        verifiedCommunitySignals: [{
          id: 'community:private',
          speciesId: 'micropterus-salmoides',
          evidenceSource: 'community_verified',
          signalType: 'sighting',
          publicGeometry: { type: 'Point', coordinates: [128.5, 36.5] },
          verifiedAt: '2026-08-22T00:00:00.000Z',
          nested: { deviceTokenHash: 'private-device-token' },
        }],
      } as unknown as PublicDataBundle;
      const serializedUnsafeBundle = {
        ...safeBundle,
        species: [{ ...safeBundle.species[0]!, visualTraits: ['{"exactLocation":"128.599312345,36.571598765"}'] }],
      } as PublicDataBundle;
      const mediaUnsafeBundle = {
        ...safeBundle,
        species: [{ ...safeBundle.species[0]!, visualTraits: ['https://example.com/private-image.jpg'] }],
      } as PublicDataBundle;
      const separatorUnsafeBundle = {
        ...safeBundle,
        species: [{
          ...safeBundle.species[0]!,
          visualTraits: [
            '{"exact_location":"128.599312345,36.571598765","device_token_hash":"private-device-token"}',
            '{\\"private-geometry\\":\\"exact-coordinate-point\\"}',
          ],
        }],
      } as PublicDataBundle;

      await expect(writePublicBundle(unsafeBundle, directory)).rejects.toThrow(/private|unsafe/i);
      await expect(writePublicBundle(serializedUnsafeBundle, directory)).rejects.toThrow(/private|unsafe/i);
      await expect(writePublicBundle(mediaUnsafeBundle, directory)).rejects.toThrow(/private|unsafe/i);
      await expect(writePublicBundle(separatorUnsafeBundle, directory)).rejects.toThrow(/private|unsafe/i);
      expect(() => readFileSync(join(directory, 'manifest.json'))).toThrow();
    });
  });

  it('emits point-free hotspot and action-zone GeoJSON while retaining source cell traceability', async () => {
    await withTemporaryDirectory(async (directory) => {
      await writePublicBundle(importDemoSnapshots(demoDirectory), directory);
      const hotspotText = readFileSync(join(directory, 'hotspots.geojson'), 'utf8');
      const zoneText = readFileSync(join(directory, 'action-zones.geojson'), 'utf8');
      const zones = JSON.parse(zoneText) as { features: Array<{ properties: Record<string, unknown> }> };

      expect(hotspotText).not.toContain('"points"');
      expect(zoneText).not.toContain('"points"');
      expect(JSON.stringify(zones.features.map((feature) => feature.properties))).not.toContain('"geometry"');
      expect(zones.features[0]?.properties).toEqual(expect.objectContaining({ sourceCellIds: expect.any(Array), evidence: expect.any(Object) }));
    });
  });
});
