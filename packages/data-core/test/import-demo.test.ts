import { calculateHotspotCells, createActionZones, importDemoSnapshots, isWithinGyeongbuk, scoringOccurrences } from '@bassanggum/data-core';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const demoDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const kdpaSourceDirectory = '/Users/hyeonhongchang/Downloads/2025_ver';

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

function generateKdpaSnapshot(sourceDirectory: string, outputDirectory: string): ReturnType<typeof rawFeatureSnapshot> {
  execFileSync('python3', ['scripts/prepare-demo-snapshots.py', '--kdpa-only', sourceDirectory, outputDirectory], {
    cwd: workspaceRoot,
    stdio: 'pipe',
  });
  return JSON.parse(readFileSync(join(outputDirectory, 'kdpa-protected-areas-oecm-gyeongbuk-2025.geojson'), 'utf8')) as ReturnType<typeof rawFeatureSnapshot>;
}

function withCopiedKdpaSourceBundle(test: (sourceDirectory: string, outputDirectory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'bassanggum-kdpa-source-'));
  const sourceDirectory = join(directory, 'source');
  const outputDirectory = join(directory, 'output');
  cpSync(kdpaSourceDirectory, sourceDirectory, { recursive: true });
  mkdirSync(outputDirectory);
  try {
    test(sourceDirectory, outputDirectory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function yearlyCoordinateKey(record: { speciesId: string; observedAt?: string | undefined; geometry: { coordinates: [number, number] | [number, number, number] } }): string {
  const [longitude, latitude] = record.geometry.coordinates;
  const normalizeCoordinate = (coordinate: number) => (Math.round(coordinate * 1_000_000) / 1_000_000).toFixed(6);
  return [record.speciesId, record.observedAt?.slice(0, 4), normalizeCoordinate(longitude), normalizeCoordinate(latitude)].join('\u0000');
}

function rawSnapshot(filename: string): { source: Record<string, unknown>; records: Array<Record<string, string>>; audit: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(demoDirectory, filename), 'utf8')) as {
    source: Record<string, unknown>;
    records: Array<Record<string, string>>;
    audit: Record<string, unknown>;
  };
}

function rawFeatureSnapshot(filename: string): {
  source: Record<string, unknown>;
  features: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }>;
  audit: Record<string, unknown>;
} {
  return JSON.parse(readFileSync(join(demoDirectory, filename), 'utf8')) as {
    source: Record<string, unknown>;
    features: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }>;
    audit: Record<string, unknown>;
  };
}

