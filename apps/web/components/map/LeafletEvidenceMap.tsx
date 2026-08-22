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
};

export function LeafletEvidenceMap({ actionZones, restrictedAreas, onActionZoneClick, onRestrictedAreaClick, onViewportChange, userLocation }: LeafletEvidenceMapProps) {
  return (
    <div aria-label="OpenStreetMap base map" style={{ height: '100%', width: '100%' }}>
      <MapContainer center={[36.35, 128.85]} style={{ height: '100%', width: '100%' }} zoom={8}>
        <TileLayer attribution="© OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ViewportListener onViewportChange={onViewportChange} />
        <LocationFocus location={userLocation} />
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
