import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

describe('GET /health', () => {
  it('returns service health', async () => {
    const app = buildServer();

    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });

    await app.close();
  });
});
