import { importDemoSnapshots } from '@bassanggum/data-core';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const demoDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));

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
});
