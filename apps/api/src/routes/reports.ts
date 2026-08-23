import type { PublicDataBundle } from '@bassanggum/data-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createOpenAiFishClassifier, createPlantNetClassifier, fixtureClassifier } from '../services/classifier.js';

const ReportSchema = z.object({
  category: z.enum(['fish', 'plant']).optional(),
  type: z.enum(['sighting', 'removal']),
  speciesId: z.string().min(1).optional(),
  deviceToken: z.string().min(1),
  location: z.tuple([z.number(), z.number()]),
  mediaToken: z.string().min(1).optional(),
  mediaDataUrl: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.mediaToken === undefined && value.mediaDataUrl === undefined) {
    context.addIssue({ code: 'custom', message: 'Image evidence is required.' });
  }
  if (value.category === undefined && value.speciesId === undefined) {
    context.addIssue({ code: 'custom', message: 'A category or species is required.' });
  }
});

export function registerReportRoutes(app: FastifyInstance, bundle: PublicDataBundle): void {
  const reports = new Map<string, { deviceToken: string; status: string; verifiedUnits: number; pointsAwarded: number }>();
  app.post('/reports', async (request, reply) => {
    const parsed = ReportSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ status: 'invalid_request' });
    const input = parsed.data;
    const expectedSpecies = input.speciesId === undefined ? undefined : bundle.species.find((species) => species.id === input.speciesId);
    if (input.speciesId !== undefined && expectedSpecies === undefined) return reply.code(400).send({ status: 'rejected', reason: 'non_target' });
    const category = input.category ?? expectedSpecies?.category;
    if (category === undefined) return reply.code(400).send({ status: 'invalid_request' });
    const media = input.mediaDataUrl ?? input.mediaToken;
    if (media === undefined || !isSupportedMedia(media)) return reply.code(400).send({ status: 'invalid_request' });
    if (!isWithinGyeongbuk(input.location)) return reply.code(400).send({ status: 'rejected', reason: 'outside_gyeongbuk' });
    if (input.type === 'removal' && bundle.restrictedAreas.some((area) => containsPoint(area.geometry, input.location))) {
      return reply.code(400).send({ status: 'rejected', reason: 'restricted_area' });
    }
    const classifier = media.startsWith('fixture:')
      ? fixtureClassifier
      : category === 'plant' && process.env.PLANTNET_API_KEY !== undefined
        ? createPlantNetClassifier(process.env.PLANTNET_API_KEY)
        : category === 'fish' && process.env.OPENAI_API_KEY !== undefined
          ? createOpenAiFishClassifier(process.env.OPENAI_API_KEY)
          : fixtureClassifier;
    const result = await classifier.classify(media);
    const identifiedSpeciesId = bundle.species.find((species) => species.scientificName === result.speciesId)?.id ?? result.speciesId;
    const identifiedSpecies = bundle.species.find((species) => species.id === identifiedSpeciesId);
    const id = `report:${input.deviceToken}:${Date.now()}`;
    const report = result.confidence < 0.7 || identifiedSpecies === undefined || (expectedSpecies !== undefined && identifiedSpeciesId !== expectedSpecies.id)
      ? { deviceToken: input.deviceToken, status: 'needs_review', verifiedUnits: 0, pointsAwarded: 0 }
      : { deviceToken: input.deviceToken, status: 'auto_verified', verifiedUnits: input.type === 'removal' ? 1 : 0, pointsAwarded: 0 };
    reports.set(id, report);
    return {
      id,
      ...report,
      identification: {
        speciesId: identifiedSpeciesId,
        confidence: result.confidence,
        ...(identifiedSpecies?.scientificName === undefined ? {} : { scientificName: identifiedSpecies.scientificName }),
        ...(identifiedSpecies?.englishName === undefined && identifiedSpecies?.koreanName === undefined
          ? {}
          : { commonName: identifiedSpecies.englishName ?? identifiedSpecies.koreanName }),
        ...(identifiedSpecies?.koreanName === undefined ? {} : { koreanName: identifiedSpecies.koreanName }),
      },
    };
  });
  app.get('/reports/:id', (request, reply) => {
    const deviceToken = z.string().min(1).safeParse((request.query as { deviceToken?: unknown }).deviceToken);
    const report = reports.get((request.params as { id: string }).id);
    if (!deviceToken.success || report === undefined || report.deviceToken !== deviceToken.data) return reply.code(404).send({ status: 'not_found' });
    return { id: (request.params as { id: string }).id, status: report.status, verifiedUnits: report.verifiedUnits, pointsAwarded: report.pointsAwarded };
  });
}

function isSupportedMedia(media: string): boolean {
  if (media.startsWith('fixture:')) return true;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(media);
  if (match === null) return false;
  const encoded = match[2];
  return encoded !== undefined && Buffer.byteLength(encoded, 'base64') <= 5 * 1024 * 1024;
}

function isWithinGyeongbuk([longitude, latitude]: [number, number]): boolean {
  return longitude >= 128 && longitude <= 130 && latitude >= 35.5 && latitude <= 37.7;
}

function containsPoint(geometry: { type: string; coordinates: unknown }, point: [number, number]): boolean {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates as unknown[];
  return polygons.some((polygon) => pointInRing((polygon as Array<Array<[number, number]>>)[0]!, point));
}

function pointInRing(ring: Array<[number, number]>, [longitude, latitude]: [number, number]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [leftLongitude, leftLatitude] = ring[index]!;
    const [rightLongitude, rightLatitude] = ring[previous]!;
    if ((leftLatitude > latitude) !== (rightLatitude > latitude) && longitude < (rightLongitude - leftLongitude) * (latitude - leftLatitude) / (rightLatitude - leftLatitude) + leftLongitude) inside = !inside;
  }
  return inside;
}
