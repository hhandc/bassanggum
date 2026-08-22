import { z } from 'zod';
import type {
  ActionZone,
  AreaGeometry,
  OfficialOccurrence,
  PublicDataBundle,
  RestrictedArea,
  VerifiedEvent,
  Waterbody,
} from '@bassanggum/data-core';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const SourceSchema = z.enum(['official', 'community_verified']);
const StatusSchema = z.enum(['none', 'watch', 'known', 'emerging']);
const BoundingBoxSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]).superRefine(([west, south, east, north], context) => {
  if (west > east || south > north) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Bounding boxes must be ordered west, south, east, north.' });
  }
});
const PageSchema = {
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
};

export const ListSpeciesInput = z.object({
  category: z.enum(['fish', 'plant']).optional(),
  ...PageSchema,
}).strict();
const SearchOccurrencesInputShape = {
  speciesId: z.string().trim().min(1).optional(),
  bbox: BoundingBoxSchema.optional(),
  source: SourceSchema.optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  ...PageSchema,
};
export const SearchOccurrencesInput = z.object(SearchOccurrencesInputShape).strict().superRefine(dateRangeIsOrdered);
export const GetHotspotsInput = z.object({
  speciesId: z.string().trim().min(1).optional(),
  areaName: z.string().trim().min(1).optional(),
  bbox: BoundingBoxSchema.optional(),
  minStatus: StatusSchema.optional(),
  ...PageSchema,
}).strict();
export const GetAreaProfileInput = z.object({ areaId: z.string().trim().min(1) }).strict();
const FindRemovalEventsInputShape = {
  areaName: z.string().trim().min(1).optional(),
  speciesId: z.string().trim().min(1).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  ...PageSchema,
};
export const FindRemovalEventsInput = z.object(FindRemovalEventsInputShape).strict().superRefine(dateRangeIsOrdered);
export const McpSearchOccurrencesInputShape = SearchOccurrencesInputShape;
export const McpFindRemovalEventsInputShape = FindRemovalEventsInputShape;
export const GetSpeciesGuidanceInput = z.object({ speciesId: z.string().trim().min(1) }).strict();
export const GetDataProvenanceInput = z.object({ datasetId: z.string().trim().min(1).optional(), ...PageSchema }).strict();

type Provenance = {
  datasetId: string;
  provider: string;
  sourceUrl: string;
  licence: string;
  attribution: string;
  importRunId?: string | undefined;
  sourceRecordId?: string | undefined;
  doi?: string | undefined;
  publishedAt?: string | undefined;
  snapshotChecksum?: string | undefined;
  sourceFileChecksum?: string | undefined;
};
type EvidenceType = 'official' | 'community_verified' | 'mixed';
export type QueryResult<T> = {
  items: T[];
  evidenceType: EvidenceType;
  provenance: Provenance[];
  nextCursor?: string | undefined;
};
type Bbox = z.infer<typeof BoundingBoxSchema>;
type DateFilter = { dateFrom?: string | undefined; dateTo?: string | undefined };

export function listSpecies(bundle: PublicDataBundle, rawInput: z.input<typeof ListSpeciesInput> = {}): QueryResult<Record<string, unknown>> {
  const input = ListSpeciesInput.parse(rawInput);
  const provenance = bundleProvenance(bundle);
  const items = bundle.species
    .filter((species) => input.category === undefined || species.category === input.category)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((species) => ({ ...species, evidenceType: 'official' as const, provenance }));
  return page(items, input, { evidenceType: 'official', provenance });
}

export function searchOccurrences(bundle: PublicDataBundle, rawInput: z.input<typeof SearchOccurrencesInput> = {}): QueryResult<Record<string, unknown>> {
  const input = SearchOccurrencesInput.parse(rawInput);
  const officialRecords = input.source === undefined || input.source === 'official'
    ? bundle.officialOccurrences.filter((record) => matchesSpecies(record, input.speciesId) && matchesPoint(record.geometry.coordinates, input.bbox) && matchesDate(record.observedAt, input))
    : [];
  const official = officialRecords
      .map((record) => ({
        id: record.id,
        speciesId: record.speciesId,
        observedAt: record.observedAt,
        observedAtPrecision: record.observedAtPrecision,
        geometry: record.geometry,
        evidenceType: 'official' as const,
        provenance: provenanceOf(record),
      }));
  const community = input.source === undefined || input.source === 'community_verified'
    ? bundle.verifiedCommunitySignals
      .filter((record) => matchesSpecies(record, input.speciesId) && matchesDate(record.verifiedAt, input))
      .map((record) => ({
        id: record.id,
        speciesId: record.speciesId,
        signalType: record.signalType,
        verifiedAt: record.verifiedAt,
        evidenceType: 'community_verified' as const,
        provenance: [] as Provenance[],
      }))
    : [];
  return page([...official, ...community].sort(byId), input, {
    evidenceType: input.source ?? (community.length > 0 ? 'mixed' : 'official'),
    provenance: uniqueProvenance(officialRecords.map(provenanceOf)),
  });
}

