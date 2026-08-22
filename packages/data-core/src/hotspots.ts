import {
  cellToBoundary,
  gridDisk,
  latLngToCell,
  POLYGON_TO_CELLS_FLAGS,
  polygonToCellsExperimental,
} from 'h3-js';

import type { HabitatArea, OfficialOccurrence, VerifiedCommunitySignal, VerifiedEvent } from './schema.js';

export const HOTSPOT_WEIGHTS = {
  h3Resolution: 8,
  officialOccurrence: {
    withinTwelveMonths: 10,
    withinThreeYears: 6,
    older: 3,
  },
  habitatFrequency: {
    rare: 5,
    occasional: 10,
    frequent: 15,
  },
  verifiedCommunitySignal: {
    sighting: 4,
    removal: 6,
  },
  adjacentStrongPresence: 2,
  strongPresenceScore: 25,
  knownMinimumScore: 25,
  watchMinimumScore: 10,
  emerging: {
    minimumSignals: 3,
    minimumProfiles: 2,
    windowDays: 30,
  },
} as const;

export type HotspotStatus = 'known' | 'watch' | 'emerging' | 'none';

export type HotspotCommunitySignal = VerifiedCommunitySignal & {
  /** An internal anonymous profile identifier; it is never included in output. */
  profileId: string;
};

export type HotspotInput = {
  now: string | Date;
  officialOccurrences: readonly OfficialOccurrence[];
  habitatAreas: readonly HabitatArea[];
  verifiedCommunitySignals: readonly HotspotCommunitySignal[];
  /** Events are deliberately accepted as context but never used as biological evidence. */
  verifiedEvents: readonly VerifiedEvent[];
};

export type HotspotContribution = {
  id: string;
  weight: number;
  point?: OfficialOccurrence['geometry'];
};

export type HotspotEvidenceBreakdown = {
  contributingIds: string[];
  points: OfficialOccurrence['geometry'][];
  officialOccurrences: HotspotContribution[];
  habitatAreas: HotspotContribution[];
  verifiedCommunitySignals: HotspotContribution[];
  adjacentCells: HotspotContribution[];
};

export type HotspotCell = {
  h3Index: string;
  speciesId: string;
  score: number;
  status: HotspotStatus;
  evidenceBreakdown: HotspotEvidenceBreakdown;
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
};

type ContributionGroup = keyof Omit<HotspotEvidenceBreakdown, 'contributingIds' | 'points'>;

