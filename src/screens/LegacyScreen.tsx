import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useGameStore } from '../game/store';
import {
  buildKnownChronicle,
  chronicleDomainLabel,
  compareKnownChroniclePeriods,
  knownChronicleStatus,
  traceKnownCausalChain,
  type ChronicleDomain
} from '../simulation/chronicle';
import { intelligenceLabel } from '../simulation/intelligence';

const fateLabel: Record<string, string> = {
  active: 'командует', dead: 'погиб', missing: 'пропал', captured: 'захвачен', coma: 'в коме', stranded: 'оставлен на поверхности', retired: 'сложил полномочия'
};

const domainOptions: ChronicleDomain[] = ['politics', 'war', 'economy', 'society', 'culture', 'science', 'ecology', 'heritage', 'demography', 'player'];

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
  const [scope, setScope] = useState<'confirmed' | 'signals' | 'player'>('confirmed');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparisonYears, setComparisonYears] = useState(25);
  const visited = store.galaxy?.systems.filter((entry) => entry.visited).length ?? 0;
  const context = useMemo(() => store.galaxy ? ({
    seed: store.galaxy.seed,
    galaxy: store.galaxy,
    factions: store.factions,
    hubs: store.hubs
  }) : null, [store.galaxy, store.factions, store.hubs]);
  const archiveCivilizationIds = useMemo(() => [...new Set(store.archaeologyChains
    .filter((chain) => chain.stages.some((stage) => stage.status === 'completed'))
    .map((chain) => chain.civilizationId))], [store.archaeologyChains]);
  const access = useMemo(() => ({
    knowledge: store.knowledge,
    contacts: store.civilizationContacts,
    currentHour: store.simulation?.clock.absoluteHour ?? 0,
    archiveCivilizationIds
  }), [store.knowledge, store.civilizationContacts, store.simulation?.clock.absoluteHour, archiveCivilizationIds]);
  const minimum = scope === 'signals' ? 'rumor' as const : 'confirmed' as const;
  const chronicle = useMemo(() => {
    if (!store.simulation || !context) return [];
    return buildKnownChronicle(store.simulation, context, access, {
      domains: domain === 'all' ? undefined : [domain],
      playerOnly: scope === 'player',
      minimumIntelligence: scope === 'player' ? 'observed' : minimum,
      limit: 1_000
    });
  }, [store.simulation, context, access, domain, scope, minimum]);
  const selected = chronicle.find((entry) => entry.id === selectedId) ?? chronicle[0];
  const causalChain = useMemo(() => store.simulation && selected?.source === 'live-simulation'
    ? traceKnownCausalChain(store.simulation, selected.id, access, minimum, 5)
    : [], [store.simulation, selected, access, minimum]);
  const comparison = useMemo(() => store.simulation && context
    ? compareKnownChroniclePeriods(store.simulation, context, access, store.gameYear - comparisonYears, store.gameYear, minimum)
    : null, [store.simulation, context, access, store.gameYear, comparisonYears, minimum]);
  const playerEvents = chronicle.filter((entry) => entry.playerInvolved).length;
  const severeEvents = chronicle.filter((entry) => entry.severity >= 7).length;
  const entityNames = (ids: string[], type: 'system' | 'civilization' | 'faction'): string => ids.map((id) => {
    if (type === 'system') return store.galaxy?.systems.find((entry) => entry.id === id)?.name;
    if (type === 'civilization') return store.galaxy?.civilizations.find((entry) => entry.id === id)?.name;
    return store.factions.find((entry) => entry.id === id)?.name;
  }).filter((entry): entry is string => Boolean(entry)).join(' · ') || 'не установлены';

  return <div className="game-shell">{chrome}<main className="scroll-screen chronicle-screen">
    <header className="chronicle-hero">
      <div><span className="eyebrow">ХРОНИКА ГАЛАКТИКИ · ГОД {store.gameYear}</span><h1>Известная история</h1><p>Летопись растёт через сканирование, контакты, новости, архивы и собственные действия. Неизвестные регионы не раскрываются автоматически.</p></div>
      <div className="chronicle-actions"><button onClick={() => void store.advanceChronicle(5)}>Наблюдать 5 лет</button><button onClick={() => void store.advanceChronicle(20)}>Наблюдать 20 лет</button></div>
    </header>
    <section className="chronicle-metrics"><article><b>{chronicle.length}</b><span>доступных событий</span></article><article><b>{severeEvents}</b><span>известных кризисов</span></article><article><b>{playerEvents}</b><span>твоих вмешательств</span></article><article><b>{visited}</b><span>систем посещено</span></article></section>
    <nav className="tabs sticky-tabs"><button className={tab === 'galaxy' ? 'active' : ''} onClick={() => setTab('galaxy')}>Галактика</button><button className={tab === 'captains' ? 'active' : ''} onClick={() => setTab('captains')}>Капитаны</button><button className={tab === 'lost' ? 'active' : ''} onClick={() => setTab('lost')}>Потерянные</button><button className={tab === 'memorials' ? 'active' : ''} onClick={() => setTab('memorials')}>Мемориалы</button></nav>
    {tab === 'galaxy' && <>
      <section className="chronicle-metrics">
        <article><span>ДОСТУП</span><select value={scope} onChange={(event: { target: { value: string } }) => setScope(event.target.value as typeof scope)}><option value="confirmed">Подтверждённое</option><option value="signals">Сигналы и слухи</option><option value="player">Только игрок</option></select></article>
        <article><span>ПЕРИОД</span><select value={comparisonYears} onChange={(event: { target: { value: string } }) => setComparisonYears(Number(event.target.value))}><option value={10}>10 лет</option><option value={25}>25 лет</option><option value={100}>100 лет</option><option value={1000}>1000 лет</option></select></article>
        <article><b>{comparison?.wars ?? 0}</b><span>известных военных событий</span></article><article><b>{comparison?.crises ?? 0}</b><span>известных кризисов</span></article>
      </section>
      <nav className="tabs"><button className={domain === 'all' ? 'active' : ''} onClick={() => setDomain('all')}>Все</button>{domainOptions.map((entry) => <button className={domain === entry ? 'active' : ''} key={entry} onClick={() => setDomain(entry)}>{chronicleDomainLabel(entry)}</button>)}</nav>
      {comparison && <article className="mobile-action-card"><b>Что удалось установить за {comparisonYears} лет</b><p>{comparison.headline}</p><small>Известных систем затронуто: {comparison.changedSystemIds.length} · цивилизаций: {comparison.changedCivilizationIds.length}. Неизвестные события в расчёт не входят.</small></article>}
      <section className="thread-context-grid">
        <div className="chronicle-timeline">{chronicle.length === 0 ? <p className="empty-state">Данных нет. Ищи архивы, сканируй системы, слушай новости и устанавливай контакт.</p> : chronicle.map((entry) => <button className={`chronicle-entry tone-${entry.severity >= 8 ? 'danger' : entry.severity >= 6 ? 'warning' : 'info'} ${selected?.id === entry.id ? 'active' : ''}`} key={entry.id} onClick={() => setSelectedId(entry.id)}><time>{entry.year}</time><div><span>{chronicleDomainLabel(entry.domain)} · {knownChronicleStatus(entry)}{entry.playerInvolved ? ' · игрок' : ''}</span><h3>{entry.title}</h3><p>{entry.summary}</p></div></button>)}</div>
        <section>{selected ? <article className="mobile-detail-view"><span className="eyebrow">{chronicleDomainLabel(selected.domain)} · ГОД {selected.year}</span><h2>{selected.title}</h2><p className="mobile-lead">{selected.summary}</p><div className="mobile-inline-stats"><span>Достоверность <b>{selected.confidence}%</b></span><span>Уровень <b>{intelligenceLabel(selected.intelligenceLevel)}</b></span><span>Источник <b>{selected.intelligenceSource}</b></span><span>Давность <b>{selected.staleYears} лет</b></span></div>{(selected.unknownCauseLinks || selected.unknownResultLinks) && <article className="mobile-action-card warning"><b>Цепочка неполна</b><p>В истории есть неизвестные причины или последствия. Их можно открыть через новые источники.</p></article>}{causalChain.length > 1 && <details className="mobile-collapsible" open><summary>Известная причинная цепочка · {causalChain.length}</summary>{causalChain.map((event) => <div className="mobile-timeline-row" key={event.id}><span>Год {store.simulation ? store.simulation.clock.epochYear + Math.floor(event.atHour / (365 * 24)) : 0}</span><p>{event.title}</p></div>)}</details>}<details className="mobile-collapsible"><summary>Подтверждённые участники</summary><p>Системы: {entityNames(selected.systemIds, 'system')}</p><p>Цивилизации: {entityNames(selected.civilizationIds, 'civilization')}</p><p>Фракции: {entityNames(selected.factionIds, 'faction')}</p>{selected.redacted && <p>Остальные сведения закрыты текущим уровнем разведки.</p>}</details></article> : <div className="legacy-empty"><b>Событие не выбрано</b></div>}</section>
      </section>
    </>}
    {tab === 'captains' && <section className="captain-legacy-grid">{store.legacy.captains.map((entry) => <article key={entry.id}><span className="eyebrow">КАПИТАН</span><h3>{entry.name}</h3><p>{entry.endedYear === undefined ? 'Командование продолжается' : `${entry.startedYear}—${entry.endedYear} · ${fateLabel[entry.fate ?? 'active']}`}</p><div className="legacy-stats"><span>системы <b>{entry.systemsVisited}</b></span><span>открытия <b>{entry.discoveries}</b></span><span>бои <b>{entry.battles}</b></span></div>{entry.epitaph && <blockquote>{entry.epitaph}</blockquote>}</article>)}</section>}
    {tab === 'lost' && <section className="lost-expedition-grid">{store.legacy.lostExpeditions.length === 0 ? <p className="empty-state">Потерянных экспедиций нет.</p> : store.legacy.lostExpeditions.map((entry) => <article key={entry.id}><span>{entry.status} · год {entry.year}</span><h3>{store.pointsOfInterest.find((point) => point.id === entry.pointOfInterestId)?.name ?? 'Неизвестная локация'}</h3><p>{entry.summary}</p><small>{store.galaxy?.systems.find((system) => system.id === entry.systemId)?.name}</small></article>)}</section>}
    {tab === 'memorials' && <section className="memorial-grid">{store.legacy.memorials.length === 0 ? <div className="legacy-empty"><b>Мемориалов нет</b></div> : store.legacy.memorials.map((entry) => <article key={entry.id}><span>{entry.type} · {entry.year}</span><h3>{store.legacy.captains.find((captain) => captain.id === entry.captainRecordId)?.name}</h3><p>{entry.text}</p></article>)}</section>}
    <footer className="chronicle-footer"><button className="danger-button" onClick={() => void destructiveReset(false)}>Сбросить кампанию</button><button className="primary-button" onClick={() => void destructiveReset(true)}>Начать новую кампанию</button></footer>
  </main></div>;
}
