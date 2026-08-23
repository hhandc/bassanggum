import { notFound } from 'next/navigation';
import { EventsScreen } from '../../../components/events/EventsScreen';
import { isLocale } from '../../../lib/i18n';
export default async function EventsPage({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; if (!isLocale(locale)) notFound(); return <EventsScreen locale={locale} />; }
