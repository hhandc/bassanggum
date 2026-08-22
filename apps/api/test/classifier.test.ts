import { describe, expect, it } from 'vitest';

import { createOpenAiFishClassifier, createPlantNetClassifier, fixtureClassifier } from '../src/services/classifier.js';

describe('fixture classifier', () => {
  it('identifies a target fish fixture with a user-visible species ID', async () => {
    await expect(fixtureClassifier.classify('fixture:target')).resolves.toMatchObject({ speciesId: 'micropterus-salmoides', confidence: 0.95, matched: true });
  });

  it('maps an OpenAI fish classification to the project species ID', async () => {
    const classifier = createOpenAiFishClassifier('test-key', async (_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['Content-Type']).toBe('application/json');
      expect(headers?.Authorization.startsWith('Bearer ')).toBe(true);
      expect(headers?.Authorization.length).toBeGreaterThan('Bearer '.length);
      return new Response(JSON.stringify({ output_text: '{"speciesId":"lepomis-macrochirus","confidence":0.91}' }));
    });
    await expect(classifier.classify('https://example.com/bluegill.jpg')).resolves.toMatchObject({ speciesId: 'lepomis-macrochirus', confidence: 0.91, matched: true });
  });

  it('uploads plant image bytes to PlantNet and returns its scientific name', async () => {
    const classifier = createPlantNetClassifier('test-key', async (url, init) => {
      if (url === 'https://example.com/bur-cucumber.jpg') return new Response(new Blob(['image'], { type: 'image/jpeg' }));
      expect(url).toContain('https://my-api.plantnet.org/v2/identify/all?api-key=test-key');
      expect(init.body).toBeInstanceOf(FormData);
      return new Response(JSON.stringify({ results: [{ score: 0.88, species: { scientificNameWithoutAuthor: 'Sicyos angulatus' } }] }));
    });

    await expect(classifier.classify('https://example.com/bur-cucumber.jpg')).resolves.toMatchObject({ speciesId: 'Sicyos angulatus', confidence: 0.88, matched: true });
  });
});
