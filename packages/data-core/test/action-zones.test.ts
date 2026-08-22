import {
  ActionZoneSchema,
  createActionZones,
  importDemoSnapshots,
  type HotspotCell,
  type SuppliedLandform,
} from '@bassanggum/data-core';
import { cellToBoundary, gridDisk, latLngToCell } from 'h3-js';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const h3Index = latLngToCell(36.5715, 128.5993, 8);
const adjacentIndex = gridDisk(h3Index, 1).find((candidate) => candidate !== h3Index);
const separatedIndex = latLngToCell(37.5715, 127.5993, 8);

function hotspotCell(
  index: string,
  speciesId = 'lepomis-macrochirus',
  score = 10,
  privatePoint = [128.599312345, 36.571598765] as [number, number],
): HotspotCell {
  const boundary = cellToBoundary(index, true).map(([longitude, latitude]) => [longitude, latitude] as [number, number]);
  const firstPosition = boundary[0]!;
  return {
    h3Index: index,
    speciesId,
    score,
    status: 'watch',
    evidenceBreakdown: {
      contributingIds: [`official:${speciesId}:${index}`],
      points: [{ type: 'Point', coordinates: privatePoint }],
      officialOccurrences: [{ id: `official:${speciesId}:${index}`, weight: score, point: { type: 'Point', coordinates: privatePoint } }],
      habitatAreas: [],
      verifiedCommunitySignals: [],
      adjacentCells: [],
    },
    geometry: { type: 'Polygon', coordinates: [[...boundary, firstPosition]] },
  };
}

