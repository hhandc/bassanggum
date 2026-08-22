import {
  normalizeHabitatFeature,
  normalizeOccurrenceRow,
  type DatasetSource,
  type ImportRun,
} from '@bassanggum/data-core';
import { describe, expect, it } from 'vitest';

const fishSource: DatasetSource = {
  datasetId: 'ecobank-demo-fish-v1',
  title: 'EcoBank-like fish occurrence demo snapshot',
  provider: 'National Institute of Ecology EcoBank (reference only)',
  sourceUrl: 'https://www.nie-ecobank.kr/',
  licence: 'CC0-1.0 (repository-authored synthetic fixture)',
  attribution: 'Bassanggum synthetic EcoBank-like fixture; EcoBank referenced (National Institute of Ecology)',
  snapshotFilename: 'ecobank-fish.json',
  checksum: 'sha256:fixture-fish-v1',
};

const importRun: ImportRun = {
  id: 'demo-import-v1',
  importedAt: '2026-08-22T00:00:00.000Z',
  parserVersion: '1.0.0',
};

describe('EcoBank-like normalizers', () => {
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
      id: 'official:ecobank-demo-fish-v1:demo-fish-001',
      speciesId: 'lepomis-macrochirus',
      evidenceSource: 'official',
      observedAt: '2024-06-15T00:00:00.000Z',
      datasetId: 'ecobank-demo-fish-v1',
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
      id: 'official:ecobank-demo-fish-v1:demo-habitat-001',
      speciesId: 'lepomis-macrochirus',
      frequencyBand: 'frequent',
      sourceRecordId: 'demo-habitat-001',
    });
  });
});
