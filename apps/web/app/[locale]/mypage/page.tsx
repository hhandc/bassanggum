import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { MyPage } from '../../../components/mypage/MyPage';
import { isLocale } from '../../../lib/i18n';

export const metadata: Metadata = {
  title: 'My Page | Bassanggum',
};

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MyPageRoute({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <MyPage locale={locale} />;
}
