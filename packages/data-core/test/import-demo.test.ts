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
const lakeSourceDirectory = '/Users/hyeonhongchang/Downloads/N3A_E0052114';
const riverSourceDirectory = '/Users/hyeonhongchang/Downloads/N3L_E0020000';
const forestSourceDirectory = '/Users/hyeonhongchang/Downloads/47';

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

function generateLakeSnapshot(sourceDirectory: string, outputDirectory: string): ReturnType<typeof rawFeatureSnapshot> {
  execFileSync('python3', ['scripts/prepare-demo-snapshots.py', '--lakes-only', sourceDirectory, outputDirectory], {
    cwd: workspaceRoot,
    stdio: 'pipe',
  });
  return JSON.parse(readFileSync(join(outputDirectory, 'national-base-map-lakes-gyeongbuk-2024.geojson'), 'utf8')) as ReturnType<typeof rawFeatureSnapshot>;
}

function generateRiverSnapshot(sourceDirectory: string, outputDirectory: string): ReturnType<typeof rawFeatureSnapshot> {
  execFileSync('python3', ['scripts/prepare-demo-snapshots.py', '--rivers-only', sourceDirectory, outputDirectory], {
    cwd: workspaceRoot,
    stdio: 'pipe',
  });
  return JSON.parse(readFileSync(join(outputDirectory, 'national-base-map-rivers-gyeongbuk-2024.geojson'), 'utf8')) as ReturnType<typeof rawFeatureSnapshot>;
}

function generateForestSnapshot(sourceDirectory: string, outputDirectory: string): ReturnType<typeof rawFeatureSnapshot> {
  execFileSync('python3', ['scripts/prepare-demo-snapshots.py', '--forests-only', sourceDirectory, outputDirectory], {
    cwd: workspaceRoot,
    stdio: 'pipe',
  });
  return JSON.parse(readFileSync(join(outputDirectory, 'gyeongbuk-forest-habitat-zones-2025.geojson'), 'utf8')) as ReturnType<typeof rawFeatureSnapshot>;
}

function writeForestFixtureSource(directory: string): void {
  const projection = 'PROJCS["KGD2002_Unified_Coordinate_System",PARAMETER["Central_Meridian",127.5]]';
  const cp949 = (value: string) => Buffer.from({
    '갱신년도': 'b0bbbdc5b3e2b5b5',
    '침엽수림': 'c4a7bfb1bcf6b8b2',
    '곰솔': 'b0f5bcd6',
  }[value] ?? Buffer.from(value).toString('hex'), 'hex');
  const fields = [
    ['FRTP_CD', 8],
    ['FRTP_NM', 120],
    ['KOFTR_GROU', 8],
    ['KOFTR_NM', 120],
    ['갱신년도', 8],
  ] as const;
  const rowLength = 1 + fields.reduce((total, [, length]) => total + length, 0);
  const headerLength = 32 + fields.length * 32 + 1;
  const dbf = Buffer.alloc(headerLength + rowLength * 2 + 1);
  dbf[0] = 3;
  dbf.writeUInt32LE(2, 4);
  dbf.writeUInt16LE(headerLength, 8);
  dbf.writeUInt16LE(rowLength, 10);
  fields.forEach(([name, length], index) => {
    const offset = 32 + index * 32;
    cp949(name).copy(dbf, offset);
    dbf[offset + 11] = 'C'.charCodeAt(0);
    dbf[offset + 16] = length;
  });
  dbf[32 + fields.length * 32] = 0x0d;
  for (let record = 0; record < 2; record += 1) {
    let offset = headerLength + record * rowLength;
    dbf[offset] = 0x20;
    offset += 1;
    for (const [value, length] of [['1', 8], ['침엽수림', 120], ['15', 8], ['곰솔', 120], ['2017', 8]] as const) {
      cp949(value).copy(dbf, offset);
      offset += length;
    }
  }
  dbf[dbf.length - 1] = 0x1a;

  const points: Array<[number, number]> = [
    [1_176_220, 1_861_390], [1_176_360, 1_861_390], [1_176_360, 1_861_520], [1_176_220, 1_861_520], [1_176_220, 1_861_390],
  ];
  const createShp = (records: readonly (readonly (readonly number[])[])[]) => {
    const contents = records.map((record) => {
      const content = Buffer.alloc(128);
      const longitudes = record.map(([longitude]) => longitude!);
      const latitudes = record.map(([, latitude]) => latitude!);
      content.writeInt32LE(5, 0);
      content.writeDoubleLE(Math.min(...longitudes), 4);
      content.writeDoubleLE(Math.min(...latitudes), 12);
      content.writeDoubleLE(Math.max(...longitudes), 20);
      content.writeDoubleLE(Math.max(...latitudes), 28);
      content.writeInt32LE(1, 36);
      content.writeInt32LE(record.length, 40);
      content.writeInt32LE(0, 44);
      record.forEach(([longitude, latitude], index) => {
        content.writeDoubleLE(longitude!, 48 + index * 16);
        content.writeDoubleLE(latitude!, 56 + index * 16);
      });
      return content;
    });
    const shp = Buffer.alloc(100 + contents.reduce((total, content) => total + 8 + content.length, 0));
    shp.writeInt32BE(9994, 0);
    shp.writeInt32BE(shp.length / 2, 24);
    shp.writeInt32LE(1000, 28);
    shp.writeInt32LE(5, 32);
    let offset = 100;
    contents.forEach((content, index) => {
      shp.writeInt32BE(index + 1, offset);
      shp.writeInt32BE(content.length / 2, offset + 4);
      content.copy(shp, offset + 8);
      offset += 8 + content.length;
    });
    return shp;
  };
  const shiftedPoints = points.map(([longitude, latitude]) => [longitude + 500, latitude]);
  const reversedOpenPoints = [...points.slice(0, -1)].reverse();
  const rotatedReversedPoints = [...reversedOpenPoints.slice(2), ...reversedOpenPoints.slice(0, 2)];
  rotatedReversedPoints.push(rotatedReversedPoints[0]!);

  for (const shard of ['47_1', '47_2']) {
    writeFileSync(join(directory, `${shard}.dbf`), dbf);
    writeFileSync(join(directory, `${shard}.shp`), createShp(shard === '47_1' ? [points, rotatedReversedPoints] : [points, shiftedPoints]));
    writeFileSync(join(directory, `${shard}.prj`), projection);
    writeFileSync(join(directory, `${shard}.shx`), Buffer.alloc(100));
  }
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

function geometryPositions(coordinates: unknown): Array<[number, number]> {
  if (!Array.isArray(coordinates)) {
    return [];
  }
  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    return [[coordinates[0], coordinates[1]]];
  }
  return coordinates.flatMap(geometryPositions);
}

