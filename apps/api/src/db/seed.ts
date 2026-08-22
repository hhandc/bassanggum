import { importDemoSnapshots, type PublicDataBundle } from '@bassanggum/data-core';
import postgres from 'postgres';

export type SeedSummary = { areas: number; dataSources: number; species: number; officialOccurrences: number };

export type MemorySeedRepository = {
  dataSources: Array<{ datasetId: string; payload: unknown }>;
  areas: Map<string, unknown>;
  species: Map<string, unknown>;
  officialOccurrences: Map<string, unknown>;
};

export function createMemorySeedRepository(): MemorySeedRepository {
  return { dataSources: [], areas: new Map(), species: new Map(), officialOccurrences: new Map() };
}

export async function seedPublicBundle(inputDirectory: string, repository: MemorySeedRepository): Promise<SeedSummary> {
  const bundle = importDemoSnapshots(inputDirectory);
  seedBundle(bundle, repository);
  return { areas: repository.areas.size, dataSources: repository.dataSources.length, species: repository.species.size, officialOccurrences: repository.officialOccurrences.size };
}

function seedBundle(bundle: PublicDataBundle, repository: MemorySeedRepository): void {
  for (const record of bundle.species) repository.species.set(record.id, record);
  for (const record of bundle.officialOccurrences) repository.officialOccurrences.set(record.id, record);
  for (const record of bundle.actionZones) repository.areas.set(record.id, record);
  const sources = bundle.officialOccurrences.map((record) => ({
    datasetId: record.datasetId,
    provider: record.provider,
    sourceUrl: record.sourceUrl,
    licence: record.licence,
    attribution: record.attribution,
    importRunId: record.importRunId,
  }));
  for (const source of sources) {
    if (!repository.dataSources.some((entry) => entry.datasetId === source.datasetId)) {
      repository.dataSources.push({ datasetId: source.datasetId, payload: source });
    }
  }
}

export async function seedPostgis(inputDirectory: string, connectionString: string): Promise<SeedSummary> {
  const bundle = importDemoSnapshots(inputDirectory);
  const sql = postgres(connectionString);
  const sources = new Map(bundle.officialOccurrences.map((record) => [record.datasetId, {
    datasetId: record.datasetId,
    provider: record.provider,
    sourceUrl: record.sourceUrl,
    licence: record.licence,
    attribution: record.attribution,
    importRunId: record.importRunId,
  }]));

  await sql.begin(async (transaction) => {
    for (const source of sources.values()) {
      await transaction`INSERT INTO data_sources (dataset_id, payload) VALUES (${source.datasetId}, ${transaction.json(source)}) ON CONFLICT (dataset_id) DO UPDATE SET payload = EXCLUDED.payload`;
    }
    for (const record of bundle.species) {
      await transaction`INSERT INTO species (id, payload) VALUES (${record.id}, ${transaction.json(record)}) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`;
    }
    for (const record of bundle.officialOccurrences) {
      await transaction`INSERT INTO official_occurrences (id, source_record_id, location, payload) VALUES (${record.id}, ${record.sourceRecordId}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(record.geometry)}), 4326), ${transaction.json(record)}) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`;
    }
    for (const record of bundle.actionZones) {
      await transaction`INSERT INTO areas (id, geometry, payload) VALUES (${record.id}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(record.geometry)}), 4326), ${transaction.json(record)}) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`;
    }
  });

  await sql.end();
  return { areas: bundle.actionZones.length, dataSources: sources.size, species: bundle.species.length, officialOccurrences: bundle.officialOccurrences.length };
}
