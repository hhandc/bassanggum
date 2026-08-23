'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type BottomNavProps = {
  locale: 'en' | 'ko';
};

const labels = {
  en: { events: 'Events', map: 'Map', myPage: 'My Page', primary: 'Primary navigation' },
  ko: { events: '행사', map: '지도', myPage: '내 정보', primary: '주요 내비게이션' },
};

export function BottomNav({ locale }: BottomNavProps) {
  const pathname = usePathname();
  const t = labels[locale];
  const tabs = [
    { icon: '🗺️', label: t.map, href: `/${locale}` },
    { icon: '📅', label: t.events, href: `/${locale}/events` },
    { icon: '👤', label: t.myPage, href: `/${locale}/mypage` },
  ];

  return (
    <nav aria-label={t.primary} style={{ background: '#0f5f46', borderTop: '1px solid #0b4937', bottom: 0, display: 'flex', height: 64, left: 0, position: 'fixed', right: 0, zIndex: 1100 }}>
      {tabs.map((tab) => <Link href={tab.href} key={tab.href} style={{ alignItems: 'center', background: pathname === tab.href ? '#187457' : 'transparent', color: pathname === tab.href ? 'white' : '#d9ebe2', display: 'flex', flex: 1, flexDirection: 'column', fontSize: 12, fontWeight: pathname === tab.href ? 700 : 500, justifyContent: 'center', textDecoration: 'none' }}>
        <span aria-hidden="true" style={{ fontSize: 20 }}>{tab.icon}</span>
        {tab.label}
      </Link>)}
    </nav>
  );
}
