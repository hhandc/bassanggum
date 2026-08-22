import type { PublicDataBundle } from '@bassanggum/data-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const MapLayersQuerySchema = z.object({
  category: z.enum(['fish', 'plant']).optional(),
  speciesId: z.string().trim().min(1).optional(),
  evidence: z.enum(['official', 'habitat', 'community', 'adjacent']).optional(),
});

export function registerMapRoutes(app: FastifyInstance, bundle: PublicDataBundle): void {
  app.get('/map/layers', (request, reply) => {
    const parsedQuery = MapLayersQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ status: 'invalid_request' });
    }
    const query = parsedQuery.data;
    const allowedSpecies = new Set(bundle.species.filter((species) => query.category === undefined || species.category === query.category).map((species) => species.id));
    const features = bundle.actionZones
      .filter((zone) => query.speciesId === undefined || zone.speciesId === query.speciesId)
      .filter((zone) => query.category === undefined || allowedSpecies.has(zone.speciesId))
      .filter((zone) => query.evidence === undefined || hasEvidence(zone.evidence.cells, query.evidence))
      .map((zone) => ({ type: 'Feature', geometry: zone.geometry, properties: { id: zone.id, kind: zone.kind, name: 'name' in zone ? zone.name : undefined, topSpecies: [zone.speciesId], evidence: zone.evidence } }));
    return { actionZones: { type: 'FeatureCollection', features } };
  });
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
