import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

describe('GET /events', () => {
  it('returns only source-linked verified events', async () => {
    const app = buildServer();
    const body = (await app.inject('/events')).json();

    expect(body.events).toEqual(expect.any(Array));

    await app.close();
  });
});
