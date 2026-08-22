import { importDemoSnapshots } from '@bassanggum/data-core';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const demoDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));

function withCopiedDemoSnapshots(test: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'bassanggum-demo-'));
  cpSync(demoDirectory, directory, { recursive: true });
  try {
    test(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function payloadChecksum(payload: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

describe('demo snapshot import', () => {
  it('imports the attributed synthetic snapshots into the public bundle contract', () => {
    const bundle = importDemoSnapshots(demoDirectory);

    expect(bundle.species).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'lepomis-macrochirus', category: 'fish', koreanName: '블루길' }),
        expect.objectContaining({ id: 'sicyos-angulatus', category: 'plant', koreanName: '가시박' }),
      ]),
    );
    expect(bundle.officialOccurrences).toHaveLength(2);
    expect(bundle.officialOccurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'official:ecobank-demo-fish-v1:demo-fish-001',
          observedAt: '2024-06-15T00:00:00.000Z',
        }),
      ]),
    );
    expect(bundle.habitatAreas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'official:ecobank-demo-habitat-v1:demo-habitat-001',
          frequencyBand: 'frequent',
        }),
      ]),
    );
    expect(bundle.waterbodies).toEqual([]);
    expect(bundle.restrictedAreas).toEqual([]);
    expect(bundle.verifiedCommunitySignals).toEqual([]);
    expect(bundle.verifiedEvents).toEqual([]);
  });

  it('runs pnpm demo:data without source credentials and writes the public bundle', () => {
    const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const outputPath = fileURLToPath(new URL('../../../data/normalized/public-bundle.json', import.meta.url));

    execFileSync('pnpm', ['demo:data'], {
      cwd: workspaceRoot,
      env: { ...process.env, CI: 'true' },
      stdio: 'pipe',
    });

    expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(
      expect.objectContaining({
        officialOccurrences: expect.arrayContaining([expect.objectContaining({ speciesId: 'lepomis-macrochirus' })]),
        habitatAreas: expect.arrayContaining([expect.objectContaining({ frequencyBand: 'frequent' })]),
      }),
    );
  });

  it('rejects a snapshot whose records no longer match its declared checksum', () => {
    withCopiedDemoSnapshots((directory) => {
      const path = join(directory, 'ecobank-fish.json');
      const snapshot = JSON.parse(readFileSync(path, 'utf8')) as { records: Array<Record<string, unknown>> };
      snapshot.records[0]!.longitude = '128.7000';
      writeFileSync(path, `${JSON.stringify(snapshot)}\n`);

      expect(() => importDemoSnapshots(directory)).toThrow(/checksum/i);
    });
  });

  it('rejects a correctly checksummed bird row appended to a fish snapshot', () => {
    withCopiedDemoSnapshots((directory) => {
      const path = join(directory, 'ecobank-fish.json');
      const snapshot = JSON.parse(readFileSync(path, 'utf8')) as {
        source: { checksum: string };
        records: Array<Record<string, unknown>>;
      };
      snapshot.records.push({
        sourceRecordId: 'demo-bird-001',
        koreanName: '큰까마귀',
        scientificName: 'Corvus corax',
        longitude: 128.5993,
        latitude: 36.5715,
        observedAt: '2024-06-16',
      });
      snapshot.source.checksum = payloadChecksum(snapshot.records);
      writeFileSync(path, `${JSON.stringify(snapshot)}\n`);

      const bundle = importDemoSnapshots(directory);

      expect(bundle.officialOccurrences).toHaveLength(2);
      expect(bundle.species).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'corvus-corax' })]));
    });
  });
});
