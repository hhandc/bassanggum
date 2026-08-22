import { describe, expect, it } from 'vitest';

describe('workspace', () => {
  it('exports the data-core package name', async () => {
    const module = await import('@bassanggum/data-core');
    expect(module.packageName).toBe('@bassanggum/data-core');
  });
});
