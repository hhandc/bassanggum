import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProvenance } from './provenance.js';
import { buildSpeciesCatalog } from './catalog.js';
import {
  AreaGeometrySchema,
  DatasetSourceSchema,
  ImportRunSchema,
  OfficialOccurrenceSchema,
  HabitatAreaSchema,
  PublicDataBundleSchema,
  type DatasetSource,
  type HabitatArea,
  type ImportRun,
  type OfficialOccurrence,
  type PublicDataBundle,
  type Species,
} from './schema.js';

type JsonRecord = Record<string, unknown>;
type Position = [number, number] | [number, number, number];
type BoundaryPosition = [number, number];
type AreaGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

export const GYEONGBUK_BOUNDARY: { type: 'Polygon'; coordinates: [BoundaryPosition[]] } = {
  type: 'Polygon',
  coordinates: [
    [
      [127.2, 36.95],
      [127.45, 36.6],
      [127.35, 36.05],
      [127.55, 35.72],
      [128.15, 35.55],
      [128.55, 35.55],
      [128.9, 35.75],
      [129.46, 35.7],
      [129.63, 36.15],
      [129.55, 36.75],
      [129.5, 37.13],
      [128.95, 37.25],
      [128.25, 37.1],
      [127.9, 37.25],
      [127.2, 36.95],
    ],
  ],
};

type SpeciesDetails = {
  id: string;
  category: 'fish' | 'plant';
  koreanName?: string;
  scientificName?: string;
  englishName?: string;
};
type KnownSpecies = Pick<SpeciesDetails, 'id' | 'category'> & { scientificName: string; englishName: string };
type ObservedSpecies = Omit<SpeciesDetails, 'category'> & { category: 'fish' | 'plant' };

const KNOWN_SPECIES = new Map<string, KnownSpecies>([
  ['블루길', { id: 'lepomis-macrochirus', category: 'fish', scientificName: 'Lepomis macrochirus', englishName: 'Bluegill' }],
  ['lepomis macrochirus', { id: 'lepomis-macrochirus', category: 'fish', scientificName: 'Lepomis macrochirus', englishName: 'Bluegill' }],
  ['가시박', { id: 'sicyos-angulatus', category: 'plant', scientificName: 'Sicyos angulatus', englishName: 'Bur cucumber' }],
  ['sicyos angulatus', { id: 'sicyos-angulatus', category: 'plant', scientificName: 'Sicyos angulatus', englishName: 'Bur cucumber' }],
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function coordinate(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function speciesDetails(row: JsonRecord): SpeciesDetails | null {
  const koreanName = nonEmptyString(row.koreanName);
  const scientificName = nonEmptyString(row.scientificName);
  const known = (scientificName === null ? undefined : KNOWN_SPECIES.get(scientificName.toLowerCase())) ??
    (koreanName === null ? undefined : KNOWN_SPECIES.get(koreanName));

  if (known !== undefined) {
    return {
      id: known.id,
      category: known.category,
      ...(koreanName === null ? {} : { koreanName }),
      scientificName: known.scientificName,
      englishName: known.englishName,
    };
  }

  return null;
}

function normalizeObservedAt(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const text = nonEmptyString(value);
  if (text === null) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(text);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
    return null;
  }
  const normalized = text.length === 10 ? `${text}T00:00:00.000Z` : text;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isPointOnSegment(point: [number, number], start: [number, number], end: [number, number]): boolean {
  const [x, y] = point;
  const [startX, startY] = start;
  const [endX, endY] = end;
  const crossProduct = (y - startY) * (endX - startX) - (x - startX) * (endY - startY);
  if (Math.abs(crossProduct) > Number.EPSILON) {
    return false;
  }
  return x >= Math.min(startX, endX) && x <= Math.max(startX, endX) && y >= Math.min(startY, endY) && y <= Math.max(startY, endY);
}

export function isWithinGyeongbuk(point: [number, number]): boolean {
  const ring = GYEONGBUK_BOUNDARY.coordinates[0]!;
  let inside = false;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = ring[index];
    const end = ring[index + 1];
    if (start === undefined || end === undefined) {
      return false;
    }
    if (isPointOnSegment(point, start, end)) {
      return true;
    }
    const [startX, startY] = start;
    const [endX, endY] = end;
    const [x, y] = point;
    const intersects = (startY > y) !== (endY > y) && x < ((endX - startX) * (y - startY)) / (endY - startY) + startX;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function hasOnlyGyeongbukPositions(geometry: AreaGeometry): boolean {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.every((polygon) =>
    polygon.every((ring) => ring.every((position) => isWithinGyeongbuk([position[0], position[1]]))),
  );
}

function validatedMetadata(source: DatasetSource, importRun: ImportRun): boolean {
  return DatasetSourceSchema.safeParse(source).success && ImportRunSchema.safeParse(importRun).success;
}

export function normalizeOccurrenceRow(
  row: unknown,
  source: DatasetSource,
  importRun: ImportRun,
): OfficialOccurrence | null {
  if (!isRecord(row) || !validatedMetadata(source, importRun)) {
    return null;
  }

  const sourceRecordId = nonEmptyString(row.sourceRecordId);
  const details = speciesDetails(row);
  const longitude = coordinate(row.longitude);
  const latitude = coordinate(row.latitude);
  const observedAt = normalizeObservedAt(row.observedAt);
  if (
    sourceRecordId === null ||
    details === null ||
    longitude === null ||
    latitude === null ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90 ||
    observedAt === null ||
    !isWithinGyeongbuk([longitude, latitude])
  ) {
    return null;
  }

  const parsed = OfficialOccurrenceSchema.safeParse({
    id: `official:${source.datasetId}:${sourceRecordId}`,
    speciesId: details.id,
    evidenceSource: 'official',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    ...(observedAt === undefined ? {} : { observedAt }),
    ...createProvenance(source, importRun, sourceRecordId),
  });
  return parsed.success ? parsed.data : null;
}

export function normalizeHabitatFeature(
  feature: unknown,
  source: DatasetSource,
  importRun: ImportRun,
): HabitatArea | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !validatedMetadata(source, importRun)) {
    return null;
  }

  const sourceRecordId = nonEmptyString(feature.properties.sourceRecordId);
  const details = speciesDetails(feature.properties);
  const frequencyBand = nonEmptyString(feature.properties.frequencyBand);
  const geometry = AreaGeometrySchema.safeParse(feature.geometry);
  if (sourceRecordId === null || details === null || !geometry.success || !hasOnlyGyeongbukPositions(geometry.data)) {
    return null;
  }

  const parsed = HabitatAreaSchema.safeParse({
    id: `official:${source.datasetId}:${sourceRecordId}`,
    speciesId: details.id,
    evidenceSource: 'official',
    geometry: geometry.data,
    ...(frequencyBand === null ? {} : { frequencyBand }),
    ...createProvenance(source, importRun, sourceRecordId),
  });
  return parsed.success ? parsed.data : null;
}

function readSnapshot(path: string): { source: DatasetSource; records: unknown[] } {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed) || !Array.isArray(parsed.records)) {
    throw new Error(`Snapshot at ${path} must contain a records array.`);
  }
  const source = DatasetSourceSchema.parse(parsed.source);
  verifyPayloadChecksum(source, parsed.records, path);
  return { source, records: parsed.records };
}

