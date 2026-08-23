'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type BottomNavProps = {
  locale: 'en' | 'ko';
};

const labels = {
  en: {
    map: 'Map',
    events: 'Events',
    myPage: 'My Page',
    primary: 'Primary navigation',
  },
  ko: {
    map: '지도',
    events: '행사',
    myPage: '내 정보',
    primary: '주요 내비게이션',
  },
};

export function BottomNav({ locale }: BottomNavProps) {
  const t = labels[locale];
  const pathname = usePathname();

  const tabs = [
    { key: 'map', href: `/${locale}/map`, label: t.map },
    { key: 'events', href: `/${locale}/events`, label: t.events },
    { key: 'mypage', href: `/${locale}/mypage`, label: t.myPage },
  ] as const;

  return (
    <nav aria-label={t.primary} style={{ background: 'white', borderTop: '1px solid #e2e8f0', bottom: 0, display: 'flex', height: 64, left: 0, position: 'fixed', right: 0, zIndex: 1000 }}>
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            href={tab.href}
            key={tab.key}
            style={{
              alignItems: 'center',
              color: active ? '#0f5f46' : '#5c6878',
              display: 'flex',
              flex: 1,
              flexDirection: 'column',
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              justifyContent: 'center',
              textDecoration: 'none',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 20 }}>{tabIcon(tab.key)}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function tabIcon(key: 'map' | 'events' | 'mypage'): string {
  if (key === 'map') return '🗺️';
  if (key === 'events') return '📅';
  return '👤';
}