describe('createActionZones', () => {
  it('merges adjacent same-species cells into an unnamed fallback cluster', () => {
    const zones = createActionZones([hotspotCell(h3Index), hotspotCell(adjacentIndex!, 'lepomis-macrochirus', 6)]);

    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({
      kind: 'unnamed_cell_cluster',
      speciesId: 'lepomis-macrochirus',
      score: 16,
      sourceCellIds: [h3Index, adjacentIndex!].sort(),
    });
  });

  it('keeps separated cells in independent fallback clusters', () => {
    const zones = createActionZones([hotspotCell(h3Index), hotspotCell(separatedIndex, 'lepomis-macrochirus', 6)]);

    expect(zones).toHaveLength(2);
    expect(zones.map((zone) => zone.sourceCellIds)).toEqual([[h3Index], [separatedIndex]].sort((left, right) => left[0]!.localeCompare(right[0]!)));
  });

  it('never combines different species even when their cells are identical', () => {
    const zones = createActionZones([
      hotspotCell(h3Index, 'lepomis-macrochirus'),
      hotspotCell(h3Index, 'micropterus-salmoides'),
    ]);

    expect(zones).toHaveLength(2);
    expect(zones.map((zone) => zone.speciesId).sort()).toEqual(['lepomis-macrochirus', 'micropterus-salmoides']);
  });

  it('preserves every source H3 cell ID and its exact score/evidence trace', () => {
    const zones = createActionZones([hotspotCell(h3Index, 'lepomis-macrochirus', 10), hotspotCell(adjacentIndex!, 'lepomis-macrochirus', 6)]);
    const zone = zones[0]!;

    expect(zone.sourceCellIds).toEqual([h3Index, adjacentIndex!].sort());
    expect(zone.evidence.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ h3Index, score: 10, contributingIds: [`official:lepomis-macrochirus:${h3Index}`] }),
        expect.objectContaining({ h3Index: adjacentIndex, score: 6, contributingIds: [`official:lepomis-macrochirus:${adjacentIndex}`] }),
      ]),
    );
  });

  it('does not present a lake as a fish bounty zone', () => {
    const boundary = cellToBoundary(h3Index, true);
    const longitudes = boundary.map(([longitude]) => longitude);
    const latitudes = boundary.map(([, latitude]) => latitude);
    const zones = createActionZones([hotspotCell(h3Index)], [
      {
        id: 'fixture-lake',
        name: 'Fixture Lake',
        kind: 'lake',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [Math.min(...longitudes) - 0.001, Math.min(...latitudes) - 0.001],
              [Math.max(...longitudes) + 0.001, Math.min(...latitudes) - 0.001],
              [Math.max(...longitudes) + 0.001, Math.max(...latitudes) + 0.001],
              [Math.min(...longitudes) - 0.001, Math.max(...latitudes) + 0.001],
              [Math.min(...longitudes) - 0.001, Math.min(...latitudes) - 0.001],
            ],
          ],
        },
      },
    ]);

    expect(zones[0]).toMatchObject({ kind: 'unnamed_cell_cluster', sourceCellIds: [h3Index] });
  });

  it('uses forest type and dominant species as sourced habitat context without treating them as a place name', () => {
    const boundary = cellToBoundary(h3Index, true);
    const longitudes = boundary.map(([longitude]) => longitude);
    const latitudes = boundary.map(([, latitude]) => latitude);
    const zones = createActionZones([hotspotCell(h3Index, 'sicyos-angulatus')], [
      {
        id: 'fixture-forest',
        name: '침엽수림 · 곰솔',
        kind: 'forest_habitat',
        sourceAttributes: { FRTP_NM: '침엽수림', KOFTR_NM: '곰솔', updatedYear: '2017' },
        provenance: {
          datasetId: 'GYEONGBUK-FOREST-HABITAT-47-2025', provider: 'Korea Forest Service', sourceUrl: 'https://map.forest.go.kr/',
          licence: 'Source licence terms were not supplied with the forest-map shapefiles.', attribution: 'Korea Forest Service',
          importRunId: 'gyeongbuk-no-key-import-v1', sourceRecordId: '47_1:000001', snapshotChecksum: 'sha256:snapshot', sourceFileChecksum: 'sha256:source',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [Math.min(...longitudes) - 0.001, Math.min(...latitudes) - 0.001],
            [Math.max(...longitudes) + 0.001, Math.min(...latitudes) - 0.001],
            [Math.max(...longitudes) + 0.001, Math.max(...latitudes) + 0.001],
            [Math.min(...longitudes) - 0.001, Math.max(...latitudes) + 0.001],
            [Math.min(...longitudes) - 0.001, Math.min(...latitudes) - 0.001],
          ]],
        },
      },
    ], new Map([['sicyos-angulatus', 'plant']]));

    expect(zones[0]).toMatchObject({
      kind: 'forest_habitat',
      name: '침엽수림 · 곰솔',
      sourceAttributes: { FRTP_NM: '침엽수림', KOFTR_NM: '곰솔', updatedYear: '2017' },
      provenance: expect.objectContaining({ datasetId: 'GYEONGBUK-FOREST-HABITAT-47-2025', importRunId: 'gyeongbuk-no-key-import-v1', sourceRecordId: '47_1:000001', sourceFileChecksum: 'sha256:source' }),
    });
    expect(zones[0]?.geometry).toEqual({ type: 'MultiPolygon', coordinates: [[
      [
        [Math.min(...longitudes) - 0.001, Math.min(...latitudes) - 0.001],
        [Math.max(...longitudes) + 0.001, Math.min(...latitudes) - 0.001],
        [Math.max(...longitudes) + 0.001, Math.max(...latitudes) + 0.001],
        [Math.min(...longitudes) - 0.001, Math.max(...latitudes) + 0.001],
        [Math.min(...longitudes) - 0.001, Math.min(...latitudes) - 0.001],
      ],
    ]] });
  });

  it('uses official forest geometry for plants and river geometry for fish from the same evidence cell', () => {
    const boundary = cellToBoundary(h3Index, true);
    const longitudes = boundary.map(([longitude]) => longitude);
    const latitudes = boundary.map(([, latitude]) => latitude);
    const landforms = [
      {
        id: 'fixture-forest',
        name: '침엽수림 · 곰솔',
        kind: 'forest_habitat' as const,
        sourceAttributes: { FRTP_NM: '침엽수림', KOFTR_NM: '곰솔', updatedYear: '2017' },
        provenance: {
          datasetId: 'GYEONGBUK-FOREST-HABITAT-47-2025', provider: 'Korea Forest Service', sourceUrl: 'https://map.forest.go.kr/',
          licence: 'Source licence terms were not supplied with the forest-map shapefiles.', attribution: 'Korea Forest Service',
          importRunId: 'gyeongbuk-no-key-import-v1', sourceRecordId: '47_1:000001', snapshotChecksum: 'sha256:snapshot', sourceFileChecksum: 'sha256:source',
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [Math.min(...longitudes) - 0.01, Math.min(...latitudes) - 0.01],
            [Math.max(...longitudes) + 0.01, Math.min(...latitudes) - 0.01],
            [Math.max(...longitudes) + 0.01, Math.max(...latitudes) + 0.01],
            [Math.min(...longitudes) - 0.01, Math.max(...latitudes) + 0.01],
            [Math.min(...longitudes) - 0.01, Math.min(...latitudes) - 0.01],
          ]],
        },
      },
      {
        id: 'fixture-river',
        name: 'Fixture River',
        kind: 'river_segment' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [Math.min(...longitudes) - 0.01, (Math.min(...latitudes) + Math.max(...latitudes)) / 2],
            [Math.max(...longitudes) + 0.01, (Math.min(...latitudes) + Math.max(...latitudes)) / 2],
          ],
        },
      },
    ] satisfies SuppliedLandform[];

    const zones = createActionZones(
      [hotspotCell(h3Index, 'sicyos-angulatus'), hotspotCell(h3Index, 'micropterus-salmoides')],
      landforms,
      new Map([['sicyos-angulatus', 'plant'], ['micropterus-salmoides', 'fish']]),
    );

    expect(zones).toHaveLength(2);
    expect(zones).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'forest_habitat', speciesId: 'sicyos-angulatus', name: '침엽수림 · 곰솔' }),
      expect.objectContaining({ kind: 'river_segment', speciesId: 'micropterus-salmoides', name: 'Fixture River' }),
    ]));
    expect(zones.find((zone) => zone.speciesId === 'micropterus-salmoides')?.geometry.coordinates).not.toEqual([[cellToBoundary(h3Index, true)]],);
  });

  it('associates a plant cell with an official forest in its immediate H3 neighbourhood', () => {
    const neighbour = gridDisk(h3Index, 1).find((candidate) => candidate !== h3Index)!;
    const neighbourBoundary = cellToBoundary(neighbour, true);
    const longitude = neighbourBoundary.reduce((total, [value]) => total + value, 0) / neighbourBoundary.length;
    const latitude = neighbourBoundary.reduce((total, [, value]) => total + value, 0) / neighbourBoundary.length;
    const forest = {
      id: 'nearby-forest',
      name: '활엽수림 · 참나무류',
      kind: 'forest_habitat' as const,
      sourceAttributes: { FRTP_NM: '활엽수림', KOFTR_NM: '참나무류', updatedYear: '2017' },
      provenance: {
        datasetId: 'GYEONGBUK-FOREST-HABITAT-47-2025', provider: 'Korea Forest Service', sourceUrl: 'https://map.forest.go.kr/',
        licence: 'Source licence terms were not supplied with the forest-map shapefiles.', attribution: 'Korea Forest Service',
        importRunId: 'gyeongbuk-no-key-import-v1', sourceRecordId: '47_1:000002', snapshotChecksum: 'sha256:snapshot', sourceFileChecksum: 'sha256:source',
      },
      geometry: { type: 'Polygon' as const, coordinates: [[
        [longitude - 0.0001, latitude - 0.0001], [longitude + 0.0001, latitude - 0.0001],
        [longitude + 0.0001, latitude + 0.0001], [longitude - 0.0001, latitude + 0.0001],
        [longitude - 0.0001, latitude - 0.0001],
      ]] },
    } satisfies SuppliedLandform;

    const zone = createActionZones([hotspotCell(h3Index, 'sicyos-angulatus')], [forest], new Map([['sicyos-angulatus', 'plant']]))[0]!;

    expect(zone).toMatchObject({ kind: 'forest_habitat', name: '활엽수림 · 참나무류', sourceCellIds: [h3Index] });
  });

  it('uses one official river shape for all fish evidence on the same river', () => {
    const riverCells = [
      hotspotCell(latLngToCell(36.5715, 128.565, 8), 'lepomis-macrochirus', 11),
      hotspotCell(latLngToCell(36.5715, 128.587, 8), 'lepomis-macrochirus', 7),
      hotspotCell(latLngToCell(36.5715, 128.61, 8), 'lepomis-macrochirus', 4),
    ];
    const river = {
      id: 'fixture-river',
      name: 'Fixture River',
      kind: 'river_segment' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [128.56, 36.5715] as [number, number],
          [128.63, 36.5715] as [number, number],
        ],
      },
    } satisfies SuppliedLandform;

    const zones = createActionZones(riverCells, [river], new Map([['lepomis-macrochirus', 'fish']]));

    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ kind: 'river_segment', name: 'Fixture River', score: 22, sourceCellIds: riverCells.map((cell) => cell.h3Index).sort() });
    expect(zones[0]?.geometry).not.toEqual({ type: 'MultiPolygon', coordinates: riverCells.map((cell) => [cellToBoundary(cell.h3Index, true)]) });
    expect(createActionZones(riverCells, [river], new Map([['lepomis-macrochirus', 'fish']]))).toEqual(zones);
  });

  it('keeps a long official river in one named zone', () => {
    const riverCells = [
      hotspotCell(latLngToCell(36.5715, 128.565, 8), 'lepomis-macrochirus', 11),
      hotspotCell(latLngToCell(36.5715, 128.595, 8), 'lepomis-macrochirus', 7),
    ];
    const river = {
      id: 'threshold-river',
      name: 'Threshold River',
      kind: 'river_segment' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [128.56, 36.5715] as [number, number],
          [128.6, 36.5715] as [number, number],
        ],
      },
    } satisfies SuppliedLandform;

    const zones = createActionZones(riverCells, [river], new Map([['lepomis-macrochirus', 'fish']]));

    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ kind: 'river_segment', name: 'Threshold River', score: 18, sourceCellIds: riverCells.map((cell) => cell.h3Index).sort() });
  });

  it('emits privacy-safe, serializable zones without precise points or device tokens', () => {
    const zone = createActionZones([hotspotCell(h3Index)])[0]!;
    const serialized = JSON.stringify(zone);

    expect(ActionZoneSchema.safeParse(zone).success).toBe(true);
    expect(serialized).not.toContain('128.599312345');
    expect(serialized).not.toContain('36.571598765');
    expect(serialized).not.toContain('device-token-hash');
    expect(serialized).not.toContain('"points"');
  });

  it('uses only category-matched official forest and river context in the actual no-key three-source bundle', () => {
    const inputDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));
    const bundle = importDemoSnapshots(inputDirectory);

    expect(bundle.actionZones.length).toBeGreaterThan(0);
    expect(bundle.actionZones.some((zone) => zone.kind === 'forest_habitat' && 'name' in zone && zone.name.trim() !== '')).toBe(true);
    expect(bundle.actionZones.some((zone) => zone.kind === 'river_segment' && 'name' in zone && zone.name.trim() !== '')).toBe(true);
  });
});
