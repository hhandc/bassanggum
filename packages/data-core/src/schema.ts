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

const LinearRingSchema = z
  .array(PositionSchema)
  .min(4)
  .superRefine((ring, context) => {
    const firstPosition = ring[0];
    const lastPosition = ring.at(-1);

    if (
      firstPosition === undefined ||
      lastPosition === undefined ||
      firstPosition.length !== lastPosition.length ||
      firstPosition.some((coordinate, index) => coordinate !== lastPosition[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Linear rings must repeat their first position as their last position.',
      });
    }
  });

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

export const LineStringSchema = z
  .object({
    type: z.literal('LineString'),
    coordinates: z.array(PositionSchema).min(2),
  })
  .strict();

export const MultiLineStringSchema = z
  .object({
    type: z.literal('MultiLineString'),
    coordinates: z.array(z.array(PositionSchema).min(2)).min(1),
  })
  .strict();

export const LandformLineGeometrySchema = z.discriminatedUnion('type', [LineStringSchema, MultiLineStringSchema]);

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
    doi: NonEmptyString.optional(),
    publishedAt: NonEmptyString.optional(),
    sourceFileChecksum: NonEmptyString.optional(),
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
    doi: NonEmptyString.optional(),
    publishedAt: NonEmptyString.optional(),
    snapshotChecksum: NonEmptyString.optional(),
    sourceFileChecksum: NonEmptyString.optional(),
  })
  .strict();

