'use client';

import { useState, type ChangeEvent } from 'react';

import { submitReport, type ReportResult } from '../../lib/api';
import { saveReportToProfile } from '../profile/MyPageScreen';

type ReportScreenProps = { locale: 'en' | 'ko' };
type Category = 'fish' | 'plant';
type ReportType = 'sighting' | 'removal';

export function ReportScreen({ locale }: ReportScreenProps) {
  const korean = locale === 'ko';
  const [category, setCategory] = useState<Category>('fish');
  const [type, setType] = useState<ReportType>('sighting');
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage(korean ? 'JPEG, PNG 또는 WebP 사진(5MB 이하)을 선택해 주세요.' : 'Choose a JPEG, PNG, or WebP image up to 5 MB.');
      return;
    }
    setMediaDataUrl(await fileToDataUrl(file));
    setMessage(null);
    setResult(null);
  }

  function requestLocation(): void {
    if (!navigator.geolocation) {
      setMessage(korean ? '이 기기에서는 위치를 사용할 수 없습니다.' : 'Location is not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLocation([coords.longitude, coords.latitude]); setMessage(null); },
      () => setMessage(korean ? '위치 권한을 허용해 주세요.' : 'Allow location access to submit your report.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function submit(): Promise<void> {
    if (mediaDataUrl === null || location === null) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const nextResult = await submitReport({ category, type, deviceToken: deviceToken(), location, mediaDataUrl });
      setResult(nextResult);
      saveReportToProfile({ category, speciesId: nextResult.identification?.speciesId, status: nextResult.status });
    } catch {
      setMessage(korean ? '신고를 제출하지 못했습니다. 다시 시도해 주세요.' : 'Could not submit this report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return <main style={{ background: '#edf4f0', color: '#163329', minHeight: '100dvh', padding: '24px 16px' }}>
    <a href={`/${locale}`} style={{ color: '#0f5f46', fontWeight: 700 }}>← {korean ? '지도' : 'Map'}</a>
    <section style={{ margin: '28px auto', maxWidth: 520 }}>
      <h1>{korean ? '외래종 신고' : 'Report an invasive species'}</h1>
      <p>{korean ? '사진과 현재 위치를 보내면 종을 확인합니다.' : 'Send a photo and your current location to identify the species.'}</p>
      <fieldset style={fieldStyle}><legend>{korean ? '종류' : 'Category'}</legend>{choiceButtons([['fish', korean ? '물고기' : 'Fish'], ['plant', korean ? '식물' : 'Plant']] as const, category, setCategory)}</fieldset>
      <fieldset style={fieldStyle}><legend>{korean ? '신고 종류' : 'Report type'}</legend>{choiceButtons([['sighting', korean ? '발견' : 'Sighting'], ['removal', korean ? '제거' : 'Removal']] as const, type, setType)}</fieldset>
      <label style={{ display: 'block', fontWeight: 700, marginTop: 20 }}> {korean ? '사진 증거' : 'Photo evidence'}
        <input accept="image/jpeg,image/png,image/webp" aria-label={korean ? '사진 증거' : 'Photo evidence'} capture="environment" onChange={(event) => void selectPhoto(event)} style={{ display: 'block', marginTop: 8 }} type="file" />
      </label>
      {mediaDataUrl !== null && <img alt={korean ? '선택한 신고 사진' : 'Selected report evidence'} src={mediaDataUrl} style={{ borderRadius: 12, display: 'block', marginTop: 12, maxHeight: 260, maxWidth: '100%' }} />}
      <button onClick={requestLocation} style={buttonStyle} type="button">{location === null ? (korean ? '내 위치 사용' : 'Use my location') : (korean ? '위치 준비됨' : 'Location ready')}</button>
      <button disabled={mediaDataUrl === null || location === null || submitting} onClick={() => void submit()} style={{ ...buttonStyle, background: '#0f5f46', color: 'white', opacity: mediaDataUrl === null || location === null ? 0.55 : 1 }} type="button">{submitting ? (korean ? '확인 중…' : 'Identifying…') : (korean ? '신고 제출' : 'Submit report')}</button>
      {message !== null && <p role="alert">{message}</p>}
      {result !== null && <Result locale={locale} result={result} />}
    </section>
  </main>;
}

function choiceButtons<T extends string>(choices: readonly (readonly [T, string])[], selected: T, setSelected: (value: T) => void) {
  return choices.map(([value, label]) => <button aria-pressed={selected === value} key={value} onClick={() => setSelected(value)} style={{ ...buttonStyle, background: selected === value ? '#d5eadc' : 'white' }} type="button">{label}</button>);
}

function Result({ locale, result }: { locale: 'en' | 'ko'; result: ReportResult }) {
  const korean = locale === 'ko';
  const title = result.status === 'auto_verified' ? (korean ? '자동 확인 완료' : 'Automatically verified') : result.status === 'needs_review' ? (korean ? '검토가 필요합니다' : 'Needs review') : (korean ? '신고를 처리할 수 없습니다' : 'Report rejected');
  const confidence = result.identification?.confidence;
  const scientificName = result.identification?.scientificName ?? result.identification?.speciesId;
  const commonName = korean ? result.identification?.koreanName ?? result.identification?.commonName : result.identification?.commonName ?? result.identification?.koreanName;
  return <section aria-live="polite" style={{ background: 'white', borderRadius: 12, marginTop: 20, padding: 16 }}><h2>{title}</h2>{scientificName !== undefined && <p>{korean ? '학명' : 'Scientific name'}: <i>{scientificName}</i></p>}{commonName !== undefined && <p>{korean ? '이름' : 'Common name'}: {commonName}</p>}{confidence !== undefined && <p>{korean ? '신뢰도' : 'Confidence'}: {Math.round(confidence * 100)}%</p>}<a href={`/${locale}`}>{korean ? '지도로 돌아가기' : 'Return to map'}</a></section>;
}

const buttonStyle = { border: '1px solid #789086', borderRadius: 9, cursor: 'pointer', fontWeight: 700, margin: '12px 8px 0 0', padding: '10px 14px' };
const fieldStyle = { border: 0, margin: '18px 0 0', padding: 0 };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function deviceToken(): string {
  const key = 'bassanggum-device-token';
  const existing = localStorage.getItem(key);
  if (existing !== null) return existing;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}
