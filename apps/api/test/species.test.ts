import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

describe('GET /species/:speciesId', () => {
  it('returns public bilingual species guidance', async () => {
    const app = buildServer();
    const response = await app.inject('/species/micropterus-salmoides');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: 'micropterus-salmoides', actionPolicy: expect.any(String) });

    await app.close();
  });
});
