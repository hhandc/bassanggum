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

export type MapCategory = 'fish' | 'plant';

export type ReportInput = { category: MapCategory; type: 'sighting' | 'removal'; deviceToken: string; location: [longitude: number, latitude: number]; mediaDataUrl: string };
export type ReportResult = { id?: string; status: 'auto_verified' | 'needs_review' | 'rejected'; reason?: string; verifiedUnits?: number; identification?: { speciesId?: string; scientificName?: string; commonName?: string; koreanName?: string; confidence?: number } };

export function getApiBaseUrl(configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL): string {
  return configuredBaseUrl || 'http://localhost:3001';
}

export async function fetchMapLayers(viewport?: MapViewport, category?: MapCategory): Promise<MapLayers> {
  const search = new URLSearchParams();
  if (viewport !== undefined) {
    search.set('bbox', viewport.bbox.join(','));
    search.set('zoom', String(viewport.zoom));
  }
  if (category !== undefined) search.set('category', category);
  const query = search.size === 0 ? '' : `?${search.toString()}`;
  const response = await fetch(`${getApiBaseUrl()}/map/layers${query}`);
  if (!response.ok) throw new Error('Unable to load map layers.');
  return response.json() as Promise<MapLayers>;
}

export async function submitReport(input: ReportInput): Promise<ReportResult> {
  const response = await fetch(`${getApiBaseUrl()}/reports`, { body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' }, method: 'POST' });
  const result = await response.json() as ReportResult;
  if (!response.ok && result.status !== 'rejected') throw new Error('Unable to submit this report.');
  return result;
}
