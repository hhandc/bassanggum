import { cellToBoundary, gridDisk } from 'h3-js';

import {
  ActionZoneSchema,
  SuppliedLandformSchema,
  type ActionZone,
  type ActionZoneEvidenceCell,
  type AreaGeometry,
  type LandformLineGeometry,
  type SuppliedLandform,
} from './schema.js';
import type { HotspotCell, HotspotContribution } from './hotspots.js';

type Position = [number, number];
type RiverReachGeometry = { type: 'LineString'; coordinates: Position[] };
type PreparedLandform = {
  id: string;
  name: string;
  kind: 'lake' | 'river_segment' | 'forest_habitat';
  geometry: AreaGeometry | RiverReachGeometry;
};
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
  const parsedLandforms = landforms
    .map((landform) => SuppliedLandformSchema.parse(landform))
    .sort((left, right) => left.id.localeCompare(right.id));
  const preparedLandforms = parsedLandforms.flatMap(prepareLandform);
  assertUniqueCells(cells);

  const drafts = [...cellsBySpecies(cells).entries()].flatMap(([speciesId, speciesCells]) => {
    const assigned = new Map<string, HotspotCell[]>();
    const unassigned: HotspotCell[] = [];

    for (const cell of speciesCells) {
      const landform = preparedLandforms.find((candidate) => landformIntersectsCell(candidate, cell.h3Index));
      if (landform === undefined) {
        unassigned.push(cell);
        continue;
      }
      const matching = assigned.get(landform.id) ?? [];
      matching.push(cell);
      assigned.set(landform.id, matching);
    }

    const named = [...assigned.entries()].map(([landformId, matchingCells]) => {
      const landform = preparedLandforms.find((candidate) => candidate.id === landformId);
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

function prepareLandform(landform: SuppliedLandform): PreparedLandform[] {
  if (landform.kind !== 'river_segment') {
    return [landform];
  }

  return splitRiverIntoReaches(landform.geometry).map((geometry, index) => {
    const ordinal = index + 1;
    const reachLabel = String(ordinal).padStart(2, '0');
    return {
      id: `${landform.id}:reach:${reachLabel}`,
      name: `${landform.name} — Reach ${reachLabel}`,
      kind: 'river_segment',
      geometry,
    };
  });
}

/**
 * Splits each supplied line component into consecutive <=2 km geodesic
 * reaches. Distances use the mean Earth radius and interpolation follows the
 * great-circle arc, avoiding latitude-dependent degree approximations.
 */
function splitRiverIntoReaches(geometry: LandformLineGeometry): RiverReachGeometry[] {
  const components = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  return components.flatMap((component) => splitLineIntoReaches(component.map(toPosition)));
}

function splitLineIntoReaches(line: readonly Position[]): RiverReachGeometry[] {
  const reaches: RiverReachGeometry[] = [];
  let current: Position[] = [line[0]!];
  let capacityMetres = 2_000;

  for (let index = 1; index < line.length; index += 1) {
    let segmentStart = line[index - 1]!;
    const segmentEnd = line[index]!;
    let remainingMetres = geodesicDistanceMetres(segmentStart, segmentEnd);

    while (remainingMetres > Number.EPSILON) {
      if (remainingMetres <= capacityMetres + Number.EPSILON) {
        current.push(segmentEnd);
        capacityMetres -= remainingMetres;
        if (capacityMetres <= Number.EPSILON) {
          reaches.push({ type: 'LineString', coordinates: current });
          current = [segmentEnd];
          capacityMetres = 2_000;
        }
        break;
      }

      const cut = interpolateGreatCircle(segmentStart, segmentEnd, capacityMetres / remainingMetres);
      current.push(cut);
      reaches.push({ type: 'LineString', coordinates: current });
      current = [cut];
      segmentStart = cut;
      remainingMetres = geodesicDistanceMetres(segmentStart, segmentEnd);
      capacityMetres = 2_000;
    }
  }

  if (current.length > 1) {
    reaches.push({ type: 'LineString', coordinates: current });
  }
  return reaches;
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
    status: cell.status,
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

function landformIntersectsCell(landform: PreparedLandform, h3Index: string): boolean {
  const boundary = cellBoundary(h3Index);
  return landform.geometry.type === 'LineString'
    ? lineIntersectsPolygon(landform.geometry.coordinates, boundary)
    : areaIntersectsPolygon(landform.geometry, boundary);
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

/** A line intersects a cell when an endpoint is inside it or a segment crosses its boundary. */
function lineIntersectsPolygon(line: readonly Position[], cellRing: readonly Position[]): boolean {
  return line.some((point) => pointInRing(point, cellRing)) || ringsIntersect(line, cellRing);
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

function toPosition(position: readonly number[]): Position {
  const [longitude, latitude] = position;
  if (longitude === undefined || latitude === undefined) {
    throw new Error('A supplied river coordinate must contain longitude and latitude.');
  }
  return [longitude, latitude];
}

function geodesicDistanceMetres([longitudeA, latitudeA]: Position, [longitudeB, latitudeB]: Position): number {
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const latitudeARadians = toRadians(latitudeA);
  const latitudeBRadians = toRadians(latitudeB);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeARadians) * Math.cos(latitudeBRadians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function interpolateGreatCircle(start: Position, end: Position, fraction: number): Position {
  const distanceRadians = geodesicDistanceMetres(start, end) / 6_371_008.8;
  if (distanceRadians <= Number.EPSILON) {
    return start;
  }
  const startLatitude = toRadians(start[1]);
  const startLongitude = toRadians(start[0]);
  const endLatitude = toRadians(end[1]);
  const endLongitude = toRadians(end[0]);
  const startWeight = Math.sin((1 - fraction) * distanceRadians) / Math.sin(distanceRadians);
  const endWeight = Math.sin(fraction * distanceRadians) / Math.sin(distanceRadians);
  const x = startWeight * Math.cos(startLatitude) * Math.cos(startLongitude) + endWeight * Math.cos(endLatitude) * Math.cos(endLongitude);
  const y = startWeight * Math.cos(startLatitude) * Math.sin(startLongitude) + endWeight * Math.cos(endLatitude) * Math.sin(endLongitude);
  const z = startWeight * Math.sin(startLatitude) + endWeight * Math.sin(endLatitude);
  return [toDegrees(Math.atan2(y, x)), toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y)))];
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
