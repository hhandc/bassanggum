import type { PublicDataBundle } from '@bassanggum/data-core';
import type { FastifyInstance } from 'fastify';

export function registerSpeciesRoutes(app: FastifyInstance, bundle: PublicDataBundle): void {
  app.get('/species/:speciesId', (request, reply) => {
    const { speciesId } = request.params as { speciesId: string };
    const species = bundle.species.find((record) => record.id === speciesId);
    return species === undefined ? reply.code(404).send({ status: 'not_found' }) : species;
  });
}
