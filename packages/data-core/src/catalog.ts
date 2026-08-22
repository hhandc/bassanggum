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
    visualTraits: z.array(NonEmptyString).min(1).optional(),
    lookAlikes: z.array(NonEmptyString).min(1).optional(),
    disposalGuidance: GuidanceSchema.optional(),
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
 * A reviewed card may carry licensed media, but catalogue coverage never
 * implies that an image, disposal method, or cooking advice has been verified.
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
      if (identificationMedia.some((image) => image.generated === true && image.supplementary !== true)) {
        throw new Error(`Generated image for ${record.id} must be explicitly supplementary.`);
      }
      if (identificationMedia.length > 0 && !identificationMedia.some((image) => image.generated !== true)) {
        throw new Error(`Generated imagery cannot be the sole identification reference for ${record.id}.`);
      }

      return SpeciesSchema.parse({ ...record, ...(identificationMedia.length === 0 ? {} : { identificationMedia }) });
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
