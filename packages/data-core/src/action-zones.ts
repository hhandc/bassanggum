import { cellToBoundary, gridDisk } from 'h3-js';

import {
  ActionZoneSchema,
  SuppliedLandformSchema,
  type ActionZone,
  type ActionZoneEvidenceCell,
  type AreaGeometry,
  type LandformLineGeometry,
  type OfficialProvenance,
  type SuppliedLandform,
} from './schema.js';
import type { HotspotCell, HotspotContribution } from './hotspots.js';

type Position = [number, number];
type PreparedLandform = {
  id: string;
  name: string;
  kind: 'lake' | 'river_segment' | 'forest_habitat';
  geometry: AreaGeometry | LandformLineGeometry;
  visibleGeometry: AreaGeometry;
  bounds: Bounds;
  sourceAttributes?: Record<string, string> | undefined;
  provenance?: OfficialProvenance | undefined;
};
type Bounds = { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number };
type ZoneDraft = {
  kind: ActionZone['kind'];
  name?: string;
  sourceAttributes?: Record<string, string> | undefined;
  provenance?: OfficialProvenance | undefined;
  id: string;
  speciesId: string;
  cells: HotspotCell[];
  geometry?: AreaGeometry | undefined;
};

/**
 * Aggregates scored H3 cells into per-species action zones. With no explicit
 * landforms, every zone is an unnamed adjacency cluster; no geography or
 * removal authority is inferred from occurrence data.
 */
export function createActionZones(
  cells: readonly HotspotCell[],
  landforms: readonly SuppliedLandform[] = [],
  speciesCategories: ReadonlyMap<string, 'fish' | 'plant'> = new Map(),
): ActionZone[] {
  const parsedLandforms = landforms
    .map((landform) => SuppliedLandformSchema.parse(landform))
    .sort((left, right) => left.id.localeCompare(right.id));
  const preparedLandforms = parsedLandforms.flatMap(prepareLandform);
  const landformIndex = indexLandforms(preparedLandforms);
  assertUniqueCells(cells);

  const drafts = [...cellsBySpecies(cells).entries()].flatMap(([speciesId, speciesCells]) => {
    const assigned = new Map<string, HotspotCell[]>();
    const unassigned: HotspotCell[] = [];

    for (const cell of speciesCells) {
      const candidates = candidateLandforms(landformIndex, cell.h3Index)
        .filter((candidate) => landformSupportsSpecies(candidate, speciesCategories.get(speciesId)))
        .map((candidate) => ({
          landform: candidate,
          direct: landformIntersectsCell(candidate, cell.h3Index),
          nearby: landformIntersectsObservationNeighbourhood(candidate, cell.h3Index),
        }))
        .filter((candidate) => candidate.direct || candidate.nearby);

      if (candidates.length === 0) {
        unassigned.push(cell);
        continue;
      }

      const chosen = candidates
        .sort((left, right) => {
          if (left.direct !== right.direct) return left.direct ? -1 : 1;
          return landformPriority(left.landform.kind) - landformPriority(right.landform.kind);
        })[0];
      if (chosen === undefined) {
        unassigned.push(cell);
        continue;
      }
      const landform = chosen.landform;
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
        ...(landform.sourceAttributes === undefined ? {} : { sourceAttributes: landform.sourceAttributes }),
        ...(landform.provenance === undefined ? {} : { provenance: landform.provenance }),
        speciesId,
        cells: matchingCells,
        geometry: landform.visibleGeometry,
      } satisfies ZoneDraft;
    });

    return [...named, ...fallbackClusters(speciesId, unassigned)];
  });

  return drafts
    .map(createZone)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId) || left.id.localeCompare(right.id));
}

function prepareLandform(landform: SuppliedLandform): PreparedLandform[] {
  return [{
    ...landform,
    visibleGeometry: landform.kind === 'river_segment' ? riverCorridor(landform.geometry) : asMultiPolygon(landform.geometry),
    bounds: geometryBounds(landform.geometry),
  }];
}

const LANDFORM_INDEX_DEGREES = 0.1;

