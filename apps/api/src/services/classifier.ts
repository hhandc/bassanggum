export type ClassificationResult = { confidence: number; matched: boolean; speciesId?: string };

export interface Classifier {
  classify(mediaToken: string): Promise<ClassificationResult>;
}

export const fixtureClassifier: Classifier = {
  async classify(mediaToken) {
    if (mediaToken === 'fixture:target') return { speciesId: 'micropterus-salmoides', confidence: 0.95, matched: true };
    if (mediaToken === 'fixture:plant-target') return { speciesId: 'sicyos-angulatus', confidence: 0.95, matched: true };
    return { confidence: 0.4, matched: true };
  },
};

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export function createOpenAiFishClassifier(apiKey: string, fetchImpl: Fetch = fetch): Classifier {
  return {
    async classify(imageUrl) {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5',
          input: [{ role: 'user', content: [
            { type: 'input_text', text: 'Identify this fish. Reply only JSON: {"speciesId":"micropterus-salmoides"|"lepomis-macrochirus"|null,"confidence":number}. Only select a species when the image supports it.' },
            { type: 'input_image', image_url: imageUrl },
          ] }],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI fish classification failed: ${response.status}.`);
      const body = await response.json() as { output_text?: string };
      const result = JSON.parse(body.output_text ?? '{}') as ClassificationResult;
      return { confidence: result.confidence ?? 0, matched: result.speciesId !== undefined, ...(result.speciesId === undefined ? {} : { speciesId: result.speciesId }) };
    },
  };
}

export function createPlantNetClassifier(apiKey: string, fetchImpl: Fetch = fetch): Classifier {
  return {
    async classify(imageUrl) {
      const imageResponse = await fetchImpl(imageUrl, { method: 'GET' });
      if (!imageResponse.ok) throw new Error(`Plant image download failed: ${imageResponse.status}.`);
      const form = new FormData();
      form.append('images', await imageResponse.blob(), 'report.jpg');
      const response = await fetchImpl(`https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(apiKey)}&nb-results=1`, { method: 'POST', body: form });
      if (!response.ok) throw new Error(`Pl@ntNet classification failed: ${response.status}.`);
      const body = await response.json() as { results?: Array<{ score?: number; species?: { scientificNameWithoutAuthor?: string } }> };
      const result = body.results?.[0];
      return { confidence: result?.score ?? 0, matched: result !== undefined, ...(result?.species?.scientificNameWithoutAuthor === undefined ? {} : { speciesId: result.species.scientificNameWithoutAuthor }) };
    },
  };
}