export function getHotspots(bundle: PublicDataBundle, rawInput: z.input<typeof GetHotspotsInput> = {}): QueryResult<Record<string, unknown>> {
  const input = GetHotspotsInput.parse(rawInput);
  const records = sourceRecords(bundle);
  const items = bundle.actionZones
    .filter((zone) => matchesSpecies(zone, input.speciesId))
    .filter((zone) => input.areaName === undefined || zoneName(zone).toLocaleLowerCase().includes(input.areaName.toLocaleLowerCase()))
    .filter((zone) => input.bbox === undefined || geometryIntersectsBbox(zone.geometry, input.bbox))
    .map((zone) => hotspotResult(zone, records))
    .filter((zone) => input.minStatus === undefined || statusRank(zone.status) >= statusRank(input.minStatus))
    .sort((left, right) => Number(right.score) - Number(left.score) || String(left.id).localeCompare(String(right.id)));
  return page(items, input, {
    evidenceType: evidenceTypeFor(items),
    provenance: uniqueProvenance(items.flatMap((item) => item.provenance)),
  });
}

export function getAreaProfile(bundle: PublicDataBundle, rawInput: z.input<typeof GetAreaProfileInput>): Record<string, unknown> {
  const { areaId } = GetAreaProfileInput.parse(rawInput);
  const zone = bundle.actionZones.find((candidate) => candidate.id === areaId);
  if (zone === undefined) {
    return notFound('area', areaId);
  }
  const records = sourceRecords(bundle);
  const hotspot = hotspotResult(zone, records);
  const matchingWaterbodies = bundle.waterbodies.filter((waterbody) => geometryIntersectsGeometry(zone.geometry, waterbody.geometry));
  const restrictions = bundle.restrictedAreas
    .filter((area) => geometryIntersectsGeometry(zone.geometry, area.geometry))
    .map((area) => attributedArea(area));
  const matchingEvents = bundle.verifiedEvents
    .filter((event) => geometryIntersectsGeometry(zone.geometry, event.geometry))
    .map(attributedEvent);
  const species = bundle.species.find((candidate) => candidate.id === zone.speciesId);
  return {
    ...hotspot,
    topSpecies: [{ speciesId: zone.speciesId, koreanName: species?.koreanName, englishName: species?.englishName, score: zone.score }],
    scoreExplanation: `Score ${zone.score} is aggregated from ${zone.evidence.cells.length} public H3 evidence cell${zone.evidence.cells.length === 1 ? '' : 's'}.`,
    matchingWaterbodies: matchingWaterbodies.map(attributedArea),
    restrictions,
    matchingEvents,
    provenance: uniqueProvenance([
      hotspot.provenance,
      ...matchingWaterbodies.map(provenanceOf),
      ...bundle.restrictedAreas.filter((area) => geometryIntersectsGeometry(zone.geometry, area.geometry)).map(provenanceOf),
      ...bundle.verifiedEvents.filter((event) => geometryIntersectsGeometry(zone.geometry, event.geometry)).map(provenanceOf),
    ]),
  };
}

