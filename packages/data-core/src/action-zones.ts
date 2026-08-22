import { cellToBoundary, gridDisk } from 'h3-js';

import {
  ActionZoneSchema,
  SuppliedLandformSchema,
  type ActionZone,
  type ActionZoneEvidenceCell,
  type AreaGeometry,
  type SuppliedLandform,
} from './schema.js';
import type { HotspotCell, HotspotContribution } from './hotspots.js';

type Position = [number, number];
type ZoneDraft = {
  kind: ActionZone['kind'];
  name?: string;
  id: string;
  speciesId: string;
  cells: HotspotCell[];
};

/**
 * Aggregates scored H3 cells into per-species action zones. With no explicit
 * landforms, every zone is an unnamed adjacency cluster; no geography or
 * removal authority is inferred from occurrence data.
 */
export function createActionZones(cells: readonly HotspotCell[], landforms: readonly SuppliedLandform[] = []): ActionZone[] {
  const parsedLandforms = landforms.map((landform) => SuppliedLandformSchema.parse(landform)).sort((left, right) => left.id.localeCompare(right.id));
  assertUniqueCells(cells);

  const drafts = [...cellsBySpecies(cells).entries()].flatMap(([speciesId, speciesCells]) => {
    const assigned = new Map<string, HotspotCell[]>();
    const unassigned: HotspotCell[] = [];

    for (const cell of speciesCells) {
      const landform = parsedLandforms.find((candidate) => landformIntersectsCell(candidate, cell.h3Index));
      if (landform === undefined) {
        unassigned.push(cell);
        continue;
      }
      const matching = assigned.get(landform.id) ?? [];
      matching.push(cell);
      assigned.set(landform.id, matching);
    }

    const named = [...assigned.entries()].map(([landformId, matchingCells]) => {
      const landform = parsedLandforms.find((candidate) => candidate.id === landformId);
      if (landform === undefined) {
        throw new Error(`Missing supplied landform ${landformId}.`);
      }
      return {
        id: `action-zone:${landform.id}:${speciesId}`,
        kind: landform.kind,
        name: landform.name,
        speciesId,
        cells: matchingCells,
      } satisfies ZoneDraft;
    });

    return [...named, ...fallbackClusters(speciesId, unassigned)];
  });

  return drafts
    .map(createZone)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId) || left.id.localeCompare(right.id));
}

function assertUniqueCells(cells: readonly HotspotCell[]): void {
  const identities = new Set<string>();
  for (const cell of cells) {
    const identity = `${cell.speciesId}\u0000${cell.h3Index}`;
    if (identities.has(identity)) {
      throw new Error(`Duplicate hotspot cell for species ${cell.speciesId} and H3 index ${cell.h3Index}.`);
    }
    identities.add(identity);
  }
}

function cellsBySpecies(cells: readonly HotspotCell[]): Map<string, HotspotCell[]> {
  const result = new Map<string, HotspotCell[]>();
  for (const cell of cells) {
    const speciesCells = result.get(cell.speciesId) ?? [];
    speciesCells.push(cell);
    result.set(cell.speciesId, speciesCells);
  }
  for (const speciesCells of result.values()) {
    speciesCells.sort((left, right) => left.h3Index.localeCompare(right.h3Index));
  }
  return result;
}

function fallbackClusters(speciesId: string, cells: readonly HotspotCell[]): ZoneDraft[] {
  const pending = new Map(cells.map((cell) => [cell.h3Index, cell]));
  const clusters: ZoneDraft[] = [];

  while (pending.size > 0) {
    const firstIndex = [...pending.keys()].sort()[0];
    if (firstIndex === undefined) {
      break;
    }
    const seed = pending.get(firstIndex);
    if (seed === undefined) {
      throw new Error(`Missing fallback seed ${firstIndex}.`);
    }
    pending.delete(firstIndex);
    const queue = [seed];
    const cluster: HotspotCell[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      cluster.push(current);
      for (const neighborIndex of gridDisk(current.h3Index, 1)) {
        const neighbor = pending.get(neighborIndex);
        if (neighbor !== undefined) {
          pending.delete(neighborIndex);
          queue.push(neighbor);
        }
      }
    }

    const sortedCluster = cluster.sort((left, right) => left.h3Index.localeCompare(right.h3Index));
    const firstCell = sortedCluster[0];
    if (firstCell === undefined) {
      throw new Error('A fallback cluster must contain its seed cell.');
    }
    clusters.push({
      id: `action-zone:cluster:${speciesId}:${firstCell.h3Index}`,
      kind: 'unnamed_cell_cluster',
      speciesId,
      cells: sortedCluster,
    });
  }

  return clusters;
}

function createZone(draft: ZoneDraft): ActionZone {
  const cells = [...draft.cells].sort((left, right) => left.h3Index.localeCompare(right.h3Index));
  return ActionZoneSchema.parse({
    id: draft.id,
    kind: draft.kind,
    ...(draft.name === undefined ? {} : { name: draft.name }),
    speciesId: draft.speciesId,
    score: cells.reduce((total, cell) => total + cell.score, 0),
    sourceCellIds: cells.map((cell) => cell.h3Index),
    evidence: { cells: cells.map(toPublicEvidence) },
    geometry: {
      type: 'MultiPolygon',
      coordinates: cells.map((cell) => [cellBoundary(cell.h3Index)]),
    },
  });
}

