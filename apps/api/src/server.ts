import Fastify from 'fastify';

export function buildServer() {
  const app = Fastify();

  app.get('/health', () => ({ status: 'ok' }));

  return app;
}