type CellDraft = {
  h3Index: string;
  speciesId: string;
  contributions: Record<ContributionGroup, Map<string, HotspotContribution>>;
  signalProfiles: Map<string, Set<string>>;
  hasOfficialEvidence: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

export function calculateHotspotCells(input: HotspotInput): HotspotCell[] {
  const now = toDate(input.now, 'now');
  const drafts = new Map<string, CellDraft>();

  for (const occurrence of input.officialOccurrences) {
    const h3Index = pointToCell(occurrence.geometry.coordinates);
    const draft = getDraft(drafts, occurrence.speciesId, h3Index);
    addContribution(
      draft,
      'officialOccurrences',
      occurrence.id,
      officialOccurrenceWeight(occurrence.observedAt, now),
      occurrence.geometry,
    );
    draft.hasOfficialEvidence = true;
  }

  for (const habitatArea of input.habitatAreas) {
    const weight = habitatWeight(habitatArea.frequencyBand);
    if (weight === undefined) {
      continue;
    }

    for (const h3Index of geometryToCells(habitatArea.geometry)) {
      const draft = getDraft(drafts, habitatArea.speciesId, h3Index);
      addContribution(draft, 'habitatAreas', habitatArea.id, weight);
      draft.hasOfficialEvidence = true;
    }
  }

  for (const signal of input.verifiedCommunitySignals) {
    if (signal.evidenceSource !== 'community_verified') {
      continue;
    }

    const h3Index = pointToCell(signal.publicGeometry.coordinates);
    const draft = getDraft(drafts, signal.speciesId, h3Index);
    addContribution(
      draft,
      'verifiedCommunitySignals',
      signal.id,
      HOTSPOT_WEIGHTS.verifiedCommunitySignal[signal.signalType],
      signal.publicGeometry,
    );

    if (isRecentSighting(signal, now)) {
      const signalProfiles = draft.signalProfiles.get(signal.id) ?? new Set<string>();
      signalProfiles.add(signal.profileId);
      draft.signalProfiles.set(signal.id, signalProfiles);
    }
  }

  const baseScores = new Map<string, number>();
  for (const [key, draft] of drafts) {
    baseScores.set(key, scoreDraft(draft));
  }

  return [...drafts.values()]
    .map((draft) => createHotspotCell(draft, baseScores))
    .sort(
      (left, right) =>
        right.score - left.score || left.speciesId.localeCompare(right.speciesId) || left.h3Index.localeCompare(right.h3Index),
    );
}

function getDraft(drafts: Map<string, CellDraft>, speciesId: string, h3Index: string): CellDraft {
  const key = draftKey(speciesId, h3Index);
  const existing = drafts.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const draft: CellDraft = {
    h3Index,
    speciesId,
    contributions: {
      officialOccurrences: new Map(),
      habitatAreas: new Map(),
      verifiedCommunitySignals: new Map(),
      adjacentCells: new Map(),
    },
    signalProfiles: new Map(),
    hasOfficialEvidence: false,
  };
  drafts.set(key, draft);
  return draft;
}

function addContribution(
  draft: CellDraft,
  group: ContributionGroup,
  id: string,
  weight: number,
  point?: OfficialOccurrence['geometry'],
): void {
  if (!draft.contributions[group].has(id)) {
    draft.contributions[group].set(id, {
      id,
      weight,
      ...(point === undefined ? {} : { point }),
    });
  }
}

function createHotspotCell(draft: CellDraft, baseScores: ReadonlyMap<string, number>): HotspotCell {
  const adjacentIndex = [...gridDisk(draft.h3Index, 1)]
    .filter((candidate) => candidate !== draft.h3Index)
    .sort()
    .find(
      (candidate) =>
        baseScores.get(draftKey(draft.speciesId, candidate)) !== undefined &&
        (baseScores.get(draftKey(draft.speciesId, candidate)) ?? 0) >= HOTSPOT_WEIGHTS.strongPresenceScore,
    );

  if (adjacentIndex !== undefined) {
    addContribution(
      draft,
      'adjacentCells',
      `cell:${adjacentIndex}`,
      HOTSPOT_WEIGHTS.adjacentStrongPresence,
    );
  }

  const score = scoreDraft(draft);
  const breakdown = evidenceBreakdown(draft);

  return {
    h3Index: draft.h3Index,
    speciesId: draft.speciesId,
    score,
    status: statusFor(draft, score),
    evidenceBreakdown: breakdown,
    geometry: cellGeometry(draft.h3Index),
  };
}

function scoreDraft(draft: CellDraft): number {
  return Object.values(draft.contributions).reduce(
    (total, group) => total + [...group.values()].reduce((groupTotal, contribution) => groupTotal + contribution.weight, 0),
    0,
  );
}

function evidenceBreakdown(draft: CellDraft): HotspotEvidenceBreakdown {
  const officialOccurrences = contributions(draft.contributions.officialOccurrences);
  const habitatAreas = contributions(draft.contributions.habitatAreas);
  const verifiedCommunitySignals = contributions(draft.contributions.verifiedCommunitySignals);
  const adjacentCells = contributions(draft.contributions.adjacentCells);
  const allContributions = [...officialOccurrences, ...habitatAreas, ...verifiedCommunitySignals, ...adjacentCells];

  return {
    contributingIds: allContributions.map((contribution) => contribution.id).sort(),
    points: allContributions.flatMap((contribution) => (contribution.point === undefined ? [] : [contribution.point])),
    officialOccurrences,
    habitatAreas,
    verifiedCommunitySignals,
    adjacentCells,
  };
}

function contributions(group: ReadonlyMap<string, HotspotContribution>): HotspotContribution[] {
  return [...group.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function statusFor(draft: CellDraft, score: number): HotspotStatus {
  if (draft.hasOfficialEvidence && score >= HOTSPOT_WEIGHTS.knownMinimumScore) {
    return 'known';
  }
  if (isEmerging(draft)) {
    return 'emerging';
  }
  if (score >= HOTSPOT_WEIGHTS.watchMinimumScore) {
    return 'watch';
  }
  return 'none';
}

function isEmerging(draft: CellDraft): boolean {
  const distinctSignals = [...draft.signalProfiles.keys()];
  const profiles = new Set([...draft.signalProfiles.values()].flatMap((profileIds) => [...profileIds]));
  return (
    distinctSignals.length >= HOTSPOT_WEIGHTS.emerging.minimumSignals &&
    profiles.size >= HOTSPOT_WEIGHTS.emerging.minimumProfiles
  );
}

function isRecentSighting(signal: HotspotCommunitySignal, now: Date): boolean {
  if (signal.signalType !== 'sighting' || signal.profileId.trim() === '') {
    return false;
  }

  const verifiedAt = toDate(signal.verifiedAt, `verified signal ${signal.id}`);
  const age = now.getTime() - verifiedAt.getTime();
  return age >= 0 && age <= HOTSPOT_WEIGHTS.emerging.windowDays * DAY_MS;
}

function officialOccurrenceWeight(observedAt: string | undefined, now: Date): number {
  if (observedAt === undefined) {
    return HOTSPOT_WEIGHTS.officialOccurrence.older;
  }

  const age = Math.max(0, now.getTime() - toDate(observedAt, 'official observation').getTime());
  if (age <= 365 * DAY_MS) {
    return HOTSPOT_WEIGHTS.officialOccurrence.withinTwelveMonths;
  }
  if (age <= 3 * 365 * DAY_MS) {
    return HOTSPOT_WEIGHTS.officialOccurrence.withinThreeYears;
  }
  return HOTSPOT_WEIGHTS.officialOccurrence.older;
}

function habitatWeight(frequencyBand: string | undefined): number | undefined {
  if (frequencyBand === undefined) {
    return undefined;
  }
  return HOTSPOT_WEIGHTS.habitatFrequency[frequencyBand as keyof typeof HOTSPOT_WEIGHTS.habitatFrequency];
}

function pointToCell(coordinates: readonly number[]): string {
  const [longitude, latitude] = coordinates;
  if (longitude === undefined || latitude === undefined) {
    throw new Error('A hotspot point must contain longitude and latitude.');
  }
  return latLngToCell(latitude, longitude, HOTSPOT_WEIGHTS.h3Resolution);
}

function geometryToCells(geometry: HabitatArea['geometry']): string[] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return [
    ...new Set(
      polygons.flatMap((polygon) =>
        polygonToCellsExperimental(
          polygon.map((ring) => ring.map(([longitude, latitude]) => [longitude, latitude])),
          HOTSPOT_WEIGHTS.h3Resolution,
          POLYGON_TO_CELLS_FLAGS.containmentOverlapping,
          true,
        ),
      ),
    ),
  ];
}

function cellGeometry(h3Index: string): HotspotCell['geometry'] {
  const boundary = cellToBoundary(h3Index, true).map(([longitude, latitude]) => [longitude, latitude] as [number, number]);
  const firstPoint = boundary[0];
  if (firstPoint === undefined) {
    throw new Error(`H3 cell ${h3Index} has no boundary.`);
  }
  return {
    type: 'Polygon',
    coordinates: [[...boundary, firstPoint]],
  };
}

function draftKey(speciesId: string, h3Index: string): string {
  return `${speciesId}\u0000${h3Index}`;
}

function toDate(value: string | Date, label: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
  return date;
}
