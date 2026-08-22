import { notFound } from 'next/navigation';

import { BassanggumMap } from '../../../components/map/BassanggumMap';
import { isLocale } from '../../../lib/i18n';

type MapPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MapPage({ params }: MapPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BassanggumMap locale={locale} />;
}
