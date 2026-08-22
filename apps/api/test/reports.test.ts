import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

describe('POST /reports', () => {
  it('auto-verifies a fixture fish removal', async () => {
    const app = buildServer();
    const response = await app.inject({ method: 'POST', url: '/reports', payload: { type: 'removal', speciesId: 'micropterus-salmoides', deviceToken: 'device-a', location: [128.6, 36.57], mediaToken: 'fixture:target' } });
    expect(response.json()).toMatchObject({ status: 'auto_verified', verifiedUnits: 1 });
    await app.close();
  });

  it('routes low-confidence classification to review', async () => {
    const app = buildServer();
    const response = await app.inject({ method: 'POST', url: '/reports', payload: { type: 'sighting', speciesId: 'micropterus-salmoides', deviceToken: 'device-a', location: [128.6, 36.57], mediaToken: 'fixture:low-confidence' } });
    expect(response.json()).toMatchObject({ status: 'needs_review', pointsAwarded: 0 });
    await app.close();
  });

  it('identifies a plant report with the plant classifier fixture', async () => {
    const app = buildServer();
    const response = await app.inject({ method: 'POST', url: '/reports', payload: { type: 'sighting', speciesId: 'sicyos-angulatus', deviceToken: 'device-a', location: [128.6, 36.57], mediaToken: 'fixture:plant-target' } });
    expect(response.json()).toMatchObject({ status: 'auto_verified', identification: { speciesId: 'sicyos-angulatus', confidence: 0.95 } });
    await app.close();
  });

  it('does not auto-verify evidence identified as a different target species', async () => {
    const app = buildServer();
    const response = await app.inject({ method: 'POST', url: '/reports', payload: { type: 'sighting', speciesId: 'lepomis-macrochirus', deviceToken: 'device-a', location: [128.6, 36.57], mediaToken: 'fixture:target' } });
    expect(response.json()).toMatchObject({ status: 'needs_review', verifiedUnits: 0, identification: { speciesId: 'micropterus-salmoides' } });
    await app.close();
  });

  it('rejects a removal inside a restricted area', async () => {
    const app = buildServer();
    const response = await app.inject({ method: 'POST', url: '/reports', payload: { type: 'removal', speciesId: 'micropterus-salmoides', deviceToken: 'device-a', location: [128.81135, 36.9697], mediaToken: 'fixture:target' } });
    expect(response.json()).toMatchObject({ status: 'rejected', reason: 'restricted_area' });
    await app.close();
  });

  it('rejects a report outside Gyeongbuk', async () => {
    const app = buildServer();
    const response = await app.inject({ method: 'POST', url: '/reports', payload: { type: 'sighting', speciesId: 'micropterus-salmoides', deviceToken: 'device-a', location: [126.98, 37.57], mediaToken: 'fixture:target' } });
    expect(response.json()).toMatchObject({ status: 'rejected', reason: 'outside_gyeongbuk' });
    await app.close();
  });

  it('returns a report only to its submitting device', async () => {
    const app = buildServer();
    const created = (await app.inject({ method: 'POST', url: '/reports', payload: { type: 'sighting', speciesId: 'micropterus-salmoides', deviceToken: 'device-a', location: [128.6, 36.57], mediaToken: 'fixture:target' } })).json();
    const response = await app.inject(`/reports/${created.id}?deviceToken=device-a`);
    expect(response.json()).toMatchObject({ id: created.id, status: 'auto_verified' });
    expect((await app.inject(`/reports/${created.id}?deviceToken=device-b`)).statusCode).toBe(404);
    await app.close();
  });
});
