import {
  DatasetSourceSchema,
  ImportRunSchema,
  OfficialProvenanceSchema,
  type DatasetSource,
  type ImportRun,
  type OfficialProvenance,
} from './schema.js';

export function createProvenance(
  source: DatasetSource,
  importRun: ImportRun,
  sourceRecordId: string,
): Readonly<OfficialProvenance> {
  const parsedSource = DatasetSourceSchema.parse(source);
  const parsedRun = ImportRunSchema.parse(importRun);
  const parsedProvenance = OfficialProvenanceSchema.parse({
    datasetId: parsedSource.datasetId,
    provider: parsedSource.provider,
    sourceUrl: parsedSource.sourceUrl,
    licence: parsedSource.licence,
    attribution: parsedSource.attribution,
    importRunId: parsedRun.id,
    sourceRecordId,
    ...(parsedSource.doi === undefined ? {} : { doi: parsedSource.doi }),
    ...(parsedSource.publishedAt === undefined ? {} : { publishedAt: parsedSource.publishedAt }),
    snapshotChecksum: parsedSource.checksum,
    ...(parsedSource.sourceFileChecksum === undefined ? {} : { sourceFileChecksum: parsedSource.sourceFileChecksum }),
  });

  return Object.freeze(parsedProvenance);
}
