import type { PublicDataBundle } from '@bassanggum/data-core';
import type { FastifyInstance } from 'fastify';

export function registerSpeciesRoutes(app: FastifyInstance, bundle: PublicDataBundle): void {
  app.get('/species', () => bundle.species.map((species) => ({
    id: species.id,
    category: species.category,
    englishName: species.englishName,
    koreanName: species.koreanName,
    scientificName: species.scientificName,
    actionPolicy: species.actionPolicy,
    disposalGuidance: species.disposalGuidance,
    cookingGuidance: species.cookingGuidance,
  })));

  app.get('/species/:speciesId', (request, reply) => {
    const { speciesId } = request.params as { speciesId: string };
    const species = bundle.species.find((record) => record.id === speciesId);
    return species === undefined ? reply.code(404).send({ status: 'not_found' }) : species;
  });
}