function geodesicDistanceMetres([startLongitude, startLatitude]: [number, number], [endLongitude, endLatitude]: [number, number]): number {
  const latitudeDelta = (endLatitude - startLatitude) * Math.PI / 180;
  const longitudeDelta = (endLongitude - startLongitude) * Math.PI / 180;
  const startLatitudeRadians = startLatitude * Math.PI / 180;
  const endLatitudeRadians = endLatitude * Math.PI / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitudeRadians) * Math.cos(endLatitudeRadians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lineLengthMetres(coordinates: unknown): number {
  const positions = geometryPositions(coordinates);
  return positions.slice(1).reduce((total, position, index) => total + geodesicDistanceMetres(positions[index]!, position), 0);
}

describe('demo snapshot import', () => {
  it('keeps simplified Gyeongbuk forest habitat geometry from both shards with source forest attributes and no official place names', () => {
    const snapshot = rawFeatureSnapshot('gyeongbuk-forest-habitat-zones-2025.geojson');

    expect(snapshot.features).not.toHaveLength(0);
    expect(new Set(snapshot.features.map((feature) => feature.properties.sourceShard))).toEqual(new Set(['47_1', '47_2']));
    expect(snapshot.features.every((feature) => feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')).toBe(true);
    expect(snapshot.features.every((feature) => geometryPositions(feature.geometry.coordinates).every(isWithinGyeongbuk))).toBe(true);
    expect(snapshot.features.every((feature) =>
      typeof feature.properties.sourceRecordId === 'string' &&
      typeof feature.properties.FRTP_NM === 'string' && feature.properties.FRTP_NM.trim() !== '' &&
      typeof feature.properties.KOFTR_NM === 'string' && feature.properties.KOFTR_NM.trim() !== '' &&
      typeof feature.properties.updatedYear === 'string',
    )).toBe(true);
    expect(snapshot.features.every((feature) => !('name' in feature.properties) || feature.properties.nameSource === 'derived')).toBe(true);
    expect(snapshot.source).toMatchObject({
      datasetId: 'GYEONGBUK-FOREST-HABITAT-47-2025',
      sourceFileChecksum: expect.stringMatching(/^sha256:/),
    });
    expect(snapshot.audit).toMatchObject({
      sourceShards: ['47_1', '47_2'],
      sourceProjection: 'EPSG:5179',
      deduplicatedOverlappingRecords: expect.any(Number),
    });
  });

  it('deduplicates controlled overlapping forest polygons across source shards', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bassanggum-forest-fixture-'));
    const outputDirectory = join(directory, 'output');
    mkdirSync(outputDirectory);
    try {
      writeForestFixtureSource(directory);
      const snapshot = generateForestSnapshot(directory, outputDirectory);

      expect(snapshot.features).toHaveLength(2);
      expect(new Set(snapshot.features.map((feature) => feature.properties.sourceShard))).toEqual(new Set(['47_1', '47_2']));
      expect(snapshot.audit).toMatchObject({ deduplicatedOverlappingRecords: 2 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('clips a forest polygon crossing the Gyeongbuk boundary instead of dropping it', () => {
    const output = execFileSync('python3', ['-c', [
      'import importlib.util, json',
      "spec = importlib.util.spec_from_file_location('prep', 'scripts/prepare-demo-snapshots.py')",
      'module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)',
      "polygon = [[[[129.45, 36.60], [129.75, 36.60], [129.75, 36.80], [129.45, 36.80], [129.45, 36.60]]]]",
      'print(json.dumps(module.clip_polygons_to_gyeongbuk(polygon)))',
    ].join('; ')], { cwd: workspaceRoot, encoding: 'utf8' });
    const polygons = JSON.parse(output) as number[][][][];

    expect(polygons).not.toHaveLength(0);
    expect(geometryPositions(polygons).every(isWithinGyeongbuk)).toBe(true);
  });

  it('regenerates the forest habitat snapshot from both complete EPSG:5179 shard bundles', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bassanggum-forests-output-'));
    try {
      const regenerated = generateForestSnapshot(forestSourceDirectory, directory);
      const committed = rawFeatureSnapshot('gyeongbuk-forest-habitat-zones-2025.geojson');

      expect(regenerated.source.sourceFileChecksum).toBe(committed.source.sourceFileChecksum);
      expect(regenerated.source.checksum).toBe(committed.source.checksum);
      expect(regenerated.features).toHaveLength(committed.features.length);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps only named, Gyeongbuk-clipped EPSG:5179 lake polygons with source provenance', () => {
    const snapshot = rawFeatureSnapshot('national-base-map-lakes-gyeongbuk-2024.geojson');

    expect(snapshot.features).not.toHaveLength(0);
    expect(snapshot.features.every((feature) => feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')).toBe(true);
    expect(snapshot.features.every((feature) => geometryPositions(feature.geometry.coordinates).every(isWithinGyeongbuk))).toBe(true);
    expect(snapshot.features.every((feature) => typeof feature.properties.name === 'string' && feature.properties.name.trim() !== '')).toBe(true);
    expect(snapshot.features.every((feature) => feature.properties.UFID && 'SERV' in feature.properties && 'MARA' in feature.properties && 'MNGT' in feature.properties && 'FMTA' in feature.properties)).toBe(true);
    expect(snapshot.source).toMatchObject({
      datasetId: 'N3A_E0052114',
      sourceFileChecksum: expect.stringMatching(/^sha256:/),
    });
    expect(snapshot.audit).toMatchObject({
      sourceProjection: 'EPSG:5179',
      filter: expect.stringContaining('Gyeongbuk'),
      excludedUnnamedRecords: expect.any(Number),
    });
  });

  it('regenerates the lake source checksum from the complete EPSG:5179 shapefile bundle', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bassanggum-lakes-output-'));
    try {
      const regenerated = generateLakeSnapshot(lakeSourceDirectory, directory);
      const committed = rawFeatureSnapshot('national-base-map-lakes-gyeongbuk-2024.geojson');

      expect(regenerated.source.sourceFileChecksum).toBe(committed.source.sourceFileChecksum);
      expect(regenerated.source.checksum).toBe(committed.source.checksum);
      expect(regenerated.features).toHaveLength(committed.features.length);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps only CP949-decoded named, metric-clipped Gyeongbuk river reaches with stable parent source IDs', () => {
    const snapshot = rawFeatureSnapshot('national-base-map-rivers-gyeongbuk-2024.geojson');

    expect(snapshot.features).not.toHaveLength(0);
    expect(snapshot.features.every((feature) => feature.geometry.type === 'LineString')).toBe(true);
    expect(snapshot.features.every((feature) => geometryPositions(feature.geometry.coordinates).every(isWithinGyeongbuk))).toBe(true);
    expect(snapshot.features.every((feature) => lineLengthMetres(feature.geometry.coordinates) <= 2_000.01)).toBe(true);
    expect(snapshot.features.every((feature) => typeof feature.properties.name === 'string' && feature.properties.name.trim() !== '')).toBe(true);
    expect(snapshot.features.every((feature) =>
      typeof feature.properties.sourceRecordId === 'string' &&
      feature.properties.sourceRecordId === feature.properties.parentSourceRecordId &&
      typeof feature.properties.reachId === 'string',
    )).toBe(true);
    expect(snapshot.source).toMatchObject({
      datasetId: 'N3L_E0020000',
      sourceFileChecksum: expect.stringMatching(/^sha256:/),
    });
    expect(snapshot.audit).toMatchObject({
      sourceProjection: 'EPSG:5179',
      sourceEncoding: 'CP949',
      filter: expect.stringContaining('Gyeongbuk'),
      maximumReachLengthMetres: 2_000,
    });
  });

  it('regenerates the named river snapshot from the complete EPSG:5179 centerline bundle', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bassanggum-rivers-output-'));
    try {
      const regenerated = generateRiverSnapshot(riverSourceDirectory, directory);
      const committed = rawFeatureSnapshot('national-base-map-rivers-gyeongbuk-2024.geojson');

      expect(regenerated.source.sourceFileChecksum).toBe(committed.source.sourceFileChecksum);
      expect(regenerated.source.checksum).toBe(committed.source.checksum);
      expect(regenerated.features.every((feature) => lineLengthMetres(feature.geometry.coordinates) <= 2_000.01)).toBe(true);
      expect(regenerated.features).toEqual(committed.features);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

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

  it('imports the three attributed Gyeongbuk occurrence snapshots, named lakes and river reaches, and KDPA screening boundaries into the public bundle contract', () => {
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
    expect(bundle.waterbodies).not.toHaveLength(0);
    expect(bundle.waterbodies.every((waterbody) => waterbody.kind === 'lake' && waterbody.name.trim() !== '')).toBe(true);
    expect(bundle.waterbodies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringMatching(/^waterbody:N3A_E0052114:/),
        datasetId: 'N3A_E0052114',
        sourceRecordId: expect.any(String),
        snapshotChecksum: expect.stringMatching(/^sha256:/),
      }),
    ]));
    expect(bundle.actionZones).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringMatching(/^action-zone:river:N3L_E0020000:/),
        kind: 'river_segment',
        name: expect.stringMatching(/ — Reach \d+$/),
      }),
    ]));
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
        waterbodies: expect.arrayContaining([
          expect.objectContaining({ datasetId: 'N3A_E0052114', kind: 'lake' }),
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
        expect.objectContaining({
          datasetId: 'N3A_E0052114',
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

  it('rejects a lake snapshot whose features no longer match its declared checksum', () => {
    withCopiedDemoSnapshots((directory) => {
      const path = join(directory, 'national-base-map-lakes-gyeongbuk-2024.geojson');
      const snapshot = JSON.parse(readFileSync(path, 'utf8')) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      snapshot.features[0]!.properties.name = 'tampered lake';
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

  it('keeps KDPA restricted areas and named lake and river context out of hotspot scoring', () => {
    const bundle = importDemoSnapshots(demoDirectory);
    const hotspotCells = calculateHotspotCells({
      now: '2026-08-22T00:00:00.000Z',
      officialOccurrences: bundle.officialOccurrences,
      habitatAreas: bundle.habitatAreas,
      verifiedCommunitySignals: bundle.verifiedCommunitySignals,
      verifiedEvents: bundle.verifiedEvents,
    });
    const withoutLandforms = createActionZones(hotspotCells);

    expect(bundle.restrictedAreas).not.toHaveLength(0);
    expect(bundle.waterbodies).not.toHaveLength(0);
    expect(bundle.actionZones.some((zone) => zone.kind === 'lake' && 'name' in zone)).toBe(true);
    expect(bundle.actionZones.some((zone) => zone.kind === 'river_segment' && 'name' in zone)).toBe(true);
    const scoreTraces = (zones: typeof bundle.actionZones) => zones.flatMap((zone) =>
      zone.evidence.cells.map((cell) => [zone.speciesId, cell.h3Index, cell.score].join('\u0000')),
    ).sort();
    expect(scoreTraces(bundle.actionZones)).toEqual(scoreTraces(withoutLandforms));
  });
});
