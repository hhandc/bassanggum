import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('documents all no-key judge commands', async () => {
  const readme = await readFile(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf8');
  for (const command of ['pnpm install', 'pnpm demo:data', 'pnpm mcp', 'pnpm test']) {
    expect(readme).toContain(command);
  }
});
