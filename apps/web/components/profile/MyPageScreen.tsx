'use client';

import { useEffect, useState } from 'react';

type StoredReport = { category: 'fish' | 'plant'; speciesId?: string; status: string };
const storageKey = 'bassanggum-report-history';

export function saveReportToProfile(report: StoredReport): void {
  const existing = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as StoredReport[];
  localStorage.setItem(storageKey, JSON.stringify([...existing, report]));
}

export function MyPageScreen({ locale }: { locale: 'en' | 'ko' }) {
  const [reports, setReports] = useState<StoredReport[]>([]);
  const korean = locale === 'ko';
  useEffect(() => setReports(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as StoredReport[]), []);
  const fish = reports.filter((report) => report.category === 'fish').length;
  const plant = reports.length - fish;
  const top = reports.reduce<Record<string, number>>((counts, report) => ({ ...counts, [report.speciesId ?? 'Unidentified']: (counts[report.speciesId ?? 'Unidentified'] ?? 0) + 1 }), {});
  const mostReported = Object.entries(top).sort((left, right) => right[1] - left[1])[0]?.[0];
  return <main style={{ background: '#edf4f0', minHeight: '100dvh', padding: '28px 18px 96px' }}><h1>{korean ? '내 정보' : 'My page'}</h1><p>{korean ? '이 기기의 익명 활동 기록입니다.' : 'Anonymous activity saved on this device.'}</p><section style={card}><h2>{korean ? '신고' : 'Reports'}</h2><p>{korean ? `총 ${reports.length}건` : `${reports.length} total`}</p><p>{korean ? `물고기 ${fish} · 식물 ${plant}` : `Fish ${fish} · Plants ${plant}`}</p><p>{korean ? `가장 많이 신고한 종: ${mostReported ?? '아직 없음'}` : `Most reported: ${mostReported ?? 'None yet'}`}</p></section><section style={card}><h2>{korean ? '보상 구역' : 'Bounty areas'}</h2><p>{korean ? '참가한 구역은 다음 단계에서 계정과 함께 동기화됩니다.' : 'Joined areas will sync with an account in a later step.'}</p></section></main>;
}

const card = { background: 'white', borderRadius: 16, marginTop: 16, padding: 16 };
