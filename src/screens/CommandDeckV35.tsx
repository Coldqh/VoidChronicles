import type { ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';
import { crewReadiness } from '../ship/life';

export function CommandDeckV35({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const galaxy = store.galaxy;
  const current = galaxy?.systems.find((system) => system.id === store.currentSystemId);
  if (!galaxy || !current || !store.ship || !store.captain) return null;

  const activeScenes = store.storyScenes.filter((scene) => scene.status === 'available');
  const activeObjectives = store.objectives.filter((objective) => objective.status === 'active' && objective.kind !== 'tutorial');
  const currentPoints = store.pointsOfInterest.filter((entry) => entry.systemId === current.id && entry.status !== 'resolved');
  const knownHubs = current.scanned ? store.hubs.filter((hub) => hub.systemId === current.id) : [];
  const urgentThread = [...store.worldThreads].filter((thread) => thread.status === 'active' || thread.status === 'escalating').sort((a, b) => b.urgency - a.urgency)[0];
  const activeRoute = store.navigation.activePlan?.status === 'active' ? store.navigation.activePlan : undefined;
  const nextLeg = activeRoute?.legs[activeRoute.currentLegIndex];
  const nextSystem = nextLeg ? galaxy.systems.find((system) => system.id === nextLeg.toSystemId) : undefined;
  const openIssues = store.ship.life?.issues.filter((issue) => issue.status === 'open') ?? [];
  const readiness = store.crew.length ? Math.round(store.crew.reduce((sum, member) => sum + crewReadiness(member), 0) / store.crew.length) : 100;
  const contactCount = store.civilizationContacts.filter((entry) => entry.stage !== 'unknown').length;
  const tutorialActive = store.tutorial.active && !store.tutorial.completed;

  const primary = tutorialActive
    ? { eyebrow: 'ПЕРВЫЙ ПРИКАЗ', title: 'Запусти сканирование системы', text: 'Корабль ждёт первого подтверждённого приказа капитана.', label: 'Открыть локальную систему', action: () => store.setScreen('system'), tone: 'signal' }
    : activeScenes[0]
      ? { eyebrow: 'ВХОДЯЩИЙ СИГНАЛ', title: activeScenes[0].title, text: activeScenes[0].summary, label: 'Открыть сообщение', action: () => store.openStoryScene(activeScenes[0]!.id), tone: 'danger' }
      : !current.scanned
        ? { eyebrow: 'НЕИЗВЕСТНАЯ СИСТЕМА', title: 'Сенсоры ждут приказа', text: 'Орбиты, поселения и сигналы скрыты до первого системного скана.', label: 'Начать сканирование', action: () => store.setScreen('system'), tone: 'signal' }
        : activeObjectives[0]
          ? { eyebrow: 'АКТИВНАЯ ОПЕРАЦИЯ', title: activeObjectives[0].title, text: activeObjectives[0].description, label: 'Открыть операции', action: () => store.setScreen('operations'), tone: 'warning' }
          : currentPoints[0]
            ? { eyebrow: 'НОВАЯ ЦЕЛЬ', title: currentPoints[0].name, text: currentPoints[0].publicSummary, label: 'Открыть систему', action: () => store.setScreen('system'), tone: 'signal' }
            : { eyebrow: 'СЛЕДУЮЩИЙ ХОД', title: activeRoute ? `Продолжить путь к ${nextSystem?.name ?? 'цели'}` : 'Выбрать новый маршрут', text: activeRoute ? `Этап ${activeRoute.currentLegIndex + 1} из ${activeRoute.legs.length}.` : 'Галактика продолжает меняться. Реши, куда вмешаться дальше.', label: 'Открыть карту', action: () => store.setScreen('galaxy'), tone: 'calm' };

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
        <button className="v35-cta" onClick={primary.action}>{primary.label}<i>→</i></button>
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
