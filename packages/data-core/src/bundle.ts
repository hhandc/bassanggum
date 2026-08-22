import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { calculateHotspotCells } from './hotspots.js';
import {
  ActionZoneSchema,
  AreaGeometrySchema,
  DatasetSourceSchema,
  PointSchema,
  PublicDataBundleSchema,
  SpeciesSchema,
  type ActionZone,
  type PublicDataBundle,
} from './schema.js';

const SHA_256_PREFIX = 'sha256:';
const HOTSPOT_REFERENCE_TIME = '2026-08-22T00:00:00.000Z';

const PublicSourceSchema = DatasetSourceSchema.pick({
  datasetId: true,
  provider: true,
  sourceUrl: true,
  licence: true,
  attribution: true,
  doi: true,
  publishedAt: true,
  sourceFileChecksum: true,
}).extend({ snapshotChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional() }).strict();

export const PublicSourceCatalogSchema = z.object({ sources: z.array(PublicSourceSchema) }).strict();
export const PublicSpeciesCatalogSchema = z.object({ species: z.array(SpeciesSchema) }).strict();

const GeoJsonFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.union([PointSchema, AreaGeometrySchema]).nullable(),
  properties: z.record(z.unknown()),
}).strict();

export const GeoJsonFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(GeoJsonFeatureSchema),
}).strict();

