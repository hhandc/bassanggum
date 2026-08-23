import { hotspotCellCenter, type PublicDataBundle } from '@bassanggum/data-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { publicAreaId } from '../area-id.js';

const MapLayersQuerySchema = z.object({
  bbox: z.string().optional().refine((value) => value === undefined || parseViewportBounds(value) !== null),
  category: z.enum(['fish', 'plant']).optional(),
  speciesId: z.string().trim().min(1).optional(),
  evidence: z.enum(['official', 'habitat', 'community', 'adjacent']).optional(),
  zoom: z.coerce.number().int().min(0).max(22).optional(),
});

type ViewportBounds = readonly [west: number, south: number, east: number, north: number];
type Position = readonly [longitude: number, latitude: number];
type ActivityCategory = 'fish' | 'plant';
type ActivityCell = PublicDataBundle['actionZones'][number]['evidence']['cells'][number];
type ActivityCircle = {
  category: ActivityCategory;
  center: Position;
  cells: ActivityCell[];
  radiusMetres: number;
  sourceZoneIds: string[];
  speciesScores: Map<string, number>;
};
type ActivitySummary = Omit<ActivityCircle, 'category'> & { categories: Set<ActivityCategory> };

export function registerMapRoutes(app: FastifyInstance, bundle: PublicDataBundle): void {
  app.get('/map/layers', (request, reply) => {
    const parsedQuery = MapLayersQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ status: 'invalid_request' });
    }
    const query = parsedQuery.data;
    const parsedViewportBounds = query.bbox === undefined ? undefined : parseViewportBounds(query.bbox);
    if (parsedViewportBounds === null) return reply.code(400).send({ status: 'invalid_request' });
    const viewportBounds = parsedViewportBounds;
    const allowedSpecies = new Set(bundle.species.filter((species) => query.category === undefined || species.category === query.category).map((species) => species.id));
    const matchingZones = bundle.actionZones
      .filter((zone) => hasMapEvidence(zone.evidence.cells))
      .filter((zone) => query.speciesId === undefined || zone.speciesId === query.speciesId)
      .filter((zone) => query.category === undefined || allowedSpecies.has(zone.speciesId))
      .filter((zone) => query.evidence === undefined || hasEvidence(zone.evidence.cells, query.evidence));
    const features = actionZoneFeatures(matchingZones, bundle)
      .filter((feature) => viewportBounds === undefined || geometryIntersectsBounds(feature.geometry, viewportBounds));
    const restrictedFeatures = bundle.restrictedAreas
      .filter((area) => viewportBounds === undefined || geometryIntersectsBounds(area.geometry, viewportBounds))
      .map((area) => ({
      type: 'Feature',
      geometry: simplifyGeometryForMap(area.geometry, maximumPositionsForZoom(query.zoom)),
      properties: { id: area.id, name: area.name, restriction: area.restriction },
      }));
    return {
      actionZones: { type: 'FeatureCollection', features },
      restrictedAreas: { type: 'FeatureCollection', features: restrictedFeatures },
    };
  });
}

function actionZoneFeatures(zones: PublicDataBundle['actionZones'], bundle: PublicDataBundle) {
  return mergeNearbyActivities(activityCircles(zones, bundle)).map((activity) => {
    const speciesScores = [...activity.speciesScores.entries()];
    const kind = `${activity.categories.values().next().value}_activity`;
    return {
      type: 'Feature' as const,
      geometry: circleGeometry(activity.center, activity.radiusMetres),
      properties: {
        id: publicAreaId(activity.sourceZoneIds.sort()[0]!),
        kind,
        name: activityName(kind),
        topSpecies: speciesScores
          .map(([speciesId, score]) => mapSpecies(speciesId, score, bundle))
          .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)),
        evidence: { cells: activity.cells },
      },
    };
  });
}

function activityCircles(zones: PublicDataBundle['actionZones'], bundle: PublicDataBundle): ActivityCircle[] {
  return zones.flatMap((zone) => {
    const category = bundle.species.find((species) => species.id === zone.speciesId)?.category;
    if (category !== 'fish' && category !== 'plant') return [];
    return [circleForZone(category, zone)];
  });
}