function readHabitatSnapshot(path: string): { source: DatasetSource; features: unknown[] } {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed) || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error(`Habitat snapshot at ${path} must be a GeoJSON FeatureCollection.`);
  }
  const source = DatasetSourceSchema.parse(parsed.source);
  verifyPayloadChecksum(source, parsed.features, path);
  return { source, features: parsed.features };
}

function readCatalogSnapshot(path: string): { records: unknown[]; media: unknown[] } {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed) || !Array.isArray(parsed.records) || !Array.isArray(parsed.media)) {
    throw new Error(`Catalogue snapshot at ${path} must contain records and media arrays.`);
  }
  return { records: parsed.records, media: parsed.media };
}

function verifyPayloadChecksum(source: DatasetSource, payload: unknown, path: string): void {
  const actual = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
  if (source.checksum !== actual) {
    throw new Error(`Snapshot checksum mismatch for ${path}.`);
  }
}

function speciesFromRow(row: unknown): ObservedSpecies | null {
  if (!isRecord(row)) {
    return null;
  }
  const details = speciesDetails(row);
  return details === null
    ? null
    : {
        id: details.id,
        category: details.category,
        ...(details.englishName === undefined ? {} : { englishName: details.englishName }),
        ...(details.koreanName === undefined ? {} : { koreanName: details.koreanName }),
        ...(details.scientificName === undefined ? {} : { scientificName: details.scientificName }),
      };
}

export function importDemoSnapshots(inputDirectory: string): PublicDataBundle {
  const fish = readSnapshot(join(inputDirectory, 'ecobank-fish.json'));
  const flora = readSnapshot(join(inputDirectory, 'ecobank-flora.json'));
  const habitat = readHabitatSnapshot(join(inputDirectory, 'ecobank-habitat.geojson'));
  const catalogue = readCatalogSnapshot(join(inputDirectory, 'species-catalog.json'));
  const importRun: ImportRun = {
    id: 'demo-import-v1',
    importedAt: '2026-08-22T00:00:00.000Z',
    parserVersion: '1.0.0',
  };

  const occurrenceInputs = [
    ...fish.records.map((row) => ({ row, source: fish.source })),
    ...flora.records.map((row) => ({ row, source: flora.source })),
  ].flatMap((input) => {
    const species = speciesFromRow(input.row);
    return species === null ? [] : [{ ...input, species }];
  });
  const observedSpeciesIds = new Set<string>();
  const occurrences: OfficialOccurrence[] = [];
  for (const input of occurrenceInputs) {
    const occurrence = normalizeOccurrenceRow(input.row, input.source, importRun);
    if (occurrence !== null) {
      occurrences.push(occurrence);
      observedSpeciesIds.add(input.species.id);
    }
  }
  const habitatAreas = habitat.features
    .map((feature) => normalizeHabitatFeature(feature, habitat.source, importRun))
    .filter((record): record is HabitatArea => record !== null);
  const cataloguedSpecies = buildSpeciesCatalog(catalogue.records, catalogue.media).filter((record) => observedSpeciesIds.has(record.id));

  return PublicDataBundleSchema.parse({
    species: cataloguedSpecies,
    officialOccurrences: occurrences,
    habitatAreas,
    waterbodies: [],
    restrictedAreas: [],
    verifiedCommunitySignals: [],
    verifiedEvents: [],
  });
}
