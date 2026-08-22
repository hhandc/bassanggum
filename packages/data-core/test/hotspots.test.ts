import {
  calculateHotspotCells,
  scoringOccurrences,
  type HotspotCommunitySignal,
  type HotspotInput,
  VerifiedCommunitySignalSchema,
} from '@bassanggum/data-core';
import { cellToLatLng, getResolution, gridDisk, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';

const point = {
  type: 'Point' as const,
  coordinates: [128.5993, 36.5715] as [number, number],
};

const sourceMetadata = {
  datasetId: 'ecobank-demo-fish-v1',
  provider: 'National Institute of Ecology EcoBank',
  sourceUrl: 'https://www.nie-ecobank.kr/',
  licence: 'CC0-1.0',
  attribution: 'Synthetic fixture',
  importRunId: 'demo-import-v1',
  sourceRecordId: 'source-record',
};

const knownInput: HotspotInput = {
  now: '2026-08-22T00:00:00.000Z',
  officialOccurrences: [
    {
      id: 'official-recent',
      speciesId: 'lepomis-macrochirus',
      evidenceSource: 'official' as const,
      geometry: point,
      observedAt: '2026-07-01T00:00:00.000Z',
      ...sourceMetadata,
    },
  ],
  habitatAreas: [
    {
      id: 'habitat-frequent',
      speciesId: 'lepomis-macrochirus',
      evidenceSource: 'official' as const,
      frequencyBand: 'frequent',
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [128.59, 36.56],
            [128.61, 36.56],
            [128.61, 36.58],
            [128.59, 36.58],
            [128.59, 36.56],
          ],
        ],
      },
      ...sourceMetadata,
    },
  ],
  verifiedCommunitySignals: [],
  verifiedEvents: [],
};

