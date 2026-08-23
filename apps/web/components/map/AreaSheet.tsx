'use client';

export type SelectedArea = {
  id: string;
  kind: string;
  name: string;
  restricted: boolean;
  topSpecies: Array<{ id: string; imageUrl?: string; name: string }>;
};

type AreaSheetProps = {
  area: SelectedArea;
  locale: 'en' | 'ko';
  onClose: () => void;
  onJoin: () => void;
};

export function AreaSheet({ area, locale, onClose, onJoin }: AreaSheetProps) {
  const isKorean = locale === 'ko';
  return (
    <section aria-label={isKorean ? '선택한 구역' : 'Selected area'} style={{ background: 'white', borderRadius: '22px 22px 0 0', bottom: 64, boxShadow: '0 -8px 30px #0003', left: 0, padding: '20px 20px 28px', position: 'absolute', right: 0, zIndex: 1000 }}>
      <button aria-label={isKorean ? '구역 상세 닫기' : 'Close area details'} onClick={onClose} style={{ background: 'transparent', border: 0, color: '#5c6878', float: 'right', fontSize: 22, lineHeight: 1 }} type="button">×</button>
      <p style={{ color: '#5c6878', fontSize: 13, margin: 0 }}>{area.kind}</p>
      <h2 style={{ fontSize: 22, margin: '4px 0 12px' }}>{area.name}</h2>
      {area.restricted ? (
        <p role="status" style={{ background: '#ffebee', borderRadius: 10, color: '#b71c1c', margin: 0, padding: 12 }}>
          {isKorean ? '이 구역에서는 제거할 수 없습니다. 관찰 제보만 할 수 있습니다.' : 'Removal is not allowed in this area. You may submit a sighting.'}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 14, margin: '0 0 8px' }}>{isKorean ? '자주 관찰되는 외래종' : 'Common invasive species'}</p>
          {area.topSpecies.length > 0 ? (
            <ul style={{ display: 'grid', fontSize: 15, fontWeight: 600, gap: 8, listStyle: 'none', margin: '0 0 16px', padding: 0 }}>
              {area.topSpecies.map((species) => <li key={species.id} style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                {species.imageUrl !== undefined && <img alt={species.name} height={42} src={species.imageUrl} style={{ borderRadius: 8, objectFit: 'cover' }} width={42} />}
                <span>{species.name}</span>
              </li>)}
            </ul>
          ) : <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>{isKorean ? '공식 종 정보 확인 중' : 'Species information pending'}</p>}
          <button onClick={onJoin} style={{ background: '#0f5f46', border: 0, borderRadius: 12, color: 'white', fontSize: 16, fontWeight: 700, padding: '12px 16px', width: '100%' }} type="button">
            {isKorean ? '보상 구역 참가' : 'Join bounty'}
          </button>
        </>
      )}
    </section>
  );
}
