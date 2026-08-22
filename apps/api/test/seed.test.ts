import { describe, expect, it } from 'vitest';

import { createMemorySeedRepository, seedPublicBundle } from '../src/db/seed.js';

describe('public bundle seed', () => {
  it('imports action zones and their source provenance without duplication', async () => {
    const repository = createMemorySeedRepository();
    const bundlePath = new URL('../../../data/raw/demo', import.meta.url).pathname;

    const first = await seedPublicBundle(bundlePath, repository);
    const second = await seedPublicBundle(bundlePath, repository);

    expect(first.areas).toBeGreaterThan(0);
    expect(first.dataSources).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(repository.dataSources[0]).toMatchObject({ datasetId: expect.any(String) });
  });
});
