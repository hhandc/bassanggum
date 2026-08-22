import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

describe('GET /map/layers', () => {
  it('returns an action-zone feature with top species but no private coordinate', async () => {
    const app = buildServer();
    const body = (await app.inject('/map/layers?category=fish')).json();

    expect(body.actionZones.features[0].properties.topSpecies).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('private_location');

    await app.close();
  });

  it('rejects unsupported layer filters', async () => {
    const app = buildServer();

    const response = await app.inject('/map/layers?category=bird');

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
