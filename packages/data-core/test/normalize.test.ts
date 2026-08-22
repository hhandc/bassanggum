import {
  normalizeHabitatFeature,
  normalizeOccurrenceRow,
  type DatasetSource,
  type ImportRun,
} from '@bassanggum/data-core';
import { describe, expect, it } from 'vitest';

const fishSource: DatasetSource = {
  datasetId: 'test-fish-v1',
  title: 'Test fish occurrence snapshot',
  provider: 'Test provider',
  sourceUrl: 'https://example.com/test-fish',
  licence: 'Test licence',
  attribution: 'Test attribution',
  snapshotFilename: 'test-fish.json',
  checksum: 'sha256:fixture-fish-v1',
};

const importRun: ImportRun = {
  id: 'demo-import-v1',
  importedAt: '2026-08-22T00:00:00.000Z',
  parserVersion: '1.0.0',
};

describe('occurrence normalizers', () => {
  it('adapts an NIE survey year and preserves its source-specific provenance', () => {
    const nieSource = {
      datasetId: 'RSD_0000000000012824',
      title: '외래생물_2015_2022',
      provider: 'National Institute of Ecology (국립생태원)',
      sourceUrl: 'https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012824',
      licence: 'KOGL terms (type unspecified on the EcoBank record)',
      attribution: 'National Institute of Ecology (국립생태원)',
      snapshotFilename: 'nie-alien-fish-gyeongbuk-2015-2022.json',
      checksum: 'sha256:nie-snapshot',
      doi: '10.22756/ASD.20240000000888',
      publishedAt: '2024-09-20',
      sourceFileChecksum: 'sha256:nie-source-file',
    } as DatasetSource;

    const record = normalizeOccurrenceRow(
      {
        sourceRecordId: 'ALSP_000000000007260',
        koreanName: '블루길',
        scientificName: 'Lepomis macrochirus',
        longitude: '128.9340556',
        latitude: '35.72669444',
        surveyYear: '2020',
        시도명: '경상북도',
      },
      nieSource,
      importRun,
    );

    expect(record).toMatchObject({
      id: 'official:RSD_0000000000012824:ALSP_000000000007260',
      observedAt: '2020-01-01T00:00:00.000Z',
      sourceRecordId: 'ALSP_000000000007260',
      datasetId: 'RSD_0000000000012824',
      provider: 'National Institute of Ecology (국립생태원)',
      doi: '10.22756/ASD.20240000000888',
      licence: 'KOGL terms (type unspecified on the EcoBank record)',
      snapshotChecksum: 'sha256:nie-snapshot',
    });
  });

  it('does not normalize an NIE fish that is absent from the curated disturbance catalogue', () => {
    expect(
      normalizeOccurrenceRow(
        {
          sourceRecordId: 'ALSP_000000000000001',
          koreanName: '잉어',
          scientificName: 'Cyprinus carpio',
          longitude: '128.9340556',
          latitude: '35.72669444',
          surveyYear: '2020',
        },
        fishSource,
        importRun,
      ),
    ).toBeNull();
  });

  it('keeps a Gyeongbuk bluegill survey point with provenance', () => {
    const record = normalizeOccurrenceRow(
      {
        sourceRecordId: 'demo-fish-001',
        koreanName: '블루길',
        scientificName: 'Lepomis macrochirus',
        longitude: '128.5993',
        latitude: '36.5715',
        observedAt: '2024-06-15',
      },
      fishSource,
      importRun,
    );

    expect(record).toMatchObject({
      id: 'official:test-fish-v1:demo-fish-001',
      speciesId: 'lepomis-macrochirus',
      evidenceSource: 'official',
      observedAt: '2024-06-15T00:00:00.000Z',
      datasetId: 'test-fish-v1',
      importRunId: 'demo-import-v1',
    });
  });

  it('drops a point outside Gyeongbuk', () => {
    expect(
      normalizeOccurrenceRow(
        {
          sourceRecordId: 'demo-fish-outside',
          koreanName: '블루길',
          scientificName: 'Lepomis macrochirus',
          longitude: 126.978,
          latitude: 37.5665,
          observedAt: '2024-06-15',
        },
        fishSource,
        importRun,
      ),
    ).toBeNull();
  });

  it('rejects an occurrence with invalid WGS84 coordinates', () => {
    expect(
      normalizeOccurrenceRow(
        {
          sourceRecordId: 'demo-fish-invalid-coordinate',
          koreanName: '블루길',
          scientificName: 'Lepomis macrochirus',
          longitude: 181,
          latitude: 36.5715,
        },
        fishSource,
        importRun,
      ),
    ).toBeNull();
  });

  it('rejects an occurrence with an invalid observation date', () => {
    expect(
      normalizeOccurrenceRow(
        {
          sourceRecordId: 'demo-fish-invalid-date',
          koreanName: '블루길',
          scientificName: 'Lepomis macrochirus',
          longitude: 128.5993,
          latitude: 36.5715,
          observedAt: '2024-02-30',
        },
        fishSource,
        importRun,
      ),
    ).toBeNull();
  });

  it('normalizes a Gyeongbuk habitat feature with frequency and provenance', () => {
    const record = normalizeHabitatFeature(
      {
        type: 'Feature',
        properties: {
          sourceRecordId: 'demo-habitat-001',
          koreanName: '블루길',
          scientificName: 'Lepomis macrochirus',
          frequencyBand: 'frequent',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [128.58, 36.55],
              [128.62, 36.55],
              [128.62, 36.59],
              [128.58, 36.59],
              [128.58, 36.55],
            ],
          ],
        },
      },
      fishSource,
      importRun,
    );

    expect(record).toMatchObject({
      id: 'official:test-fish-v1:demo-habitat-001',
      speciesId: 'lepomis-macrochirus',
      frequencyBand: 'frequent',
      sourceRecordId: 'demo-habitat-001',
    });
  });
});
