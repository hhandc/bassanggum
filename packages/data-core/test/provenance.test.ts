import { createProvenance } from '@bassanggum/data-core';
import { describe, expect, it } from 'vitest';

const source = {
  datasetId: '15022461',
  title: 'EcoBank ecological information',
  provider: 'National Institute of Ecology',
  sourceUrl: 'https://www.data.go.kr/data/15022461',
  licence: 'KOGL Type 1',
  attribution: 'National Institute of Ecology',
  snapshotFilename: 'ecobank-fish.json',
  checksum: 'sha256:example',
};

const run = {
  id: 'import-2026-08-22',
  importedAt: '2026-08-22T00:00:00.000Z',
  parserVersion: '1.0.0',
};

describe('provenance', () => {
  it('retains dataset attribution in normalized provenance', () => {
    expect(createProvenance(source, run, 'eco-42')).toMatchObject({
      datasetId: '15022461',
      sourceRecordId: 'eco-42',
      licence: 'KOGL Type 1',
    });
  });

  it('returns immutable provenance metadata', () => {
    expect(Object.isFrozen(createProvenance(source, run, 'eco-42'))).toBe(true);
  });
});
