'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Feature } from 'geojson';

import { fetchMapLayers, type MapCategory, type MapLayers, type MapViewport } from '../../lib/api';
import { AreaSheet, type SelectedArea } from './AreaSheet';
import { MapLegend } from './MapLegend';

const LeafletEvidenceMap = dynamic(() => import('./LeafletEvidenceMap').then((module) => module.LeafletEvidenceMap), { ssr: false });

const emptyFeatureCollection = { type: 'FeatureCollection' as const, features: [] };
type MapFilter = 'all' | MapCategory;

type BassanggumMapProps = {
  locale: 'en' | 'ko';
};

export function BassanggumMap({ locale }: BassanggumMapProps) {
  const [layers, setLayers] = useState<MapLayers | null>(null);
  const [filter, setFilter] = useState<MapFilter>('all');
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);
  const [joinedArea, setJoinedArea] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const hasRequestedInitialLocation = useRef(false);
  const isKorean = locale === 'ko';

  const loadViewport = useCallback((nextViewport: MapViewport) => {
    setViewport(nextViewport);
  }, []);

  useEffect(() => {
    if (viewport === null) return;
    void fetchMapLayers(viewport, filter === 'all' ? undefined : filter).then((response) => {
      setLayers(response);
      setMapError(false);
    }).catch(() => setMapError(true));
  }, [filter, viewport]);

  function selectActionZone(feature: Feature): void {
    const properties = feature.properties ?? {};
    const species = Array.isArray(properties.topSpecies) ? properties.topSpecies.flatMap((candidate) => {
      if (typeof candidate !== 'object' || candidate === null || !('id' in candidate) || !('name' in candidate)) return [];
      const { id, imageUrl, name } = candidate as { id: unknown; imageUrl?: unknown; name: unknown };
      return typeof id === 'string' && typeof name === 'string' ? [{ id, name, ...(typeof imageUrl === 'string' ? { imageUrl } : {}) }] : [];
    }) : [];
    setSelectedArea({ id: String(properties.id), kind: String(properties.kind ?? (isKorean ? '보상 구역' : 'Bounty zone')), name: String(properties.name ?? (isKorean ? '이름 없는 집중 구역' : 'Unnamed hotspot')), restricted: false, topSpecies: species });
  }

  function selectRestrictedArea(feature: Feature): void {
    const properties = feature.properties ?? {};
    setSelectedArea({ id: String(properties.id), kind: isKorean ? '보호 구역' : 'Protected area', name: String(properties.name ?? (isKorean ? '제한 구역' : 'Restricted area')), restricted: true, topSpecies: [] });
  }

  const centerOnUser = useCallback((): void => {
    navigator.geolocation?.getCurrentPosition(({ coords }) => setUserLocation([coords.latitude, coords.longitude]));
  }, []);

  useEffect(() => {
    if (hasRequestedInitialLocation.current) return;
    hasRequestedInitialLocation.current = true;
    centerOnUser();
  }, [centerOnUser]);

  return (
    <main style={{ background: '#dce6ed', height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <div aria-label={isKorean ? '경북 보상 구역 지도' : 'Gyeongbuk bounty map'} style={{ height: '100%', width: '100%' }}>
        <LeafletEvidenceMap actionZones={layers?.actionZones ?? emptyFeatureCollection} onActionZoneClick={selectActionZone} onMapClick={() => setSelectedArea(null)} onRestrictedAreaClick={selectRestrictedArea} onViewportChange={loadViewport} restrictedAreas={layers?.restrictedAreas ?? emptyFeatureCollection} userLocation={userLocation} />
      </div>
      <header style={{ alignItems: 'center', background: '#0f5f46', color: 'white', display: 'flex', justifyContent: 'space-between', left: 12, padding: '10px 14px', position: 'absolute', right: 12, top: 12, zIndex: 1000 }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Bassanggum</h1>
        <button onClick={centerOnUser} style={{ background: 'white', border: 0, borderRadius: 8, color: '#0f5f46', fontWeight: 700, padding: '7px 10px' }} type="button">{isKorean ? '내 위치' : 'My location'}</button>
      </header>
      <MapCategoryFilter filter={filter} locale={locale} onChange={setFilter} />
      <MapLegend locale={locale} />
      {layers === null && <p role="status" style={{ left: 16, position: 'absolute', top: 70, zIndex: 1000 }}>{isKorean ? '지도를 불러오는 중…' : 'Loading map…'}</p>}
      {mapError && <p role="status" style={{ background: 'white', borderRadius: 10, left: 16, padding: 10, position: 'absolute', right: 16, top: 70, zIndex: 1000 }}>{isKorean ? '지도를 새로고침하지 못했습니다.' : 'Could not refresh visible map areas.'}</p>}
      {joinedArea !== null && <p role="status" style={{ background: 'white', borderRadius: 10, left: 16, padding: 10, position: 'absolute', right: 16, top: 70, zIndex: 1000 }}>{isKorean ? `${joinedArea} 참여 준비 완료` : `Ready to hunt in ${joinedArea}`}</p>}
      {selectedArea !== null && <AreaSheet area={selectedArea} locale={locale} onClose={() => setSelectedArea(null)} onJoin={() => { setJoinedArea(selectedArea.name); setSelectedArea(null); }} />}
      {selectedArea === null && <a href={`/${locale}/report`} style={{ background: '#0f5f46', borderRadius: 99, bottom: 84, color: 'white', fontSize: 17, fontWeight: 800, left: '50%', padding: '14px 28px', position: 'absolute', textDecoration: 'none', transform: 'translateX(-50%)', zIndex: 1000 }}>{isKorean ? 'Hunt' : 'Hunt'}</a>}
    </main>
  );
}

export function MapCategoryFilter({ filter, locale, onChange }: { filter: MapFilter; locale: BassanggumMapProps['locale']; onChange(filter: MapFilter): void }) {
  const labels = locale === 'ko'
    ? { all: '전체', fish: '물고기', plant: '식물' }
    : { all: 'All', fish: 'Fish', plant: 'Plants' };

  return (
    <nav aria-label={locale === 'ko' ? '지도 종별 필터' : 'Map species filters'} style={{ background: '#ffffffed', borderRadius: 12, display: 'flex', gap: 4, padding: 4, position: 'absolute', right: 16, top: 64, zIndex: 1000 }}>
      {(Object.keys(labels) as MapFilter[]).map((value) => <button aria-pressed={filter === value} key={value} onClick={() => onChange(value)} style={{ background: filter === value ? '#0f5f46' : 'transparent', border: 0, borderRadius: 8, color: filter === value ? 'white' : '#18332a', fontWeight: 700, padding: '7px 10px' }} type="button">{labels[value]}</button>)}
    </nav>
  );
}
