'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Feature } from 'geojson';

import { fetchMapLayers, type MapLayers, type MapViewport } from '../../lib/api';
import { AreaSheet, type SelectedArea } from './AreaSheet';
import { BottomNav } from '../BottomNav';
import { MapLegend } from './MapLegend';

const LeafletEvidenceMap = dynamic(() => import('./LeafletEvidenceMap').then((module) => module.LeafletEvidenceMap), { ssr: false });

const emptyFeatureCollection = { type: 'FeatureCollection' as const, features: [] };

type BassanggumMapProps = {
  locale: 'en' | 'ko';
};

export function BassanggumMap({ locale }: BassanggumMapProps) {
  const [layers, setLayers] = useState<MapLayers | null>(null);
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [joinedAreas, setJoinedAreas] = useState<Set<string>>(new Set());
  const [mapError, setMapError] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const isKorean = locale === 'ko';

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const stored = localStorage.getItem('bassanggum-joined-bounties');
    if (stored === null) return;
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) setJoinedAreas(new Set(parsed.filter((item): item is string => typeof item === 'string')));
    } catch {
      // ignore malformed storage
    }
  }, []);

  const loadViewport = useCallback((viewport: MapViewport) => {
    void fetchMapLayers(viewport).then((response) => {
      setLayers(response);
      setMapError(false);
    }).catch(() => setMapError(true));
  }, []);

  function joinArea(area: SelectedArea): void {
    const next = new Set(joinedAreas);
    next.add(area.id);
    setJoinedAreas(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bassanggum-joined-bounties', JSON.stringify([...next]));
    }
  }

  function areaName(feature: Feature): string {
    const properties = feature.properties ?? {};
    const kind = String(properties.kind ?? '');
    const apiName = typeof properties.name === 'string' ? properties.name : undefined;
    if (apiName !== undefined && apiName.trim() !== '') return apiName;
    if (kind === 'fish_activity') return isKorean ? '이름 없는 물고기 활동 구역' : 'Unnamed fish activity area';
    if (kind === 'plant_activity') return isKorean ? '이름 없는 식물 활동 구역' : 'Unnamed plant activity area';
    if (kind === 'mixed_activity') return isKorean ? '이름 없는 혼합 활동 구역' : 'Unnamed mixed activity area';
    return isKorean ? '이름 없는 집중 구역' : 'Unnamed hotspot';
  }

  function areaKind(feature: Feature): string {
    const kind = String(feature.properties?.kind ?? '');
    if (kind === 'fish_activity') return isKorean ? '물고기 활동 구역' : 'Fish activity area';
    if (kind === 'plant_activity') return isKorean ? '식물 활동 구역' : 'Plant activity area';
    if (kind === 'mixed_activity') return isKorean ? '혼합 활동 구역' : 'Mixed activity area';
    return isKorean ? '보상 구역' : 'Bounty zone';
  }

  function selectActionZone(feature: Feature): void {
    const properties = feature.properties ?? {};
    const species = Array.isArray(properties.topSpecies) ? properties.topSpecies.flatMap((candidate) => {
      if (typeof candidate !== 'object' || candidate === null || !('id' in candidate) || !('name' in candidate)) return [];
      const { id, imageUrl, name } = candidate as { id: unknown; imageUrl?: unknown; name: unknown };
      return typeof id === 'string' && typeof name === 'string' ? [{ id, name, ...(typeof imageUrl === 'string' ? { imageUrl } : {}) }] : [];
    }) : [];
    const id = String(properties.id);
    setSelectedFeature(feature);
    setSelectedArea({ id, kind: areaKind(feature), name: areaName(feature), restricted: false, topSpecies: species, joined: joinedAreas.has(id) });
  }

  function selectRestrictedArea(feature: Feature): void {
    const properties = feature.properties ?? {};
    const id = String(properties.id);
    setSelectedFeature(feature);
    setSelectedArea({ id, kind: isKorean ? '보호 구역' : 'Protected area', name: String(properties.name ?? (isKorean ? '제한 구역' : 'Restricted area')), restricted: true, topSpecies: [], joined: joinedAreas.has(id) });
  }

  function centerOnUser(): void {
    navigator.geolocation?.getCurrentPosition(({ coords }) => setUserLocation([coords.latitude, coords.longitude]));
  }

  const selectedFeatureMemo = useMemo(() => selectedFeature, [selectedFeature]);

  return (
    <main style={{ background: '#dce6ed', height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <div aria-label={isKorean ? '경북 보상 구역 지도' : 'Gyeongbuk bounty map'} style={{ height: '100%', width: '100%' }}>
        <LeafletEvidenceMap actionZones={layers?.actionZones ?? emptyFeatureCollection} onActionZoneClick={selectActionZone} onRestrictedAreaClick={selectRestrictedArea} onViewportChange={loadViewport} restrictedAreas={layers?.restrictedAreas ?? emptyFeatureCollection} selectedFeature={selectedFeatureMemo} userLocation={userLocation} />
      </div>
      <header style={{ alignItems: 'center', background: '#ffffffed', display: 'flex', justifyContent: 'space-between', left: 12, padding: '10px 14px', position: 'absolute', right: 12, top: 12, zIndex: 1000 }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Bassanggum</h1>
        <button onClick={centerOnUser} type="button">{isKorean ? '내 위치' : 'My location'}</button>
      </header>
      <MapLegend locale={locale} />
      {layers === null && <p role="status" style={{ left: 16, position: 'absolute', top: 70, zIndex: 1000 }}>{isKorean ? '지도를 불러오는 중…' : 'Loading map…'}</p>}
      {mapError && <p role="status" style={{ background: 'white', borderRadius: 10, left: 16, padding: 10, position: 'absolute', right: 16, top: 70, zIndex: 1000 }}>{isKorean ? '지도를 새로고침하지 못했습니다.' : 'Could not refresh visible map areas.'}</p>}
      {selectedArea !== null && <AreaSheet area={selectedArea} locale={locale} onJoin={() => joinArea(selectedArea)} />}
      {selectedArea === null && (
        <Link href={`/${locale}/report`} style={{ background: '#0f5f46', borderRadius: 99, bottom: 88, color: 'white', fontSize: 17, fontWeight: 800, left: '50%', padding: '14px 28px', position: 'absolute', textDecoration: 'none', transform: 'translateX(-50%)', zIndex: 1000 }}>
          {isKorean ? '제보하기' : 'Report'}
        </Link>
      )}
      <BottomNav locale={locale} />
    </main>
  );
}
