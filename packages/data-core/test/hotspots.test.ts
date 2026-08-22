import { calculateHotspotCells, type HotspotInput } from '@bassanggum/data-core';
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

describe('calculateHotspotCells', () => {
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

  it('labels three verified signals from two profiles in 30 days as emerging', () => {
    const cells = calculateHotspotCells({
      now: '2026-08-22T00:00:00.000Z',
      officialOccurrences: [],
      habitatAreas: [],
      verifiedEvents: [],
      verifiedCommunitySignals: [
        {
          id: 'signal-a',
          speciesId: 'lepomis-macrochirus',
          evidenceSource: 'community_verified' as const,
          signalType: 'sighting' as const,
          publicGeometry: point,
          verifiedAt: '2026-08-01T00:00:00.000Z',
          profileId: 'profile-a',
        },
        {
          id: 'signal-b',
          speciesId: 'lepomis-macrochirus',
          evidenceSource: 'community_verified' as const,
          signalType: 'sighting' as const,
          publicGeometry: point,
          verifiedAt: '2026-08-10T00:00:00.000Z',
          profileId: 'profile-a',
        },
        {
          id: 'signal-c',
          speciesId: 'lepomis-macrochirus',
          evidenceSource: 'community_verified' as const,
          signalType: 'sighting' as const,
          publicGeometry: point,
          verifiedAt: '2026-08-20T00:00:00.000Z',
          profileId: 'profile-b',
        },
      ],
    });

    expect(cells[0]).toMatchObject({ score: 12, status: 'emerging' });
  });
});
