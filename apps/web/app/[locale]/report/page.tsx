import { notFound } from 'next/navigation';

import { ReportScreen } from '../../../components/report/ReportScreen';
import { isLocale } from '../../../lib/i18n';

export default async function ReportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ReportScreen locale={locale} />;
}
