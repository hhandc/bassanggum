import { importDemoSnapshots, isWithinGyeongbuk } from '@bassanggum/data-core';
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

function rawSnapshot(filename: string): { source: Record<string, unknown>; records: Array<Record<string, string>>; audit: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(demoDirectory, filename), 'utf8')) as {
    source: Record<string, unknown>;
    records: Array<Record<string, string>>;
    audit: Record<string, unknown>;
  };
}

describe('demo snapshot import', () => {
  it('keeps only valid Gyeongbuk fish and plant workbook rows in the bounded source snapshot', () => {
    const snapshot = rawSnapshot('ecosystem-disturbing-organisms-gyeongbuk-2016-2024.json');

    expect(snapshot.records).toHaveLength(4780);
    expect(snapshot.records.every((record) => record.시도명 === '경상북도')).toBe(true);
    expect(snapshot.records.every((record) => record.분류군명 === '어류' || record.분류군명 === '식물')).toBe(true);
    expect(snapshot.records.every((record) => Number.isFinite(Number(record.위도)) && Number.isFinite(Number(record.경도)))).toBe(true);
    expect(snapshot.records.every((record) => isWithinGyeongbuk([Number(record.경도), Number(record.위도)]))).toBe(true);
    expect(snapshot.source.sourceFileChecksum).toBe('sha256:090f97e42d3157cb37b4cb68a1d548f03387f3d2f77c27af10c9704fe6c570f9');
  });

  it('keeps all NIE Gyeongbuk fish rows but audits the catalogue filter separately', () => {
    const snapshot = rawSnapshot('nie-alien-fish-gyeongbuk-2015-2022.json');

    expect(snapshot.records).toHaveLength(251);
    expect(snapshot.records.every((record) => record.시도명 === '경상북도')).toBe(true);
    expect(snapshot.records.every((record) => Number.isFinite(Number(record.위도)) && Number.isFinite(Number(record.경도)))).toBe(true);
    expect(snapshot.source).toMatchObject({
      datasetId: 'RSD_0000000000012824',
      doi: '10.22756/ASD.20240000000888',
      publishedAt: '2024-09-20',
      sourceFileChecksum: 'sha256:f606443c122380949f9785876b60c48762f88e3f4cf8c8e6101f9eceb5628558',
    });
    expect(snapshot.audit).toMatchObject({
      publishedRowsAfterCuratedFishFilter: 231,
      rejectedRowsNotInCuratedDisturbanceCatalogue: 20,
      rejectedSpeciesCounts: { '떡붕어': 18, '잉어': 2 },
    });
  });

  it('imports the two attributed Gyeongbuk source snapshots into the public bundle contract', () => {
    const bundle = importDemoSnapshots(demoDirectory);

    expect(bundle.species).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'micropterus-salmoides', category: 'fish', koreanName: '배스' }),
        expect.objectContaining({ id: 'lepomis-macrochirus', category: 'fish', koreanName: '블루길' }),
        expect.objectContaining({ id: 'sicyos-angulatus', category: 'plant', koreanName: '가시박' }),
      ]),
    );
    expect(bundle.officialOccurrences).toHaveLength(5011);
    expect(bundle.officialOccurrences.filter((record) => record.datasetId === '15022461')).toHaveLength(4780);
    expect(bundle.officialOccurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'official:15022461:O20200113000746',
          datasetId: '15022461',
          sourceRecordId: 'O20200113000746',
        }),
        expect.objectContaining({
          id: 'official:RSD_0000000000012824:ALSP_000000000007280',
          datasetId: 'RSD_0000000000012824',
          doi: '10.22756/ASD.20240000000888',
          snapshotChecksum: expect.stringMatching(/^sha256:/),
        }),
      ]),
    );
    expect(bundle.habitatAreas).toEqual([]);
    expect(bundle.waterbodies).toEqual([]);
    expect(bundle.restrictedAreas).toEqual([]);
    expect(bundle.verifiedCommunitySignals).toEqual([]);
    expect(bundle.verifiedEvents).toEqual([]);
    expect(bundle.species).toHaveLength(15);
    expect(new Set(bundle.species.map((species) => species.koreanName))).toEqual(
      new Set([
        '배스', '블루길', '환삼덩굴', '돼지풀', '미국쑥부쟁이', '가시상추', '가시박', '단풍잎돼지풀',
        '애기수영', '털물참새피', '물참새피', '도깨비가지', '양미역취', '서양금혼초', '물여뀌바늘',
      ]),
    );
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
        officialOccurrences: expect.arrayContaining([
          expect.objectContaining({ datasetId: '15022461' }),
          expect.objectContaining({ datasetId: 'RSD_0000000000012824' }),
        ]),
        habitatAreas: [],
      }),
    );
  }, 15_000);

  it('rejects a source snapshot whose records no longer match its declared checksum', () => {
    withCopiedDemoSnapshots((directory) => {
      const path = join(directory, 'ecosystem-disturbing-organisms-gyeongbuk-2016-2024.json');
      const snapshot = JSON.parse(readFileSync(path, 'utf8')) as { records: Array<Record<string, unknown>> };
      snapshot.records[0]!.longitude = '128.7000';
      writeFileSync(path, `${JSON.stringify(snapshot)}\n`);

      expect(() => importDemoSnapshots(directory)).toThrow(/checksum/i);
    });
  });

  it('does not publish a correctly checksummed non-catalogue fish from the NIE snapshot', () => {
    withCopiedDemoSnapshots((directory) => {
      const path = join(directory, 'nie-alien-fish-gyeongbuk-2015-2022.json');
      const snapshot = JSON.parse(readFileSync(path, 'utf8')) as {
        source: { checksum: string };
        records: Array<Record<string, unknown>>;
      };
      snapshot.records.push({
        id: 'ALSP_000000000000001',
        ktsn: '120000000000',
        한글보통명: '잉어',
        학명: 'Cyprinus carpio',
        조사연도: '2020',
        위도: '35.72669444',
        경도: '128.9340556',
        시도명: '경상북도',
      });
      snapshot.source.checksum = payloadChecksum(snapshot.records);
      writeFileSync(path, `${JSON.stringify(snapshot)}\n`);

      const bundle = importDemoSnapshots(directory);

      expect(bundle.officialOccurrences).toHaveLength(5011);
      expect(bundle.species).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'cyprinus-carpio' })]));
    });
  });
});
