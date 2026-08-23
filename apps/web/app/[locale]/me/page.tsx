import { notFound } from 'next/navigation';
import { MyPageScreen } from '../../../components/profile/MyPageScreen';
import { isLocale } from '../../../lib/i18n';
export default async function MyPage({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; if (!isLocale(locale)) notFound(); return <MyPageScreen locale={locale} />; }
