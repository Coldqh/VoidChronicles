import { useEffect, useMemo, useRef, useState } from 'react';
import { GalaxyCanvas } from './components/GalaxyCanvas';
import { ExpeditionModal } from './components/ExpeditionModal';
import { ShipCombatModal } from './components/ShipCombatModal';
import { SystemMap } from './components/SystemMap';
import { roleLabel } from './crew/generateCrew';
import type { GenerationProgress } from './generation/generateGalaxy';
import { generateGalaxyInWorker } from './generation/generateInWorker';
import type {
  Artifact,
  Civilization,
  Contract,
  GalaxySettings,
  Hypothesis,
  LocalNpc,
  Planet,
  PointOfInterest
} from './game/types';
import { useGameStore, type MainScreen } from './game/store';
import { exportSnapshot, readSnapshotFile } from './persistence/db';
import { forceApplicationUpdate } from './runtime/update';
import { APP_CODENAME, APP_VERSION, BUILD_TIME, SAVE_SCHEMA_VERSION } from './version';
import { contactStageLabel } from './world/civilizations';
import { generateMarket } from './world/livingGalaxy';
import './styles/app.css';

const defaultSettings: GalaxySettings = {
  seed: 'VOID-CHRONICLES-005',
  systemCount: 300,
  historyYears: 2_000_000,
  civilizationCount: 12,
  lifeFrequency: 0.34,
  anomalyFrequency: 0.035,
  difficulty: 'standard'
};

const formatYear = (year: number) => year < 0 ? `${Math.abs(year).toLocaleString('ru-RU')} лет до старта` : `Год ${year}`;
const VersionBadge = () => <span className="version-badge">v{APP_VERSION}</span>;
const contractStatusLabel = (contract: Contract) => contract.status === 'available' ? 'доступен' : contract.status === 'active' ? 'активен' : contract.status === 'completed' ? 'выполнен' : contract.status === 'expired' ? 'просрочен' : 'провален';
const npcRoleLabel = (npc: LocalNpc) => ({ administrator: 'управляющий', merchant: 'торговец', scientist: 'учёный', doctor: 'врач', fixer: 'посредник', priest: 'религиозный деятель', guard: 'охранник', resident: 'местный житель' }[npc.role]);
const hypothesisDispositionLabel = (hypothesis: Hypothesis) => hypothesis.disposition === 'published' ? 'опубликована' : hypothesis.disposition === 'sold' ? 'продана' : hypothesis.disposition === 'suppressed' ? 'скрыта' : 'не решено';

function MainMenu() {
  const store = useGameStore();
  const [settings, setSettings] = useState(defaultSettings);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const create = async () => {
    if (store.generationActive || store.busyAction) return;
    store.setGenerationActive(true);
    setProgress({ stage: 'start', progress: 0.01, message: 'Инициализация генератора' });
    try {
      await store.startGame(await generateGalaxyInWorker(settings, setProgress));
    } catch (error) {
      setProgress({ stage: 'error', progress: 0, message: error instanceof Error ? error.message : 'Ошибка генерации' });
    } finally {
      store.setGenerationActive(false);
    }
  };

  const importSave = async (file?: File) => {
    if (!file) return;
    try {
      await store.restoreSnapshot(await readSnapshotFile(file));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Не удалось импортировать сохранение');
    }
  };

  return <main className="menu-screen">
    <div className="menu-stars" />
    <section className="menu-panel">
      <div className="menu-version"><VersionBadge/><span>{APP_CODENAME}</span></div>
      <span className="eyebrow">PROCEDURAL SPACE ROGUELIKE</span>
      <h1>VOID<br/>CHRONICLES</h1>
      <p className="menu-subtitle">Цивилизации имеют культуры, языки и память. Первый контакт может закончиться торговлей, ошибкой перевода или войной.</p>
      {store.recoveryNotice && <div className="recovery-notice"><b>Система сохранений</b><p>{store.recoveryNotice}</p><button onClick={store.dismissRecoveryNotice}>Закрыть</button></div>}
      {store.saveError && <div className="save-error"><b>Сейв не загружен</b><p>{store.saveError}</p><div className="menu-actions"><button onClick={store.dismissSaveError}>Скрыть</button><button className="danger-button" onClick={() => void store.clearGame()}>Удалить повреждённый сейв</button></div></div>}
      {progress ? <div className="generation-panel">
        <div className="generation-line"><span>{progress.stage.toUpperCase()}</span><strong>{Math.round(progress.progress * 100)}%</strong></div>
        <div className="progress-track"><i style={{ width: `${progress.progress * 100}%` }}/></div>
        <p>{progress.message}</p>
        {progress.stage === 'error' && <button onClick={() => setProgress(null)}>Вернуться</button>}
      </div> : <>
        <div className="seed-row"><label>SEED<input value={settings.seed} onChange={(event) => setSettings({ ...settings, seed: event.target.value || 'VOID' })}/></label><button onClick={() => setSettings({ ...settings, seed: `VOID-${Math.random().toString(36).slice(2, 10).toUpperCase()}` })}>Случайный</button></div>
        <div className="settings-grid">
          <label>Системы<input type="number" min="20" max="1500" value={settings.systemCount} onChange={(event) => setSettings({ ...settings, systemCount: Number(event.target.value) })}/></label>
          <label>История<select value={settings.historyYears} onChange={(event) => setSettings({ ...settings, historyYears: Number(event.target.value) })}><option value={100000}>100 000</option><option value={2000000}>2 000 000</option><option value={10000000}>10 000 000</option></select></label>
          <label>Цивилизации<input type="number" min="2" max="80" value={settings.civilizationCount} onChange={(event) => setSettings({ ...settings, civilizationCount: Number(event.target.value) })}/></label>
          <label>Сложность<select value={settings.difficulty} onChange={(event) => setSettings({ ...settings, difficulty: event.target.value as GalaxySettings['difficulty'] })}><option value="explorer">Исследователь</option><option value="standard">Стандарт</option><option value="brutal">Жестокая</option></select></label>
        </div>
        <div className="menu-actions">
          <button className="primary-button large" disabled={store.generationActive || Boolean(store.busyAction)} onClick={create}>{store.generationActive ? 'Генерация…' : 'Создать галактику'}</button>
          {store.saveAvailable && <button onClick={() => void store.resumeGame()}>Продолжить ironman</button>}
          <button onClick={() => fileRef.current?.click()}>Импорт сохранения</button>
          <button onClick={() => store.setScreen('settings')}>Настройки</button>
          <input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => void importSave(event.target.files?.[0])}/>
        </div>
      </>}
      <footer>v{APP_VERSION} · {APP_CODENAME}</footer>
    </section>
  </main>;
}

