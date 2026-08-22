import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchMapLayers, getApiBaseUrl } from '../lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getApiBaseUrl', () => {
  it('uses the local API when the public API base URL is empty', () => {
    expect(getApiBaseUrl('')).toBe('http://localhost:3001');
  });
});

describe('fetchMapLayers', () => {
  it('adds viewport bounds and zoom to the map request', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => ({}), ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    await fetchMapLayers({ bbox: [128, 36, 129, 37], zoom: 9 });

    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3001/map/layers?bbox=128%2C36%2C129%2C37&zoom=9');
  });
});
