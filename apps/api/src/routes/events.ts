import type { PublicDataBundle } from '@bassanggum/data-core';
import type { FastifyInstance } from 'fastify';

export function registerEventRoutes(app: FastifyInstance, bundle: PublicDataBundle): void {
  app.get('/events', () => ({ events: bundle.verifiedEvents }));
}
