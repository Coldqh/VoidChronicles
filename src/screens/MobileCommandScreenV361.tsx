import { useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { crewReadiness } from '../ship/life';
import { buildCaptainJourney, type JourneyAction } from '../journey/captainJourney';
import { formatInteger } from '../ui/format';

type JournalTab = 'order' | 'voyage' | 'career' | 'consequences';

export function MobileCommandScreenV361({ chrome }: { chrome: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<JournalTab>('order');
  const galaxy = store.galaxy;
  const current = galaxy?.systems.find((system) => system.id === store.currentSystemId);
  if (!galaxy || !current || !store.ship || !store.captain) return null;

  const openIssues = store.ship.life?.issues.filter((issue) => issue.status === 'open') ?? [];
  const readiness = store.crew.length
    ? Math.round(store.crew.reduce((sum, member) => sum + crewReadiness(member), 0) / store.crew.length)
    : 100;
  const activeRoute = store.navigation.activePlan?.status === 'active' ? store.navigation.activePlan : undefined;
  const nextLeg = activeRoute?.legs[activeRoute.currentLegIndex];
  const nextSystem = nextLeg ? galaxy.systems.find((system) => system.id === nextLeg.toSystemId) : undefined;
  const journey = buildCaptainJourney({
    tutorial: store.tutorial,
    captain: store.captain,
    ship: store.ship,
    currentSystem: current,
    storyScenes: store.storyScenes,
    objectives: store.objectives,
    worldThreads: store.worldThreads,
    researchProjects: store.researchProjects,
    archaeologyChains: store.archaeologyChains,
    navigation: store.navigation,
    discoveries: store.discoveries,
    logs: store.logs,
    openShipIssues: openIssues.length
  });

  const runAction = (action: JourneyAction) => {
    if (action.kind === 'scene') store.openStoryScene(action.sceneId);
    else store.setScreen(action.screen);
  };

  return <div className="game-shell v361-shell">{chrome}<main className="mobile-data-screen v361-screen v361-command-screen v363-command-screen">
    <header className="v361-screen-header">
      <div><span>МОСТИК · ГОД {formatInteger(store.gameYear)}</span><h1>{current.name}</h1></div>
      <div className="v361-header-stats"><b>{formatInteger(store.ship.hull)}%</b><b>{formatInteger(store.ship.fuel)}%</b><b>₡{formatInteger(store.captain.credits)}</b></div>
    </header>

    <section className={`v361-primary-card v363-primary-card tone-${journey.focus.tone}`}>
      <div><span>{journey.focus.eyebrow}</span><h2>{journey.focus.title}</h2><p>{journey.focus.text}</p></div>
      <button className="primary-button" onClick={() => runAction(journey.focus.action)}>{journey.focus.label}</button>
    </section>

    <div className="v361-quick-rows v363-quick-rows">
      <button onClick={() => store.setScreen('galaxy')}><span>МАРШРУТ</span><b>{activeRoute ? `${current.name} → ${nextSystem?.name ?? 'следующая система'}` : 'Не проложен'}</b><em>›</em></button>
      <button onClick={() => store.setScreen('ship')}><span>КОРАБЛЬ</span><b>{openIssues.length ? `${openIssues.length} проблем · готовность ${readiness}%` : `Готовность ${readiness}%`}</b><em>›</em></button>
    </div>

    <nav className="v361-tabs four" aria-label="Журнал капитана">
      <button className={tab === 'order' ? 'active' : ''} onClick={() => setTab('order')}>Приказ</button>
      <button className={tab === 'voyage' ? 'active' : ''} onClick={() => setTab('voyage')}>Путь</button>
      <button className={tab === 'career' ? 'active' : ''} onClick={() => setTab('career')}>Карьера</button>
      <button className={tab === 'consequences' ? 'active' : ''} onClick={() => setTab('consequences')}>Итоги</button>
    </nav>

    <section className="v361-tab-body">
      {tab === 'order' && <article className="v361-focus-panel">
        <span>ТЕКУЩИЙ ПРИКАЗ</span><h2>{journey.focus.title}</h2><p>{journey.focus.text}</p>
        <small className="v363-order-hint">Основное действие находится в верхнем блоке.</small>
      </article>}

      {tab === 'voyage' && <div className="v361-stage-list">
        <header><span>ПЕРВЫЙ РЕЙС</span><b>{journey.firstVoyageProgress}%</b></header>
        {journey.firstVoyageStages.map((stage, index) => <article className={`status-${stage.status}`} key={stage.id}><i>{stage.status === 'completed' ? '✓' : index + 1}</i><div><b>{stage.title}</b><p>{stage.summary}</p></div></article>)}
      </div>}

      {tab === 'career' && <article className="v361-focus-panel">
        <span>ИМЯ КАПИТАНА</span><h2>{journey.career.title}</h2><p>{journey.career.summary}</p>
        <div className="v361-metric-row"><span>Операции <b>{journey.career.completedOperations}</b></span><span>Известность <b>{journey.career.renown}</b></span><span>Рубеж <b>{journey.career.nextRequired}</b></span></div>
        <i className="v361-progress"><em style={{ width: `${journey.career.progress}%` }}/></i>
      </article>}

      {tab === 'consequences' && <div className="v361-compact-list">
        {journey.recentConsequences.length ? journey.recentConsequences.map((entry) => <article key={entry.id}><span>ПОСЛЕДСТВИЕ</span><b>{entry.title}</b><p>{entry.text}</p></article>) : <article><span>ЖУРНАЛ ПУСТ</span><b>Последствий пока нет</b><p>Они появятся после первого подтверждённого решения.</p></article>}
        {journey.campaignThread && <button className="v361-list-button" onClick={() => runAction(journey.campaignThread!.action)}><span>БОЛЬШАЯ ЛИНИЯ</span><b>{journey.campaignThread.title}</b><p>{journey.campaignThread.summary}</p><em>›</em></button>}
      </div>}
    </section>
  </main></div>;
}
