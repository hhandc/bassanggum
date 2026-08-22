import { createProvenance } from '@bassanggum/data-core';
import { describe, expect, it } from 'vitest';

const source = {
  datasetId: 'RSD_0000000000012894',
  title: 'EcoBank ecological information',
  provider: 'National Institute of Ecology',
  sourceUrl: 'https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012894',
  licence: 'No exact licence was verified from the supplied workbook or the available EcoBank record.',
  attribution: 'National Institute of Ecology',
  snapshotFilename: 'test-source.json',
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
      datasetId: 'RSD_0000000000012894',
      sourceRecordId: 'eco-42',
      licence: 'No exact licence was verified from the supplied workbook or the available EcoBank record.',
    });
  });

  it('returns immutable provenance metadata', () => {
    expect(Object.isFrozen(createProvenance(source, run, 'eco-42'))).toBe(true);
  });
});
