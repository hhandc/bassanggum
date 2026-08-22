import type { PublicDataBundle } from '@bassanggum/data-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createOpenAiFishClassifier, createPlantNetClassifier, fixtureClassifier } from '../services/classifier.js';

const ReportSchema = z.object({ type: z.enum(['sighting', 'removal']), speciesId: z.string().min(1), deviceToken: z.string().min(1), location: z.tuple([z.number(), z.number()]), mediaToken: z.string().min(1) });

export function registerReportRoutes(app: FastifyInstance, bundle: PublicDataBundle): void {
  const reports = new Map<string, { deviceToken: string; status: string; verifiedUnits: number; pointsAwarded: number }>();
  app.post('/reports', async (request, reply) => {
    const parsed = ReportSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ status: 'invalid_request' });
    const input = parsed.data;
    const targetSpecies = bundle.species.find((species) => species.id === input.speciesId);
    if (targetSpecies === undefined) return reply.code(400).send({ status: 'rejected', reason: 'non_target' });
    if (!isWithinGyeongbuk(input.location)) return reply.code(400).send({ status: 'rejected', reason: 'outside_gyeongbuk' });
    if (input.type === 'removal' && bundle.restrictedAreas.some((area) => containsPoint(area.geometry, input.location))) {
      return reply.code(400).send({ status: 'rejected', reason: 'restricted_area' });
    }
    const classifier = input.mediaToken.startsWith('fixture:')
      ? fixtureClassifier
      : targetSpecies.category === 'plant' && process.env.PLANTNET_API_KEY !== undefined
        ? createPlantNetClassifier(process.env.PLANTNET_API_KEY)
        : targetSpecies.category === 'fish' && process.env.OPENAI_API_KEY !== undefined
          ? createOpenAiFishClassifier(process.env.OPENAI_API_KEY)
          : fixtureClassifier;
    const result = await classifier.classify(input.mediaToken);
    const identifiedSpeciesId = bundle.species.find((species) => species.scientificName === result.speciesId)?.id ?? result.speciesId;
    const id = `report:${input.deviceToken}:${Date.now()}`;
    const report = result.confidence < 0.8 || identifiedSpeciesId !== input.speciesId
      ? { deviceToken: input.deviceToken, status: 'needs_review', verifiedUnits: 0, pointsAwarded: 0 }
      : { deviceToken: input.deviceToken, status: 'auto_verified', verifiedUnits: input.type === 'removal' ? 1 : 0, pointsAwarded: 0 };
    reports.set(id, report);
    return { id, ...report, identification: { speciesId: identifiedSpeciesId, confidence: result.confidence } };
  });
  app.get('/reports/:id', (request, reply) => {
    const deviceToken = z.string().min(1).safeParse((request.query as { deviceToken?: unknown }).deviceToken);
    const report = reports.get((request.params as { id: string }).id);
    if (!deviceToken.success || report === undefined || report.deviceToken !== deviceToken.data) return reply.code(404).send({ status: 'not_found' });
    return { id: (request.params as { id: string }).id, status: report.status, verifiedUnits: report.verifiedUnits, pointsAwarded: report.pointsAwarded };
  });
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
