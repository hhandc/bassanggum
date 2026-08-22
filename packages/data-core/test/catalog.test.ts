import { buildSpeciesCatalog } from '@bassanggum/data-core';
import { describe, expect, it } from 'vitest';

const records = [
  {
    id: 'lepomis-macrochirus',
    category: 'fish' as const,
    englishName: 'Bluegill',
    koreanName: '블루길',
    scientificName: 'Lepomis macrochirus',
    visualTraits: ['Deep, laterally compressed body'],
    lookAlikes: ['Native sunfish'],
    disposalGuidance: { text: 'Follow the local authority disposal directions.', sourceUrl: 'https://example.test/disposal' },
    actionPolicy: 'official_event_only' as const,
  },
  {
    id: 'sicyos-angulatus',
    category: 'plant' as const,
    englishName: 'Bur cucumber',
    koreanName: '가시박',
    scientificName: 'Sicyos angulatus',
    visualTraits: ['Climbing vine with rough leaves'],
    lookAlikes: ['Native cucumber relatives'],
    disposalGuidance: { text: 'Bag fragments before disposal.', sourceUrl: 'https://example.test/disposal' },
    actionPolicy: 'report_only' as const,
  },
];

const media = [
  {
    speciesId: 'lepomis-macrochirus',
    url: 'https://example.test/bluegill.jpg',
    credit: 'Example photographer',
    licence: 'CC BY 4.0',
  },
  {
    speciesId: 'sicyos-angulatus',
    url: 'https://example.test/bur-cucumber.jpg',
    credit: 'Example photographer',
    licence: 'CC BY 4.0',
  },
];

describe('species catalogue', () => {
  it('contains only fish and plant entries', () => {
    expect(buildSpeciesCatalog(records, media).every((item) => ['fish', 'plant'].includes(item.category))).toBe(true);
  });

  it('requires licence metadata for every identification image', () => {
    expect(() => buildSpeciesCatalog(records, [{ speciesId: 'lepomis-macrochirus', url: 'https://example.test/bluegill.jpg' }])).toThrow();
  });

  it('keeps bilingual guidance and an action policy with each observed species', () => {
    expect(buildSpeciesCatalog(records, media)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'lepomis-macrochirus',
          koreanName: '블루길',
          actionPolicy: 'official_event_only',
          identificationMedia: [expect.objectContaining({ credit: 'Example photographer', licence: 'CC BY 4.0' })],
        }),
      ]),
    );
  });

  it('allows source-linked cooking guidance only for fish', () => {
    const fish = { ...records[0]!, cookingGuidance: { text: 'Cook thoroughly.', sourceUrl: 'https://example.test/cooking' } };
    expect(buildSpeciesCatalog([fish], [media[0]!])[0]?.cookingGuidance).toEqual(fish.cookingGuidance);

    const plant = { ...records[1]!, cookingGuidance: { text: 'Do not use this.', sourceUrl: 'https://example.test/cooking' } };
    expect(() => buildSpeciesCatalog([plant], [media[1]!])).toThrow(/plant/i);
  });

  it('does not accept generated imagery as the only identification reference', () => {
    expect(() => buildSpeciesCatalog(records.slice(0, 1), [{ ...media[0]!, generated: true, supplementary: true }])).toThrow(/generated/i);
  });
});
