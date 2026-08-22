type MapLegendProps = {
  locale: 'en' | 'ko';
};

export function MapLegend({ locale }: MapLegendProps) {
  const labels = locale === 'ko'
    ? ['참여 가능한 보상 구역', '보호·제한 구역', '공식 근거']
    : ['Active bounty zone', 'Protected or restricted area', 'Official evidence'];

  return (
    <aside aria-label={locale === 'ko' ? '지도 범례' : 'Map legend'} style={{ background: '#ffffffeb', borderRadius: 14, bottom: 112, left: 16, padding: 12, position: 'absolute', zIndex: 1000 }}>
      <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 8px' }}>{labels[2]}</p>
      <p style={{ fontSize: 12, margin: '4px 0' }}><span aria-hidden="true" style={{ background: '#1769aa', borderRadius: 99, display: 'inline-block', height: 10, marginRight: 6, width: 10 }} />{labels[0]}</p>
      <p style={{ fontSize: 12, margin: '4px 0' }}><span aria-hidden="true" style={{ background: '#c62828', borderRadius: 99, display: 'inline-block', height: 10, marginRight: 6, width: 10 }} />{labels[1]}</p>
    </aside>
  );
}
