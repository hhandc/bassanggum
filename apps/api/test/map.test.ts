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

  it('rejects malformed or inverted viewport bounds', async () => {
    const app = buildServer();

    expect((await app.inject('/map/layers?bbox=128,36,bad,37')).statusCode).toBe(400);
    expect((await app.inject('/map/layers?bbox=129,36,128,37')).statusCode).toBe(400);
    await app.close();
  });

  it('omits geometry outside the requested viewport', async () => {
    const app = buildServer();
    const body = (await app.inject('/map/layers?bbox=0,0,0.1,0.1&zoom=9')).json();

    expect(body.actionZones.features).toHaveLength(0);
    expect(body.restrictedAreas.features).toHaveLength(0);
    await app.close();
  });

  it('returns restricted-area polygons separately from bounty action zones', async () => {
    const app = buildServer();
    const body = (await app.inject('/map/layers')).json();

    expect(body.restrictedAreas.features).not.toHaveLength(0);
    expect(body.restrictedAreas.features[0].properties).toMatchObject({ restriction: expect.any(String) });
    await app.close();
  });

  it('limits protected-area rings in the map response so the mobile map can render them promptly', async () => {
    const app = buildServer();
    const body = (await app.inject('/map/layers')).json();

    expect(body.restrictedAreas.features.every((feature: { geometry: { coordinates: unknown } }) => everyRingHasAtMost(feature.geometry.coordinates, 24))).toBe(true);
    await app.close();
  });

  it('excludes no-signal analysis cells from the bounty map', async () => {
    const app = buildServer();
    const body = (await app.inject('/map/layers')).json();

    expect(body.actionZones.features.every((feature: { properties: { evidence: { cells: Array<{ status: string }> } } }) => feature.properties.evidence.cells.some((cell) => cell.status !== 'none'))).toBe(true);
    await app.close();
  });
});

function everyRingHasAtMost(coordinates: unknown, limit: number): boolean {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return true;
  if (Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') return coordinates.length <= limit;
  return coordinates.every((coordinate) => everyRingHasAtMost(coordinate, limit));
}