const navigationGroups: { title: string; items: { id: MainScreen; label: string; icon: string }[] }[] = [
  { title: 'КОМАНДОВАНИЕ', items: [
    { id: 'command', label: 'Мостик', icon: '◆' },
    { id: 'galaxy', label: 'Галактика', icon: '✦' },
    { id: 'system', label: 'Система', icon: '◉' }
  ] },
  { title: 'МИР', items: [
    { id: 'civilizations', label: 'Цивилизации', icon: '⌬' },
    { id: 'factions', label: 'Фракции', icon: '⚑' },
    { id: 'contracts', label: 'Контракты', icon: '▤' },
    { id: 'archive', label: 'Архив', icon: '▣' }
  ] },
  { title: 'КОРАБЛЬ', items: [
    { id: 'crew', label: 'Экипаж', icon: '♟' },
    { id: 'ship', label: 'Корабль', icon: '▲' },
    { id: 'settings', label: 'Настройки', icon: '⚙' }
  ] }
];

function AppChrome() {
  const store = useGameStore();
  const [open, setOpen] = useState(false);
  const current = store.galaxy?.systems.find((system) => system.id === store.currentSystemId);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  if (!store.captain || !store.ship) return null;
  const navigate = (screen: MainScreen) => { store.setScreen(screen); setOpen(false); };

  return <>
    <header className="app-hud">
      <button className="drawer-toggle" aria-label="Открыть навигацию" onClick={() => setOpen(true)}><span/><span/><span/></button>
      <button className="hud-brand" onClick={() => navigate('command')}><b>VOID CHRONICLES</b><VersionBadge/></button>
      <div className="hud-location"><span>{current?.name ?? 'НЕИЗВЕСТНАЯ СИСТЕМА'}</span><small>{store.currentHubId ? store.hubs.find((hub) => hub.id === store.currentHubId)?.name : 'КОРАБЛЬ В КОСМОСЕ'}</small></div>
      <div className="hud-stats"><span className={`save-state save-${store.saveStatus}`}>{store.saveStatus === 'saving' || store.saveStatus === 'pending' ? 'СОХРАНЕНИЕ…' : store.saveStatus === 'error' ? 'ОШИБКА' : 'IRONMAN'}</span><span>{formatYear(store.gameYear)}</span><span>₡ {store.captain.credits}</span><span>⛽ {store.ship.fuel}</span></div>
    </header>
    <button className={`drawer-overlay ${open ? 'open' : ''}`} aria-label="Закрыть меню" onClick={() => setOpen(false)}/>
    <aside className={`nav-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header><div><span className="eyebrow">КОРАБЕЛЬНАЯ СИСТЕМА</span><h2>VOID CHRONICLES</h2><div className="drawer-version"><VersionBadge/><span>{APP_CODENAME}</span></div></div><button className="icon-button" onClick={() => setOpen(false)}>×</button></header>
      <nav className="drawer-nav">
        {navigationGroups.map((group) => <section key={group.title}><span>{group.title}</span>{group.items.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><i>{item.icon}</i><b>{item.label}</b></button>)}</section>)}
      </nav>
      <footer><div><span>КОРПУС</span><b>{store.ship.hull}/{store.ship.maxHull}</b></div><div><span>ЭКИПАЖ</span><b>{store.crew.length + 1}</b></div><div><span>СХЕМА СЕЙВА</span><b>v{SAVE_SCHEMA_VERSION}</b></div></footer>
    </aside>
  </>;
}

function CommandDeckScreen() {
  const store = useGameStore();
  const current = store.galaxy?.systems.find((system) => system.id === store.currentSystemId);
  if (!current || !store.ship || !store.captain) return null;
  const localHubs = store.hubs.filter((hub) => hub.systemId === current.id);
  const localFaction = store.factions.find((faction) => faction.id === current.factionId);
  const active = store.contracts.filter((contract) => contract.status === 'active');
  const systemContacts = store.civilizationContacts.filter((contact) => current.civilizationIds.includes(contact.civilizationId));
  return <div className="game-shell"><AppChrome/><main className="scroll-screen command-deck">
    <section className="command-hero"><div><span className="eyebrow">КОМАНДНЫЙ МОСТИК · {current.region.toUpperCase()}</span><h1>{current.name}</h1><p>{localFaction ? `${localFaction.name} · отношение: ${localFaction.disposition}` : 'Нейтральное пространство без единого контроля.'}</p><div className="hero-actions"><button className="primary-button" onClick={() => store.setScreen('system')}>Открыть систему</button><button onClick={() => store.setScreen('contracts')}>Доска контрактов</button><button onClick={() => store.setScreen('civilizations')}>Цивилизации</button>{localHubs[0] && <button onClick={() => void store.dockAtHub(localHubs[0].id)}>Стыковка: {localHubs[0].name}</button>}</div></div><div className="command-ship"><div className="ship-silhouette compact"><div className="ship-core"/><div className="ship-wing left"/><div className="ship-wing right"/></div></div></section>
    <section className="command-grid">
      <article className="command-card"><span className="eyebrow">КОРАБЛЬ</span><h2>{store.ship.name}</h2><div className="stat-row"><span>Корпус</span><b>{store.ship.hull}/{store.ship.maxHull}</b></div><div className="stat-row"><span>Топливо</span><b>{store.ship.fuel}/{store.ship.maxFuel}</b></div><div className="stat-row"><span>Груз</span><b>{store.ship.cargo.length}/{store.ship.cargoCapacity}</b></div></article>
      <article className="command-card"><span className="eyebrow">ХАБЫ И ПОСЕЛЕНИЯ</span><h2>{localHubs.length}</h2>{localHubs.length ? localHubs.map((hub) => <div className="compact-row" key={hub.id}><div><b>{hub.name}</b><small>{hub.kind} · {hub.safety}</small></div><button onClick={() => void store.dockAtHub(hub.id)}>Стыковка</button></div>) : <p>В системе нет известного гражданского порта.</p>}</article>
      <article className="command-card"><span className="eyebrow">КОНТАКТЫ</span><h2>{systemContacts.length}</h2>{systemContacts.length ? systemContacts.map((contact) => { const civ = store.galaxy?.civilizations.find((entry) => entry.id === contact.civilizationId); return <div className="compact-row" key={contact.civilizationId}><div><b>{civ?.name}</b><small>{contactStageLabel(contact.stage)} · язык {contact.languageLevel}/5</small></div></div>; }) : <p>Разумные сигналы не подтверждены.</p>}<button onClick={() => store.setScreen('civilizations')}>Открыть досье</button></article>
      <article className="command-card"><span className="eyebrow">АКТИВНЫЕ КОНТРАКТЫ</span><h2>{active.length}</h2>{active.slice(0, 3).map((contract) => <div className="compact-row" key={contract.id}><div><b>{contract.title}</b><small>{contract.progress}/{contract.requiredProgress} · до {contract.deadlineYear}</small></div></div>)}<button onClick={() => store.setScreen('contracts')}>Все контракты</button></article>
      <article className="command-card command-log"><span className="eyebrow">НОВОСТИ СЕТИ</span>{store.news.slice(0, 5).map((item) => <div key={item.id}><b>{item.headline}</b><p>{item.text}</p><small>{formatYear(item.year)} · достоверность {item.reliability}%</small></div>)}</article>
      <article className="command-card alerts-card"><span className="eyebrow">ОБСТАНОВКА</span><p>{localFaction?.disposition === 'friendly' ? 'Местная власть дружественна. Гражданские контакты не атакуют без причины.' : localFaction?.disposition === 'hostile' ? 'Фракция враждебна. Стыковка запрещена, перехват вероятен.' : 'Контакты оценивают корабль. Ошибка перевода может изменить отношение.'}</p>{store.ship.cargo.some((item) => item.illegal) && <p className="warning-text">В трюме запрещённый груз. В законных портах возможен досмотр.</p>}</article>
    </section>
  </main></div>;
}

function GalaxyScreen() {
  const store = useGameStore();
  const [notice, setNotice] = useState('');
  const [combat, setCombat] = useState(false);
  if (!store.galaxy || !store.ship || !store.currentSystemId) return null;
  const current = store.galaxy.systems.find((system) => system.id === store.currentSystemId);
  const selected = store.galaxy.systems.find((system) => system.id === store.selectedSystemId) ?? current;
  if (!current || !selected) return null;
  const jumpDistance = Math.hypot(selected.coordinates.x - current.coordinates.x, selected.coordinates.y - current.coordinates.y);
  const canTravel = selected.id !== current.id && current.neighbors.includes(selected.id) && jumpDistance <= store.ship.jumpRange;
  const faction = store.factions.find((entry) => entry.id === selected.factionId);
  return <div className="game-shell"><AppChrome/><main className="map-screen galaxy-screen-separated"><section className="galaxy-map-full"><GalaxyCanvas systems={store.galaxy.systems} currentSystemId={current.id} selectedSystemId={selected.id} jumpRange={store.ship.jumpRange} onSelect={store.selectSystem}/>{notice && <button className="notice" onClick={() => setNotice('')}>{notice}</button>}</section><aside className="galaxy-route-panel"><span className="eyebrow">МЕЖЗВЁЗДНАЯ НАВИГАЦИЯ</span><h1>{selected.name}</h1><p>{selected.region} · угроза {selected.danger}</p>{faction && <div className={`faction-strip disposition-${faction.disposition}`}><b>{faction.name}</b><span>{faction.disposition} · репутация {faction.reputation}</span></div>}<div className="stat-row"><span>Дистанция</span><b>{Math.round(jumpDistance)}</b></div><div className="stat-row"><span>Хабы</span><b>{store.hubs.filter((hub) => hub.systemId === selected.id).length}</b></div><div className="stat-row"><span>Цивилизации</span><b>{selected.civilizationIds.length}</b></div>{selected.id === current.id ? <button className="primary-button" onClick={() => store.setScreen('system')}>Открыть карту системы</button> : <button className="primary-button" disabled={!canTravel || Boolean(store.busyAction)} onClick={async () => { const result = await store.travelTo(selected.id); setNotice(result.message); if (result.encounter === 'shipCombat') setCombat(true); }}>Прыжок · {Math.max(7, Math.ceil(jumpDistance / 14))} топлива</button>}{!current.neighbors.includes(selected.id) && selected.id !== current.id && <p className="warning-text">Нет прямого маршрута.</p>}</aside>{combat && <ShipCombatModal playerHull={store.ship.hull} onDamage={store.damageShip} onVictory={async () => { await store.earnCredits(620, 'Победа в корабельном бою'); setCombat(false); }} onEscape={() => setCombat(false)} onDefeat={() => setCombat(false)}/>}</main></div>;
}

function artifactForPoint(point: PointOfInterest, artifacts: Artifact[]) {
  return artifacts.find((entry) => entry.civilizationId === point.civilizationId && !entry.discovered) ?? artifacts.find((entry) => !entry.discovered);
}

function SystemScreen() {
  const store = useGameStore();
  const [planetId, setPlanetId] = useState<string | null>(null);
  const [point, setPoint] = useState<PointOfInterest | null>(null);
  const [notice, setNotice] = useState('');
  if (!store.galaxy || !store.currentSystemId) return null;
  const system = store.galaxy.systems.find((entry) => entry.id === store.currentSystemId);
  if (!system) return null;
  const planet = system.planets.find((entry) => entry.id === planetId) ?? null;
  const planetPoints = planet ? store.pointsOfInterest.filter((entry) => entry.planetId === planet.id) : [];
  const report = planet ? store.scanReports.find((entry) => entry.planetId === planet.id) : undefined;
  const localHubs = store.hubs.filter((hub) => hub.systemId === system.id);
  const systemCivilizations = store.galaxy.civilizations.filter((civilization) => system.civilizationIds.includes(civilization.id) || system.planets.some((entry) => entry.civilizationId === civilization.id));
  return <div className="game-shell"><AppChrome/><main className="map-screen system-screen-separated"><section className="system-map-shell"><header><div><span className="eyebrow">ЛОКАЛЬНАЯ НАВИГАЦИЯ</span><h1>{system.name}</h1><p>{system.starClass} · {system.planets.length} планет · {localHubs.length} гражданских узлов</p></div><button className="primary-button" disabled={Boolean(store.busyAction)} onClick={() => void store.scanSystem(system.id)}>{system.scanned ? 'Обновить системный скан' : 'Системный скан'}</button></header><SystemMap system={system} selectedPlanetId={planetId} pointsOfInterest={store.pointsOfInterest.filter((entry) => entry.systemId === system.id)} onSelectPlanet={(entry) => setPlanetId(entry.id)}/><section className="system-subsection"><h3>Разумные сигналы</h3>{systemCivilizations.length ? systemCivilizations.map((civilization) => { const contact = store.civilizationContacts.find((entry) => entry.civilizationId === civilization.id); return <article className="contact-row" key={civilization.id}><div><b>{civilization.name}</b><small>{civilization.status} · {contact ? contactStageLabel(contact.stage) : 'нет данных'} · язык {contact?.languageLevel ?? 0}/5</small></div>{civilization.status !== 'dead' && <button disabled={Boolean(store.busyAction)} onClick={async () => setNotice((await store.attemptFirstContact(civilization.id)).message)}>Связь</button>}</article>; }) : <p className="empty-state">Разумные сигналы не подтверждены.</p>}</section><section className="system-subsection"><h3>Хабы и поселения</h3>{localHubs.length ? localHubs.map((hub) => <article className="contact-row" key={hub.id}><div><span className="eyebrow">{hub.kind} · {hub.safety}</span><b>{hub.name}</b><small>{hub.description}</small></div><button onClick={async () => setNotice((await store.dockAtHub(hub.id)).message)}>Стыковка</button></article>) : <p className="empty-state">Гражданских узлов не обнаружено.</p>}</section></section><aside className="system-object-panel">{notice && <p className="notice-inline">{notice}</p>}{planet ? <><div className={`planet-orb planet-${planet.type}`}><span/></div><h2>{planet.scanLevel ? planet.name : 'НЕИЗВЕСТНЫЙ ОБЪЕКТ'}</h2><p>{planet.type} · пригодность {planet.habitability}% · угроза {planet.danger}</p><button disabled={!system.scanned || Boolean(store.busyAction)} onClick={async () => setNotice((await store.detailedScanPlanet(planet.id)).message)}>Детальный скан</button>{report && <article className="scan-report"><span>ДОСТОВЕРНОСТЬ {Math.round(report.confidence)}%</span><p>{report.summary}</p></article>}<div className="poi-list">{planetPoints.length ? planetPoints.map((entry) => { const state = store.locationStates.find((location) => location.pointOfInterestId === entry.id); return <article className={`poi-card poi-${entry.status}`} key={entry.id}><div><span className="eyebrow">{entry.type} · {entry.danger} · {entry.status}</span><h3>{entry.name}</h3><p>{entry.publicSummary}</p>{state && <small>Визитов: {state.visitCount} · врагов осталось: {state.enemyStates.filter((enemy) => enemy.health > 0).length} · данные забраны: {state.collectedEvidenceKeys.length}</small>}</div>{planet.type !== 'gas' && <button onClick={() => setPoint(entry)}>Высадка</button>}</article>; }) : <p className="empty-state">Точки интереса не определены.</p>}</div></> : <p>Выберите планету на карте.</p>}</aside>{point && planet && <ExpeditionModal seed={store.galaxy.seed} planet={planet} point={point} artifact={artifactForPoint(point, store.galaxy.artifacts)} crew={store.crew} locationState={store.locationStates.find((entry) => entry.pointOfInterestId === point.id)} onClose={() => setPoint(null)} onComplete={async (result) => { await store.completeExpedition(result); }}/>}</main></div>;
}

function HubScreen() {
  const store = useGameStore();
  const hub = store.hubs.find((entry) => entry.id === store.currentHubId);
  const [message, setMessage] = useState('');
  if (!hub) return <div className="game-shell"><AppChrome/><main className="scroll-screen hub-screen"><p>Корабль не пристыкован.</p><button onClick={() => store.setScreen('system')}>Вернуться в систему</button></main></div>;
  const faction = store.factions.find((entry) => entry.id === hub.factionId);
  const civilization = store.galaxy?.civilizations.find((entry) => entry.id === hub.civilizationId);
  const market = generateMarket(hub, store.gameYear);
  const hubContracts = store.contracts.filter((contract) => contract.issuerHubId === hub.id && contract.status === 'available');
  const npcs = store.localNpcs.filter((npc) => npc.hubId === hub.id && npc.alive && npc.present);
  const artifactCargo = store.ship?.cargo.filter((item) => item.artifactId) ?? [];
  return <div className="game-shell"><AppChrome/><main className="scroll-screen hub-screen"><header><div><span className="eyebrow">{hub.kind.toUpperCase()} · НАСЕЛЕНИЕ {hub.population.toLocaleString('ru-RU')}</span><h1>{hub.name}</h1><p>{hub.description}</p></div><button onClick={() => void store.leaveHub()}>Отстыковаться</button></header>{message && <p className="notice-inline">{message}</p>}<section className="hub-grid">
    <article><h2>Власть и культура</h2><h3>{faction?.name}</h3><p>Отношение: <b>{faction?.disposition}</b> · репутация {faction?.reputation}</p>{civilization && <button onClick={() => store.setScreen('civilizations')}>Досье: {civilization.name}</button>}<div className="tags">{faction?.laws.map((law) => <span key={law}>{law}</span>)}</div><h3>Местные обычаи</h3>{hub.localCustoms?.map((custom) => <p key={custom}>{custom}</p>)}</article>
    <article><h2>Районы</h2>{hub.districts?.map((district) => <div className="district-row" key={district.id}><div><b>{district.name}</b><small>{district.function} · {district.safety}</small></div><p>{district.description}</p></div>)}</article>
    <article className="hub-market"><h2>Рынок</h2>{market.map((good) => <div className="market-row" key={good.id}><div><b>{good.name}</b><small>{good.category}{good.illegal ? ' · ЗАПРЕЩЕНО' : ''}</small></div><span>₡{good.price}</span><button onClick={async () => setMessage((await store.buyMarketGood(hub.id, good)).message)}>Купить</button></div>)}</article>
    <article><h2>Местные люди</h2>{npcs.map((npc) => <div className={`npc-card disposition-${npc.disposition}`} key={npc.id}><div><b>{npc.name}</b><small>{npcRoleLabel(npc)} · доверие {npc.trust}</small></div><p>{npc.species} · {npc.culture}</p><p><b>Хочет:</b> {npc.agenda}</p><div className="npc-actions"><button onClick={() => void store.interactWithNpc(npc.id, 'deal')}>Сделка</button><button onClick={() => void store.interactWithNpc(npc.id, 'help')}>Помочь · ₡80</button><button className="danger-button" onClick={() => void store.interactWithNpc(npc.id, 'threat')}>Угрожать</button></div></div>)}</article>
    <article><h2>Доска заданий</h2>{hubContracts.slice(0, 5).map((contract) => <div className="contract-mini" key={contract.id}><b>{contract.title}</b><p>{contract.description}</p><button onClick={async () => setMessage((await store.acceptContract(contract.id)).message)}>Принять · ₡{contract.reward}</button></div>)}<button onClick={() => void store.refreshContracts()}>Обновить доску</button></article>
    <article><h2>Артефакты и наследие</h2>{artifactCargo.length === 0 ? <p>В трюме нет артефактов.</p> : artifactCargo.map((item) => { const artifact = store.galaxy?.artifacts.find((entry) => entry.id === item.artifactId); const sameCivilization = artifact?.civilizationId === hub.civilizationId; return <div className="artifact-offer" key={item.id}><b>{item.name}</b><small>Базовая оценка ₡{item.value}</small><div><button onClick={() => void store.sellArtifactToHub(item.id, hub.id, 'market')}>Рынок</button>{['university','religious','government'].includes(faction?.kind ?? '') && <button onClick={() => void store.sellArtifactToHub(item.id, hub.id, 'museum')}>Музей</button>}{sameCivilization && <button className="primary-button" onClick={() => void store.sellArtifactToHub(item.id, hub.id, 'heirs')}>Наследники</button>}{hub.services.includes('blackMarket') && <button className="danger-button" onClick={() => void store.sellArtifactToHub(item.id, hub.id, 'blackMarket')}>Чёрный рынок</button>}</div></div>; })}</article>
    <article><h2>Продать обычный груз</h2>{store.ship?.cargo.filter((item) => !item.contractId && !item.artifactId).map((item) => <div className="market-row" key={item.id}><div><b>{item.name}</b><small>{item.illegal ? 'контрабанда' : 'товар'}</small></div><button onClick={() => void store.sellCommodity(item.id, hub.id)}>Продать</button></div>)}</article>
  </section></main></div>;
}

function ContractsScreen() {
  const store = useGameStore();
  const [filter, setFilter] = useState<'all' | 'available' | 'active'>('all');
  const visible = store.contracts.filter((contract) => filter === 'all' || contract.status === filter);
  return <div className="game-shell"><AppChrome/><main className="scroll-screen contracts-screen"><header><div><span className="eyebrow">РАБОТА И ОБЯЗАТЕЛЬСТВА</span><h1>Контракты</h1></div><div className="tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Все</button><button className={filter === 'available' ? 'active' : ''} onClick={() => setFilter('available')}>Доступные</button><button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>Активные</button></div></header><section className="contract-grid">{visible.map((contract) => <article className={`contract-card status-${contract.status}`} key={contract.id}><span className="eyebrow">{contract.type} · {contractStatusLabel(contract)}</span><h2>{contract.title}</h2><p>{contract.description}</p><div className="stat-row"><span>Награда</span><b>₡{contract.reward}</b></div><div className="stat-row"><span>Срок</span><b>{contract.deadlineYear}</b></div><div className="stat-row"><span>Прогресс</span><b>{contract.progress}/{contract.requiredProgress}</b></div>{contract.illegal && <p className="warning-text">Незаконный контракт. Возможны досмотр и конфискация.</p>}{contract.status === 'available' && <button className="primary-button" onClick={() => void store.acceptContract(contract.id)}>Принять · аванс ₡{contract.advance}</button>}</article>)}</section></main></div>;
}

function FactionsScreen() {
  const store = useGameStore();
  return <div className="game-shell"><AppChrome/><main className="scroll-screen factions-screen"><header><div><span className="eyebrow">ПОЛИТИЧЕСКАЯ КАРТА</span><h1>Фракции</h1><p>Они запоминают сделки, угрозы, контракты и передачу наследия.</p></div></header><section className="faction-grid">{store.factions.map((faction) => <article className={`faction-card disposition-${faction.disposition}`} key={faction.id}><span className="eyebrow">{faction.kind} · {faction.disposition}</span><h2>{faction.name}</h2><div className="stat-row"><span>Репутация</span><b>{faction.reputation}</b></div><div className="stat-row"><span>Военная сила</span><b>{faction.military}</b></div><div className="stat-row"><span>Исследования</span><b>{faction.research}</b></div><div className="tags">{faction.laws.map((law) => <span key={law}>{law}</span>)}</div><h3>Память</h3>{faction.memories.slice(0, 4).map((memory) => <p key={memory.id}>{memory.text} <b>{memory.impact > 0 ? '+' : ''}{memory.impact}</b></p>)}</article>)}</section></main></div>;
}

function CivilizationsScreen() {
  const store = useGameStore();
  const civilizations = store.galaxy?.civilizations ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(civilizations[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const visible = civilizations.filter((civilization) => `${civilization.name} ${civilization.speciesName}`.toLowerCase().includes(query.toLowerCase()));
  const selected = civilizations.find((civilization) => civilization.id === selectedId) ?? visible[0];
  const contact = selected ? store.civilizationContacts.find((entry) => entry.civilizationId === selected.id) : undefined;
  const chains = selected ? store.archaeologyChains.filter((chain) => chain.civilizationId === selected.id) : [];
  const currentSystem = store.galaxy?.systems.find((system) => system.id === store.currentSystemId);
  const contactAvailable = selected && selected.status !== 'dead' && Boolean(currentSystem?.civilizationIds.includes(selected.id) || currentSystem?.planets.some((planet) => planet.civilizationId === selected.id));
  return <div className="game-shell"><AppChrome/><main className="civilizations-screen"><aside className="civilization-index"><header><span className="eyebrow">КСЕНОЛОГИЧЕСКИЙ АРХИВ</span><h1>Цивилизации</h1><input placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)}/></header><div>{visible.map((civilization) => <button key={civilization.id} className={selected?.id === civilization.id ? 'active' : ''} onClick={() => setSelectedId(civilization.id)}><b>{civilization.name}</b><span>{civilization.status} · tech {civilization.techLevel}</span></button>)}</div></aside><section className="civilization-detail">{selected ? <CivilizationDetail civilization={selected} contact={contact} chains={chains} contactAvailable={Boolean(contactAvailable)} onContact={() => void store.attemptFirstContact(selected.id)}/> : <p>Нет данных.</p>}</section></main></div>;
}

function CivilizationDetail({ civilization, contact, chains, contactAvailable, onContact }: { civilization: Civilization; contact?: ReturnType<typeof useGameStore.getState>['civilizationContacts'][number]; chains: ReturnType<typeof useGameStore.getState>['archaeologyChains']; contactAvailable: boolean; onContact(): void }) {
  return <>
    <header className="civilization-hero"><div><span className="eyebrow">{civilization.status.toUpperCase()} · TECH {civilization.techLevel}</span><h1>{civilization.name}</h1><p>{civilization.speciesName} · {civilization.ideology}</p></div>{civilization.status !== 'dead' && <div className="contact-panel"><b>{contact ? contactStageLabel(contact.stage) : 'нет канала'}</b><span>язык {contact?.languageLevel ?? 0}/5 · доверие {contact?.trust ?? 0}</span><button className="primary-button" disabled={!contactAvailable} onClick={onContact}>Попытка контакта</button></div>}</header>
    <section className="civilization-grid">
      <article><h2>Биология вида</h2><p><b>Тело:</b> {civilization.speciesProfile?.bodyPlan}</p><p><b>Обмен:</b> {civilization.speciesProfile?.metabolism}</p><p><b>Размножение:</b> {civilization.speciesProfile?.reproduction}</p><p><b>Срок жизни:</b> {civilization.speciesProfile?.lifespan} лет</p><p><b>Адаптация:</b> {civilization.speciesProfile?.homeAdaptation}</p><p><b>Особенность:</b> {civilization.speciesProfile?.unusualTrait}</p></article>
      <article><h2>Происхождение</h2><p>{civilization.originMystery}</p>{civilization.extinctionCause && <p className="warning-text"><b>Версия гибели:</b> {civilization.extinctionCause}</p>}<h3>Отношение к чужакам</h3><p>{civilization.outsiderPolicy}</p><div className="tags">{civilization.socialClasses?.map((entry) => <span key={entry}>{entry}</span>)}</div></article>
      <article className="wide"><h2>Культуры</h2><div className="inner-grid">{civilization.cultures?.map((culture) => <div className="culture-card" key={culture.id}><h3>{culture.name}</h3><p><b>Ценности:</b> {culture.values.join(', ')}</p><p><b>Табу:</b> {culture.taboos.join(', ')}</p><p><b>Искусство:</b> {culture.artForms.join(', ')}</p></div>)}</div></article>
      <article><h2>Языки</h2>{civilization.languages?.map((language) => <div className="compact-row" key={language.id}><div><b>{language.name}</b><small>{language.script}</small></div><span>{language.complexity}/10</span></div>)}</article>
      <article><h2>Религии</h2>{civilization.religions?.map((religion) => <div className="religion-card" key={religion.id}><h3>{religion.name}</h3><p>{religion.doctrine}</p><small>Святыни: {religion.sacredObjects.join(', ')}</small></div>)}</article>
      <article className="wide"><h2>Государства</h2><div className="inner-grid">{civilization.states?.map((state) => <div className="state-card" key={state.id}><span className="eyebrow">{state.status}</span><h3>{state.name}</h3><p>{state.government}</p><small>{state.outsiderPolicy}</small></div>)}</div></article>
      {chains.length > 0 && <article className="wide"><h2>Археологические цепочки</h2>{chains.map((chain) => <div className={`arch-chain status-${chain.status}`} key={chain.id}><h3>{chain.title}</h3><p>{chain.summary}</p><div>{chain.stages.map((stage, index) => <div className={`arch-stage stage-${stage.status}`} key={stage.id}><b>{index + 1}. {stage.title}</b><span>{stage.summary}</span><small>{stage.status}{stage.targetPointOfInterestId ? ' · цель найдена' : ''}</small></div>)}</div></div>)}</article>}
    </section>
  </>;
}

function CrewScreen() {
  const store = useGameStore();
  return <div className="game-shell"><AppChrome/><main className="scroll-screen crew-screen"><header><div><span className="eyebrow">ЛЮДИ КОРАБЛЯ</span><h1>Экипаж</h1><p>Полноценные напарники редки. Максимум активного состава — четыре.</p></div><div><button disabled={Boolean(store.busyAction)} onClick={() => void store.refreshCrewCandidates()}>Найти кандидатов · ₡40</button><button disabled={Boolean(store.busyAction) || store.crew.length === 0} onClick={() => void store.settlePayroll()}>Выплатить жалование</button></div></header><section className="crew-columns"><div><h2>На борту · {store.crew.length}/4</h2><div className="crew-grid">{store.crew.length ? store.crew.map((member) => <article className="crew-card" key={member.id}><span className={`crew-status status-${member.status}`}>{member.status}</span><div className="crew-avatar">{member.name.slice(0, 1)}</div><h3>{member.name}</h3><p>{member.species} · {member.culture}</p><b>{roleLabel(member.primaryRole)}{member.secondaryRole ? ` / ${roleLabel(member.secondaryRole)}` : ''}</b><div className="stat-row"><span>Здоровье</span><b>{member.health}</b></div><div className="stat-row"><span>Мораль</span><b>{member.morale}</b></div><div className="stat-row"><span>Верность</span><b>{member.loyalty}</b></div><div className="tags">{member.traits.map((trait) => <span key={trait}>{trait}</span>)}</div><small>Зарплата: ₡{member.salary} · доля {member.sharePercent}%</small><button className="danger-button" onClick={() => void store.dismissCrew(member.id)}>Расторгнуть контракт</button></article>) : <p className="empty-state">Ты пока один. Кандидатов проще искать в хабах.</p>}</div></div><div><h2>Кандидаты</h2><div className="crew-grid">{store.crewCandidates.length ? store.crewCandidates.map((candidate) => <article className="crew-card candidate" key={candidate.id}><div className="crew-avatar">{candidate.name.slice(0, 1)}</div><h3>{candidate.name}</h3><p>{candidate.species} · {candidate.culture}</p><b>{roleLabel(candidate.primaryRole)} · уровень {candidate.level}</b><div className="tags">{candidate.traits.map((trait) => <span key={trait}>{trait}</span>)}</div><div className="stat-row"><span>Подписание</span><b>₡{candidate.signingCost}</b></div><button className="primary-button" disabled={store.crew.length >= 4 || (store.captain?.credits ?? 0) < candidate.signingCost} onClick={() => void store.hireCrew(candidate.id)}>Нанять</button></article>) : <p className="empty-state">Список пуст.</p>}</div></div></section></main></div>;
}

function ArchiveScreen() {
  const store = useGameStore();
  const [tab, setTab] = useState<'discoveries' | 'evidence' | 'hypotheses' | 'chains' | 'locations' | 'history'>('discoveries');
  const [query, setQuery] = useState('');
  if (!store.galaxy) return null;
  const normalized = query.toLowerCase();
  return <div className="game-shell"><AppChrome/><main className="scroll-screen archive-screen"><header><div><span className="eyebrow">ИССЛЕДОВАТЕЛЬСКИЙ АРХИВ</span><h1>Архив экспедиции</h1></div><input placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)}/></header><nav className="tabs sticky-tabs">{(['discoveries','evidence','hypotheses','chains','locations','history'] as const).map((id) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{id}</button>)}</nav><section className="archive-grid">
    {tab === 'discoveries' && store.discoveries.filter((entry) => `${entry.name} ${entry.description}`.toLowerCase().includes(normalized)).map((entry) => <article key={entry.id}><span>{entry.kind} · {entry.confidence}%</span><h3>{entry.name}</h3><p>{entry.description}</p></article>)}
    {tab === 'evidence' && store.evidence.filter((entry) => `${entry.title} ${entry.description}`.toLowerCase().includes(normalized)).map((entry) => <article key={entry.id}><span>{entry.kind} · {entry.reliability}%</span><h3>{entry.title}</h3><p>{entry.description}</p><small>{store.pointsOfInterest.find((point) => point.id === entry.pointOfInterestId)?.name}</small></article>)}
    {tab === 'hypotheses' && store.hypotheses.map((entry) => <article key={entry.id}><span>{entry.status} · {entry.confidence}% · {hypothesisDispositionLabel(entry)}</span><h3>{entry.title}</h3><p>{entry.summary}</p>{!entry.disposition && <div className="archive-actions"><button onClick={() => void store.resolveHypothesis(entry.id, 'published')}>Опубликовать</button><button onClick={() => void store.resolveHypothesis(entry.id, 'sold')}>Продать данные</button><button onClick={() => void store.resolveHypothesis(entry.id, 'suppressed')}>Скрыть</button></div>}</article>)}
    {tab === 'chains' && store.archaeologyChains.map((chain) => <article key={chain.id}><span>{chain.status}</span><h3>{chain.title}</h3><p>{chain.summary}</p>{chain.stages.map((stage) => <small key={stage.id}>{stage.status}: {stage.title}</small>)}</article>)}
    {tab === 'locations' && store.locationStates.map((state) => <article key={state.pointOfInterestId}><span>визитов {state.visitCount} · {state.lastOutcome}</span><h3>{store.pointsOfInterest.find((point) => point.id === state.pointOfInterestId)?.name ?? state.pointOfInterestId}</h3><p>Врагов осталось: {state.enemyStates.filter((enemy) => enemy.health > 0).length}. Объектов использовано: {state.resolvedObjectIds.length}. Данных забрано: {state.collectedEvidenceKeys.length}.</p></article>)}
    {tab === 'history' && store.galaxy.history.slice(-160).reverse().map((entry) => <article key={entry.id}><span>{formatYear(entry.year)}</span><h3>{entry.title}</h3><p>{entry.summary}</p></article>)}
  </section><aside className="archive-summary"><b>Последние записи</b>{store.logs.slice(0, 5).map((entry) => <p key={entry.id}>{entry.title}</p>)}</aside></main></div>;
}

function ShipScreen() {
  const store = useGameStore();
  if (!store.ship || !store.captain) return null;
  const snapshot = store.getSnapshot();
  return <div className="game-shell"><AppChrome/><main className="scroll-screen ship-screen"><section className="ship-hero"><span className="eyebrow">ЛИЧНЫЙ КОРАБЛЬ</span><h1>{store.ship.name}</h1><div className="ship-silhouette"><div className="ship-core"/><div className="ship-wing left"/><div className="ship-wing right"/></div><div className="ship-actions"><button onClick={() => void store.repairShip()}>Ремонт</button><button onClick={() => void store.refuelShip()}>Заправка</button>{snapshot && <button onClick={() => exportSnapshot(snapshot)}>Экспорт</button>}<button onClick={() => void store.createBackup()}>Backup ({store.backupCount})</button><button className="danger-button" onClick={() => void store.clearGame()}>Удалить ironman</button></div></section><section className="ship-data"><article><h2>Состояние</h2><div className="meter"><span>Корпус</span><strong>{store.ship.hull}</strong><i style={{ width: `${store.ship.hull}%` }}/></div><div className="meter"><span>Топливо</span><strong>{store.ship.fuel}</strong><i style={{ width: `${store.ship.fuel}%` }}/></div></article><article><h2>Модули</h2>{store.ship.modules.map((module) => <div className="module-row" key={module.id}><span>{module.slot}</span><div><b>{module.name}</b><p>{module.effect}</p></div></div>)}</article><article><h2>Капитан</h2><p>{store.captain.name} · уровень {store.captain.level}</p><p>Здоровье {store.captain.health}/{store.captain.maxHealth}</p></article><article><h2>Груз и анализ</h2>{store.ship.cargo.length === 0 ? <p>Трюм пуст.</p> : store.ship.cargo.map((item) => { const knowledge = item.artifactId ? store.artifactKnowledge.find((entry) => entry.artifactId === item.artifactId) : undefined; return <div className="module-row cargo-analysis" key={item.id}><div><b>{item.name}</b><p>{item.illegal ? 'ЗАПРЕЩЁННЫЙ ГРУЗ · ' : ''}оценка ₡{item.value} · знания {knowledge?.level ?? 0}/4</p>{item.artifactId && <button disabled={(knowledge?.level ?? 0) >= 4} onClick={() => void store.analyzeArtifact(item.artifactId!)}>Анализ ₡120</button>}{!item.contractId && !item.commodityId && !item.artifactId && <button onClick={() => void store.sellCargo(item.id)}>Продать ₡{Math.round(item.value * .72)}</button>}</div></div>; })}</article></section></main></div>;
}

function SettingsScreen() {
  const store = useGameStore();
  const [updating, setUpdating] = useState(false);
  const snapshot = store.getSnapshot();
  const update = async () => {
    setUpdating(true);
    try { await forceApplicationUpdate(); }
    catch (error) { setUpdating(false); alert(error instanceof Error ? error.message : 'Ошибка обновления'); }
  };
  return <div className="game-shell">{store.galaxy && <AppChrome/>}<main className="scroll-screen settings-screen"><header><div><span className="eyebrow">СИСТЕМА</span><h1>Настройки</h1></div>{!store.galaxy && <button onClick={() => store.setScreen('menu')}>Назад</button>}</header><section className="settings-cards"><article><h2>Версия</h2><div className="version-hero">v{APP_VERSION}</div><p>{APP_CODENAME}</p><div className="stat-row"><span>Схема сейва</span><b>v{SAVE_SCHEMA_VERSION}</b></div><div className="stat-row"><span>Сборка</span><b>{BUILD_TIME === 'development' ? 'development' : new Date(BUILD_TIME).toLocaleString('ru-RU')}</b></div></article><article><h2>Обновление PWA</h2><button className="primary-button" disabled={updating} onClick={() => void update()}>{updating ? 'Обновление…' : 'Принудительно обновить игру'}</button><small>IndexedDB и ironman не удаляются.</small></article><article><h2>Ironman</h2>{snapshot && <button onClick={() => exportSnapshot(snapshot)}>Экспортировать</button>}<button onClick={() => void store.createBackup()}>Создать backup</button></article></section></main></div>;
}

const BootScreen = () => <main className="boot-screen"><div className="boot-mark">◆</div><span className="eyebrow">VOID CHRONICLES · v{APP_VERSION}</span><p>Проверка локального архива…</p></main>;

export default function App() {
  const screen = useGameStore((state) => state.screen);
  const galaxy = useGameStore((state) => state.galaxy);
  const hydration = useGameStore((state) => state.hydrationStatus);
  const hydrate = useGameStore((state) => state.hydrateFromStorage);
  useEffect(() => { void hydrate(); }, [hydrate]);
  if (hydration === 'idle' || hydration === 'loading') return <BootScreen/>;
  if (screen === 'settings') return <SettingsScreen/>;
  if (!galaxy || screen === 'menu') return <MainMenu/>;
  if (screen === 'command') return <CommandDeckScreen/>;
  if (screen === 'galaxy') return <GalaxyScreen/>;
  if (screen === 'system') return <SystemScreen/>;
  if (screen === 'hub') return <HubScreen/>;
  if (screen === 'contracts') return <ContractsScreen/>;
  if (screen === 'factions') return <FactionsScreen/>;
  if (screen === 'civilizations') return <CivilizationsScreen/>;
  if (screen === 'crew') return <CrewScreen/>;
  if (screen === 'archive') return <ArchiveScreen/>;
  return <ShipScreen/>;
}
