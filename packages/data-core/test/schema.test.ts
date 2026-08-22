import {
  OfficialOccurrenceSchema,
  PolygonSchema,
  PublicDataBundleSchema,
  SpeciesSchema,
} from '@bassanggum/data-core';
import { describe, expect, it } from 'vitest';

const point = {
  type: 'Point' as const,
  coordinates: [128.6, 36.5] as [number, number],
};

const officialProvenance = {
  datasetId: 'RSD_0000000000012894',
  provider: 'National Institute of Ecology',
  sourceUrl: 'https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012894',
  licence: 'No exact licence was verified from the supplied workbook or the available EcoBank record.',
  attribution: 'National Institute of Ecology',
  importRunId: 'import-2026-08-22',
  sourceRecordId: 'eco-42',
};

describe('normalized public-data schemas', () => {
  it('accepts a source-attributed official occurrence', () => {
    expect(
      OfficialOccurrenceSchema.parse({
        id: 'official:RSD_0000000000012894:eco-42',
        speciesId: 'bass',
        evidenceSource: 'official',
        geometry: point,
        ...officialProvenance,
      }),
    ).toMatchObject({
      datasetId: 'RSD_0000000000012894',
      sourceRecordId: 'eco-42',
    });
  });

  it('rejects an official occurrence without a source record ID', () => {
    expect(() =>
      OfficialOccurrenceSchema.parse({
        id: 'official:RSD_0000000000012894:eco-42',
        speciesId: 'bass',
        evidenceSource: 'official',
        geometry: point,
        ...officialProvenance,
        sourceRecordId: undefined,
      }),
    ).toThrow();
  });

  it('limits species to fish and plant categories', () => {
    expect(() => SpeciesSchema.parse({ id: 'rat', category: 'mammal' })).toThrow();
  });

  it('requires an explicit action policy for every species', () => {
    expect(() => SpeciesSchema.parse({ id: 'lepomis-macrochirus', category: 'fish' })).toThrow(/actionPolicy/i);
  });

  it('rejects a polygon with an unclosed linear ring', () => {
    expect(() =>
      PolygonSchema.parse({
        type: 'Polygon',
        coordinates: [
          [
            [128.5, 36.4],
            [128.6, 36.4],
            [128.6, 36.5],
            [128.5, 36.5],
          ],
        ],
      }),
    ).toThrow();
  });

  it('excludes media and private coordinates from public data bundles', () => {
    expect(() =>
      PublicDataBundleSchema.parse({
        species: [],
        officialOccurrences: [],
        habitatAreas: [],
        waterbodies: [],
        restrictedAreas: [],
        verifiedCommunitySignals: [
          {
            id: 'community:42',
            speciesId: 'bass',
            evidenceSource: 'community_verified',
            publicGeometry: point,
            privateGeometry: point,
            mediaHashes: ['sha256:example'],
          },
        ],
        verifiedEvents: [],
        actionZones: [],
      }),
    ).toThrow();
  });

  it('accepts a bundle containing only public signal fields', () => {
    expect(
      PublicDataBundleSchema.parse({
        species: [],
        officialOccurrences: [],
        habitatAreas: [],
        waterbodies: [],
        restrictedAreas: [],
        verifiedCommunitySignals: [],
        verifiedEvents: [],
        actionZones: [],
      }),
    ).toMatchObject({ verifiedCommunitySignals: [] });
  });
});
