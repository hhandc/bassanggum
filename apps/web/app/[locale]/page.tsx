import { isLocale } from '../../lib/i18n';
import { BassanggumMap } from '../../components/map/BassanggumMap';

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  return <BassanggumMap locale={isLocale(locale) ? locale : 'en'} />;
}