export function findRemovalEvents(bundle: PublicDataBundle, rawInput: z.input<typeof FindRemovalEventsInput> = {}): QueryResult<Record<string, unknown>> {
  const input = FindRemovalEventsInput.parse(rawInput);
  const namedAreas = input.areaName === undefined
    ? []
    : bundle.actionZones.filter((zone) => zoneName(zone).toLocaleLowerCase().includes(input.areaName!.toLocaleLowerCase()));
  const items = bundle.verifiedEvents
    .filter((event) => input.speciesId === undefined || event.eligibleSpeciesIds.includes(input.speciesId))
    .filter((event) => eventMatchesDate(event, input))
    .filter((event) => input.areaName === undefined || event.title.toLocaleLowerCase().includes(input.areaName.toLocaleLowerCase()) || namedAreas.some((area) => geometryIntersectsGeometry(event.geometry, area.geometry)))
    .map(attributedEvent)
    .sort((left, right) => String(left.startsAt).localeCompare(String(right.startsAt)) || String(left.id).localeCompare(String(right.id)));
  return page(items, input, {
    evidenceType: 'official',
    provenance: uniqueProvenance(bundle.verifiedEvents
      .filter((event) => input.speciesId === undefined || event.eligibleSpeciesIds.includes(input.speciesId))
      .filter((event) => eventMatchesDate(event, input))
      .filter((event) => input.areaName === undefined || event.title.toLocaleLowerCase().includes(input.areaName.toLocaleLowerCase()) || namedAreas.some((area) => geometryIntersectsGeometry(event.geometry, area.geometry)))
      .map(provenanceOf)),
  });
}

export function getSpeciesGuidance(bundle: PublicDataBundle, rawInput: z.input<typeof GetSpeciesGuidanceInput>): Record<string, unknown> {
  const { speciesId } = GetSpeciesGuidanceInput.parse(rawInput);
  const species = bundle.species.find((candidate) => candidate.id === speciesId);
  if (species === undefined) {
    return notFound('species', speciesId);
  }
  return {
    id: species.id,
    category: species.category,
    koreanName: species.koreanName,
    englishName: species.englishName,
    scientificName: species.scientificName,
    visualTraits: species.visualTraits,
    lookAlikes: species.lookAlikes,
    actionPolicy: species.actionPolicy,
    disposalGuidance: species.disposalGuidance,
    cookingGuidance: species.cookingGuidance,
    evidenceType: 'official' as const,
    provenance: bundleProvenance(bundle),
  };
}

export function getDataProvenance(bundle: PublicDataBundle, rawInput: z.input<typeof GetDataProvenanceInput> = {}): QueryResult<Record<string, unknown>> {
  const input = GetDataProvenanceInput.parse(rawInput);
  const provenance = allDataProvenance(bundle)
    .filter((record) => input.datasetId === undefined || record.datasetId === input.datasetId)
    .sort(byProvenanceIdentity);
  const items = provenance
    .map((record) => ({ ...record, evidenceType: 'official' as const, provenance: record }))
    .sort((left, right) => byProvenanceIdentity(left, right));
  return page(items, input, { evidenceType: 'official', provenance });
}

function dateRangeIsOrdered(value: DateFilter, context: z.RefinementCtx): void {
  if (value.dateFrom !== undefined && value.dateTo !== undefined && value.dateFrom > value.dateTo) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'dateFrom must not be later than dateTo.' });
  }
}

function page<T>(items: T[], input: { limit: number; cursor?: string | undefined }, metadata: Pick<QueryResult<T>, 'evidenceType' | 'provenance'>): QueryResult<T> {
  const offset = decodeCursor(input.cursor);
  const nextCursor = offset + input.limit < items.length ? encodeCursor(offset + input.limit) : undefined;
  return {
    ...metadata,
    items: items.slice(offset, offset + input.limit),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^\d+$/.test(decoded)) throw new Error('Invalid cursor.');
  return Number(decoded);
}

function sourceRecords(bundle: PublicDataBundle): Array<OfficialOccurrence | PublicDataBundle['habitatAreas'][number] | Waterbody | RestrictedArea | VerifiedEvent> {
  return [...bundle.officialOccurrences, ...bundle.habitatAreas, ...bundle.waterbodies, ...bundle.restrictedAreas, ...bundle.verifiedEvents];
}

function bundleProvenance(bundle: PublicDataBundle): Provenance[] {
  return allDataProvenance(bundle);
}

export function allDataProvenance(bundle: PublicDataBundle): Provenance[] {
  return uniqueProvenance(sourceRecords(bundle).map(provenanceOf));
}

