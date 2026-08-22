import { isLocale } from '../../lib/i18n';
import enMessages from '../../messages/en.json';
import koMessages from '../../messages/ko.json';

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  const messages = isLocale(locale) ? { en: enMessages, ko: koMessages }[locale] : enMessages;
  const navigation = [
    ['map', messages.navigation.map],
    ['report', messages.navigation.report],
    ['events', messages.navigation.events],
    ['impact', messages.navigation.impact],
  ] as const;

  return (
    <main>
      <h1>Bassanggum</h1>
      <p>{messages.home.description}</p>
      <nav aria-label="Primary navigation">
        {navigation.map(([path, label]) => (
          <a href={`/${locale}/${path}`} key={path}>
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}
