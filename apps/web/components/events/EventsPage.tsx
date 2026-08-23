'use client';

import { useEffect, useState } from 'react';

import { BottomNav } from '../BottomNav';
import { fetchEvents, fetchSpeciesCatalog, type SpeciesCatalogItem, type VerifiedEvent } from '../../lib/api';

type EventsPageProps = {
  locale: 'en' | 'ko';
};

export function EventsPage({ locale }: EventsPageProps) {
  const isKorean = locale === 'ko';
  const [events, setEvents] = useState<VerifiedEvent[]>([]);
  const [speciesById, setSpeciesById] = useState<Map<string, SpeciesCatalogItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    void Promise.all([fetchEvents(), fetchSpeciesCatalog()])
      .then(([eventsResponse, catalog]) => {
        setEvents(eventsResponse.events);
        setSpeciesById(new Map(catalog.map((item) => [item.id, item])));
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const tips = [...speciesById.values()].filter((item) => item.disposalGuidance !== undefined || item.cookingGuidance !== undefined);

  return (
    <div style={{ background: '#f7fafc', minHeight: '100dvh', padding: '16px 16px 88px' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{isKorean ? '행사 및 안내' : 'Events & Tips'}</h1>
        <p style={{ color: '#5c6878', fontSize: 14, margin: '4px 0 0' }}>{isKorean ? '지자체·단체 보상 행사와 처리 안내' : 'Government and community bounty events plus guidance.'}</p>
      </header>
      {loading && <p role="status">{isKorean ? '불러오는 중…' : 'Loading…'}</p>}
      {error && <p role="alert" style={{ background: '#ffebee', borderRadius: 10, color: '#b71c1c', padding: 12 }}>{isKorean ? '행사를 불러오지 못했습니다.' : 'Could not load events.'}</p>}
      {!loading && events.length === 0 && <p role="status">{isKorean ? '예정된 행사가 없습니다.' : 'No upcoming events.'}</p>}
      <section aria-label={isKorean ? '행사' : 'Events'} style={{ display: 'grid', gap: 12 }}>
        {events.map((event) => <EventCard event={event} isKorean={isKorean} key={event.id} speciesById={speciesById} />)}
      </section>
      <section aria-label={isKorean ? '처리·조리 안내' : 'Disposal & cooking guidance'} style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>{isKorean ? '안전 처리 안내' : 'Safe handling guidance'}</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {tips.map((item) => <TipCard item={item} isKorean={isKorean} key={item.id} />)}
        </div>
      </section>
      <BottomNav locale={locale} />
    </div>
  );
}

function EventCard({ event, isKorean, speciesById }: { event: VerifiedEvent; isKorean: boolean; speciesById: Map<string, SpeciesCatalogItem> }) {
  const eligibleNames = event.eligibleSpeciesIds.map((id) => {
    const item = speciesById.get(id);
    return item ? (isKorean ? item.koreanName : item.englishName) ?? item.id : id;
  });
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const dateLabel = start.toDateString() === end.toDateString()
    ? formatDate(start, isKorean)
    : `${formatDate(start, isKorean)} – ${formatDate(end, isKorean)}`;

  return (
    <article style={{ background: 'white', borderRadius: 14, padding: 16 }}>
      <h3 style={{ fontSize: 16, margin: '0 0 4px' }}>{event.title}</h3>
      <p style={{ color: '#5c6878', fontSize: 13, margin: '0 0 8px' }}>{event.organizer}</p>
      <p style={{ fontSize: 14, margin: '4px 0' }}>{dateLabel}</p>
      <p style={{ fontSize: 14, fontWeight: 600, margin: '8px 0 4px' }}>{event.rewardWording}</p>
      <p style={{ color: '#5c6878', fontSize: 13, margin: '4px 0 0' }}>{event.eligibilityNotes}</p>
      {eligibleNames.length > 0 && <p style={{ color: '#5c6878', fontSize: 13, margin: '8px 0 0' }}>{isKorean ? '대상 종: ' : 'Eligible species: '}{eligibleNames.join(', ')}</p>}
      <a href={event.eventUrl} rel="noopener noreferrer" style={{ color: '#0f5f46', display: 'inline-block', fontSize: 13, fontWeight: 600, marginTop: 10, textDecoration: 'none' }} target="_blank">{isKorean ? '행사 페이지' : 'Event page'} →</a>
    </article>
  );
}

function TipCard({ item, isKorean }: { item: SpeciesCatalogItem; isKorean: boolean }) {
  const name = (isKorean ? item.koreanName : item.englishName) ?? item.id;
  const disposal = item.disposalGuidance;
  const cooking = item.cookingGuidance;

  return (
    <article style={{ background: 'white', borderRadius: 14, padding: 16 }}>
      <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>{name}</h3>
      {disposal && <p style={{ fontSize: 14, margin: '4px 0' }}><strong>{isKorean ? '처리: ' : 'Disposal: '}</strong>{disposal.text}</p>}
      {cooking && <p style={{ fontSize: 14, margin: '4px 0' }}><strong>{isKorean ? '조리: ' : 'Cooking: '}</strong>{cooking.text}</p>}
    </article>
  );
}

function formatDate(date: Date, isKorean: boolean): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString(isKorean ? 'ko-KR' : 'en-US', options);
}