export const BundleManifestSchema = z.object({
  version: z.literal(1),
  files: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*\.(?:json|geojson)$/)),
  hashes: z.record(z.string().regex(/^sha256:[a-f0-9]{64}$/)),
}).strict().superRefine((manifest, context) => {
  if (new Set(manifest.files).size !== manifest.files.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Manifest file names must be unique.' });
  }
  if (Object.keys(manifest.hashes).length !== manifest.files.length || manifest.files.some((file) => manifest.hashes[file] === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Manifest hashes must cover every generated data file.' });
  }
});

export type BundleManifest = z.infer<typeof BundleManifestSchema>;

type JsonObject = Record<string, unknown>;
type GeneratedPayload = { filename: string; schema: z.ZodType<unknown>; value: unknown };

/**
 * Builds a deterministic, source-attributed public representation of a
 * normalized bundle. Exact official occurrence geometries remain available in
 * their official layer; hotspot and action-zone features never retain evidence
 * point geometries or community-device material.
 */
export async function writePublicBundle(bundle: PublicDataBundle, outputDirectory: string): Promise<BundleManifest> {
  const publicBundle = normalizePublicBundle(bundle);
  const payloads = createPayloads(publicBundle);
  const encodedPayloads = payloads.map(({ filename, schema, value }) => ({
    filename,
    schema,
    value: validateAndEncode(filename, schema, value),
  }));
  const manifest = BundleManifestSchema.parse({
    version: 1,
    files: encodedPayloads.map(({ filename }) => filename).sort(),
    hashes: Object.fromEntries(encodedPayloads.map(({ filename, value }) => [filename, hash(value)])),
  });
  const manifestText = validateAndEncode('manifest.json', BundleManifestSchema, manifest);

  await writeValidatedDirectory(outputDirectory, [...encodedPayloads, { filename: 'manifest.json', schema: BundleManifestSchema, value: manifestText }]);
  return manifest;
}

function normalizePublicBundle(bundle: PublicDataBundle): PublicDataBundle {
  let parsed: PublicDataBundle;
  try {
    parsed = PublicDataBundleSchema.parse(bundle);
  } catch (error) {
    throw new Error('Unsafe public bundle: it contains invalid or private fields.', { cause: error });
  }
  if (parsed.verifiedCommunitySignals.length > 0) {
    throw new Error('Unsafe public bundle: exact community coordinate points cannot be published.');
  }

  const species = parsed.species
    .map(({ identificationMedia: _identificationMedia, ...record }) => ({
      ...record,
      ...(record.visualTraits === undefined ? {} : { visualTraits: [...record.visualTraits].sort() }),
      ...(record.lookAlikes === undefined ? {} : { lookAlikes: [...record.lookAlikes].sort() }),
    }))
    .sort(byId);
  const actionZones = parsed.actionZones.map(sortActionZone).sort(byId);
  const result = PublicDataBundleSchema.parse({
    species,
    officialOccurrences: [...parsed.officialOccurrences].sort(byId),
    habitatAreas: [...parsed.habitatAreas].sort(byId),
    waterbodies: [...parsed.waterbodies].sort(byId),
    restrictedAreas: [...parsed.restrictedAreas].sort(byId),
    verifiedCommunitySignals: [...parsed.verifiedCommunitySignals].sort(byId),
    verifiedEvents: parsed.verifiedEvents.map((event) => ({ ...event, eligibleSpeciesIds: [...event.eligibleSpeciesIds].sort() })).sort(byId),
    actionZones,
  });
  assertNoPrivateContent(result);
  return result;
}

function createPayloads(bundle: PublicDataBundle): GeneratedPayload[] {
  const hotspots = calculateHotspotCells({
    now: HOTSPOT_REFERENCE_TIME,
    officialOccurrences: bundle.officialOccurrences,
    habitatAreas: bundle.habitatAreas,
    verifiedCommunitySignals: bundle.verifiedCommunitySignals.map((signal) => ({ ...signal, deviceTokenHash: '' })),
    verifiedEvents: bundle.verifiedEvents,
  });
  const sources = sourceCatalog(bundle);

  return [
    { filename: 'public-bundle.json', schema: PublicDataBundleSchema, value: bundle },
    { filename: 'source-catalog.json', schema: PublicSourceCatalogSchema, value: { sources } },
    { filename: 'species-catalog.json', schema: PublicSpeciesCatalogSchema, value: { species: bundle.species } },
    { filename: 'official-occurrences.geojson', schema: GeoJsonFeatureCollectionSchema, value: featureCollection(bundle.officialOccurrences, 'geometry') },
    { filename: 'habitat-areas.geojson', schema: GeoJsonFeatureCollectionSchema, value: featureCollection(bundle.habitatAreas, 'geometry') },
    { filename: 'waterbodies.geojson', schema: GeoJsonFeatureCollectionSchema, value: featureCollection(bundle.waterbodies, 'geometry') },
    { filename: 'restricted-areas.geojson', schema: GeoJsonFeatureCollectionSchema, value: featureCollection(bundle.restrictedAreas, 'geometry') },
    { filename: 'verified-community-signals.geojson', schema: GeoJsonFeatureCollectionSchema, value: featureCollection(bundle.verifiedCommunitySignals, 'publicGeometry') },
    { filename: 'verified-events.geojson', schema: GeoJsonFeatureCollectionSchema, value: featureCollection(bundle.verifiedEvents, 'geometry') },
    { filename: 'hotspots.geojson', schema: GeoJsonFeatureCollectionSchema, value: hotspotFeatureCollection(hotspots) },
    { filename: 'action-zones.geojson', schema: GeoJsonFeatureCollectionSchema, value: actionZoneFeatureCollection(bundle.actionZones) },
  ].sort((left, right) => left.filename.localeCompare(right.filename));
}

function sourceCatalog(bundle: PublicDataBundle): z.infer<typeof PublicSourceCatalogSchema>['sources'] {
  const records = [
    ...bundle.officialOccurrences,
    ...bundle.habitatAreas,
    ...bundle.waterbodies,
    ...bundle.restrictedAreas,
    ...bundle.verifiedEvents,
  ];
  const sources = new Map<string, z.infer<typeof PublicSourceSchema>>();
  for (const record of records) {
    if (!sources.has(record.datasetId)) {
      sources.set(record.datasetId, PublicSourceSchema.parse({
        datasetId: record.datasetId,
        provider: record.provider,
        sourceUrl: record.sourceUrl,
        licence: record.licence,
        attribution: record.attribution,
        ...(record.doi === undefined ? {} : { doi: record.doi }),
        ...(record.publishedAt === undefined ? {} : { publishedAt: record.publishedAt }),
        ...(record.snapshotChecksum === undefined ? {} : { snapshotChecksum: record.snapshotChecksum }),
        ...(record.sourceFileChecksum === undefined ? {} : { sourceFileChecksum: record.sourceFileChecksum }),
      }));
    }
  }
  return [...sources.values()].sort((left, right) => left.datasetId.localeCompare(right.datasetId));
}

function featureCollection(records: readonly JsonObject[], geometryKey: string): z.infer<typeof GeoJsonFeatureCollectionSchema> {
  return {
    type: 'FeatureCollection',
    features: [...records]
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      .map((record) => {
        const { [geometryKey]: geometry, ...properties } = record;
        return { type: 'Feature', geometry: geometry as z.infer<typeof GeoJsonFeatureSchema>['geometry'], properties };
      }),
  };
}

function hotspotFeatureCollection(hotspots: ReturnType<typeof calculateHotspotCells>): z.infer<typeof GeoJsonFeatureCollectionSchema> {
  return {
    type: 'FeatureCollection',
    features: [...hotspots]
      .sort((left, right) => left.speciesId.localeCompare(right.speciesId) || left.h3Index.localeCompare(right.h3Index))
      .map(({ geometry, evidenceBreakdown, ...properties }) => ({
        type: 'Feature' as const,
        geometry,
        properties: {
          ...properties,
          evidence: {
            contributingIds: [...evidenceBreakdown.contributingIds].sort(),
            officialOccurrences: safeContributions(evidenceBreakdown.officialOccurrences),
            habitatAreas: safeContributions(evidenceBreakdown.habitatAreas),
            verifiedCommunitySignals: safeContributions(evidenceBreakdown.verifiedCommunitySignals),
            adjacentCells: safeContributions(evidenceBreakdown.adjacentCells),
          },
        },
      })),
  };
}

function actionZoneFeatureCollection(zones: readonly ActionZone[]): z.infer<typeof GeoJsonFeatureCollectionSchema> {
  return {
    type: 'FeatureCollection',
    features: [...zones].sort(byId).map(({ geometry, ...properties }) => ({ type: 'Feature' as const, geometry, properties })),
  };
}

function safeContributions(contributions: ReadonlyArray<{ id: string; weight: number }>): Array<{ id: string; weight: number }> {
  return contributions.map(({ id, weight }) => ({ id, weight })).sort(byId);
}

function sortActionZone(zone: ActionZone): ActionZone {
  return ActionZoneSchema.parse({
    ...zone,
    sourceCellIds: [...zone.sourceCellIds].sort(),
    evidence: {
      cells: zone.evidence.cells.map((cell) => ({
        ...cell,
        contributingIds: [...cell.contributingIds].sort(),
        officialOccurrences: safeContributions(cell.officialOccurrences),
        habitatAreas: safeContributions(cell.habitatAreas),
        verifiedCommunitySignals: safeContributions(cell.verifiedCommunitySignals),
        adjacentCells: safeContributions(cell.adjacentCells),
      })).sort((left, right) => left.h3Index.localeCompare(right.h3Index)),
    },
  });
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function validateAndEncode(filename: string, schema: z.ZodType<unknown>, value: unknown): string {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Cannot write ${filename}: schema validation failed.`, { cause: parsed.error });
  }
  assertNoPrivateContent(parsed.data);
  const encoded = `${stableJson(parsed.data)}\n`;
  assertNoPrivateContent(encoded);
  return encoded;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortObject(value), null, 2);
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortObject(item)]));
  }
  return value;
}

function assertNoPrivateContent(value: unknown): void {
  const forbiddenKeys = new Set([
    'exactlocation', 'exactcoordinate', 'exactcoordinates',
    'privategeometry', 'privatelocation', 'privatecoordinate', 'privatecoordinates',
    'mediaurl', 'mediaurls', 'mediahash', 'mediahashes', 'identificationmedia',
    'devicetoken', 'devicetokenhash', 'profile', 'profileid', 'profiletoken', 'report', 'reportid',
  ]);
  const forbiddenSerializedContent = /(?:"|\\")(?:(?:exact(?:Location|Coordinates?)|private(?:Geometry|Location|Coordinates?)|media(?:Url|Urls|Hashes?)|identificationMedia|deviceTokenHash|profile(?:Token|Id)?|reportId))(?:"|\\")/i;
  const visit = (item: unknown, path: string): void => {
    if (typeof item === 'string') {
      if (forbiddenSerializedContent.test(item) || /https?:\/\/[^\s"']+\.(?:avif|gif|jpe?g|mov|mp3|mp4|png|svg|webm|webp)(?:[?#][^\s"']*)?$/i.test(item)) {
        throw new Error(`Unsafe private content at ${path}.`);
      }
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (item !== null && typeof item === 'object') {
      for (const [key, entry] of Object.entries(item)) {
        if (forbiddenKeys.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
          throw new Error(`Unsafe private field ${path}.${key}.`);
        }
        visit(entry, `${path}.${key}`);
      }
    }
  };
  visit(value, '$');
}

function hash(value: string): string {
  return `${SHA_256_PREFIX}${createHash('sha256').update(value).digest('hex')}`;
}

async function writeValidatedDirectory(
  outputDirectory: string,
  files: Array<{ filename: string; schema: z.ZodType<unknown>; value: string }>,
): Promise<void> {
  const target = resolve(outputDirectory);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const existing = await stat(target).catch(() => undefined);
  if (existing !== undefined && !existing.isDirectory()) {
    throw new Error(`Public bundle output path must be a directory: ${target}`);
  }
  await mkdir(target, { recursive: true });
  const staging = await mkdtemp(join(parent, '.public-bundle-staging-'));
  const backup = await mkdtemp(join(parent, '.public-bundle-backup-'));
  try {
    for (const file of files) {
      const stagedPath = join(staging, file.filename);
      await writeFile(stagedPath, file.value, 'utf8');
      const readBack = await readFile(stagedPath, 'utf8');
      if (readBack !== file.value) {
        throw new Error(`Read-back verification failed for ${file.filename}.`);
      }
      const parsed = file.schema.safeParse(JSON.parse(readBack));
      if (!parsed.success) {
        throw new Error(`Read-back schema validation failed for ${file.filename}.`, { cause: parsed.error });
      }
      assertNoPrivateContent(readBack);
    }

    const movedExisting: string[] = [];
    const published: string[] = [];
    try {
      for (const file of files) {
        const destination = join(target, file.filename);
        if (await stat(destination).then(() => true).catch(() => false)) {
          await rename(destination, join(backup, file.filename));
          movedExisting.push(file.filename);
        }
      }
      for (const file of files) {
        await rename(join(staging, file.filename), join(target, file.filename));
        published.push(file.filename);
      }
    } catch (error) {
      await Promise.all(published.map((filename) => rm(join(target, filename), { force: true })));
      await Promise.all(movedExisting.map((filename) => rename(join(backup, filename), join(target, filename))));
      throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
  }
}
