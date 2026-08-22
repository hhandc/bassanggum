import { importDemoSnapshots } from '@bassanggum/data-core';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadPublicBundle } from '../src/bundle-reader.js';
import { createResources } from '../src/resources.js';

const demoDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));
const bundle = importDemoSnapshots(demoDirectory);

describe('MCP resources', () => {
  it('loads and validates the generated public bundle from the workspace data directory', () => {
    const loaded = loadPublicBundle();

    expect(loaded.bundle.species).not.toHaveLength(0);
    expect(loaded.sourceCatalog.sources).not.toHaveLength(0);
  });

  it('publishes all documented read-only public resources with provenance', () => {
    const resources = createResources(bundle);

    expect(Object.keys(resources).sort()).toEqual([
      'bassanggum://catalog/datasets',
      'bassanggum://catalog/species',
      'bassanggum://events/verified',
      'bassanggum://geo/hotspots',
    ]);
    for (const resource of Object.values(resources)) {
      expect(resource).toMatchObject({ evidenceType: expect.any(String), provenance: expect.any(Array) });
    }
  });

  it('publishes source-level attribution in the dataset resource', () => {
    const first = bundle.officialOccurrences[0]!;
    const second = { ...first, id: 'official:fixture:second', sourceRecordId: 'fixture-second' };
    const resources = createResources({ ...bundle, officialOccurrences: [first, second], restrictedAreas: [] });
    const datasets = resources['bassanggum://catalog/datasets']!.datasets as Array<{ sourceRecordId?: string }>;

    expect(datasets).toHaveLength(1);
    expect(datasets[0]?.sourceRecordId).toBeUndefined();
  });

  it('publishes KDPA safety-screening provenance in the dataset resource', () => {
    const resources = createResources(bundle);
    const datasets = resources['bassanggum://catalog/datasets']!.datasets as Array<{ datasetId: string; sourceUrl: string; attribution: string }>;

    expect(datasets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        datasetId: 'KDPA-PROTECTED-AREAS-OECM-KR-2025',
        sourceUrl: 'https://www.kdpa.kr/',
        attribution: expect.stringContaining('KDPA'),
      }),
    ]));
  });
});