function circleForZone(category: ActivityCategory, zone: PublicDataBundle['actionZones'][number]): ActivityCircle {
  const positions = zone.evidence.cells.map((cell) => hotspotCellCenter(cell.h3Index));
  const center: Position = [
    positions.reduce((total, [longitude]) => total + longitude, 0) / positions.length,
    positions.reduce((total, [, latitude]) => total + latitude, 0) / positions.length,
  ];
  const extentRadius = Math.max(...positions.map((position) => distanceMetres(center, position)), 0);
  return {
    category,
    center,
    cells: zone.evidence.cells,
    radiusMetres: Math.min(2_200, Math.max(300, extentRadius + 150, 180 * Math.sqrt(zone.evidence.cells.length) + 15 * Math.sqrt(zone.score))),
    sourceZoneIds: [zone.id],
    speciesScores: new Map([[zone.speciesId, zone.score]]),
  };
}

function mergeNearbyActivities(circles: readonly ActivityCircle[]) {
  const parent = circles.map((_, index) => index);
  function root(index: number): number {
    const current = parent[index];
    if (current === undefined || current === index) return index;
    const resolved = root(current);
    parent[index] = resolved;
    return resolved;
  }
  for (let left = 0; left < circles.length; left += 1) {
    for (let right = left + 1; right < circles.length; right += 1) {
      const leftCircle = circles[left];
      const rightCircle = circles[right];
      if (leftCircle === undefined || rightCircle === undefined || leftCircle.category !== rightCircle.category) continue;
      if (distanceMetres(leftCircle.center, rightCircle.center) <= leftCircle.radiusMetres + rightCircle.radiusMetres + 250) parent[root(right)] = root(left);
    }
  }
  const groups = new Map<number, ActivityCircle[]>();
  circles.forEach((circle, index) => {
    const group = groups.get(root(index)) ?? [];
    group.push(circle);
    groups.set(root(index), group);
  });
  return [...groups.values()].map(mergeActivityGroup);
}

function mergeActivityGroup(circles: readonly ActivityCircle[]): ActivitySummary {
  const totalScore = circles.reduce((total, circle) => total + [...circle.speciesScores.values()].reduce((sum, score) => sum + score, 0), 0);
  const center: Position = [
    circles.reduce((total, circle) => total + circle.center[0] * circleScore(circle), 0) / totalScore,
    circles.reduce((total, circle) => total + circle.center[1] * circleScore(circle), 0) / totalScore,
  ];
  const speciesScores = new Map<string, number>();
  for (const circle of circles) {
    for (const [speciesId, score] of circle.speciesScores) speciesScores.set(speciesId, (speciesScores.get(speciesId) ?? 0) + score);
  }
  return {
    categories: new Set(circles.map((circle) => circle.category)),
    center,
    cells: circles.flatMap((circle) => circle.cells),
    radiusMetres: Math.min(2_500, Math.max(...circles.map((circle) => distanceMetres(center, circle.center) + circle.radiusMetres))),
    sourceZoneIds: circles.flatMap((circle) => circle.sourceZoneIds),
    speciesScores,
  };
}

function circleScore(circle: ActivityCircle): number {
  return [...circle.speciesScores.values()].reduce((total, score) => total + score, 0);
}

function circleGeometry([longitude, latitude]: Position, radiusMetres: number) {
  const latitudeRadians = latitude * (Math.PI / 180);
  const latitudeOffset = radiusMetres / 111_320;
  const longitudeOffset = radiusMetres / (111_320 * Math.cos(latitudeRadians));
  const ring = Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return [longitude + Math.cos(angle) * longitudeOffset, latitude + Math.sin(angle) * latitudeOffset] as [number, number];
  });
  return { type: 'Polygon' as const, coordinates: [[...ring, ring[0]!]] };
}

function activityName(kind: string): string {
  if (kind === 'fish_activity') return 'Invasive fish activity area';
  if (kind === 'plant_activity') return 'Invasive plant activity area';
  return 'Mixed invasive activity area';
}

