import type { FeatureCollection, Geometry } from 'geojson';

export type MapFeature = {
  geometry: Geometry;
  properties: { id: string; kind?: string; name?: string; topSpecies?: MapSpecies[]; restriction?: string };
  type: 'Feature';
};

export type MapSpecies = {
  id: string;
  imageUrl?: string;
  name: string;
  score: number;
};

export type MapLayers = {
  actionZones: FeatureCollection;
  restrictedAreas: FeatureCollection;
};

export type MapViewport = {
  bbox: [west: number, south: number, east: number, north: number];
  zoom: number;
};

export type SpeciesCatalogItem = {
  id: string;
  category: 'fish' | 'plant';
  englishName?: string;
  koreanName?: string;
  scientificName?: string;
  actionPolicy: 'community_removal' | 'official_event_only' | 'report_only';
  disposalGuidance?: { text: string; sourceUrl: string };
  cookingGuidance?: { text: string; sourceUrl: string };
};

export type VerifiedEvent = {
  id: string;
  organizer: string;
  title: string;
  eventUrl: string;
  startsAt: string;
  endsAt: string;
  eligibleSpeciesIds: string[];
  rewardWording: string;
  eligibilityNotes: string;
};

export type ReportInput = {
  type: 'sighting' | 'removal';
  speciesId: string;
  deviceToken: string;
  location: [longitude: number, latitude: number];
  mediaToken: string;
};

export type ReportResult = {
  id: string;
  status: 'auto_verified' | 'needs_review' | 'rejected' | 'invalid_request';
  reason?: string;
  verifiedUnits: number;
  pointsAwarded: number;
  identification?: { speciesId: string; confidence: number };
};

export function getApiBaseUrl(configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL): string {
  return configuredBaseUrl || 'http://localhost:3001';
}

export async function fetchMapLayers(viewport?: MapViewport): Promise<MapLayers> {
  const query = viewport === undefined ? '' : `?bbox=${encodeURIComponent(viewport.bbox.join(','))}&zoom=${viewport.zoom}`;
  const response = await fetch(`${getApiBaseUrl()}/map/layers${query}`);
  if (!response.ok) throw new Error('Unable to load map layers.');
  return response.json() as Promise<MapLayers>;
}

export async function fetchSpeciesCatalog(): Promise<SpeciesCatalogItem[]> {
  const response = await fetch(`${getApiBaseUrl()}/species`);
  if (!response.ok) throw new Error('Unable to load species catalog.');
  return response.json() as Promise<SpeciesCatalogItem[]>;
}

export async function fetchEvents(): Promise<{ events: VerifiedEvent[] }> {
  const response = await fetch(`${getApiBaseUrl()}/events`);
  if (!response.ok) throw new Error('Unable to load events.');
  return response.json() as Promise<{ events: VerifiedEvent[] }>;
}

export async function submitReport(input: ReportInput): Promise<ReportResult> {
  const response = await fetch(`${getApiBaseUrl()}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as ReportResult;
  if (!response.ok) {
    return { ...body, status: body.status ?? 'rejected' };
  }
  return body;
}

export async function fetchReport(id: string, deviceToken: string): Promise<ReportResult> {
  const response = await fetch(`${getApiBaseUrl()}/reports/${id}?deviceToken=${encodeURIComponent(deviceToken)}`);
  if (!response.ok) throw new Error('Unable to load report.');
  return response.json() as Promise<ReportResult>;
}
