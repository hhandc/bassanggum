import { getRequestConfig } from 'next-intl/server';

import { isLocale } from '../lib/i18n';
import enMessages from '../messages/en.json';
import koMessages from '../messages/ko.json';

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = requestedLocale !== undefined && isLocale(requestedLocale) ? requestedLocale : 'en';

  return {
    locale,
    messages: locale === 'ko' ? koMessages : enMessages,
  };
});