function provenanceOf(record: { datasetId: string; provider: string; sourceUrl: string; licence: string; attribution: string; importRunId?: string | undefined; sourceRecordId?: string | undefined; doi?: string | undefined; publishedAt?: string | undefined; snapshotChecksum?: string | undefined; sourceFileChecksum?: string | undefined }): Provenance {
  return {
    datasetId: record.datasetId,
    provider: record.provider,
    sourceUrl: record.sourceUrl,
    licence: record.licence,
    attribution: record.attribution,
    ...(record.importRunId === undefined ? {} : { importRunId: record.importRunId }),
    ...(record.sourceRecordId === undefined ? {} : { sourceRecordId: record.sourceRecordId }),
    ...(record.doi === undefined ? {} : { doi: record.doi }),
    ...(record.publishedAt === undefined ? {} : { publishedAt: record.publishedAt }),
    ...(record.snapshotChecksum === undefined ? {} : { snapshotChecksum: record.snapshotChecksum }),
    ...(record.sourceFileChecksum === undefined ? {} : { sourceFileChecksum: record.sourceFileChecksum }),
  };
}

function uniqueProvenance(values: Array<Provenance | Provenance[] | undefined>): Provenance[] {
  const bySourceRecord = new Map<string, Provenance>();
  for (const value of values.flatMap((item) => item === undefined ? [] : Array.isArray(item) ? item : [item])) {
    bySourceRecord.set(provenanceIdentity(value), value);
  }
  return [...bySourceRecord.values()].sort(byProvenanceIdentity);
}

function hotspotResult(zone: ActionZone, records: ReturnType<typeof sourceRecords>): Record<string, unknown> & { provenance: Provenance[]; evidenceType: EvidenceType; status: z.infer<typeof StatusSchema> } {
  const recordById = new Map(records.map((record) => [record.id, record]));
  const contributorIds = zone.evidence.cells.flatMap((cell) => cell.contributingIds);
  const provenance = uniqueProvenance(contributorIds.flatMap((id) => {
    const record = recordById.get(id);
    return record === undefined ? [] : [provenanceOf(record)];
  }));
  const evidenceType: EvidenceType = contributorIds.length > 0 ? 'official' : 'community_verified';
  return {
    id: zone.id,
    areaName: zoneName(zone),
    speciesId: zone.speciesId,
    kind: zone.kind,
    score: zone.score,
    status: statusForScore(zone.score),
    sourceCellIds: zone.sourceCellIds,
    evidence: zone.evidence,
    geometry: zone.geometry,
    evidenceType,
    provenance,
  };
}

function notFound(kind: string, id: string): Record<string, unknown> {
  return {
    found: false,
    message: `No public ${kind} was found for ${id}.`,
    evidenceType: 'official' as const,
    provenance: [],
  };
}

function evidenceTypeFor(items: Array<{ evidenceType: EvidenceType }>): EvidenceType {
  const types = new Set(items.map((item) => item.evidenceType));
  if (types.size > 1) return 'mixed';
  return types.values().next().value ?? 'official';
}

function provenanceIdentity(record: Provenance): string {
  return [record.datasetId, record.importRunId ?? '', record.sourceRecordId ?? '', record.sourceUrl].join('\u0000');
}

function byProvenanceIdentity(left: Provenance, right: Provenance): number {
  return provenanceIdentity(left).localeCompare(provenanceIdentity(right));
}

function attributedArea(area: Waterbody | RestrictedArea): Record<string, unknown> {
  return { ...area, evidenceType: 'official' as const, provenance: provenanceOf(area) };
}

function attributedEvent(event: VerifiedEvent): Record<string, unknown> {
  return { ...event, evidenceType: 'official' as const, provenance: provenanceOf(event) };
}

function matchesSpecies(record: { speciesId: string }, speciesId: string | undefined): boolean {
  return speciesId === undefined || record.speciesId === speciesId;
}

function matchesPoint([longitude, latitude]: readonly [number, number, ...number[]], bbox: Bbox | undefined): boolean {
  return bbox === undefined || (longitude >= bbox[0] && longitude <= bbox[2] && latitude >= bbox[1] && latitude <= bbox[3]);
}

function matchesDate(value: string | undefined, filter: DateFilter): boolean {
  if (filter.dateFrom === undefined && filter.dateTo === undefined) return true;
  if (value === undefined) return false;
  return (filter.dateFrom === undefined || value >= filter.dateFrom) && (filter.dateTo === undefined || value <= filter.dateTo);
}

