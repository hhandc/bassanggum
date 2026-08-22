import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('workspace', () => {
  it('emits an ESM data-core entry point', async () => {
    await expect(access(new URL('../dist/index.js', import.meta.url))).resolves.toBeUndefined();
  });

  it('exports the data-core package name', async () => {
    const module = await import('@bassanggum/data-core');
    expect(module.packageName).toBe('@bassanggum/data-core');
  });
});
