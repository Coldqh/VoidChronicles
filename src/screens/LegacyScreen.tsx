import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useGameStore } from '../game/store';
import {
  buildChronicle,
  chronicleDomainLabel,
  compareChroniclePeriods,
  traceCausalChain,
  type ChronicleDomain
} from '../simulation/chronicle';

const fateLabel: Record<string, string> = {
  active: 'командует', dead: 'погиб', missing: 'пропал', captured: 'захвачен', coma: 'в коме', stranded: 'оставлен на поверхности', retired: 'сложил полномочия'
};

const domainOptions: ChronicleDomain[] = ['war', 'politics', 'economy', 'society', 'culture', 'science', 'ecology', 'heritage', 'demography', 'player'];

async function destructiveReset(startAgain: boolean): Promise<void> {
  const store = useGameStore.getState();
  const message = startAgain
    ? 'Текущая ironman-кампания будет удалена. Настройки генерации сохранятся для нового старта. Продолжить?'
    : 'Удалить текущую кампанию и резервные копии? Это действие нельзя отменить.';
  if (!window.confirm(message)) return;
  if (startAgain && store.galaxy) {
    try { localStorage.setItem('void-chronicles:new-campaign-preset', JSON.stringify(store.galaxy.settings)); } catch { /* optional */ }
  }
  await store.clearGame();
}

export function ContinuityScreen() {
  const store = useGameStore();
  const ended = [...store.legacy.captains].reverse().find((entry) => entry.endedYear !== undefined);
  if (!store.ship || !store.captain) return null;
  const visited = store.galaxy?.systems.filter((entry) => entry.visited).length ?? 0;
  const title = store.captain.condition === 'dead' ? 'Капитан погиб' : store.captain.condition === 'captured' ? 'Капитан захвачен' : store.captain.condition === 'missing' ? 'Капитан пропал' : 'Командование потеряно';

  return <main className="game-over-screen">
    <section className="game-over-panel">
      <span className="eyebrow">IRONMAN · КАМПАНИЯ ОКОНЧЕНА</span>
      <h1>{title}</h1>
      <p>{store.legacy.continuityReason ?? `Статус: ${fateLabel[store.captain.condition] ?? store.captain.condition}.`}</p>
      <div className="game-over-metrics">
        <article><span>ГОД</span><b>{store.gameYear}</b></article>
        <article><span>СИСТЕМЫ</span><b>{visited}</b></article>
        <article><span>ОТКРЫТИЯ</span><b>{ended?.discoveries ?? store.discoveries.length}</b></article>
        <article><span>БОИ</span><b>{ended?.battles ?? 0}</b></article>
      </div>
      <div className="game-over-actions">
        <button onClick={() => void store.enterChronicleMode()}>Открыть хронику</button>
        <button className="primary-button" onClick={() => void destructiveReset(true)}>Новая кампания</button>
        <button className="danger-button" onClick={() => void destructiveReset(false)}>Удалить сейв</button>
      </div>
    </section>
  </main>;
}