function distanceMetres([leftLongitude, leftLatitude]: Position, [rightLongitude, rightLatitude]: Position): number {
  const toRadians = Math.PI / 180;
  const latitudeDelta = (rightLatitude - leftLatitude) * toRadians;
  const longitudeDelta = (rightLongitude - leftLongitude) * toRadians;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(leftLatitude * toRadians) * Math.cos(rightLatitude * toRadians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapSpecies(speciesId: string, score: number, bundle: PublicDataBundle) {
  const species = bundle.species.find((candidate) => candidate.id === speciesId);
  const image = species?.identificationMedia?.find((candidate) => candidate.generated !== true);
  return {
    id: speciesId,
    name: species?.englishName ?? species?.koreanName ?? speciesId,
    ...(image === undefined ? {} : { imageUrl: image.url }),
    score,
  };
}

function parseViewportBounds(value: string): ViewportBounds | null {
  const values = value.split(',').map(Number);
  if (values.length !== 4 || values.some((coordinate) => !Number.isFinite(coordinate))) return null;
  const west = values[0];
  const south = values[1];
  const east = values[2];
  const north = values[3];
  if (west === undefined || south === undefined || east === undefined || north === undefined) return null;
  return west < east && south < north ? [west, south, east, north] : null;
}

function geometryIntersectsBounds(geometry: unknown, [west, south, east, north]: ViewportBounds): boolean {
  const geometryBounds = getGeometryBounds(geometry);
  return geometryBounds !== null && geometryBounds[0] <= east && geometryBounds[2] >= west && geometryBounds[1] <= north && geometryBounds[3] >= south;
}

function getGeometryBounds(geometry: unknown): ViewportBounds | null {
  if (!isRecord(geometry) || !('coordinates' in geometry)) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  function visit(coordinates: unknown): void {
    if (!Array.isArray(coordinates)) return;
    if (isPosition(coordinates)) {
      const [longitude, latitude] = coordinates;
      west = Math.min(west, longitude);
      south = Math.min(south, latitude);
      east = Math.max(east, longitude);
      north = Math.max(north, latitude);
      return;
    }
    coordinates.forEach(visit);
  }
  visit(geometry.coordinates);
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

function maximumPositionsForZoom(zoom: number | undefined): number {
  if (zoom === undefined || zoom <= 11) return zoom !== undefined && zoom <= 8 ? 12 : 24;
  return 80;
}

function simplifyGeometryForMap<T>(geometry: T, maximumPositions: number): T {
  if (!isRecord(geometry) || !('coordinates' in geometry)) return geometry;
  return { ...geometry, coordinates: simplifyCoordinates(geometry.coordinates, maximumPositions) } as T;
}

function simplifyCoordinates(coordinates: unknown, maximumPositions: number): unknown {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return coordinates;
  if (isPosition(coordinates[0])) return simplifyRing(coordinates, maximumPositions);
  return coordinates.map((coordinate) => simplifyCoordinates(coordinate, maximumPositions));
}

function simplifyRing(ring: unknown[], maximumPositions: number): unknown[] {
  if (ring.length <= maximumPositions) return ring;
  const finalPosition = ring.length - 1;
  const step = Math.ceil(finalPosition / (maximumPositions - 1));
  const simplified = ring.filter((_, index) => index === finalPosition || index % step === 0);
  return simplified.at(-1) === ring.at(-1) ? simplified : [...simplified, ring.at(-1)];
}

function isPosition(value: unknown): value is [number, number, ...number[]] {
  return Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasEvidence(
  cells: PublicDataBundle['actionZones'][number]['evidence']['cells'],
  evidence: 'official' | 'habitat' | 'community' | 'adjacent',
): boolean {
  const contributionKey = {
    official: 'officialOccurrences',
    habitat: 'habitatAreas',
    community: 'verifiedCommunitySignals',
    adjacent: 'adjacentCells',
  } as const;
  return cells.some((cell) => cell[contributionKey[evidence]].length > 0);
}

function hasMapEvidence(cells: readonly ActivityCell[]): boolean {
  return cells.some((cell) => cell.status !== 'none' || cell.officialOccurrences.length > 0 || cell.verifiedCommunitySignals.length > 0);
}