export const SpeciesSchema = z
  .object({
    id: NonEmptyString,
    category: z.enum(['fish', 'plant']),
    englishName: NonEmptyString.optional(),
    koreanName: NonEmptyString.optional(),
    scientificName: NonEmptyString.optional(),
    visualTraits: z.array(NonEmptyString).min(1).optional(),
    lookAlikes: z.array(NonEmptyString).min(1).optional(),
    disposalGuidance: z
      .object({ text: NonEmptyString, sourceUrl: z.string().url() })
      .strict()
      .optional(),
    actionPolicy: z.enum(['community_removal', 'official_event_only', 'report_only']),
    cookingGuidance: z
      .object({ text: NonEmptyString, sourceUrl: z.string().url() })
      .strict()
      .optional(),
    identificationMedia: z
      .array(
        z
          .object({
            speciesId: NonEmptyString,
            url: z.string().url(),
            sourceUrl: z.string().url(),
            credit: NonEmptyString,
            licence: NonEmptyString,
            generated: z.boolean().optional(),
            supplementary: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .optional(),
  })
  .strict();

export const OfficialOccurrenceSchema = z
  .object({
    id: NonEmptyString,
    speciesId: NonEmptyString,
    evidenceSource: z.literal('official'),
    geometry: PointSchema,
    observedAt: z.string().datetime({ offset: true }).optional(),
    /** Source granularity for observedAt; it enables safe scoring-only date/year matching. */
    observedAtPrecision: z.enum(['year', 'date', 'datetime']).optional(),
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

const H3CellIdSchema = NonEmptyString;
const HotspotStatusSchema = z.enum(['known', 'watch', 'emerging', 'none']);
const PublicEvidenceContributionSchema = z
  .object({
    id: NonEmptyString,
    weight: z.number().finite(),
  })
  .strict();

/**
 * A deliberately point-free copy of the evidence used to score one H3 cell.
 * Action zones expose H3-level traceability, never occurrence coordinates or
 * internal community-device identifiers.
 */
export const ActionZoneEvidenceCellSchema = z
  .object({
    h3Index: H3CellIdSchema,
    score: z.number().finite(),
    status: HotspotStatusSchema,
    contributingIds: z.array(NonEmptyString),
    officialOccurrences: z.array(PublicEvidenceContributionSchema),
    habitatAreas: z.array(PublicEvidenceContributionSchema),
    verifiedCommunitySignals: z.array(PublicEvidenceContributionSchema),
    adjacentCells: z.array(PublicEvidenceContributionSchema),
  })
  .strict();

export const ActionZoneEvidenceSchema = z
  .object({
    cells: z.array(ActionZoneEvidenceCellSchema).min(1),
  })
  .strict();

export const ActionZoneKindSchema = z.enum(['lake', 'river_segment', 'forest_habitat', 'unnamed_cell_cluster']);
const NamedActionZoneKindSchema = z.enum(['lake', 'river_segment', 'forest_habitat']);

const ActionZoneBaseSchema = z
  .object({
    id: NonEmptyString,
    speciesId: NonEmptyString,
    score: z.number().finite(),
    sourceCellIds: z.array(H3CellIdSchema).min(1),
    evidence: ActionZoneEvidenceSchema,
    geometry: MultiPolygonSchema,
  })
  .strict();

export const ActionZoneSchema = z.discriminatedUnion('kind', [
  ActionZoneBaseSchema.extend({ kind: z.literal('unnamed_cell_cluster') }),
  ActionZoneBaseSchema.extend({ kind: NamedActionZoneKindSchema, name: NonEmptyString }),
]).superRefine((zone, context) => {
  if (new Set(zone.sourceCellIds).size !== zone.sourceCellIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Action-zone source H3 cell IDs must be unique.' });
  }
  if (new Set(zone.evidence.cells.map((cell) => cell.h3Index)).size !== zone.evidence.cells.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Action-zone evidence must contain one trace per H3 cell.' });
  }
});

/**
 * Caller-supplied context for named zones. Its required geometry makes the
 * association explicit; this data structure does not authorize removal.
 */
const SuppliedLandformBaseSchema = z
  .object({
    id: NonEmptyString,
    name: NonEmptyString,
  })
  .strict();

export const SuppliedLandformSchema = z.discriminatedUnion('kind', [
  SuppliedLandformBaseSchema.extend({ kind: z.literal('lake'), geometry: AreaGeometrySchema }),
  SuppliedLandformBaseSchema.extend({ kind: z.literal('forest_habitat'), geometry: AreaGeometrySchema }),
  SuppliedLandformBaseSchema.extend({ kind: z.literal('river_segment'), geometry: LandformLineGeometrySchema }),
]);

export const PublicDataBundleSchema = z
  .object({
    species: z.array(SpeciesSchema),
    officialOccurrences: z.array(OfficialOccurrenceSchema),
    habitatAreas: z.array(HabitatAreaSchema),
    waterbodies: z.array(WaterbodySchema),
    restrictedAreas: z.array(RestrictedAreaSchema),
    verifiedCommunitySignals: z.array(VerifiedCommunitySignalSchema),
    verifiedEvents: z.array(VerifiedEventSchema),
    actionZones: z.array(ActionZoneSchema),
  })
  .strict();

export type DatasetSource = z.infer<typeof DatasetSourceSchema>;
export type ImportRun = z.infer<typeof ImportRunSchema>;
export type OfficialProvenance = z.infer<typeof OfficialProvenanceSchema>;
export type Species = z.infer<typeof SpeciesSchema>;
export type OfficialOccurrence = z.infer<typeof OfficialOccurrenceSchema>;
export type AreaGeometry = z.infer<typeof AreaGeometrySchema>;
export type LandformLineGeometry = z.infer<typeof LandformLineGeometrySchema>;
export type HabitatArea = z.infer<typeof HabitatAreaSchema>;
export type Waterbody = z.infer<typeof WaterbodySchema>;
export type RestrictedArea = z.infer<typeof RestrictedAreaSchema>;
export type VerifiedCommunitySignal = z.infer<typeof VerifiedCommunitySignalSchema>;
export type VerifiedEvent = z.infer<typeof VerifiedEventSchema>;
export type ActionZoneEvidenceCell = z.infer<typeof ActionZoneEvidenceCellSchema>;
export type ActionZoneEvidence = z.infer<typeof ActionZoneEvidenceSchema>;
export type ActionZone = z.infer<typeof ActionZoneSchema>;
export type SuppliedLandform = z.infer<typeof SuppliedLandformSchema>;
export type PublicDataBundle = z.infer<typeof PublicDataBundleSchema>;
