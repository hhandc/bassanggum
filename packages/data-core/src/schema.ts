import { z } from 'zod';

const NonEmptyString = z.string().trim().min(1);
const Longitude = z.number().finite().min(-180).max(180);
const Latitude = z.number().finite().min(-90).max(90);
const PositionSchema = z.tuple([Longitude, Latitude]).or(z.tuple([Longitude, Latitude, z.number().finite()]));

export const PointSchema = z
  .object({
    type: z.literal('Point'),
    coordinates: PositionSchema,
  })
  .strict();

const LinearRingSchema = z.array(PositionSchema).min(4);

export const PolygonSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(LinearRingSchema).min(1),
  })
  .strict();

export const MultiPolygonSchema = z
  .object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(LinearRingSchema).min(1)).min(1),
  })
  .strict();

export const AreaGeometrySchema = z.discriminatedUnion('type', [PolygonSchema, MultiPolygonSchema]);

export const DatasetSourceSchema = z
  .object({
    datasetId: NonEmptyString,
    title: NonEmptyString,
    provider: NonEmptyString,
    sourceUrl: z.string().url(),
    licence: NonEmptyString,
    attribution: NonEmptyString,
    snapshotFilename: NonEmptyString,
    checksum: NonEmptyString,
  })
  .strict();

export const ImportRunSchema = z
  .object({
    id: NonEmptyString,
    importedAt: z.string().datetime({ offset: true }),
    parserVersion: NonEmptyString,
  })
  .strict();

export const OfficialProvenanceSchema = z
  .object({
    datasetId: NonEmptyString,
    provider: NonEmptyString,
    sourceUrl: z.string().url(),
    licence: NonEmptyString,
    attribution: NonEmptyString,
    importRunId: NonEmptyString,
    sourceRecordId: NonEmptyString,
  })
  .strict();

export const SpeciesSchema = z
  .object({
    id: NonEmptyString,
    category: z.enum(['fish', 'plant']),
    englishName: NonEmptyString.optional(),
    koreanName: NonEmptyString.optional(),
    scientificName: NonEmptyString.optional(),
  })
  .strict();

export const OfficialOccurrenceSchema = z
  .object({
    id: NonEmptyString,
    speciesId: NonEmptyString,
    evidenceSource: z.literal('official'),
    geometry: PointSchema,
    observedAt: z.string().datetime({ offset: true }).optional(),
  })
  .merge(OfficialProvenanceSchema)
  .strict();

export const HabitatAreaSchema = z
  .object({
    id: NonEmptyString,
    speciesId: NonEmptyString,
    evidenceSource: z.literal('official'),
    geometry: AreaGeometrySchema,
    frequencyBand: NonEmptyString.optional(),
  })
  .merge(OfficialProvenanceSchema)
  .strict();

export const WaterbodySchema = z
  .object({
    id: NonEmptyString,
    name: NonEmptyString,
    kind: z.enum(['lake', 'river', 'river_segment', 'wetland', 'other']),
    geometry: AreaGeometrySchema,
  })
  .merge(OfficialProvenanceSchema)
  .strict();

export const RestrictedAreaSchema = z
  .object({
    id: NonEmptyString,
    name: NonEmptyString,
    geometry: AreaGeometrySchema,
    restriction: NonEmptyString,
  })
  .merge(OfficialProvenanceSchema)
  .strict();

export const VerifiedCommunitySignalSchema = z
  .object({
    id: NonEmptyString,
    speciesId: NonEmptyString,
    evidenceSource: z.literal('community_verified'),
    signalType: z.enum(['sighting', 'removal']),
    publicGeometry: PointSchema,
    verifiedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const VerifiedEventSchema = z
  .object({
    id: NonEmptyString,
    organizer: NonEmptyString,
    title: NonEmptyString,
    eventUrl: z.string().url(),
    geometry: AreaGeometrySchema,
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    eligibleSpeciesIds: z.array(NonEmptyString).min(1),
    rewardWording: NonEmptyString,
    eligibilityNotes: NonEmptyString,
    validatedAt: z.string().datetime({ offset: true }),
  })
  .merge(OfficialProvenanceSchema)
  .strict();

export const PublicDataBundleSchema = z
  .object({
    species: z.array(SpeciesSchema),
    officialOccurrences: z.array(OfficialOccurrenceSchema),
    habitatAreas: z.array(HabitatAreaSchema),
    waterbodies: z.array(WaterbodySchema),
    restrictedAreas: z.array(RestrictedAreaSchema),
    verifiedCommunitySignals: z.array(VerifiedCommunitySignalSchema),
    verifiedEvents: z.array(VerifiedEventSchema),
  })
  .strict();

export type DatasetSource = z.infer<typeof DatasetSourceSchema>;
export type ImportRun = z.infer<typeof ImportRunSchema>;
export type OfficialProvenance = z.infer<typeof OfficialProvenanceSchema>;
export type Species = z.infer<typeof SpeciesSchema>;
export type OfficialOccurrence = z.infer<typeof OfficialOccurrenceSchema>;
export type HabitatArea = z.infer<typeof HabitatAreaSchema>;
export type Waterbody = z.infer<typeof WaterbodySchema>;
export type RestrictedArea = z.infer<typeof RestrictedAreaSchema>;
export type VerifiedCommunitySignal = z.infer<typeof VerifiedCommunitySignalSchema>;
export type VerifiedEvent = z.infer<typeof VerifiedEventSchema>;
export type PublicDataBundle = z.infer<typeof PublicDataBundleSchema>;