function indexLandforms(landforms: readonly PreparedLandform[]): Map<string, PreparedLandform[]> {
  const index = new Map<string, PreparedLandform[]>();
  for (const landform of landforms) {
    for (let longitude = tileCoordinate(landform.bounds.minLongitude); longitude <= tileCoordinate(landform.bounds.maxLongitude); longitude += 1) {
      for (let latitude = tileCoordinate(landform.bounds.minLatitude); latitude <= tileCoordinate(landform.bounds.maxLatitude); latitude += 1) {
        const key = `${longitude}:${latitude}`;
        const candidates = index.get(key) ?? [];
        candidates.push(landform);
        index.set(key, candidates);
      }
    }
  }
  return index;
}

function candidateLandforms(index: ReadonlyMap<string, readonly PreparedLandform[]>, h3Index: string): PreparedLandform[] {
  const bounds = observationBounds(h3Index);
  const candidates = new Map<string, PreparedLandform>();
  for (let longitude = tileCoordinate(bounds.minLongitude); longitude <= tileCoordinate(bounds.maxLongitude); longitude += 1) {
    for (let latitude = tileCoordinate(bounds.minLatitude); latitude <= tileCoordinate(bounds.maxLatitude); latitude += 1) {
      for (const candidate of index.get(`${longitude}:${latitude}`) ?? []) {
        if (boundsIntersect(bounds, candidate.bounds)) {
          candidates.set(candidate.id, candidate);
        }
      }
    }
  }
  return [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function tileCoordinate(coordinate: number): number {
  return Math.floor(coordinate / LANDFORM_INDEX_DEGREES);
}

function geometryBounds(geometry: AreaGeometry | LandformLineGeometry): Bounds {
  const positions = geometry.type === 'Polygon'
    ? geometry.coordinates.flat().map(toPosition)
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates.flat(2).map(toPosition)
      : geometry.type === 'LineString'
        ? geometry.coordinates.map(toPosition)
        : geometry.coordinates.flat().map(toPosition);
  return coordinateBounds(positions);
}

function coordinateBounds(positions: readonly Position[]): Bounds {
  return {
    minLongitude: Math.min(...positions.map(([longitude]) => longitude)),
    minLatitude: Math.min(...positions.map(([, latitude]) => latitude)),
    maxLongitude: Math.max(...positions.map(([longitude]) => longitude)),
    maxLatitude: Math.max(...positions.map(([, latitude]) => latitude)),
  };
}

function boundsIntersect(left: Bounds, right: Bounds): boolean {
  return left.minLongitude <= right.maxLongitude && left.maxLongitude >= right.minLongitude &&
    left.minLatitude <= right.maxLatitude && left.maxLatitude >= right.minLatitude;
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
    ...(draft.sourceAttributes === undefined ? {} : { sourceAttributes: draft.sourceAttributes }),
    ...(draft.provenance === undefined ? {} : { provenance: draft.provenance }),
    speciesId: draft.speciesId,
    score: cells.reduce((total, cell) => total + cell.score, 0),
    sourceCellIds: cells.map((cell) => cell.h3Index),
    evidence: { cells: cells.map(toPublicEvidence) },
    geometry: draft.geometry ?? {
      type: 'MultiPolygon',
      coordinates: cells.map((cell) => [cellBoundary(cell.h3Index)]),
    },
  });
}

function landformSupportsSpecies(landform: PreparedLandform, category: 'fish' | 'plant' | undefined): boolean {
  return (category === 'fish' && (landform.kind === 'river_segment' || landform.kind === 'lake')) ||
    (category === 'plant' && landform.kind === 'forest_habitat');
}

function landformPriority(kind: PreparedLandform['kind']): number {
  switch (kind) {
    case 'lake': return 0;
    case 'river_segment': return 1;
    case 'forest_habitat': return 2;
  }
}

function asMultiPolygon(geometry: AreaGeometry): AreaGeometry {
  return geometry.type === 'MultiPolygon' ? geometry : { type: 'MultiPolygon', coordinates: [geometry.coordinates] };
}

