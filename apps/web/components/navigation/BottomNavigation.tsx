import Link from 'next/link';

export function BottomNavigation({ locale }: { locale: 'en' | 'ko' }) {
  const korean = locale === 'ko';
  return <nav aria-label={korean ? '주 메뉴' : 'Main navigation'} style={{ background: '#10261e', bottom: 0, display: 'flex', justifyContent: 'space-around', left: 0, padding: '12px 8px max(12px, env(safe-area-inset-bottom))', position: 'fixed', right: 0, zIndex: 2000 }}>
    <Link aria-label={korean ? '지도' : 'Map'} href={`/${locale}`} style={linkStyle}>⌖<span>{korean ? '지도' : 'Map'}</span></Link>
    <Link aria-label={korean ? '내 정보' : 'My page'} href={`/${locale}/me`} style={linkStyle}>◎<span>{korean ? '내 정보' : 'My page'}</span></Link>
    <Link aria-label={korean ? '이벤트' : 'Events'} href={`/${locale}/events`} style={linkStyle}>✦<span>{korean ? '이벤트' : 'Events'}</span></Link>
  </nav>;
}

const linkStyle = { alignItems: 'center', color: 'white', display: 'flex', flexDirection: 'column' as const, fontSize: 12, fontWeight: 700, gap: 3, minWidth: 80, textDecoration: 'none' };
