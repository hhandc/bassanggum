import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

describe('GET /areas/:areaId', () => {
  it('explains a known area score using provenance', async () => {
    const app = buildServer();
    const layers = (await app.inject('/map/layers?category=fish')).json();
    const areaId = layers.actionZones.features[0].properties.id;
    const body = (await app.inject(`/areas/${areaId}`)).json();

    expect(body).toMatchObject({ status: expect.any(String), evidence: expect.any(Array), provenance: expect.any(Array) });

    await app.close();
  });
});