function toPublicEvidence(cell: HotspotCell): ActionZoneEvidenceCell {
  return {
    h3Index: cell.h3Index,
    score: cell.score,
    contributingIds: [...cell.evidenceBreakdown.contributingIds].sort(),
    officialOccurrences: publicContributions(cell.evidenceBreakdown.officialOccurrences),
    habitatAreas: publicContributions(cell.evidenceBreakdown.habitatAreas),
    verifiedCommunitySignals: publicContributions(cell.evidenceBreakdown.verifiedCommunitySignals),
    adjacentCells: publicContributions(cell.evidenceBreakdown.adjacentCells),
  };
}

function publicContributions(contributions: readonly HotspotContribution[]): Array<{ id: string; weight: number }> {
  return contributions
    .map(({ id, weight }) => ({ id, weight }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function landformIntersectsCell(landform: SuppliedLandform, h3Index: string): boolean {
  return areaIntersectsPolygon(landform.geometry, cellBoundary(h3Index));
}

function cellBoundary(h3Index: string): Position[] {
  const boundary = cellToBoundary(h3Index, true).map(([longitude, latitude]) => [longitude, latitude] as Position);
  const first = boundary[0];
  if (first === undefined) {
    throw new Error(`H3 cell ${h3Index} has no boundary.`);
  }
  return [...boundary, first];
}

function areaIntersectsPolygon(area: AreaGeometry, cellRing: readonly Position[]): boolean {
  const polygons = area.type === 'Polygon' ? [area.coordinates] : area.coordinates;
  return polygons.some((polygon) => polygonIntersectsPolygon(polygon, cellRing));
}

function polygonIntersectsPolygon(areaRings: readonly (readonly number[])[][], cellRing: readonly Position[]): boolean {
  const outer = areaRings[0];
  if (outer === undefined) {
    return false;
  }
  const areaOuter = outer.map(([longitude, latitude]) => [longitude, latitude] as Position);
  const areaHoles = areaRings.slice(1).map((ring) => ring.map(([longitude, latitude]) => [longitude, latitude] as Position));

  return (
    cellRing.some((point) => pointInPolygon(point, areaOuter, areaHoles)) ||
    areaOuter.some((point) => pointInRing(point, cellRing)) ||
    ringsIntersect(areaOuter, cellRing)
  );
}

function pointInPolygon(point: Position, outer: readonly Position[], holes: readonly Position[][]): boolean {
  return pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole));
}

function pointInRing(point: Position, ring: readonly Position[]): boolean {
  let inside = false;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = ring[index];
    const end = ring[index + 1];
    if (start === undefined || end === undefined) {
      return false;
    }
    if (pointOnSegment(point, start, end)) {
      return true;
    }
    const [x, y] = point;
    const [startX, startY] = start;
    const [endX, endY] = end;
    if ((startY > y) !== (endY > y) && x < ((endX - startX) * (y - startY)) / (endY - startY) + startX) {
      inside = !inside;
    }
  }
  return inside;
}

function ringsIntersect(left: readonly Position[], right: readonly Position[]): boolean {
  for (let leftIndex = 0; leftIndex < left.length - 1; leftIndex += 1) {
    const leftStart = left[leftIndex];
    const leftEnd = left[leftIndex + 1];
    if (leftStart === undefined || leftEnd === undefined) {
      continue;
    }
    for (let rightIndex = 0; rightIndex < right.length - 1; rightIndex += 1) {
      const rightStart = right[rightIndex];
      const rightEnd = right[rightIndex + 1];
      if (rightStart !== undefined && rightEnd !== undefined && segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(firstStart: Position, firstEnd: Position, secondStart: Position, secondEnd: Position): boolean {
  const first = orientation(firstStart, firstEnd, secondStart);
  const second = orientation(firstStart, firstEnd, secondEnd);
  const third = orientation(secondStart, secondEnd, firstStart);
  const fourth = orientation(secondStart, secondEnd, firstEnd);

  return (
    (first === 0 && pointOnSegment(secondStart, firstStart, firstEnd)) ||
    (second === 0 && pointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (third === 0 && pointOnSegment(firstStart, secondStart, secondEnd)) ||
    (fourth === 0 && pointOnSegment(firstEnd, secondStart, secondEnd)) ||
    (first > 0) !== (second > 0) && (third > 0) !== (fourth > 0)
  );
}

function orientation(start: Position, end: Position, point: Position): number {
  const value = (end[1] - start[1]) * (point[0] - end[0]) - (end[0] - start[0]) * (point[1] - end[1]);
  return Math.abs(value) < Number.EPSILON ? 0 : value > 0 ? 1 : -1;
}

function pointOnSegment(point: Position, start: Position, end: Position): boolean {
  return (
    orientation(start, end, point) === 0 &&
    point[0] >= Math.min(start[0], end[0]) &&
    point[0] <= Math.max(start[0], end[0]) &&
    point[1] >= Math.min(start[1], end[1]) &&
    point[1] <= Math.max(start[1], end[1])
  );
}
