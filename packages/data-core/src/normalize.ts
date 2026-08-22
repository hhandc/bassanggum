import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProvenance } from './provenance.js';
import { buildSpeciesCatalog } from './catalog.js';
import { createActionZones } from './action-zones.js';
import { calculateHotspotCells } from './hotspots.js';
import {
  AreaGeometrySchema,
  DatasetSourceSchema,
  ImportRunSchema,
  OfficialOccurrenceSchema,
  HabitatAreaSchema,
  LandformLineGeometrySchema,
  PublicDataBundleSchema,
  RestrictedAreaSchema,
  WaterbodySchema,
  type DatasetSource,
  type HabitatArea,
  type ImportRun,
  type OfficialOccurrence,
  type PublicDataBundle,
  type RestrictedArea,
  type Species,
  type SuppliedLandform,
  type Waterbody,
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
      // The southern coastal segment includes supplied Gyeongju observations.
      // It corrects the initial coarse vertex without adding a third source.
      [128.9, 35.55],
      [129.63, 35.55],
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
type ObservedAt = { observedAt: string; observedAtPrecision: 'year' | 'date' | 'datetime' };

const KNOWN_SPECIES = new Map<string, KnownSpecies>([
  ['환삼덩굴', { id: 'humulus-japonicus', category: 'plant', scientificName: 'Humulus japonicus', englishName: 'Japanese hop' }],
  ['humulus japonicus', { id: 'humulus-japonicus', category: 'plant', scientificName: 'Humulus japonicus', englishName: 'Japanese hop' }],
  ['돼지풀', { id: 'ambrosia-artemisiifolia', category: 'plant', scientificName: 'Ambrosia artemisiifolia', englishName: 'Common ragweed' }],
  ['ambrosia artemisiifolia', { id: 'ambrosia-artemisiifolia', category: 'plant', scientificName: 'Ambrosia artemisiifolia', englishName: 'Common ragweed' }],
  ['미국쑥부쟁이', { id: 'aster-pilosus', category: 'plant', scientificName: 'Aster pilosus', englishName: 'White heath aster' }],
  ['aster pilosus', { id: 'aster-pilosus', category: 'plant', scientificName: 'Aster pilosus', englishName: 'White heath aster' }],
  ['가시상추', { id: 'lactuca-scariola', category: 'plant', scientificName: 'Lactuca scariola', englishName: 'Prickly lettuce' }],
  ['lactuca scariola', { id: 'lactuca-scariola', category: 'plant', scientificName: 'Lactuca scariola', englishName: 'Prickly lettuce' }],
  ['배스', { id: 'micropterus-salmoides', category: 'fish', scientificName: 'Micropterus salmoides', englishName: 'Largemouth bass' }],
  ['micropterus salmoides', { id: 'micropterus-salmoides', category: 'fish', scientificName: 'Micropterus salmoides', englishName: 'Largemouth bass' }],
  ['블루길', { id: 'lepomis-macrochirus', category: 'fish', scientificName: 'Lepomis macrochirus', englishName: 'Bluegill' }],
  ['lepomis macrochirus', { id: 'lepomis-macrochirus', category: 'fish', scientificName: 'Lepomis macrochirus', englishName: 'Bluegill' }],
  ['가시박', { id: 'sicyos-angulatus', category: 'plant', scientificName: 'Sicyos angulatus', englishName: 'Bur cucumber' }],
  ['sicyos angulatus', { id: 'sicyos-angulatus', category: 'plant', scientificName: 'Sicyos angulatus', englishName: 'Bur cucumber' }],
  ['단풍잎돼지풀', { id: 'ambrosia-trifida', category: 'plant', scientificName: 'Ambrosia trifida', englishName: 'Giant ragweed' }],
  ['ambrosia trifida', { id: 'ambrosia-trifida', category: 'plant', scientificName: 'Ambrosia trifida', englishName: 'Giant ragweed' }],
  ['애기수영', { id: 'rumex-acetosella', category: 'plant', scientificName: 'Rumex acetosella', englishName: 'Sheep sorrel' }],
  ['rumex acetosella', { id: 'rumex-acetosella', category: 'plant', scientificName: 'Rumex acetosella', englishName: 'Sheep sorrel' }],
  ['털물참새피', { id: 'paspalum-distichum-var-indutum', category: 'plant', scientificName: 'Paspalum distichum var. indutum', englishName: 'Hairy knotgrass' }],
  ['paspalum distichum var. indutum', { id: 'paspalum-distichum-var-indutum', category: 'plant', scientificName: 'Paspalum distichum var. indutum', englishName: 'Hairy knotgrass' }],
  ['물참새피', { id: 'paspalum-distichum', category: 'plant', scientificName: 'Paspalum distichum', englishName: 'Knotgrass' }],
  ['paspalum distichum', { id: 'paspalum-distichum', category: 'plant', scientificName: 'Paspalum distichum', englishName: 'Knotgrass' }],
  ['도깨비가지', { id: 'solanum-carolinense', category: 'plant', scientificName: 'Solanum carolinense', englishName: 'Carolina horsenettle' }],
  ['solanum carolinense', { id: 'solanum-carolinense', category: 'plant', scientificName: 'Solanum carolinense', englishName: 'Carolina horsenettle' }],
  ['양미역취', { id: 'solidago-altissima', category: 'plant', scientificName: 'Solidago altissima', englishName: 'Tall goldenrod' }],
  ['solidago altissima', { id: 'solidago-altissima', category: 'plant', scientificName: 'Solidago altissima', englishName: 'Tall goldenrod' }],
  ['서양금혼초', { id: 'hypochaeris-radicata', category: 'plant', scientificName: 'Hypochaeris radicata', englishName: 'Catsear' }],
  ['hypochaeris radicata', { id: 'hypochaeris-radicata', category: 'plant', scientificName: 'Hypochaeris radicata', englishName: 'Catsear' }],
  ['물여뀌바늘', { id: 'ludwigia-peploides', category: 'plant', scientificName: 'Ludwigia peploides', englishName: 'Floating primrose-willow' }],
  ['ludwigia peploides', { id: 'ludwigia-peploides', category: 'plant', scientificName: 'Ludwigia peploides', englishName: 'Floating primrose-willow' }],
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

function sourceValue(row: JsonRecord, canonicalKey: string, sourceKey: string): unknown {
  return row[canonicalKey] ?? row[sourceKey];
}

function sourceRecordIdFromRow(row: JsonRecord): string | null {
  return nonEmptyString(row.sourceRecordId ?? row.ID ?? row.OBJECTID ?? row.id);
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

function observedAtFromRow(row: JsonRecord): ObservedAt | null | undefined {
  const observedAt = row.observedAt;
  if (observedAt !== undefined && observedAt !== null && observedAt !== '') {
    return normalizeObservedValue(observedAt);
  }

  const surveyDate = row['조사일자'];
  if (surveyDate !== undefined && surveyDate !== null && surveyDate !== '') {
    return normalizeObservedValue(surveyDate);
  }

  const surveyYear = row.surveyYear ?? row['조사연도'];
  if (surveyYear === undefined || surveyYear === null || surveyYear === '') {
    return undefined;
  }
  const text = nonEmptyString(surveyYear);
  if (text === null || !/^\d{4}$/.test(text)) {
    return null;
  }
  const year = Number(text);
  if (year < 1900 || year > 2100) {
    return null;
  }
  const normalized = normalizeObservedAt(`${text}-01-01`);
  return normalized === null || normalized === undefined ? normalized : { observedAt: normalized, observedAtPrecision: 'year' };
}

function normalizeObservedValue(value: unknown): ObservedAt | null | undefined {
  const normalized = normalizeObservedAt(value);
  if (normalized === null || normalized === undefined) {
    return normalized;
  }
  const text = nonEmptyString(value);
  return {
    observedAt: normalized,
    observedAtPrecision: text !== null && /^\d{4}-\d{2}-\d{2}$/.test(text) ? 'date' : 'datetime',
  };
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

function hasOnlyGyeongbukLinePositions(geometry: { coordinates: Position[] }): boolean {
  return geometry.coordinates.every((position) => isWithinGyeongbuk([position[0], position[1]]));
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

  const sourceRecordId = sourceRecordIdFromRow(row);
  const details = speciesDetails({
    ...row,
    koreanName: sourceValue(row, 'koreanName', '한글보통명'),
    scientificName: sourceValue(row, 'scientificName', '학명'),
  });
  const longitude = coordinate(sourceValue(row, 'longitude', '경도'));
  const latitude = coordinate(sourceValue(row, 'latitude', '위도'));
  const observedAt = observedAtFromRow(row);
  const administrativeRegion = nonEmptyString(row['시도명']);
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
    administrativeRegion !== '경상북도' ||
    !isWithinGyeongbuk([longitude, latitude])
  ) {
    return null;
  }

  const parsed = OfficialOccurrenceSchema.safeParse({
    id: `official:${source.datasetId}:${sourceRecordId}`,
    speciesId: details.id,
    evidenceSource: 'official',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    ...(observedAt === undefined ? {} : observedAt),
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

/**
 * KDPA administrative code KR-47 is the authoritative geographic filter.
 * This conservative overlay is informational safety screening only: it never
 * enters hotspot scoring and does not grant any removal permission.
 */
export function normalizeRestrictedAreaFeature(
  feature: unknown,
  source: DatasetSource,
  importRun: ImportRun,
): RestrictedArea | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !validatedMetadata(source, importRun)) {
    return null;
  }

  const sourceRecordId = nonEmptyString(feature.properties.sourceRecordId);
  const name = nonEmptyString(feature.properties.name);
  const subLocation = nonEmptyString(feature.properties.subLocation);
  const geometry = AreaGeometrySchema.safeParse(feature.geometry);
  if (sourceRecordId === null || name === null || subLocation !== 'KR-47' || !geometry.success) {
    return null;
  }

  const parsed = RestrictedAreaSchema.safeParse({
    id: `restricted:${source.datasetId}:${sourceRecordId}`,
    name,
    geometry: geometry.data,
    restriction: 'KDPA protected-area/OECM safety screening only; overlap requires an official event or agency determination and does not authorize removal.',
    ...createProvenance(source, importRun, sourceRecordId),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * National Base Map lake polygons are informational named context.  A name
 * must come from the source NAME field; unnamed polygons deliberately do not
 * become action-zone labels.
 */
export function normalizeWaterbodyFeature(
  feature: unknown,
  source: DatasetSource,
  importRun: ImportRun,
): Waterbody | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !validatedMetadata(source, importRun)) {
    return null;
  }

  const sourceRecordId = nonEmptyString(feature.properties.sourceRecordId ?? feature.properties.UFID);
  const name = nonEmptyString(feature.properties.name ?? feature.properties.NAME);
  const geometry = AreaGeometrySchema.safeParse(feature.geometry);
  const mara = coordinate(feature.properties.MARA);
  const ufid = nonEmptyString(feature.properties.UFID);
  const serv = typeof feature.properties.SERV === 'string' ? feature.properties.SERV.trim() : null;
  const mngt = typeof feature.properties.MNGT === 'string' ? feature.properties.MNGT.trim() : null;
  const fmta = typeof feature.properties.FMTA === 'string' ? feature.properties.FMTA.trim() : null;
  if (
    sourceRecordId === null ||
    name === null ||
    !geometry.success ||
    !hasOnlyGyeongbukPositions(geometry.data) ||
    ufid === null ||
    mara === null ||
    serv === null ||
    mngt === null ||
    fmta === null
  ) {
    return null;
  }

  const parsed = WaterbodySchema.safeParse({
    id: `waterbody:${source.datasetId}:${sourceRecordId}`,
    name,
    kind: 'lake',
    geometry: geometry.data,
    sourceAttributes: { UFID: ufid, SERV: serv, MARA: mara, MNGT: mngt, FMTA: fmta },
    ...createProvenance(source, importRun, sourceRecordId),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * National Base Map river labels are accepted only from named N3L centerlines.
 * The separately supplied N3A width layer has no naming authority.
 */
export function normalizeRiverLandformFeature(
  feature: unknown,
  source: DatasetSource,
): SuppliedLandform | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || source.datasetId !== 'N3L_E0020000') {
    return null;
  }

  const sourceRecordId = nonEmptyString(feature.properties.sourceRecordId);
  const parentSourceRecordId = nonEmptyString(feature.properties.parentSourceRecordId);
  const reachId = nonEmptyString(feature.properties.reachId);
  const name = nonEmptyString(feature.properties.name);
  const geometry = LandformLineGeometrySchema.safeParse(feature.geometry);
  if (
    sourceRecordId === null ||
    parentSourceRecordId === null ||
    sourceRecordId !== parentSourceRecordId ||
    reachId === null ||
    name === null ||
    !geometry.success ||
    geometry.data.type !== 'LineString' ||
    !hasOnlyGyeongbukLinePositions(geometry.data)
  ) {
    return null;
  }

  const reachNumber = /^.*:reach:(\d+)$/.exec(reachId)?.[1];
  return {
    id: `river:${source.datasetId}:${sourceRecordId}:${reachId}`,
    name: reachNumber === undefined ? name : `${name} — Reach ${Number(reachNumber)}`,
    kind: 'river_segment',
    geometry: geometry.data,
  };
}

/** Forest map categories are sourced habitat context, never official place names. */
export function normalizeForestLandformFeature(feature: unknown, source: DatasetSource, importRun: ImportRun): SuppliedLandform | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || source.datasetId !== 'GYEONGBUK-FOREST-HABITAT-47-2025') {
    return null;
  }

  const sourceRecordId = nonEmptyString(feature.properties.sourceRecordId);
  const forestType = nonEmptyString(feature.properties.FRTP_NM);
  const dominantSpecies = nonEmptyString(feature.properties.KOFTR_NM);
  const updatedYear = typeof feature.properties.updatedYear === 'string' ? feature.properties.updatedYear.trim() : null;
  const geometry = AreaGeometrySchema.safeParse(feature.geometry);
  if (
    sourceRecordId === null ||
    forestType === null ||
    dominantSpecies === null ||
    updatedYear === null ||
    !geometry.success ||
    !hasOnlyGyeongbukPositions(geometry.data)
  ) {
    return null;
  }

  return {
    id: `forest:${source.datasetId}:${sourceRecordId}`,
    name: `${forestType} · ${dominantSpecies}`,
    kind: 'forest_habitat',
    sourceAttributes: { FRTP_NM: forestType, KOFTR_NM: dominantSpecies, updatedYear },
    provenance: createProvenance(source, importRun, sourceRecordId),
    geometry: geometry.data,
  };
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
  const details = speciesDetails({
    ...row,
    koreanName: sourceValue(row, 'koreanName', '한글보통명'),
    scientificName: sourceValue(row, 'scientificName', '학명'),
  });
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
  const disturbance = readSnapshot(join(inputDirectory, 'ecosystem-disturbing-organisms-gyeongbuk-2016-2024.json'));
  const alienFish = readSnapshot(join(inputDirectory, 'nie-alien-fish-gyeongbuk-2015-2022.json'));
  const alienPlants = readSnapshot(join(inputDirectory, 'nie-alien-plants-gyeongbuk-2015-2021.json'));
  const kdpaBoundaries = readHabitatSnapshot(join(inputDirectory, 'kdpa-protected-areas-oecm-gyeongbuk-2025.geojson'));
  const lakes = readHabitatSnapshot(join(inputDirectory, 'national-base-map-lakes-gyeongbuk-2024.geojson'));
  const rivers = readHabitatSnapshot(join(inputDirectory, 'national-base-map-rivers-gyeongbuk-2024.geojson'));
  const forests = readHabitatSnapshot(join(inputDirectory, 'gyeongbuk-forest-habitat-zones-2025.geojson'));
  const catalogue = readCatalogSnapshot(join(inputDirectory, 'species-catalog.json'));
  const importRun: ImportRun = {
    id: 'gyeongbuk-no-key-import-v1',
    importedAt: '2026-08-22T00:00:00.000Z',
    parserVersion: '1.0.0',
  };

  const occurrenceInputs = [
    ...disturbance.records.map((row) => ({ row, source: disturbance.source })),
    ...alienFish.records.map((row) => ({ row, source: alienFish.source })),
    ...alienPlants.records.map((row) => ({ row, source: alienPlants.source })),
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
  const cataloguedSpecies = buildSpeciesCatalog(catalogue.records, catalogue.media).filter((record) => observedSpeciesIds.has(record.id));
  const restrictedAreas = kdpaBoundaries.features.flatMap((feature) => {
    const area = normalizeRestrictedAreaFeature(feature, kdpaBoundaries.source, importRun);
    return area === null ? [] : [area];
  });
  const waterbodies = lakes.features.flatMap((feature) => {
    const waterbody = normalizeWaterbodyFeature(feature, lakes.source, importRun);
    return waterbody === null ? [] : [waterbody];
  });
  const lakeLandforms: SuppliedLandform[] = waterbodies.map((waterbody) => ({
    id: waterbody.id,
    name: waterbody.name,
    kind: 'lake',
    geometry: waterbody.geometry,
  }));
  const riverLandforms = rivers.features.flatMap((feature) => {
    const river = normalizeRiverLandformFeature(feature, rivers.source);
    return river === null ? [] : [river];
  });
  const forestLandforms = forests.features.flatMap((feature) => {
    const forest = normalizeForestLandformFeature(feature, forests.source, importRun);
    return forest === null ? [] : [forest];
  });

  return PublicDataBundleSchema.parse({
    species: cataloguedSpecies,
    officialOccurrences: occurrences,
    habitatAreas: [],
    waterbodies,
    restrictedAreas,
    verifiedCommunitySignals: [],
    verifiedEvents: [],
    actionZones: createActionZones(
      calculateHotspotCells({
        now: importRun.importedAt,
        officialOccurrences: occurrences,
        habitatAreas: [],
        verifiedCommunitySignals: [],
        verifiedEvents: [],
      }),
      [...lakeLandforms, ...riverLandforms, ...forestLandforms],
      new Map(cataloguedSpecies.map((species) => [species.id, species.category] as const)),
    ),
  });
}
