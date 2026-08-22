import {
  calculateHotspotCells,
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
  deviceTokenHash: string,
  overrides: Partial<HotspotCommunitySignal> = {},
): HotspotCommunitySignal {
  return {
    id,
    speciesId: 'lepomis-macrochirus',
    evidenceSource: 'community_verified',
    signalType: 'sighting',
    publicGeometry: point,
    verifiedAt: '2026-08-20T00:00:00.000Z',
    deviceTokenHash,
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
        speciesId: 'lepomis-macrochirus',
        evidenceSource: 'official',
        geometry: point,
        ...(observedAt === undefined ? {} : { observedAt }),
        ...sourceMetadata,
      },
    ],
  })[0]?.score;
}

describe('calculateHotspotCells', () => {
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
        id: 'official:15022461:O20200113000746',
        speciesId: 'lepomis-macrochirus',
        evidenceSource: 'official',
        geometry: duplicatePoint,
        observedAt: matchingDate,
        ...sourceMetadata,
        datasetId: '15022461',
      },
      {
        id: 'official:RSD_0000000000012824:ALSP_000000000007280',
        speciesId: 'lepomis-macrochirus',
        evidenceSource: 'official',
        geometry: duplicatePoint,
        observedAt: matchingDate,
        ...sourceMetadata,
        datasetId: 'RSD_0000000000012824',
      },
    ]);
    const sameSourceRepeats = input([
      {
        id: 'official:15022461:first',
        speciesId: 'lepomis-macrochirus',
        evidenceSource: 'official',
        geometry: duplicatePoint,
        observedAt: matchingDate,
        ...sourceMetadata,
        datasetId: '15022461',
      },
      {
        id: 'official:15022461:second',
        speciesId: 'lepomis-macrochirus',
        evidenceSource: 'official',
        geometry: duplicatePoint,
        observedAt: matchingDate,
        ...sourceMetadata,
        datasetId: '15022461',
      },
    ]);

    expect(onePerSource).toMatchObject({ score: 3, status: 'none' });
    expect(onePerSource?.evidenceBreakdown.officialOccurrences).toHaveLength(1);
    expect(sameSourceRepeats?.evidenceBreakdown.officialOccurrences).toHaveLength(2);
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

  it('labels three verified sightings from two device hashes in 30 days as emerging', () => {
    const cells = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', 'device-a', { verifiedAt: '2026-08-01T00:00:00.000Z' }),
        communitySignal('signal-b', 'device-a', { verifiedAt: '2026-08-10T00:00:00.000Z' }),
        communitySignal('signal-c', 'device-b'),
      ]),
    );

    expect(cells[0]).toMatchObject({ score: 12, status: 'emerging' });
  });

  it('does not classify three sightings from one device hash as emerging', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', 'device-a'),
        communitySignal('signal-b', 'device-a'),
        communitySignal('signal-c', 'device-a'),
      ]),
    )[0];

    expect(cell).toMatchObject({ score: 12, status: 'watch' });
  });

  it('does not count blank device hashes toward emerging qualification', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', 'device-a'),
        communitySignal('signal-b', ''),
        communitySignal('signal-c', '   '),
      ]),
    )[0];

    expect(cell).toMatchObject({ score: 12, status: 'watch' });
  });

  it('includes a sighting verified exactly 30 days ago in emerging qualification', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', 'device-a', { verifiedAt: '2026-07-23T00:00:00.000Z' }),
        communitySignal('signal-b', 'device-a'),
        communitySignal('signal-c', 'device-b'),
      ]),
    )[0];

    expect(cell?.status).toBe('emerging');
  });

  it('excludes expired and future sightings from emerging qualification', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', 'device-a', { verifiedAt: '2026-07-22T23:59:59.999Z' }),
        communitySignal('signal-b', 'device-b', { verifiedAt: '2026-08-22T00:00:00.001Z' }),
        communitySignal('signal-c', 'device-c'),
      ]),
    )[0];

    expect(cell).toMatchObject({ score: 12, status: 'watch' });
  });

  it('weights a verified removal at 6 and a verified sighting at 4', () => {
    const sighting = calculateHotspotCells(communityInput([communitySignal('sighting', 'device-a')]))[0];
    const removal = calculateHotspotCells(
      communityInput([communitySignal('removal', 'device-a', { signalType: 'removal' })]),
    )[0];

    expect(sighting?.score).toBe(4);
    expect(removal?.score).toBe(6);
  });

  it('does not let removal signals qualify an emerging hotspot', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('removal-a', 'device-a', { signalType: 'removal' }),
        communitySignal('removal-b', 'device-a', { signalType: 'removal' }),
        communitySignal('removal-c', 'device-b', { signalType: 'removal' }),
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
    const cell = calculateHotspotCells(communityInput([communitySignal('signal-a', 'device-a')]))[0];

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
        communitySignal('neighbor-signal', 'device-b', { publicGeometry: neighborPoint }),
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

  it('omits internal device hashes from hotspot public output and public signal schema', () => {
    const cell = calculateHotspotCells(
      communityInput([
        communitySignal('signal-a', 'device-token-hash-not-public'),
      ]),
    )[0];

    expect(JSON.stringify(cell)).not.toContain('device-token-hash-not-public');
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
        deviceTokenHash: 'device-token-hash-not-public',
      }).success,
    ).toBe(false);
  });
});
