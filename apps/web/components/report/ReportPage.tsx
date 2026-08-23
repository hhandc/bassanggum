'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { fetchSpeciesCatalog, submitReport, type ReportResult, type SpeciesCatalogItem } from '../../lib/api';
import { getDeviceToken } from '../../lib/device-token';

const FIXTURE_MEDIA_TOKEN = 'fixture:target';

type ReportPageProps = {
  locale: 'en' | 'ko';
};

export function ReportPage({ locale }: ReportPageProps) {
  const isKorean = locale === 'ko';
  const [speciesList, setSpeciesList] = useState<SpeciesCatalogItem[]>([]);
  const [speciesId, setSpeciesId] = useState('');
  const [type, setType] = useState<'sighting' | 'removal'>('sighting');
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    void fetchSpeciesCatalog()
      .then((list) => {
        setSpeciesList(list);
        if (list[0] !== undefined) setSpeciesId(list[0].id);
      })
      .catch(() => setLoadError(true));
  }, []);

  function locate(): void {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation([coords.longitude, coords.latitude]);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(true);
      },
    );
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (speciesId === '' || location === null) return;
    setSubmitting(true);
    setError(false);
    try {
      const report = await submitReport({
        type,
        speciesId,
        deviceToken: getDeviceToken(),
        location,
        mediaToken: FIXTURE_MEDIA_TOKEN,
      });
      setResult(report);
      persistReport(report.id, speciesId, type);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (result !== null) {
    return (
      <div style={{ background: '#f7fafc', minHeight: '100dvh', padding: 24 }}>
        <ResultCard locale={locale} result={result} />
        <Link href={`/${locale}/map`} style={{ background: '#0f5f46', borderRadius: 12, color: 'white', display: 'block', fontWeight: 700, marginTop: 16, padding: '12px 16px', textAlign: 'center', textDecoration: 'none' }}>{isKorean ? '지도로 돌아가기' : 'Back to map'}</Link>
      </div>
    );
  }

  return (
    <div style={{ background: '#f7fafc', minHeight: '100dvh', padding: 24 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{isKorean ? '제보하기' : 'Report'}</h1>
        <p style={{ color: '#5c6878', fontSize: 14, margin: '4px 0 0' }}>{isKorean ? '외래종 관찰 또는 제거를 제보하세요.' : 'Report an invasive species sighting or removal.'}</p>
      </header>
      {loadError && <p role="alert" style={{ background: '#ffebee', borderRadius: 10, color: '#b71c1c', marginBottom: 12, padding: 12 }}>{isKorean ? '종 목록을 불러오지 못했습니다.' : 'Could not load species list.'}</p>}
      <form onSubmit={handleSubmit} style={{ background: 'white', borderRadius: 14, padding: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{isKorean ? '종 선택' : 'Species'}</label>
        <select onChange={(event) => setSpeciesId(event.target.value)} required style={{ border: '1px solid #cbd5e0', borderRadius: 10, fontSize: 15, marginBottom: 16, padding: 12, width: '100%' }} value={speciesId}>
          {speciesList.map((species) => <option key={species.id} value={species.id}>{speciesName(species, isKorean)}</option>)}
        </select>
        <fieldset style={{ border: 'none', margin: '0 0 16px', padding: 0 }}>
          <legend style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{isKorean ? '제보 유형' : 'Report type'}</legend>
          <label style={{ alignItems: 'center', display: 'flex', fontSize: 15, gap: 8, marginBottom: 8 }}>
            <input checked={type === 'sighting'} name="type" onChange={() => setType('sighting')} type="radio" value="sighting" />
            {isKorean ? '관찰 제보' : 'Sighting'}
          </label>
          <label style={{ alignItems: 'center', display: 'flex', fontSize: 15, gap: 8 }}>
            <input checked={type === 'removal'} name="type" onChange={() => setType('removal')} type="radio" value="removal" />
            {isKorean ? '제거 제보' : 'Removal'}
          </label>
        </fieldset>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{isKorean ? '위치' : 'Location'}</label>
          <button disabled={locating} onClick={locate} style={{ background: '#edf2f7', border: '1px solid #cbd5e0', borderRadius: 10, fontSize: 14, padding: '10px 14px', width: '100%' }} type="button">
            {location === null ? (locating ? (isKorean ? '위치 확인 중…' : 'Locating…') : (isKorean ? '현재 위치 사용' : 'Use my location')) : `${location[1].toFixed(5)}, ${location[0].toFixed(5)}`}
          </button>
        </div>
        {error && <p role="alert" style={{ color: '#b71c1c', fontSize: 14, margin: '0 0 12px' }}>{isKorean ? '제보에 실패했습니다. 위치 권한을 확인하세요.' : 'Submission failed. Please check location permission.'}</p>}
        <p style={{ color: '#5c6878', fontSize: 12, margin: '0 0 12px' }}>{isKorean ? '데모용으로 AI 식별 대신 고정 토큰을 사용합니다.' : 'This demo uses a fixture token instead of AI classification.'}</p>
        <button disabled={speciesId === '' || location === null || submitting} style={{ background: '#0f5f46', border: 0, borderRadius: 12, color: 'white', fontSize: 16, fontWeight: 700, padding: '12px 16px', width: '100%' }} type="submit">
          {submitting ? (isKorean ? '제출 중…' : 'Submitting…') : (isKorean ? '제보 제출' : 'Submit report')}
        </button>
      </form>
    </div>
  );
}

function ResultCard({ result, locale }: { result: ReportResult; locale: 'en' | 'ko' }) {
  const isKorean = locale === 'ko';
  const title = result.status === 'auto_verified' ? (isKorean ? '자동 승인됨' : 'Auto-verified')
    : result.status === 'needs_review' ? (isKorean ? '검토 필요' : 'Needs review')
      : result.status === 'rejected' ? (isKorean ? '거부됨' : 'Rejected')
        : (isKorean ? '오류' : 'Error');
  const color = result.status === 'auto_verified' ? '#0f5f46' : result.status === 'needs_review' ? '#b35900' : '#b71c1c';

  return (
    <article aria-live="polite" style={{ background: 'white', borderLeft: `6px solid ${color}`, borderRadius: 14, padding: 20 }}>
      <h2 style={{ color, fontSize: 20, margin: '0 0 8px' }}>{title}</h2>
      {result.status === 'auto_verified' && <p>{isKorean ? '제보가 승인되었습니다. 참여해 주셔서 감사합니다.' : 'Your report was verified. Thanks for taking part.'}</p>}
      {result.status === 'needs_review' && <p>{isKorean ? '제보를 검토한 후 처리하겠습니다.' : 'Your report will be reviewed before processing.'}</p>}
      {result.status === 'rejected' && <p>{isKorean ? `거부 사유: ${reasonText(result.reason, isKorean)}` : `Reason: ${reasonText(result.reason, isKorean)}`}</p>}
      {result.status === 'invalid_request' && <p>{isKorean ? '입력값을 확인해 주세요.' : 'Please check your input.'}</p>}
      {result.verifiedUnits > 0 && <p style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{isKorean ? `확인된 제거: ${result.verifiedUnits}` : `Verified removals: ${result.verifiedUnits}`}</p>}
      {result.identification && <p style={{ color: '#5c6878', fontSize: 13, marginTop: 8 }}>{isKorean ? `식별: ${result.identification.speciesId}` : `Identification: ${result.identification.speciesId}`} ({Math.round(result.identification.confidence * 100)}%)</p>}
    </article>
  );
}

function speciesName(species: SpeciesCatalogItem, isKorean: boolean): string {
  const primary = isKorean ? species.koreanName : species.englishName;
  const secondary = isKorean ? species.englishName : species.koreanName;
  if (primary !== undefined && secondary !== undefined) return `${primary} (${secondary})`;
  return primary ?? secondary ?? species.id;
}

function reasonText(reason: string | undefined, isKorean: boolean): string {
  if (reason === 'outside_gyeongbuk') return isKorean ? '경북 지역이 아님' : 'Outside Gyeongbuk';
  if (reason === 'restricted_area') return isKorean ? '보호 구역' : 'Restricted area';
  if (reason === 'non_target') return isKorean ? '대상 종이 아님' : 'Not a target species';
  return reason ?? (isKorean ? '알 수 없음' : 'Unknown');
}

function persistReport(id: string, speciesId: string, type: 'sighting' | 'removal'): void {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('bassanggum-reports');
  const previous: StoredReport[] = stored === null ? [] : JSON.parse(stored) as StoredReport[];
  localStorage.setItem('bassanggum-reports', JSON.stringify([...previous, { id, speciesId, type }]));
}

type StoredReport = { id: string; speciesId: string; type: 'sighting' | 'removal' };
