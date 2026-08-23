import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ReportPage } from '../../../components/report/ReportPage';
import { isLocale } from '../../../lib/i18n';

export const metadata: Metadata = {
  title: 'Report | Bassanggum',
};

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ReportRoute({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ReportPage locale={locale} />;
}
