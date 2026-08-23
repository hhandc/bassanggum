import { curatedEvents } from '../../lib/curated-events';

export function EventsScreen({ locale }: { locale: 'en' | 'ko' }) {
  const korean = locale === 'ko';
  return <main style={pageStyle}>
    <h1>{korean ? '이벤트와 팁' : 'Events & tips'}</h1>
    <p>{korean ? '현재 확인된 정부 이벤트는 없습니다. 아래는 수집한 과거 기사입니다.' : 'No current verified government events are listed. These are hand-curated past news examples.'}</p>
    {curatedEvents.map((event) => <article key={event.id} style={cardStyle}>
      <strong>{korean ? '과거 이벤트' : 'Past event'}</strong>
      <h2>{event.title}</h2><p>{event.place} · {event.date}</p><p>{event.summary}</p><p>{korean ? '대상' : 'Targets'}: {event.targets.join(', ')}</p>
      <a href={event.sourceUrl} rel="noreferrer" target="_blank">{korean ? '원문 보기' : 'Read source article'}</a>
    </article>)}
    <article style={cardStyle}><h2>{korean ? '안전 팁' : 'Safety tip'}</h2><p>{korean ? '현장 규정과 보호구역 안내를 먼저 확인하고, 제거 활동은 공식 지침을 따르세요.' : 'Check local rules and protected-area guidance first; follow official instructions for removal activity.'}</p></article>
  </main>;
}

const pageStyle = { background: '#edf4f0', minHeight: '100dvh', padding: '28px 18px 96px' };
const cardStyle = { background: 'white', borderRadius: 16, margin: '16px 0', padding: 16 };