function communitySignal(
  id: string,
  overrides: Partial<HotspotCommunitySignal> = {},
): HotspotCommunitySignal {
  return {
    id,
    speciesId: 'lepomis-macrochirus',
    evidenceSource: 'community_verified',
    signalType: 'sighting',
    publicGeometry: point,
    verifiedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function communityInput(verifiedCommunitySignals: HotspotCommunitySignal[], now = '2026-08-22T00:00:00.000Z'): HotspotInput {
  return {
    now,
    officialOccurrences: [],
    habitatAreas: [],
    verifiedEvents: [],
    verifiedCommunitySignals,
  };
}

function scoreForSingleOfficial(observedAt: string | undefined): number | undefined {
  return calculateHotspotCells({
    ...communityInput([]),
    officialOccurrences: [
      {
        id: `official-${observedAt ?? 'undated'}`,
        speciesId: 'sicyos-angulatus',
        evidenceSource: 'official',
        geometry: point,
        ...(observedAt === undefined ? {} : { observedAt }),
        ...sourceMetadata,
      },
    ],
  })[0]?.score;
}

function precisionOccurrence(
  id: string,
  datasetId: string,
  observedAt: string,
  observedAtPrecision: 'year' | 'date',
): HotspotInput['officialOccurrences'][number] & { observedAtPrecision: 'year' | 'date' } {
  return {
    id,
    speciesId: 'sicyos-angulatus',
    evidenceSource: 'official',
    geometry: point,
    observedAt,
    observedAtPrecision,
    ...sourceMetadata,
    datasetId,
  };
}

describe('calculateHotspotCells', () => {
  it('pairs annual and dated cross-source evidence by year without collapsing repeat observations', () => {
    const annual = precisionOccurrence('official:annual:one', 'annual-source', '2020-01-01T00:00:00.000Z', 'year');
    const datedOne = precisionOccurrence('official:dated:one', 'dated-source', '2020-04-15T00:00:00.000Z', 'date');
    const datedTwo = precisionOccurrence('official:dated:two', 'dated-source', '2020-09-15T00:00:00.000Z', 'date');
    const differentYear = precisionOccurrence('official:dated:other-year', 'dated-source', '2021-04-15T00:00:00.000Z', 'date');
    const sameSourceRepeat = precisionOccurrence('official:annual:two', 'annual-source', '2020-01-01T00:00:00.000Z', 'year');

    expect(scoringOccurrences([annual, datedOne])).toHaveLength(1);
    expect(scoringOccurrences([annual, differentYear])).toHaveLength(2);
    expect(scoringOccurrences([annual, datedOne, datedTwo])).toHaveLength(2);
    expect(scoringOccurrences([annual, sameSourceRepeat])).toHaveLength(2);
  });

  it('counts matching cross-source official evidence once while retaining same-source repeats', () => {
    const duplicatePoint = {
      type: 'Point' as const,
      coordinates: [128.349275, 36.227925] as [number, number],
    };
    const input = (officialOccurrences: HotspotInput['officialOccurrences']) =>
      calculateHotspotCells({ ...communityInput([]), officialOccurrences })[0];
    const matchingDate = '2020-01-01T00:00:00.000Z';

    const onePerSource = input([
      {
        id: 'official:RSD_0000000000012894:O20200113000746',
        speciesId: 'sicyos-angulatus',
        evidenceSource: 'official',
        geometry: duplicatePoint,
        observedAt: matchingDate,
        ...sourceMetadata,
        datasetId: 'RSD_0000000000012894',
      },
      {
        id: 'official:RSD_0000000000012824:cross-source-duplicate',
        speciesId: 'sicyos-angulatus',
        evidenceSource: 'official',
        geometry: duplicatePoint,
        observedAt: matchingDate,
        ...sourceMetadata,
        datasetId: 'RSD_0000000000012824',
      },
      {
        id: 'official:RSD_0000000000012705:plant-duplicate',
        speciesId: 'sicyos-angulatus',
        evidenceSource: 'official',
        geometry: duplicatePoint,
        observedAt: matchingDate,
        ...sourceMetadata,
        datasetId: 'RSD_0000000000012705',
      },
    ]);
    const sameSourceRepeats = input([
      {
        id: 'official:RSD_0000000000012894:first',
        speciesId: 'sicyos-angulatus',
        evidenceSource: 'official',
        geometry: duplicatePoint,
        observedAt: matchingDate,
        ...sourceMetadata,
        datasetId: 'RSD_0000000000012894',
      },
      {
        id: 'official:RSD_0000000000012894:second',
        speciesId: 'sicyos-angulatus',
        evidenceSource: 'official',
        geometry: duplicatePoint,
        observedAt: matchingDate,
        ...sourceMetadata,
        datasetId: 'RSD_0000000000012894',
      },
    ]);

    expect(onePerSource).toMatchObject({ score: 3, status: 'none' });
    expect(onePerSource?.evidenceBreakdown.officialOccurrences).toHaveLength(1);
    expect(sameSourceRepeats?.evidenceBreakdown.officialOccurrences).toHaveLength(2);
  });

  it('pairs cross-source evidence whose coordinates differ only below six decimal places', () => {
    const coordinate = [128.349275041, 36.227924959] as [number, number];
    const duplicate = [128.349275001, 36.227924999] as [number, number];
    const nearby = [128.3492761, 36.2279249] as [number, number];
    const occurrence = (id: string, datasetId: string, coordinates: [number, number]) => ({
      id,
      speciesId: 'lepomis-macrochirus',
      evidenceSource: 'official' as const,
      geometry: { type: 'Point' as const, coordinates },
      observedAt: '2020-01-01T00:00:00.000Z',
      ...sourceMetadata,
      datasetId,
    });

    const paired = calculateHotspotCells({
      ...communityInput([]),
      officialOccurrences: [
        occurrence('official:RSD_0000000000012894:precision-a', 'RSD_0000000000012894', coordinate),
        occurrence('official:RSD_0000000000012824:precision-b', 'RSD_0000000000012824', duplicate),
      ],
    })[0];
    const distinct = calculateHotspotCells({
      ...communityInput([]),
      officialOccurrences: [
        occurrence('official:RSD_0000000000012894:nearby-a', 'RSD_0000000000012894', coordinate),
        occurrence('official:RSD_0000000000012824:nearby-b', 'RSD_0000000000012824', nearby),
      ],
    })[0];

    expect(paired?.evidenceBreakdown.officialOccurrences).toHaveLength(1);
    expect(distinct?.evidenceBreakdown.officialOccurrences).toHaveLength(2);
  });

  it('labels a cell with official evidence and score 25 as known', () => {
    const cell = calculateHotspotCells(knownInput)[0];

    expect(cell).toMatchObject({ score: 25, status: 'known' });
    expect(cell?.evidenceBreakdown.contributingIds).toEqual(['habitat-frequent', 'official-recent']);
    expect(cell?.evidenceBreakdown.points).toEqual([point]);
  });

  it('does not add event data to the biological score', () => {
    const withoutEvent = calculateHotspotCells(knownInput)[0]?.score;
    const withEvent = calculateHotspotCells({
      ...knownInput,
      verifiedEvents: [
        {
          id: 'official-event',
          organizer: 'Gyeongbuk',
          title: 'Bluegill removal day',
          eventUrl: 'https://example.com/events/bluegill',
          geometry: knownInput.habitatAreas[0]!.geometry,
          startsAt: '2026-08-25T00:00:00.000Z',
          endsAt: '2026-08-25T08:00:00.000Z',
          eligibleSpeciesIds: ['lepomis-macrochirus'],
          rewardWording: 'See organizer notice.',
          eligibilityNotes: 'Official event only.',
          validatedAt: '2026-08-20T00:00:00.000Z',
          ...sourceMetadata,
        },
      ],
    })[0]?.score;

    expect(withEvent).toBe(withoutEvent);
  });

  it('labels three recent verified sightings with upstream diversity proof as emerging', () => {
    const cells = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', { verifiedAt: '2026-08-01T00:00:00.000Z', emergingDeviceDiversityVerified: true }),
        communitySignal('signal-b', { verifiedAt: '2026-08-10T00:00:00.000Z', emergingDeviceDiversityVerified: true }),
        communitySignal('signal-c', { emergingDeviceDiversityVerified: true }),
      ]),
    );

    expect(cells[0]).toMatchObject({ score: 12, status: 'emerging' });
  });

  it('keeps three recent sightings a watch area without upstream diversity proof', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a'),
        communitySignal('signal-b'),
        communitySignal('signal-c'),
      ]),
    )[0];

    expect(cell).toMatchObject({ score: 12, status: 'watch' });
  });

  it('does not synthesize device diversity proof from distinct public signal IDs', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a'),
        communitySignal('signal-b'),
        communitySignal('signal-c'),
      ]),
    )[0];

    expect(cell).toMatchObject({ score: 12, status: 'watch' });
  });

  it('includes a sighting verified exactly 30 days ago in emerging qualification', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', { verifiedAt: '2026-07-23T00:00:00.000Z', emergingDeviceDiversityVerified: true }),
        communitySignal('signal-b', { emergingDeviceDiversityVerified: true }),
        communitySignal('signal-c', { emergingDeviceDiversityVerified: true }),
      ]),
    )[0];

    expect(cell?.status).toBe('emerging');
  });

  it('excludes expired and future sightings from emerging qualification', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', { verifiedAt: '2026-07-22T23:59:59.999Z', emergingDeviceDiversityVerified: true }),
        communitySignal('signal-b', { verifiedAt: '2026-08-22T00:00:00.001Z', emergingDeviceDiversityVerified: true }),
        communitySignal('signal-c', { emergingDeviceDiversityVerified: true }),
      ]),
    )[0];

    expect(cell).toMatchObject({ score: 12, status: 'watch' });
  });

  it('weights a verified removal at 6 and a verified sighting at 4', () => {
    const sighting = calculateHotspotCells(communityInput([communitySignal('sighting')]))[0];
    const removal = calculateHotspotCells(
      communityInput([communitySignal('removal', { signalType: 'removal' })]),
    )[0];

    expect(sighting?.score).toBe(4);
    expect(removal?.score).toBe(6);
  });

  it('does not let removal signals qualify an emerging hotspot', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('removal-a', { signalType: 'removal', emergingDeviceDiversityVerified: true }),
        communitySignal('removal-b', { signalType: 'removal', emergingDeviceDiversityVerified: true }),
        communitySignal('removal-c', { signalType: 'removal', emergingDeviceDiversityVerified: true }),
      ]),
    )[0];

    expect(cell).toMatchObject({ score: 18, status: 'watch' });
  });

  it('uses the agreed official evidence recency thresholds', () => {
    expect(scoreForSingleOfficial('2025-08-22T00:00:00.000Z')).toBe(10);
    expect(scoreForSingleOfficial('2025-08-21T23:59:59.999Z')).toBe(6);
    expect(scoreForSingleOfficial('2023-08-22T00:00:00.000Z')).toBe(6);
    expect(scoreForSingleOfficial('2023-08-21T23:59:59.999Z')).toBe(3);
    expect(scoreForSingleOfficial(undefined)).toBe(3);
  });

  it('uses resolution-8 H3 cells', () => {
    const cell = calculateHotspotCells(communityInput([communitySignal('signal-a')]))[0];

    expect(getResolution(cell?.h3Index ?? '')).toBe(8);
  });

  it('adds a two-point bonus next to a strongly present same-species cell', () => {
    const strongCell = latLngToCell(point.coordinates[1], point.coordinates[0], 8);
    const neighbor = gridDisk(strongCell, 1).find((candidate) => candidate !== strongCell);
    const [neighborLatitude, neighborLongitude] = cellToLatLng(neighbor ?? '');
    const neighborPoint = {
      type: 'Point' as const,
      coordinates: [neighborLongitude, neighborLatitude] as [number, number],
    };
    const weakCell = latLngToCell(neighborLatitude, neighborLongitude, 8);

    const cells = calculateHotspotCells({
      ...communityInput([
        communitySignal('neighbor-signal', { publicGeometry: neighborPoint }),
      ]),
      officialOccurrences: ['a', 'b', 'c'].map((id) => ({
        id: `official-${id}`,
        speciesId: 'lepomis-macrochirus',
        evidenceSource: 'official' as const,
        geometry: point,
        observedAt: '2026-08-20T00:00:00.000Z',
        ...sourceMetadata,
      })),
    });

    expect(cells.find((cell) => cell.h3Index === weakCell)).toMatchObject({ score: 6, status: 'none' });
  });

  it('accepts only the non-identifying diversity attestation in public community signals', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', { emergingDeviceDiversityVerified: true }),
      ]),
    )[0];

    expect(cell).not.toHaveProperty('deviceTokenHash');
    expect(cell?.evidenceBreakdown.verifiedCommunitySignals[0]).not.toHaveProperty('deviceTokenHash');
    expect(
      VerifiedCommunitySignalSchema.safeParse({
        id: 'signal-a',
        speciesId: 'lepomis-macrochirus',
        evidenceSource: 'community_verified',
        signalType: 'sighting',
        publicGeometry: point,
        verifiedAt: '2026-08-20T00:00:00.000Z',
        emergingDeviceDiversityVerified: true,
      }).success,
    ).toBe(true);
    expect(
      VerifiedCommunitySignalSchema.safeParse({
        id: 'signal-a',
        speciesId: 'lepomis-macrochirus',
        evidenceSource: 'community_verified',
        signalType: 'sighting',
        publicGeometry: point,
        verifiedAt: '2026-08-20T00:00:00.000Z',
        deviceTokenHash: 'device-token-hash-not-public',
      }).success,
    ).toBe(false);
  });
});
