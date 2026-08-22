import { describe, expect, it } from 'vitest';

import { postgisTables } from '../src/db/schema.js';

describe('PostGIS schema', () => {
  it('defines every persisted public and community record table', () => {
    expect(Object.keys(postgisTables).sort()).toEqual([
      'anonymousProfiles',
      'areas',
      'challenges',
      'dataSources',
      'habitatAreas',
      'hotspotScores',
      'leaderboardEntries',
      'officialOccurrences',
      'reportMedia',
      'reports',
      'restrictedAreas',
      'species',
      'verificationResults',
      'verifiedEvents',
      'waterbodies',
    ]);
  });
});
