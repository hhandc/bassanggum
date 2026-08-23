import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { isLocale } from '../../lib/i18n';
import { BottomNavigation } from '../../components/navigation/BottomNavigation';
import enMessages from '../../messages/en.json';
import koMessages from '../../messages/ko.json';

const messages = {
  en: enMessages,
  ko: koMessages,
};

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {children}<BottomNavigation locale={locale} />
    </NextIntlClientProvider>
  );
}