function eventMatchesDate(event: VerifiedEvent, filter: DateFilter): boolean {
  return (filter.dateFrom === undefined || event.endsAt >= filter.dateFrom) && (filter.dateTo === undefined || event.startsAt <= filter.dateTo);
}

function zoneName(zone: ActionZone): string {
  return 'name' in zone ? zone.name : zone.id;
}

function statusForScore(score: number): z.infer<typeof StatusSchema> {
  if (score >= 25) return 'known';
  if (score >= 10) return 'watch';
  return 'none';
}

function statusRank(status: z.infer<typeof StatusSchema>): number {
  return ({ none: 0, emerging: 1, watch: 2, known: 3 })[status];
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function geometryIntersectsBbox(geometry: AreaGeometry, bbox: Bbox): boolean {
  return geometryBounds(geometry).west <= bbox[2] && geometryBounds(geometry).east >= bbox[0] && geometryBounds(geometry).south <= bbox[3] && geometryBounds(geometry).north >= bbox[1];
}

function geometryIntersectsGeometry(left: AreaGeometry, right: AreaGeometry): boolean {
  const leftBounds = geometryBounds(left);
  const rightBounds = geometryBounds(right);
  if (leftBounds.east < rightBounds.west || leftBounds.west > rightBounds.east || leftBounds.north < rightBounds.south || leftBounds.south > rightBounds.north) return false;
  return polygons(left).some((leftPolygon) => polygons(right).some((rightPolygon) => polygonIntersectsPolygon(leftPolygon, rightPolygon)));
}

type Position = readonly [number, number];
type Polygon = readonly (readonly Position[])[];

function polygons(geometry: AreaGeometry): Polygon[] {
  return geometry.type === 'Polygon' ? [geometry.coordinates as Polygon] : geometry.coordinates.map((polygon) => polygon as Polygon);
}

function geometryBounds(geometry: AreaGeometry): { west: number; south: number; east: number; north: number } {
  const positions = polygons(geometry).flatMap((polygon) => polygon.flatMap((ring) => ring));
  return {
    west: Math.min(...positions.map(([longitude]) => longitude)),
    south: Math.min(...positions.map(([, latitude]) => latitude)),
    east: Math.max(...positions.map(([longitude]) => longitude)),
    north: Math.max(...positions.map(([, latitude]) => latitude)),
  };
}

function polygonIntersectsPolygon(left: Polygon, right: Polygon): boolean {
  const leftOuter = left[0]!;
  const rightOuter = right[0]!;
  return ringsIntersect(leftOuter, rightOuter) || leftOuter.some((point) => pointInPolygon(point, right)) || rightOuter.some((point) => pointInPolygon(point, left));
}

function ringsIntersect(left: readonly Position[], right: readonly Position[]): boolean {
  return segments(left).some(([leftStart, leftEnd]) => segments(right).some(([rightStart, rightEnd]) => segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)));
}

function segments(ring: readonly Position[]): Array<[Position, Position]> {
  return ring.slice(0, -1).map((point, index) => [point, ring[index + 1]!] as [Position, Position]);
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const orientation = (start: Position, end: Position, point: Position) => (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && pointOnSegment(a, b, c)) return true;
  if (abD === 0 && pointOnSegment(a, b, d)) return true;
  if (cdA === 0 && pointOnSegment(c, d, a)) return true;
  if (cdB === 0 && pointOnSegment(c, d, b)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function pointOnSegment(start: Position, end: Position, point: Position): boolean {
  return point[0] >= Math.min(start[0], end[0]) && point[0] <= Math.max(start[0], end[0]) && point[1] >= Math.min(start[1], end[1]) && point[1] <= Math.max(start[1], end[1]);
}

function pointInPolygon(point: Position, polygon: Polygon): boolean {
  return pointInRing(point, polygon[0]!) && !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function pointInRing([longitude, latitude]: Position, ring: readonly Position[]): boolean {
  let inside = false;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [startLongitude, startLatitude] = ring[index]!;
    const [endLongitude, endLatitude] = ring[index + 1]!;
    if ((startLatitude > latitude) !== (endLatitude > latitude) && longitude < ((endLongitude - startLongitude) * (latitude - startLatitude)) / (endLatitude - startLatitude) + startLongitude) inside = !inside;
  }
  return inside;
}
