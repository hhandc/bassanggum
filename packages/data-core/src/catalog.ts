import { z } from 'zod';
import { SpeciesSchema, type Species } from './schema.js';

const NonEmptyString = z.string().trim().min(1);
const GuidanceSchema = z.object({ text: NonEmptyString, sourceUrl: z.string().url() }).strict();

const CatalogRecordSchema = z
  .object({
    id: NonEmptyString,
    category: z.enum(['fish', 'plant']),
    englishName: NonEmptyString,
    koreanName: NonEmptyString,
    scientificName: NonEmptyString,
    visualTraits: z.array(NonEmptyString).min(1),
    lookAlikes: z.array(NonEmptyString).min(1),
    disposalGuidance: GuidanceSchema,
    actionPolicy: z.enum(['community_removal', 'official_event_only', 'report_only']),
    cookingGuidance: GuidanceSchema.optional(),
  })
  .strict();

const IdentificationMediaSchema = z
  .object({
    speciesId: NonEmptyString,
    url: z.string().url(),
    sourceUrl: z.string().url(),
    credit: NonEmptyString,
    licence: NonEmptyString,
    generated: z.boolean().optional(),
    supplementary: z.boolean().optional(),
  })
  .strict();

export type CatalogRecord = z.infer<typeof CatalogRecordSchema>;
export type IdentificationMedia = z.infer<typeof IdentificationMediaSchema>;

/**
 * Validates curated fish/plant identification content before it is published.
 * Generated imagery can be supplementary, but a licensed non-generated image
 * remains mandatory for each species' identification reference.
 */
export function buildSpeciesCatalog(records: readonly unknown[], media: readonly unknown[]): Species[] {
  const parsedRecords = records.map((record) => CatalogRecordSchema.parse(record));
  const parsedMedia = media.map((image) => IdentificationMediaSchema.parse(image));
  const knownIds = new Set(parsedRecords.map((record) => record.id));

  if (knownIds.size !== parsedRecords.length) {
    throw new Error('Catalogue species IDs must be unique.');
  }
  if (parsedMedia.some((image) => !knownIds.has(image.speciesId))) {
    throw new Error('Identification media must reference a catalogue species.');
  }

  return parsedRecords
    .map((record) => {
      if (record.category === 'plant' && record.cookingGuidance !== undefined) {
        throw new Error(`Plant catalogue entry ${record.id} cannot include cooking guidance.`);
      }

      const identificationMedia = parsedMedia.filter((image) => image.speciesId === record.id);
      if (identificationMedia.length === 0) {
        throw new Error(`Catalogue entry ${record.id} requires a licensed identification image.`);
      }
      if (identificationMedia.some((image) => image.generated === true && image.supplementary !== true)) {
        throw new Error(`Generated image for ${record.id} must be explicitly supplementary.`);
      }
      if (!identificationMedia.some((image) => image.generated !== true)) {
        throw new Error(`Generated imagery cannot be the sole identification reference for ${record.id}.`);
      }

      return SpeciesSchema.parse({ ...record, identificationMedia });
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