describe('demo snapshot import', () => {
  it('keeps only KDPA KR-47 protected-area boundaries with complete source attribution', () => {
    const snapshot = rawFeatureSnapshot('kdpa-protected-areas-oecm-gyeongbuk-2025.geojson');

    expect(snapshot.features).not.toHaveLength(0);
    expect(snapshot.features.every((feature) => feature.properties.subLocation === 'KR-47')).toBe(true);
    expect(snapshot.features.every((feature) => feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')).toBe(true);
    expect(snapshot.source).toMatchObject({
      datasetId: 'KDPA-PROTECTED-AREAS-OECM-KR-2025',
      sourceUrl: 'https://www.kdpa.kr/',
      attribution: expect.stringContaining('KDPA'),
      sourceFileChecksum: expect.stringMatching(/^sha256:/),
    });
    expect(snapshot.features[0]?.properties.sourceRecordId).toEqual(expect.any(String));
  });

  it('regenerates KDPA provenance when only the DBF component is tampered with', () => {
    withCopiedKdpaSourceBundle((sourceDirectory, outputDirectory) => {
      const original = generateKdpaSnapshot(sourceDirectory, outputDirectory);
      const dbfPath = join(sourceDirectory, 'Protected_areas_OECM_Republic_of_Korea_ver_2025.dbf');
      const dbf = readFileSync(dbfPath);
      const originalName = Buffer.from('Baekdudaegan National Aboretum', 'ascii');
      const offset = dbf.indexOf(originalName);
      expect(offset).toBeGreaterThanOrEqual(0);
      dbf[offset] = 'X'.charCodeAt(0);
      writeFileSync(dbfPath, dbf);

      const regenerated = generateKdpaSnapshot(sourceDirectory, outputDirectory);

      expect(regenerated.source.sourceFileChecksum).not.toBe(original.source.sourceFileChecksum);
      expect(regenerated.features[0]?.properties.name).toBe('Xaekdudaegan National Aboretum');
    });
  }, 30_000);

  it('regenerates KDPA provenance when only the SHX component is tampered with', () => {
    withCopiedKdpaSourceBundle((sourceDirectory, outputDirectory) => {
      const original = generateKdpaSnapshot(sourceDirectory, outputDirectory);
      const shxPath = join(sourceDirectory, 'Protected_areas_OECM_Republic_of_Korea_ver_2025.shx');
      const shx = readFileSync(shxPath);
      writeFileSync(shxPath, Buffer.concat([shx, Buffer.from([0])]));

      const regenerated = generateKdpaSnapshot(sourceDirectory, outputDirectory);

      expect(regenerated.source.sourceFileChecksum).not.toBe(original.source.sourceFileChecksum);
      expect(regenerated.features).toHaveLength(original.features.length);
      expect(regenerated.features[0]?.properties.sourceRecordId).toBe(original.features[0]?.properties.sourceRecordId);
    });
  }, 30_000);

  it('keeps only valid Gyeongbuk fish and plant workbook rows in the bounded source snapshot', () => {
    const snapshot = rawSnapshot('ecosystem-disturbing-organisms-gyeongbuk-2016-2024.json');

    expect(snapshot.records).toHaveLength(4780);
    expect(snapshot.records.every((record) => record.시도명 === '경상북도')).toBe(true);
    expect(snapshot.records.every((record) => record.분류군명 === '어류' || record.분류군명 === '식물')).toBe(true);
    expect(snapshot.records.every((record) => Number.isFinite(Number(record.위도)) && Number.isFinite(Number(record.경도)))).toBe(true);
    expect(snapshot.records.every((record) => isWithinGyeongbuk([Number(record.경도), Number(record.위도)]))).toBe(true);
    expect(snapshot.source).toMatchObject({
      datasetId: 'RSD_0000000000012894',
      sourceUrl: 'https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012894',
      sourceFileChecksum: 'sha256:090f97e42d3157cb37b4cb68a1d548f03387f3d2f77c27af10c9704fe6c570f9',
    });
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

  it('keeps every gated alien-plant source row and audits the non-curated remainder separately', () => {
    const snapshot = rawSnapshot('nie-alien-plants-gyeongbuk-2015-2021.json');

    expect(snapshot.records).toHaveLength(25_357);
    expect(snapshot.records.every((record) => record.시도명 === '경상북도')).toBe(true);
    expect(snapshot.records.every((record) => Number.isFinite(Number(record.위도)) && Number.isFinite(Number(record.경도)))).toBe(true);
    expect(snapshot.records.every((record) => isWithinGyeongbuk([Number(record.경도), Number(record.위도)]))).toBe(true);
    expect(snapshot.source).toMatchObject({
      datasetId: 'RSD_0000000000012705',
      sourceUrl: 'https://www.nie-ecobank.kr/rdm/rsrchdoi/selectRsrchDtaDtlVw.do?rsrchDtaId=RSD_0000000000012705',
      sourceFileChecksum: 'sha256:6301e0902f81433f6f3cb94f9251f3bf85814b54b91d6c400e7767c674ff471c',
    });
    expect(snapshot.audit).toMatchObject({
      rawGyeongbukLabelledRowsBeforeCategoryFilter: 25_357,
      geographicOnlyRejections: 0,
      publishedRowsAfterCuratedPlantFilter: 2_553,
      rejectedRowsNotInCuratedDisturbanceCatalogue: 22_804,
    });
  });

  it('imports the three attributed Gyeongbuk occurrence snapshots and KDPA screening boundaries into the public bundle contract', () => {
    const bundle = importDemoSnapshots(demoDirectory);

    expect(bundle.species).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'micropterus-salmoides', category: 'fish', koreanName: '배스' }),
        expect.objectContaining({ id: 'lepomis-macrochirus', category: 'fish', koreanName: '블루길' }),
        expect.objectContaining({ id: 'sicyos-angulatus', category: 'plant', koreanName: '가시박' }),
      ]),
    );
    expect(bundle.officialOccurrences).toHaveLength(7564);
    expect(bundle.officialOccurrences.filter((record) => record.datasetId === 'RSD_0000000000012894')).toHaveLength(4780);
    expect(bundle.officialOccurrences.filter((record) => record.datasetId === 'RSD_0000000000012705')).toHaveLength(2553);
    expect(bundle.officialOccurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'official:RSD_0000000000012894:O20200113000746',
          datasetId: 'RSD_0000000000012894',
          sourceRecordId: 'O20200113000746',
          observedAtPrecision: 'year',
        }),
        expect.objectContaining({
          id: 'official:RSD_0000000000012824:ALSP_000000000007280',
          datasetId: 'RSD_0000000000012824',
          doi: '10.22756/ASD.20240000000888',
          snapshotChecksum: expect.stringMatching(/^sha256:/),
        }),
        expect.objectContaining({
          id: 'official:RSD_0000000000012705:53320',
          datasetId: 'RSD_0000000000012705',
          sourceRecordId: '53320',
          observedAt: '2020-10-14T00:00:00.000Z',
          observedAtPrecision: 'date',
        }),
      ]),
    );
    expect(bundle.habitatAreas).toEqual([]);
    expect(bundle.waterbodies).toEqual([]);
    expect(bundle.restrictedAreas).not.toHaveLength(0);
    expect(bundle.restrictedAreas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringMatching(/^restricted:KDPA-PROTECTED-AREAS-OECM-KR-2025:/),
        datasetId: 'KDPA-PROTECTED-AREAS-OECM-KR-2025',
        sourceUrl: 'https://www.kdpa.kr/',
        attribution: expect.stringContaining('KDPA'),
        sourceRecordId: expect.any(String),
        restriction: expect.stringContaining('screening'),
      }),
    ]));
    expect(bundle.verifiedCommunitySignals).toEqual([]);
    expect(bundle.verifiedEvents).toEqual([]);
    expect(bundle.species).toHaveLength(15);
    expect(new Set(bundle.species.map((species) => species.koreanName))).toEqual(
      new Set([
        '배스', '블루길', '환삼덩굴', '돼지풀', '미국쑥부쟁이', '가시상추', '가시박', '단풍잎돼지풀',
        '애기수영', '털물참새피', '물참새피', '도깨비가지', '양미역취', '서양금혼초', '물여뀌바늘',
      ]),
    );
    const speciesById = new Map(bundle.species.map((species) => [species.id, species]));
    const thirdSourceSpecies = new Set(
      bundle.officialOccurrences
        .filter((record) => record.datasetId === 'RSD_0000000000012705')
        .map((record) => record.speciesId),
    );
    expect(thirdSourceSpecies).toHaveLength(13);
    expect([...thirdSourceSpecies].every((speciesId) => {
      const species = speciesById.get(speciesId);
      return species?.category === 'plant' && species.actionPolicy === 'report_only' && species.cookingGuidance === undefined;
    })).toBe(true);
    const scoreable = scoringOccurrences(bundle.officialOccurrences);
    const sourceIdsByYearlyCoordinate = new Map<string, Set<string>>();
    for (const record of bundle.officialOccurrences) {
      const sourceIds = sourceIdsByYearlyCoordinate.get(yearlyCoordinateKey(record)) ?? new Set<string>();
      sourceIds.add(record.datasetId);
      sourceIdsByYearlyCoordinate.set(yearlyCoordinateKey(record), sourceIds);
    }
    expect([...sourceIdsByYearlyCoordinate.values()].filter((sourceIds) => sourceIds.size > 1)).toHaveLength(2561);
    expect(scoreable).toHaveLength(4986);
  });

  it('runs pnpm demo:data without source credentials and writes the public bundle', () => {
    const outputPath = fileURLToPath(new URL('../../../data/normalized/public-bundle.json', import.meta.url));
    const { NODE_OPTIONS: _vitestWorkerNodeOptions, ...subprocessEnvironment } = process.env;

    execFileSync('pnpm', ['demo:data'], {
      cwd: workspaceRoot,
      env: { ...subprocessEnvironment, CI: 'true' },
      stdio: 'pipe',
    });

    expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(
      expect.objectContaining({
        officialOccurrences: expect.arrayContaining([
          expect.objectContaining({ datasetId: 'RSD_0000000000012894' }),
          expect.objectContaining({ datasetId: 'RSD_0000000000012824' }),
          expect.objectContaining({ datasetId: 'RSD_0000000000012705' }),
        ]),
        habitatAreas: [],
        restrictedAreas: expect.arrayContaining([
          expect.objectContaining({ datasetId: 'KDPA-PROTECTED-AREAS-OECM-KR-2025' }),
        ]),
      }),
    );
    expect(JSON.parse(readFileSync(join(workspaceRoot, 'data/normalized/restricted-areas.geojson'), 'utf8'))).toMatchObject({
      type: 'FeatureCollection',
      features: expect.arrayContaining([
        expect.objectContaining({ properties: expect.objectContaining({ datasetId: 'KDPA-PROTECTED-AREAS-OECM-KR-2025' }) }),
      ]),
    });
    expect(JSON.parse(readFileSync(join(workspaceRoot, 'data/normalized/source-catalog.json'), 'utf8'))).toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({
          datasetId: 'KDPA-PROTECTED-AREAS-OECM-KR-2025',
          sourceUrl: 'https://www.kdpa.kr/',
        }),
      ]),
    });
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

  it('rejects a KDPA boundary snapshot whose features no longer match its declared checksum', () => {
    withCopiedDemoSnapshots((directory) => {
      const path = join(directory, 'kdpa-protected-areas-oecm-gyeongbuk-2025.geojson');
      const snapshot = JSON.parse(readFileSync(path, 'utf8')) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      snapshot.features[0]!.properties.name = 'tampered KDPA boundary';
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

      expect(bundle.officialOccurrences).toHaveLength(7564);
      expect(bundle.species).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'cyprinus-carpio' })]));
    });
  });

  it('keeps KDPA restricted areas out of hotspot and action-zone scoring', () => {
    const bundle = importDemoSnapshots(demoDirectory);
    const withoutRestrictedAreas = createActionZones(calculateHotspotCells({
      now: '2026-08-22T00:00:00.000Z',
      officialOccurrences: bundle.officialOccurrences,
      habitatAreas: bundle.habitatAreas,
      verifiedCommunitySignals: bundle.verifiedCommunitySignals,
      verifiedEvents: bundle.verifiedEvents,
    }));

    expect(bundle.restrictedAreas).not.toHaveLength(0);
    expect(bundle.actionZones).toEqual(withoutRestrictedAreas);
  });
});
