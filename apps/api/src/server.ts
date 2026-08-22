import Fastify from 'fastify';
import { importDemoSnapshots } from '@bassanggum/data-core';
import { fileURLToPath } from 'node:url';

import { registerAreaRoutes } from './routes/areas.js';
import { registerEventRoutes } from './routes/events.js';
import { registerMapRoutes } from './routes/map.js';
import { registerSpeciesRoutes } from './routes/species.js';
import { registerReportRoutes } from './routes/reports.js';

export function buildServer() {
  const app = Fastify();
  const bundle = importDemoSnapshots(fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url)));

  app.addHook('onRequest', (request, reply, done) => {
    if (request.headers.origin === 'http://localhost:3000') {
      reply.header('access-control-allow-origin', 'http://localhost:3000');
      reply.header('access-control-allow-headers', 'content-type');
    }
    if (request.method === 'OPTIONS') return reply.code(204).send();
    done();
  });

  app.get('/health', () => ({ status: 'ok' }));
  registerMapRoutes(app, bundle);
  registerAreaRoutes(app, bundle);
  registerSpeciesRoutes(app, bundle);
  registerEventRoutes(app, bundle);
  registerReportRoutes(app, bundle);

  return app;
}
