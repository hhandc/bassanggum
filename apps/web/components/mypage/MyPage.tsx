'use client';

import { useEffect, useState } from 'react';

import { BottomNav } from '../BottomNav';
import { fetchReport, fetchSpeciesCatalog, type ReportResult, type SpeciesCatalogItem } from '../../lib/api';
import { getDeviceToken } from '../../lib/device-token';

type MyPageProps = {
  locale: 'en' | 'ko';
};

type StoredReport = { id: string; speciesId: string; type: 'sighting' | 'removal' };

export function MyPage({ locale }: MyPageProps) {
  const isKorean = locale === 'ko';
  const [deviceToken] = useState(() => getDeviceToken());
  const [joined, setJoined] = useState<string[]>([]);
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [reportDetails, setReportDetails] = useState<Map<string, ReportResult>>(new Map());
  const [speciesById, setSpeciesById] = useState<Map<string, SpeciesCatalogItem>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      const storedJoined = localStorage.getItem('bassanggum-joined-bounties');
      if (storedJoined !== null) {
        try {
          const parsed = JSON.parse(storedJoined) as unknown;
          if (Array.isArray(parsed)) setJoined(parsed.filter((item): item is string => typeof item === 'string'));
        } catch {
          // ignore malformed storage
        }
      }
      const storedReports = localStorage.getItem('bassanggum-reports');
      if (storedReports !== null) {
        try {
          const parsed = JSON.parse(storedReports) as unknown;
          if (Array.isArray(parsed)) setReports(parsed.filter(isStoredReport));
        } catch {
          // ignore malformed storage
        }
      }
    }
    void fetchSpeciesCatalog()
      .then((catalog) => setSpeciesById(new Map(catalog.map((item) => [item.id, item]))))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (reports.length === 0) return;
    const abortController = new AbortController();
    void Promise.all(
      reports.map(async (report) => {
        try {
          const detail = await fetchReport(report.id, deviceToken);
          if (!abortController.signal.aborted) {
            setReportDetails((previous) => new Map([...previous, [report.id, detail]]));
          }
        } catch {
          // ignore missing reports
        }
      }),
    );
    return () => abortController.abort();
  }, [reports, deviceToken]);

  const removals = reportDetails.size > 0
    ? [...reportDetails.values()].reduce((total, report) => total + report.verifiedUnits, 0)
    : reports.filter((report) => report.type === 'removal').length;
  const sightings = reports.filter((report) => report.type === 'sighting').length;
  const total = reports.length;
  const level = Math.min(5, 1 + Math.floor(total / 3));
  const rank = level === 1 ? (isKorean ? '탐색자' : 'Scout')
    : level === 2 ? (isKorean ? '수집가' : 'Collector')
      : level === 3 ? (isKorean ? '감시자' : 'Watcher')
        : level === 4 ? (isKorean ? '제거자' : 'Remover')
          : (isKorean ? '수호자' : 'Guardian');

  return (
    <div style={{ background: '#f7fafc', minHeight: '100dvh', padding: '16px 16px 88px' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{isKorean ? '내 정보' : 'My Page'}</h1>
        <p style={{ color: '#5c6878', fontSize: 14, margin: '4px 0 0' }}>{isKorean ? '익명 프로필과 제보 기록' : 'Anonymous profile and report history.'}</p>
      </header>
      <section style={{ background: 'white', borderRadius: 14, marginBottom: 16, padding: 20 }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 16 }}>
          <div aria-hidden="true" style={{ alignItems: 'center', background: '#0f5f46', borderRadius: 999, color: 'white', display: 'flex', fontSize: 32, height: 64, justifyContent: 'center', width: 64 }}>🌿</div>
          <div>
            <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>{rank}</h2>
            <p style={{ color: '#5c6878', fontSize: 13, margin: 0 }}>{isKorean ? '익명 사용자' : 'Anonymous user'}</p>
            <p style={{ color: '#5c6878', fontSize: 12, margin: '4px 0 0' }}>{isKorean ? '레벨' : 'Level'} {level}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 20, textAlign: 'center' }}>
          <Stat label={isKorean ? '제보' : 'Reports'} value={total} />
          <Stat label={isKorean ? '관찰' : 'Sightings'} value={sightings} />
          <Stat label={isKorean ? '제거' : 'Removals'} value={removals} />
        </div>
      </section>
      <section style={{ background: 'white', borderRadius: 14, marginBottom: 16, padding: 16 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{isKorean ? '참여 중인 보상 구역' : 'Joined bounties'}</h2>
        {joined.length === 0 ? <p style={{ color: '#5c6878', fontSize: 14, margin: 0 }}>{isKorean ? '아직 참여한 구역이 없습니다.' : 'No bounties joined yet.'}</p>
          : <ul style={{ display: 'grid', fontSize: 15, gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>{joined.map((name) => <li key={name}>• {name}</li>)}</ul>}
      </section>
      <section style={{ background: 'white', borderRadius: 14, padding: 16 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{isKorean ? '제보 기록' : 'Report history'}</h2>
        {loading && <p role="status">{isKorean ? '불러오는 중…' : 'Loading…'}</p>}
        {!loading && reports.length === 0 && <p style={{ color: '#5c6878', fontSize: 14, margin: 0 }}>{isKorean ? '아직 제보가 없습니다.' : 'No reports yet.'}</p>}
        {!loading && reports.length > 0 && (
          <ul style={{ display: 'grid', fontSize: 15, gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
            {reports.map((report) => {
              const species = speciesById.get(report.speciesId);
              const name = species ? (isKorean ? species.koreanName : species.englishName) ?? report.speciesId : report.speciesId;
              const detail = reportDetails.get(report.id);
              return (
                <li key={report.id} style={{ borderBottom: '1px solid #edf2f7', paddingBottom: 10 }}>
                  <p style={{ fontWeight: 600, margin: 0 }}>{name}</p>
                  <p style={{ color: '#5c6878', fontSize: 13, margin: '2px 0 0' }}>{report.type === 'sighting' ? (isKorean ? '관찰' : 'Sighting') : (isKorean ? '제거' : 'Removal')} • {detail ? statusLabel(detail.status, isKorean) : (isKorean ? '확인 중' : 'Checking…')}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <BottomNav locale={locale} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{value}</p>
      <p style={{ color: '#5c6878', fontSize: 12, margin: '4px 0 0' }}>{label}</p>
    </div>
  );
}

function statusLabel(status: string, isKorean: boolean): string {
  if (status === 'auto_verified') return isKorean ? '승인됨' : 'Verified';
  if (status === 'needs_review') return isKorean ? '검토 중' : 'Review';
  if (status === 'rejected') return isKorean ? '거부됨' : 'Rejected';
  return status;
}

function isStoredReport(value: unknown): value is StoredReport {
  if (typeof value !== 'object' || value === null) return false;
  const report = value as { id?: unknown; speciesId?: unknown; type?: unknown };
  return typeof report.id === 'string' && typeof report.speciesId === 'string' && (report.type === 'sighting' || report.type === 'removal');
}
