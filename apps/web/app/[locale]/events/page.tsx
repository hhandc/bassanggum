import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { EventsPage } from '../../../components/events/EventsPage';
import { isLocale } from '../../../lib/i18n';

export const metadata: Metadata = {
  title: 'Events | Bassanggum',
};

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function EventsRoute({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <EventsPage locale={locale} />;
}
