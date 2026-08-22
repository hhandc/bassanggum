import { importDemoSnapshots, writePublicBundle } from '@bassanggum/data-core';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadPublicBundle } from '../src/bundle-reader.js';

const demoDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));

function withTemporaryDirectory(test: (directory: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'bassanggum-public-bundle-'));
  return test(directory).finally(() => rmSync(directory, { recursive: true, force: true }));
}

describe('public bundle reader', () => {
  it('rejects a schema-valid manifest that omits a canonical file it serves', async () => {
    await withTemporaryDirectory(async (directory) => {
      await writePublicBundle(importDemoSnapshots(demoDirectory), directory);
      const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as {
        version: number;
        files: string[];
        hashes: Record<string, string>;
      };
      const files = manifest.files.filter((filename) => filename !== 'public-bundle.json');
      const hashes = Object.fromEntries(files.map((filename) => [filename, manifest.hashes[filename]! ]));
      writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify({ version: 1, files, hashes })}\n`);

      expect(() => loadPublicBundle(directory)).toThrow(/public-bundle\.json|canonical/i);
    });
  }, 15_000);
});
