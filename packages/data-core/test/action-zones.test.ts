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

  it('uses an explicitly supplied landform geometry without implying removal authority', () => {
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

    expect(zones[0]).toMatchObject({ kind: 'lake', name: 'Fixture Lake', sourceCellIds: [h3Index] });
    expect(zones[0]).not.toHaveProperty('removalAuthorized');
  });

  it('splits a supplied river line into deterministic two-kilometre reaches with per-reach cell evidence', () => {
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

    const zones = createActionZones(riverCells, [river]);

    expect(zones.map((zone) => ('name' in zone ? zone.name : undefined))).toEqual([
      'Fixture River — Reach 01',
      'Fixture River — Reach 02',
      'Fixture River — Reach 03',
    ]);
    expect(zones.map((zone) => zone.score)).toEqual([11, 7, 4]);
    expect(zones.map((zone) => zone.sourceCellIds)).toEqual(riverCells.map((cell) => [cell.h3Index]));
    expect(createActionZones(riverCells, [river])).toEqual(zones);
  });

  it('splits a fixture that crosses the two-kilometre threshold', () => {
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

    const zones = createActionZones(riverCells, [river]);

    expect(zones.map((zone) => ('name' in zone ? zone.name : undefined))).toEqual([
      'Threshold River — Reach 01',
      'Threshold River — Reach 02',
    ]);
    expect(zones.map((zone) => zone.sourceCellIds)).toEqual(riverCells.map((cell) => [cell.h3Index]));
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

  it('uses only source-named lake context in the actual no-key three-source bundle', () => {
    const inputDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));
    const bundle = importDemoSnapshots(inputDirectory);

    expect(bundle.actionZones.length).toBeGreaterThan(0);
    expect(bundle.actionZones.some((zone) => zone.kind === 'lake' && 'name' in zone && zone.name.trim() !== '')).toBe(true);
    expect(bundle.actionZones.every((zone) => zone.kind !== 'lake' || ('name' in zone && zone.name.trim() !== ''))).toBe(true);
  });
});
