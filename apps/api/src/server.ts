import Fastify from 'fastify';
import { importDemoSnapshots } from '@bassanggum/data-core';
import { fileURLToPath } from 'node:url';

import { registerAreaRoutes } from './routes/areas.js';
import { registerEventRoutes } from './routes/events.js';
import { registerMapRoutes } from './routes/map.js';
import { registerSpeciesRoutes } from './routes/species.js';

export function buildServer() {
  const app = Fastify();
  const bundle = importDemoSnapshots(fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url)));

  app.get('/health', () => ({ status: 'ok' }));
  registerMapRoutes(app, bundle);
  registerAreaRoutes(app, bundle);
  registerSpeciesRoutes(app, bundle);
  registerEventRoutes(app, bundle);

  return app;
}
