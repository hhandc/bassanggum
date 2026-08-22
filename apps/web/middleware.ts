import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';

import { locales } from './lib/i18n';

const handleI18nRouting = createMiddleware({
  locales,
  defaultLocale: 'en',
  localePrefix: 'always',
});

export function middleware(request: NextRequest) {
  return handleI18nRouting(request);
}

export const config = {
  matcher: ['/', '/(en|ko)/:path*'],
};
