import type { FeatureCollection, Geometry } from 'geojson';

export type MapFeature = {
  geometry: Geometry;
  properties: { id: string; kind?: string; name?: string; topSpecies?: string[]; restriction?: string };
  type: 'Feature';
};

export type MapLayers = {
  actionZones: FeatureCollection;
  restrictedAreas: FeatureCollection;
};

export type MapViewport = {
  bbox: [west: number, south: number, east: number, north: number];
  zoom: number;
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
