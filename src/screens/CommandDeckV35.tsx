import type { ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';
import { crewReadiness } from '../ship/life';
import { buildCaptainJourney, type JourneyAction } from '../journey/captainJourney';
import { CaptainJournalV36 } from './CaptainJournalV36';
import '../styles/journeyV36.css';

export function CommandDeckV35({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const galaxy = store.galaxy;
  const current = galaxy?.systems.find((system) => system.id === store.currentSystemId);
  if (!galaxy || !current || !store.ship || !store.captain) return null;

  const currentPoints = store.pointsOfInterest.filter((entry) => entry.systemId === current.id && entry.status !== 'resolved');
  const knownHubs = current.scanned ? store.hubs.filter((hub) => hub.systemId === current.id) : [];
  const urgentThread = [...store.worldThreads].filter((thread) => thread.status === 'active' || thread.status === 'escalating').sort((a, b) => b.urgency - a.urgency)[0];
  const activeRoute = store.navigation.activePlan?.status === 'active' ? store.navigation.activePlan : undefined;
  const nextLeg = activeRoute?.legs[activeRoute.currentLegIndex];
  const nextSystem = nextLeg ? galaxy.systems.find((system) => system.id === nextLeg.toSystemId) : undefined;
  const openIssues = store.ship.life?.issues.filter((issue) => issue.status === 'open') ?? [];
  const readiness = store.crew.length ? Math.round(store.crew.reduce((sum, member) => sum + crewReadiness(member), 0) / store.crew.length) : 100;
  const contactCount = store.civilizationContacts.filter((entry) => entry.stage !== 'unknown').length;

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
    pendingConsequences: store.pendingConsequences,
    openShipIssues: openIssues.length
  });

  const runJourneyAction = (action: JourneyAction) => {
    if (action.kind === 'scene') store.openStoryScene(action.sceneId);
    else store.setScreen(action.screen);
  };

  const primary = journey.focus;
  const life = store.ship.life;
  const criticalSupply = Math.min(life?.supplies.food ?? 100, life?.supplies.oxygen ?? 100);

  return <div className="game-shell">{chrome}<main className="v35-command">
    <div className={`v35-command-cosmos danger-${current.danger}`} aria-hidden="true">
      <i className="v35-star-core"/><i className="v35-orbit orbit-one"/><i className="v35-orbit orbit-two"/><i className="v35-orbit orbit-three"/>
      <i className="v35-ship-silhouette"/><span className="v35-scan-line"/>
    </div>

    <section className="v35-command-stage">
      <header className="v35-command-title">
        <div><span className="eyebrow">КОМАНДНЫЙ МОСТИК · {current.region.toUpperCase()}</span><h1>{current.name}</h1><p>{current.scanned ? `${current.starClass} · ${current.planets.length} орбит · угроза ${current.danger}` : 'Навигационные данные ещё не подтверждены.'}</p></div>
        <div className="v35-command-year"><span>ТЕКУЩИЙ ГОД</span><b>{formatInteger(store.gameYear)}</b></div>
      </header>

      <article className={`v35-primary-decision tone-${primary.tone}`}>
        <div className="v35-decision-beacon"><i/><span/></div>
        <div><span className="eyebrow">{primary.eyebrow}</span><h2>{primary.title}</h2><p>{primary.text}</p></div>
        <button data-tutorial={store.tutorial.currentStep === 0 && store.tutorial.active ? 'open-system' : undefined} className="v35-cta" onClick={() => runJourneyAction(primary.action)}>{primary.label}<i>→</i></button>
      </article>

      <section className="v35-command-panels">
        <button className="v35-command-card route" onClick={() => store.setScreen('galaxy')}>
          <span>МАРШРУТ</span><h3>{activeRoute ? `${current.name} → ${nextSystem?.name ?? 'следующая система'}` : 'Маршрут не проложен'}</h3>
          <p>{activeRoute ? `${activeRoute.legs.length - activeRoute.currentLegIndex} прыжков осталось · риск ${formatInteger(activeRoute.totalRisk)}` : 'Выбери быстрый, тихий или экономичный путь.'}</p>
          <i className="v35-card-line"/>
        </button>
        <button className={`v35-command-card world ${urgentThread ? 'alert' : ''}`} onClick={() => store.setScreen('world')}>
          <span>ЖИВОЙ МИР</span><h3>{urgentThread?.title ?? 'Подтверждённых кризисов нет'}</h3>
          <p>{urgentThread?.summary ?? `${contactCount} цивилизаций в разведывательной картине.`}</p>
          {urgentThread && <em>{formatInteger(urgentThread.urgency)}</em>}
        </button>
        <button className={`v35-command-card ship ${openIssues.length || criticalSupply < 30 ? 'alert' : ''}`} onClick={() => store.setScreen('ship')}>
          <span>КОРАБЛЬ</span><h3>{store.ship.name}</h3>
          <p>{openIssues.length ? `${openIssues.length} проблем требуют решения` : `Экипаж готов на ${readiness}%`}</p>
          <div className="v35-mini-bars"><i style={{ width: `${store.ship.hull}%` }}/><i style={{ width: `${criticalSupply}%` }}/></div>
        </button>
      </section>

      <CaptainJournalV36 journey={journey} onAction={runJourneyAction}/>

      <section className="v35-command-lower">
        <article className="v35-crew-watch">
          <header><div><span className="eyebrow">ЛЮДИ НА ПОСТАХ</span><h2>Экипаж</h2></div><button onClick={() => store.setScreen('crew')}>Открыть досье</button></header>
          <div>{store.crew.length ? store.crew.slice(0, 4).map((member) => <button key={member.id} onClick={() => store.setScreen('crew')}>
            <i>{member.name.slice(0, 1)}</i><span><b>{member.name}</b><small>{member.primaryRole} · готовность {crewReadiness(member)}%</small></span><em className={crewReadiness(member) < 45 ? 'critical' : ''}>{crewReadiness(member)}</em>
          </button>) : <p>Капитан работает один.</p>}</div>
        </article>

        <article className="v35-signal-feed">
          <header><span className="eyebrow">ПОСЛЕДНИЕ СИГНАЛЫ</span><button onClick={() => store.setScreen('chronicle')}>Хроника</button></header>
          <div>{store.logs.slice(0, 4).map((entry) => <p key={entry.id}><span>{entry.title}</span><b>{entry.text}</b></p>)}</div>
          {!store.logs.length && <p>Корабельный журнал пуст.</p>}
        </article>
      </section>

      <footer className="v35-command-footer">
        <button onClick={() => store.setScreen('system')}><i>◉</i><span><b>Локальная система</b><small>{current.scanned ? `${currentPoints.length} активных сигналов` : 'нужен скан'}</small></span></button>
        <button onClick={() => store.setScreen('civilizations')}><i>⌬</i><span><b>Контакты</b><small>{contactCount} известных цивилизаций</small></span></button>
        <button onClick={() => store.setScreen('laboratory')}><i>◈</i><span><b>Лаборатория</b><small>{store.researchProjects.filter((entry) => entry.status === 'active').length} активных проектов</small></span></button>
        <button onClick={() => knownHubs[0] ? void store.dockAtHub(knownHubs[0].id) : store.setScreen('system')}><i>▰</i><span><b>{knownHubs[0]?.name ?? 'Стыковка'}</b><small>{knownHubs.length ? 'доступный узел' : 'узлов не найдено'}</small></span></button>
      </footer>
    </section>
  </main></div>;
}