/** The official river source is a centerline, so this is only a display corridor. */
function riverCorridor(geometry: LandformLineGeometry): AreaGeometry {
  const components = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const corridors = components.flatMap((component) => component.slice(1).flatMap((end, index) => {
    const start = component[index];
    return start === undefined ? [] : [riverSegmentCorridor(toPosition(start), toPosition(end))];
  }));
  if (corridors.length === 0) {
    throw new Error('A supplied river line must contain at least one non-empty segment.');
  }
  return { type: 'MultiPolygon', coordinates: corridors.map((ring) => [ring]) };
}

function riverSegmentCorridor(start: Position, end: Position): Position[] {
  const meanLatitude = ((start[1] + end[1]) / 2) * (Math.PI / 180);
  const metresPerLatitudeDegree = 111_320;
  const metresPerLongitudeDegree = metresPerLatitudeDegree * Math.cos(meanLatitude);
  const deltaLongitudeMetres = (end[0] - start[0]) * metresPerLongitudeDegree;
  const deltaLatitudeMetres = (end[1] - start[1]) * metresPerLatitudeDegree;
  const length = Math.hypot(deltaLongitudeMetres, deltaLatitudeMetres);
  const halfWidthMetres = 100;
  const offsetLongitude = length === 0 ? halfWidthMetres / metresPerLongitudeDegree : (-deltaLatitudeMetres / length) * halfWidthMetres / metresPerLongitudeDegree;
  const offsetLatitude = length === 0 ? halfWidthMetres / metresPerLatitudeDegree : (deltaLongitudeMetres / length) * halfWidthMetres / metresPerLatitudeDegree;
  const leftStart: Position = [start[0] + offsetLongitude, start[1] + offsetLatitude];
  const leftEnd: Position = [end[0] + offsetLongitude, end[1] + offsetLatitude];
  const rightEnd: Position = [end[0] - offsetLongitude, end[1] - offsetLatitude];
  const rightStart: Position = [start[0] - offsetLongitude, start[1] - offsetLatitude];
  return [leftStart, leftEnd, rightEnd, rightStart, leftStart];
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
  if (landform.geometry.type === 'LineString') return lineIntersectsPolygon(landform.geometry.coordinates.map(toPosition), boundary);
  if (landform.geometry.type === 'MultiLineString') return landform.geometry.coordinates.some((line) => lineIntersectsPolygon(line.map(toPosition), boundary));
  return areaIntersectsPolygon(landform.geometry, boundary);
}

function landformIntersectsObservationNeighbourhood(landform: PreparedLandform, h3Index: string): boolean {
  const searchRing = boundsRing(observationBounds(h3Index));
  if (landform.geometry.type === 'LineString') return lineIntersectsPolygon(landform.geometry.coordinates.map(toPosition), searchRing);
  if (landform.geometry.type === 'MultiLineString') return landform.geometry.coordinates.some((line) => lineIntersectsPolygon(line.map(toPosition), searchRing));
  return areaIntersectsPolygon(landform.geometry, searchRing);
}

/** Nearby official landforms are an approximately one-kilometre association, not an exact occurrence boundary. */
function observationBounds(h3Index: string): Bounds {
  const bounds = coordinateBounds(cellBoundary(h3Index));
  const latitude = (bounds.minLatitude + bounds.maxLatitude) / 2;
  const latitudePadding = 0.009;
  const longitudePadding = latitudePadding / Math.cos(latitude * Math.PI / 180);
  return {
    minLongitude: bounds.minLongitude - longitudePadding,
    minLatitude: bounds.minLatitude - latitudePadding,
    maxLongitude: bounds.maxLongitude + longitudePadding,
    maxLatitude: bounds.maxLatitude + latitudePadding,
  };
}

function boundsRing(bounds: Bounds): Position[] {
  return [
    [bounds.minLongitude, bounds.minLatitude], [bounds.maxLongitude, bounds.minLatitude],
    [bounds.maxLongitude, bounds.maxLatitude], [bounds.minLongitude, bounds.maxLatitude],
    [bounds.minLongitude, bounds.minLatitude],
  ];
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
