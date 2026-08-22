import type { PublicDataBundle } from '@bassanggum/data-core';
import type { FastifyInstance } from 'fastify';

export function registerAreaRoutes(app: FastifyInstance, bundle: PublicDataBundle): void {
  app.get('/areas/:areaId', (request, reply) => {
    const { areaId } = request.params as { areaId: string };
    const area = bundle.actionZones.find((zone) => zone.id === areaId);
    if (area === undefined) return reply.code(404).send({ status: 'not_found' });
    const sourceRecords = bundle.officialOccurrences.filter((record) => record.speciesId === area.speciesId);
    return {
      id: area.id,
      status: areaStatus(area.evidence.cells.map((cell) => cell.status)),
      evidence: area.evidence.cells,
      provenance: sourceRecords.map(({ datasetId, provider, sourceUrl, licence, attribution, importRunId, sourceRecordId }) => ({ datasetId, provider, sourceUrl, licence, attribution, importRunId, sourceRecordId })),
    };
  });
}

function areaStatus(statuses: readonly ('known' | 'watch' | 'emerging' | 'none')[]): 'known' | 'watch' | 'emerging' | 'none' {
  for (const status of ['known', 'watch', 'emerging', 'none'] as const) {
    if (statuses.includes(status)) {
      return status;
    }
  }
  throw new Error('An action zone must contain at least one evidence-cell status.');
}
