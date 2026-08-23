import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

describe('GET /health', () => {
  it('returns service health', async () => {
    const app = buildServer();

    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });

    await app.close();
  });

  it('allows the local PWA origin to call the API', async () => {
    const app = buildServer();

    const response = await app.inject({ method: 'GET', url: '/map/layers', headers: { origin: 'http://localhost:3000' } });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    await app.close();
  });

});
