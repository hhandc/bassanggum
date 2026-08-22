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
    minimumDeviceHashes: 2,
    windowDays: 30,
  },
} as const;

export type HotspotStatus = 'known' | 'watch' | 'emerging' | 'none';

export type HotspotCommunitySignal = VerifiedCommunitySignal;

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
  recentSightingIds: Set<string>;
  hasEmergingDeviceDiversityProof: boolean;
  hasOfficialEvidence: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

export function calculateHotspotCells(input: HotspotInput): HotspotCell[] {
  const now = toDate(input.now, 'now');
  const drafts = new Map<string, CellDraft>();

  for (const occurrence of scoringOccurrences(input.officialOccurrences)) {
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
      draft.recentSightingIds.add(signal.id);
      draft.hasEmergingDeviceDiversityProof ||= signal.emergingDeviceDiversityVerified === true;
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

/**
 * Returns the official records that contribute to scores. Bundle records are
 * deliberately untouched: only matching observations from different source
 * datasets are paired here. Repeated observations inside one dataset remain.
 */
export function scoringOccurrences(occurrences: readonly OfficialOccurrence[]): OfficialOccurrence[] {
  const annualGroups = new Map<string, OfficialOccurrence[]>();
  for (const occurrence of occurrences) {
    const fingerprint = officialEvidenceYearFingerprint(occurrence);
    const records = annualGroups.get(fingerprint) ?? [];
    records.push(occurrence);
    annualGroups.set(fingerprint, records);
  }

  const byFingerprint = new Map<string, Map<string, OfficialOccurrence[]>>();
  for (const [yearFingerprint, records] of annualGroups) {
    if (records.some((occurrence) => occurrence.observedAtPrecision === 'year')) {
      addScoringRecords(byFingerprint, `year:${yearFingerprint}`, records);
      continue;
    }
    for (const occurrence of records) {
      addScoringRecords(byFingerprint, `date:${officialEvidenceFingerprint(occurrence)}`, [occurrence]);
    }
  }

  const scored: OfficialOccurrence[] = [];
  for (const sourceGroups of byFingerprint.values()) {
    const groups = [...sourceGroups.values()].map((records) => [...records].sort((left, right) => left.id.localeCompare(right.id)));
    const highestRepeatCount = Math.max(...groups.map((records) => records.length));
    for (let index = 0; index < highestRepeatCount; index += 1) {
      const pairedRecords = groups.flatMap((records): OfficialOccurrence[] => {
        const record = records[index];
        return record === undefined ? [] : [record];
      });
      const selected = pairedRecords.sort((left, right) => left.id.localeCompare(right.id))[0];
      if (selected !== undefined) {
        scored.push(selected);
      }
    }
  }
  return scored.sort((left, right) => left.id.localeCompare(right.id));
}

function addScoringRecords(
  groups: Map<string, Map<string, OfficialOccurrence[]>>,
  fingerprint: string,
  records: readonly OfficialOccurrence[],
): void {
  const sourceGroups = groups.get(fingerprint) ?? new Map<string, OfficialOccurrence[]>();
  for (const occurrence of records) {
    const sourceRecords = sourceGroups.get(occurrence.datasetId) ?? [];
    sourceRecords.push(occurrence);
    sourceGroups.set(occurrence.datasetId, sourceRecords);
  }
  groups.set(fingerprint, sourceGroups);
}

/** A stable exact-date semantic key used exclusively to prevent cross-source double scoring. */
export function officialEvidenceFingerprint(occurrence: OfficialOccurrence): string {
  const [longitude, latitude] = occurrence.geometry.coordinates;
  const observedAt = occurrence.observedAt;
  // Undated evidence cannot satisfy the same-date/year requirement, so it is never paired.
  const dateKey = observedAt === undefined ? `undated:${occurrence.id}` : observedAt;
  // Six decimals are approximately 0.11 m: enough to pair harmless source
  // serialization differences, not clearly distinct nearby observations.
  return [occurrence.speciesId, dateKey, coordinateFingerprint(longitude), coordinateFingerprint(latitude)].join('\u0000');
}

/** A stable species/year/coordinate key used only when a source declares year precision. */
function officialEvidenceYearFingerprint(occurrence: OfficialOccurrence): string {
  const [longitude, latitude] = occurrence.geometry.coordinates;
  const observedAt = occurrence.observedAt;
  const yearKey = observedAt === undefined ? `undated:${occurrence.id}` : observedAt.slice(0, 4);
  return [occurrence.speciesId, yearKey, coordinateFingerprint(longitude), coordinateFingerprint(latitude)].join('\u0000');
}

function coordinateFingerprint(coordinate: number): string {
  return (Math.round(coordinate * 1_000_000) / 1_000_000).toFixed(6);
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
    recentSightingIds: new Set(),
    hasEmergingDeviceDiversityProof: false,
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
  return (
    draft.recentSightingIds.size >= HOTSPOT_WEIGHTS.emerging.minimumSignals &&
    draft.hasEmergingDeviceDiversityProof
  );
}

function isRecentSighting(signal: HotspotCommunitySignal, now: Date): boolean {
  if (signal.signalType !== 'sighting') {
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

  const observedDate = toDate(observedAt, 'official observation');
  if (observedDate >= calendarYearsAgo(now, 1)) {
    return HOTSPOT_WEIGHTS.officialOccurrence.withinTwelveMonths;
  }
  if (observedDate >= calendarYearsAgo(now, 3)) {
    return HOTSPOT_WEIGHTS.officialOccurrence.withinThreeYears;
  }
  return HOTSPOT_WEIGHTS.officialOccurrence.older;
}

function calendarYearsAgo(now: Date, years: number): Date {
  const targetYear = now.getUTCFullYear() - years;
  const targetMonth = now.getUTCMonth();
  const finalDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(now.getUTCDate(), finalDayOfTargetMonth),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
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
