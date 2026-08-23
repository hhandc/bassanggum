'use client';

import type { Feature, FeatureCollection } from 'geojson';
import { GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useEffect } from 'react';

import type { MapViewport } from '../../lib/api';

type LeafletEvidenceMapProps = {
  actionZones: FeatureCollection;
  restrictedAreas: FeatureCollection;
  onActionZoneClick(feature: Feature): void;
  onRestrictedAreaClick(feature: Feature): void;
  onViewportChange(viewport: MapViewport): void;
  userLocation: [latitude: number, longitude: number] | null;
  selectedFeature?: Feature | null;
};

export function LeafletEvidenceMap({ actionZones, restrictedAreas, onActionZoneClick, onRestrictedAreaClick, onViewportChange, userLocation, selectedFeature }: LeafletEvidenceMapProps) {
  return (
    <div aria-label="OpenStreetMap base map" style={{ height: '100%', width: '100%' }}>
      <MapContainer center={[36.35, 128.85]} style={{ height: '100%', width: '100%' }} zoom={8}>
        <TileLayer attribution="© OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ViewportListener onViewportChange={onViewportChange} />
        <LocationFocus location={userLocation} />
        <SelectionFocus feature={selectedFeature} />
        <GeoJSON data={restrictedAreas} key={`restricted-${featureCollectionKey(restrictedAreas)}`} onEachFeature={(feature, layer) => layer.on('click', () => onRestrictedAreaClick(feature))} pathOptions={{ color: '#8e0000', fillColor: '#c62828', fillOpacity: 0.35, weight: 2 }} />
        <GeoJSON data={actionZones} key={`action-${featureCollectionKey(actionZones)}`} onEachFeature={(feature, layer) => layer.on('click', () => onActionZoneClick(feature))} style={actionZoneStyle} />
      </MapContainer>
    </div>
  );
}

function actionZoneStyle(feature?: Feature) {
  const kind = feature?.properties?.kind;
  if (kind === 'plant_activity') return { color: '#20663b', fillColor: '#4f9b58', fillOpacity: 0.38, weight: 2 };
  if (kind === 'mixed_activity') return { color: '#5b3a82', fillColor: '#6f5aa7', fillOpacity: 0.45, weight: 2 };
  return { color: '#0d4778', fillColor: '#1769aa', fillOpacity: 0.45, weight: 2 };
}

function featureCollectionKey(collection: FeatureCollection): string {
  return collection.features.map((feature) => String(feature.properties?.id ?? '')).join('|');
}

function ViewportListener({ onViewportChange }: Pick<LeafletEvidenceMapProps, 'onViewportChange'>) {
  const map = useMapEvents({ moveend: sendViewport });

  useEffect(() => {
    sendViewport();
  }, [map, onViewportChange]);

  function sendViewport(): void {
    const bounds = map.getBounds();
    onViewportChange({ bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], zoom: Math.round(map.getZoom()) });
  }

  return null;
}

function LocationFocus({ location }: { location: LeafletEvidenceMapProps['userLocation'] }) {
  const map = useMap();

  useEffect(() => {
    if (location !== null) map.flyTo(location, 12);
  }, [location, map]);

  return null;
}

function SelectionFocus({ feature }: { feature: Feature | null | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (feature === null || feature === undefined) return;
    const center = featureCentroid(feature);
    if (center !== null) map.flyTo(center, 12);
  }, [feature, map]);

  return null;
}

function featureCentroid(feature: Feature): [latitude: number, longitude: number] | null {
  const geometry = feature.geometry;
  if (geometry === null || geometry === undefined) return null;
  if (geometry.type === 'Point') {
    const [longitude, latitude] = geometry.coordinates;
    return [latitude, longitude];
  }
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    if (ring === undefined) return null;
    return polygonCentroid(ring);
  }
  if (geometry.type === 'MultiPolygon') {
    const positions = geometry.coordinates.flat(2) as number[][];
    return positionsCentroid(positions);
  }
  if (geometry.type === 'LineString') {
    return positionsCentroid(geometry.coordinates);
  }
  return null;
}

function polygonCentroid(ring: number[][]): [number, number] | null {
  const positions = ring.slice(0, -1);
  return positionsCentroid(positions);
}

function positionsCentroid(positions: number[][]): [number, number] | null {
  if (positions.length === 0) return null;
  let totalLongitude = 0;
  let totalLatitude = 0;
  for (const position of positions) {
    totalLongitude += position[0]!;
    totalLatitude += position[1]!;
  }
  return [totalLatitude / positions.length, totalLongitude / positions.length];
}
