import type { PublicDataBundle } from '@bassanggum/data-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const MapLayersQuerySchema = z.object({
  bbox: z.string().optional().refine((value) => value === undefined || parseViewportBounds(value) !== null),
  category: z.enum(['fish', 'plant']).optional(),
  speciesId: z.string().trim().min(1).optional(),
  evidence: z.enum(['official', 'habitat', 'community', 'adjacent']).optional(),
  zoom: z.coerce.number().int().min(0).max(22).optional(),
});

type ViewportBounds = readonly [west: number, south: number, east: number, north: number];

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
    const features = bundle.actionZones
      .filter((zone) => zone.evidence.cells.some((cell) => cell.status !== 'none'))
      .filter((zone) => query.speciesId === undefined || zone.speciesId === query.speciesId)
      .filter((zone) => query.category === undefined || allowedSpecies.has(zone.speciesId))
      .filter((zone) => query.evidence === undefined || hasEvidence(zone.evidence.cells, query.evidence))
      .filter((zone) => viewportBounds === undefined || geometryIntersectsBounds(zone.geometry, viewportBounds))
      .map((zone) => ({ type: 'Feature', geometry: zone.geometry, properties: { id: zone.id, kind: zone.kind, name: 'name' in zone ? zone.name : undefined, topSpecies: [zone.speciesId], evidence: zone.evidence } }));
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