export function ChronicleScreen({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<'galaxy' | 'captains' | 'lost' | 'memorials'>('galaxy');
  const [domain, setDomain] = useState<ChronicleDomain | 'all'>('all');
  const [scope, setScope] = useState<'all' | 'known' | 'player'>('known');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparisonYears, setComparisonYears] = useState(25);
  const visited = store.galaxy?.systems.filter((entry) => entry.visited).length ?? 0;
  const context = useMemo(() => store.galaxy ? ({
    seed: store.galaxy.seed,
    galaxy: store.galaxy,
    factions: store.factions,
    hubs: store.hubs
  }) : null, [store.galaxy, store.factions, store.hubs]);
  const knownSystemIds = useMemo(() => new Set(store.galaxy?.systems.filter((system) => system.visited || system.scanned).map((system) => system.id) ?? []), [store.galaxy]);
  const knownCivilizationIds = useMemo(() => new Set(store.civilizationContacts.filter((contact) => contact.stage !== 'unknown').map((contact) => contact.civilizationId)), [store.civilizationContacts]);
  const chronicle = useMemo(() => {
    if (!store.simulation || !context) return [];
    return buildChronicle(store.simulation, context, {
      domains: domain === 'all' ? undefined : [domain],
      playerOnly: scope === 'player',
      limit: 1_000
    }).filter((entry) => scope === 'all' || scope === 'player' || entry.source === 'deep-history' || entry.visibility === 'public' || entry.systemIds.some((id) => knownSystemIds.has(id)) || entry.civilizationIds.some((id) => knownCivilizationIds.has(id)));
  }, [store.simulation, context, domain, scope, knownSystemIds, knownCivilizationIds]);
  const selected = chronicle.find((entry) => entry.id === selectedId) ?? chronicle[0];
  const causalChain = useMemo(() => store.simulation && selected?.source === 'live-simulation'
    ? traceCausalChain(store.simulation, selected.id, 'both', 5)
    : [], [store.simulation, selected]);
  const comparison = useMemo(() => store.simulation && context
    ? compareChroniclePeriods(store.simulation, context, store.gameYear - comparisonYears, store.gameYear)
    : null, [store.simulation, context, store.gameYear, comparisonYears]);
  const playerEvents = chronicle.filter((entry) => entry.playerInvolved).length;
  const severeEvents = chronicle.filter((entry) => entry.severity >= 7).length;

  return <div className="game-shell">{chrome}<main className="scroll-screen chronicle-screen">
    <header className="chronicle-hero">
      <div><span className="eyebrow">ХРОНИКА ГАЛАКТИКИ · ГОД {store.gameYear}</span><h1>История мира</h1><p>Государства, войны, культуры, планеты и действия капитана собраны в одну причинную летопись.</p></div>
      <div className="chronicle-actions"><button onClick={() => void store.advanceChronicle(5)}>Наблюдать 5 лет</button><button onClick={() => void store.advanceChronicle(20)}>Наблюдать 20 лет</button></div>
    </header>
    <section className="chronicle-metrics"><article><b>{chronicle.length}</b><span>событий в выборке</span></article><article><b>{severeEvents}</b><span>тяжёлых кризисов</span></article><article><b>{playerEvents}</b><span>вмешательств игрока</span></article><article><b>{visited}</b><span>систем посещено</span></article></section>
    <nav className="tabs sticky-tabs"><button className={tab === 'galaxy' ? 'active' : ''} onClick={() => setTab('galaxy')}>Галактика</button><button className={tab === 'captains' ? 'active' : ''} onClick={() => setTab('captains')}>Капитаны</button><button className={tab === 'lost' ? 'active' : ''} onClick={() => setTab('lost')}>Потерянные</button><button className={tab === 'memorials' ? 'active' : ''} onClick={() => setTab('memorials')}>Мемориалы</button></nav>
    {tab === 'galaxy' && <>
      <section className="chronicle-metrics">
        <article><span>ДОСТУП</span><select value={scope} onChange={(event: { target: { value: string } }) => setScope(event.target.value as typeof scope)}><option value="known">Известное</option><option value="all">Вся симуляция</option><option value="player">Только игрок</option></select></article>
        <article><span>ПЕРИОД</span><select value={comparisonYears} onChange={(event: { target: { value: string } }) => setComparisonYears(Number(event.target.value))}><option value={10}>10 лет</option><option value={25}>25 лет</option><option value={100}>100 лет</option><option value={1000}>1000 лет</option></select></article>
        <article><b>{comparison?.wars ?? 0}</b><span>военных событий</span></article><article><b>{comparison?.crises ?? 0}</b><span>кризисов</span></article>
      </section>
      <nav className="tabs"><button className={domain === 'all' ? 'active' : ''} onClick={() => setDomain('all')}>Все</button>{domainOptions.map((entry) => <button className={domain === entry ? 'active' : ''} key={entry} onClick={() => setDomain(entry)}>{chronicleDomainLabel(entry)}</button>)}</nav>
      {comparison && <article className="mobile-action-card"><b>Изменения за {comparisonYears} лет</b><p>{comparison.headline}</p><small>Систем затронуто: {comparison.changedSystemIds.length} · цивилизаций: {comparison.changedCivilizationIds.length} · зарегистрированные потери: {comparison.recordedCasualties.toLocaleString('ru-RU')}</small></article>}
      <section className="thread-context-grid">
        <div className="chronicle-timeline">{chronicle.length === 0 ? <p className="empty-state">Подтверждённых событий нет.</p> : chronicle.map((entry) => <button className={`chronicle-entry tone-${entry.severity >= 8 ? 'danger' : entry.severity >= 6 ? 'warning' : 'info'} ${selected?.id === entry.id ? 'active' : ''}`} key={entry.id} onClick={() => setSelectedId(entry.id)}><time>{entry.year}</time><div><span>{chronicleDomainLabel(entry.domain)} · {entry.source === 'deep-history' ? 'глубокая история' : `тяжесть ${entry.severity}`}{entry.playerInvolved ? ' · игрок' : ''}</span><h3>{entry.title}</h3><p>{entry.summary}</p></div></button>)}</div>
        <section>{selected ? <article className="mobile-detail-view"><span className="eyebrow">{chronicleDomainLabel(selected.domain)} · ГОД {selected.year}</span><h2>{selected.title}</h2><p className="mobile-lead">{selected.summary}</p><div className="mobile-inline-stats"><span>Причины <b>{selected.causedByEventIds.length}</b></span><span>Последствия <b>{selected.resultedInEventIds.length}</b></span><span>Изменено <b>{selected.changedEntityIds.length}</b></span><span>Уничтожено <b>{selected.destroyedEntityIds.length}</b></span></div>{causalChain.length > 1 && <details className="mobile-collapsible" open><summary>Причинная цепочка · {causalChain.length}</summary>{causalChain.map((event) => <div className="mobile-timeline-row" key={event.id}><span>Год {store.simulation ? store.simulation.clock.epochYear + Math.floor(event.atHour / (365 * 24)) : 0}</span><p>{event.title}</p></div>)}</details>}<details className="mobile-collapsible"><summary>Связанные сущности</summary><p>Системы: {selected.systemIds.join(', ') || 'нет'}</p><p>Цивилизации: {selected.civilizationIds.join(', ') || 'нет'}</p><p>Создано: {selected.createdEntityIds.join(', ') || 'нет'}</p><p>Изменено: {selected.changedEntityIds.join(', ') || 'нет'}</p></details></article> : <div className="legacy-empty"><b>Событие не выбрано</b></div>}</section>
      </section>
    </>}
    {tab === 'captains' && <section className="captain-legacy-grid">{store.legacy.captains.map((entry) => <article key={entry.id}><span className="eyebrow">КАПИТАН</span><h3>{entry.name}</h3><p>{entry.endedYear === undefined ? 'Командование продолжается' : `${entry.startedYear}—${entry.endedYear} · ${fateLabel[entry.fate ?? 'active']}`}</p><div className="legacy-stats"><span>системы <b>{entry.systemsVisited}</b></span><span>открытия <b>{entry.discoveries}</b></span><span>бои <b>{entry.battles}</b></span></div>{entry.epitaph && <blockquote>{entry.epitaph}</blockquote>}</article>)}</section>}
    {tab === 'lost' && <section className="lost-expedition-grid">{store.legacy.lostExpeditions.length === 0 ? <p className="empty-state">Потерянных экспедиций нет.</p> : store.legacy.lostExpeditions.map((entry) => <article key={entry.id}><span>{entry.status} · год {entry.year}</span><h3>{store.pointsOfInterest.find((point) => point.id === entry.pointOfInterestId)?.name ?? 'Неизвестная локация'}</h3><p>{entry.summary}</p><small>{store.galaxy?.systems.find((system) => system.id === entry.systemId)?.name}</small></article>)}</section>}
    {tab === 'memorials' && <section className="memorial-grid">{store.legacy.memorials.length === 0 ? <div className="legacy-empty"><b>Мемориалов нет</b></div> : store.legacy.memorials.map((entry) => <article key={entry.id}><span>{entry.type} · {entry.year}</span><h3>{store.legacy.captains.find((captain) => captain.id === entry.captainRecordId)?.name}</h3><p>{entry.text}</p></article>)}</section>}
    <footer className="chronicle-footer"><button className="danger-button" onClick={() => void destructiveReset(false)}>Сбросить кампанию</button><button className="primary-button" onClick={() => void destructiveReset(true)}>Начать новую кампанию</button></footer>
  </main></div>;
}
