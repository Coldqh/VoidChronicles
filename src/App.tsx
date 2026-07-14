import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { GalaxyCanvas, type GalaxyCanvasHandle } from './components/GalaxyCanvas';
import { ExpeditionModal } from './components/ExpeditionModal';
import { ShipCombatModal } from './components/ShipCombatModal';
import { TutorialOverlay } from './components/TutorialOverlay';
import { SystemMap } from './components/SystemMap';
import { roleLabel } from './crew/generateCrew';
import { normalizeGalaxySettings, type GenerationProgress } from './generation/generateGalaxy';
import { generateGalaxyInWorker } from './generation/generateInWorker';
import type {
  Artifact,
  Civilization,
  Contract,
  GalaxySettings,
  Hypothesis,
  LocalNpc,
  Planet,
  PointOfInterest,
  StoryScene
} from './game/types';
import { useGameStore, type MainScreen } from './game/store';
import { exportSnapshot, readSnapshotFile } from './persistence/db';
import { forceApplicationUpdate } from './runtime/update';
import { APP_CODENAME, APP_VERSION, BUILD_TIME, SAVE_SCHEMA_VERSION } from './version';
import { contactStageLabel } from './world/civilizations';
import { generateMarket } from './world/livingGalaxy';
import { useCompactLayout } from './hooks/useCompactLayout';
const LaboratoryScreen = lazy(() => import('./screens/LaboratoryScreen').then((module) => ({ default: module.LaboratoryScreen })));
const WorldScreen = lazy(() => import('./screens/WorldScreen').then((module) => ({ default: module.WorldScreen })));
const OperationsScreen = lazy(() => import('./screens/OperationsScreen').then((module) => ({ default: module.OperationsScreen })));
import { ChronicleScreen, ContinuityScreen } from './screens/LegacyScreen';
import './styles/app.css';
import './styles/adaptive.css';

const defaultSettings: GalaxySettings = {
  seed: 'VOID-CHRONICLES-005',
  systemCount: 300,
  historyYears: 2_000_000,
  civilizationCount: 12,
  lifeFrequency: 0.34,
  anomalyFrequency: 0.035,
  difficulty: 'standard',
  tutorialEnabled: true
};

const formatYear = (year: number) => year < 0 ? `${Math.abs(year).toLocaleString('ru-RU')} лет до старта` : `Год ${year}`;
const BRAND_MARK = `${import.meta.env.BASE_URL}brand/void-chronicles-mark.webp`;
const VersionBadge = () => <span className="version-badge">v{APP_VERSION}</span>;
const contractStatusLabel = (contract: Contract) => contract.status === 'available' ? 'доступен' : contract.status === 'active' ? 'активен' : contract.status === 'completed' ? 'выполнен' : contract.status === 'expired' ? 'просрочен' : 'провален';
const npcRoleLabel = (npc: LocalNpc) => ({ administrator: 'управляющий', merchant: 'торговец', scientist: 'учёный', doctor: 'врач', fixer: 'посредник', priest: 'религиозный деятель', guard: 'охранник', resident: 'местный житель' }[npc.role]);
const hypothesisDispositionLabel = (hypothesis: Hypothesis) => hypothesis.disposition === 'published' ? 'опубликована' : hypothesis.disposition === 'sold' ? 'продана' : hypothesis.disposition === 'suppressed' ? 'скрыта' : 'не решено';

function MainMenu() {
  const store = useGameStore();
  const [settings, setSettings] = useState<GalaxySettings>(() => {
    try {
      const raw = localStorage.getItem('void-chronicles:new-campaign-preset');
      if (raw) {
        localStorage.removeItem('void-chronicles:new-campaign-preset');
        return { ...defaultSettings, ...JSON.parse(raw) as GalaxySettings, seed: `${JSON.parse(raw).seed}-RESTART-${Date.now().toString(36).toUpperCase()}` };
      }
    } catch { /* use defaults */ }
    return defaultSettings;
  });
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const create = async () => {
    if (store.generationActive || store.busyAction) return;
    store.setGenerationActive(true);
    setProgress({ stage: 'start', progress: 0.01, message: 'Инициализация генератора' });
    try {
      const normalized = normalizeGalaxySettings(settings);
      setSettings(normalized);
      const galaxy = await generateGalaxyInWorker(normalized, setProgress);
      if (galaxy.systems.length !== normalized.systemCount) throw new Error(`Генератор вернул ${galaxy.systems.length} систем вместо ${normalized.systemCount}`);
      await store.startGame(galaxy);
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
          <label className="tutorial-choice"><span><b>Обучение нового капитана</b><small>Современное вводное сопровождение на первом запуске.</small></span><input type="checkbox" checked={settings.tutorialEnabled !== false} onChange={(event) => setSettings({ ...settings, tutorialEnabled: event.target.checked })}/><i/></label>
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
    { id: 'encounters', label: 'Сцены', icon: '◌' },
    { id: 'galaxy', label: 'Галактика', icon: '✦' },
    { id: 'system', label: 'Система', icon: '◉' },
    { id: 'operations', label: 'Операции', icon: '⚔' },
    { id: 'chronicle', label: 'Хроника', icon: '◫' }
  ] },
  { title: 'МИР', items: [
    { id: 'world', label: 'Живой мир', icon: '◎' },
    { id: 'civilizations', label: 'Цивилизации', icon: '⌬' },
    { id: 'factions', label: 'Фракции', icon: '⚑' },
    { id: 'contracts', label: 'Контракты', icon: '▤' },
    { id: 'archive', label: 'Архив', icon: '▣' }
  ] },
  { title: 'КОРАБЛЬ', items: [
    { id: 'laboratory', label: 'Лаборатория', icon: '◈' },
    { id: 'crew', label: 'Экипаж', icon: '♟' },
    { id: 'ship', label: 'Корабль', icon: '▲' },
    { id: 'settings', label: 'Настройки', icon: '⚙' }
  ] }
];

function AppChrome() {
  const store = useGameStore();
  const compact = useCompactLayout();
  const [open, setOpen] = useState(false);
  const current = store.galaxy?.systems.find((system) => system.id === store.currentSystemId);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('drawer-open', open);
    return () => document.documentElement.classList.remove('drawer-open');
  }, [open]);

  if (!store.captain || !store.ship) return null;
  const navigate = (screen: MainScreen) => { store.setScreen(screen); setOpen(false); };
  const knownContacts = store.civilizationContacts.some((entry) => entry.stage !== 'unknown');
  const visitedHubIds = new Set(store.hubs.filter((hub) => hub.visited).map((hub) => hub.id));
  const unlocked = new Set<MainScreen>(['command', 'galaxy', 'system', 'operations', 'ship', 'settings']);
  if (store.legacy.captains.length > 1 || store.legacy.chronicle.length > 1 || store.legacy.mode === 'chronicle') unlocked.add('chronicle');
  if (store.storyScenes.length || store.pendingConsequences.length) unlocked.add('encounters');
  if (store.worldThreads.some((entry) => entry.playerInvolved) || store.news.some((entry) => entry.systemIds.some((id) => store.galaxy?.systems.find((system) => system.id === id)?.visited))) unlocked.add('world');
  if (knownContacts || store.archaeologyChains.some((entry) => entry.stages.some((stage) => stage.status !== 'locked'))) unlocked.add('civilizations');
  if (store.factions.some((faction) => store.hubs.some((hub) => hub.factionId === faction.id && visitedHubIds.has(hub.id)))) unlocked.add('factions');
  if (store.contracts.some((entry) => entry.status === 'active') || visitedHubIds.size) unlocked.add('contracts');
  if (store.discoveries.length || store.evidence.length || store.locationStates.length) unlocked.add('archive');
  if (store.researchProjects.length || store.ship.cargo.some((entry) => entry.artifactId)) unlocked.add('laboratory');
  if (store.crew.length || store.crewCandidates.length || visitedHubIds.size) unlocked.add('crew');
  const visibleNavigationGroups = navigationGroups.map((group) => ({ ...group, items: group.items.filter((item) => unlocked.has(item.id)) })).filter((group) => group.items.length);
  const dockScreens = new Set<MainScreen>(['command', 'system', 'galaxy']);
  const extraItems = visibleNavigationGroups.flatMap((group) => group.items).filter((item) => !dockScreens.has(item.id));

  const hud = <header className="app-hud">
    <button className="drawer-toggle" aria-label="Открыть навигацию" onClick={() => setOpen((value) => !value)}><span/><span/><span/></button>
    <button className="hud-brand" onClick={() => navigate('command')}><img className="hud-brand-mark" src={BRAND_MARK} alt=""/><span className="hud-brand-copy"><b>VOID CHRONICLES</b><VersionBadge/></span></button>
    <div className="hud-location"><span>{current?.name ?? 'НЕИЗВЕСТНАЯ СИСТЕМА'}</span><small>{store.currentHubId ? store.hubs.find((hub) => hub.id === store.currentHubId)?.name : 'КОРАБЛЬ В КОСМОСЕ'}</small></div>
    <div className="hud-stats"><span className={`save-state save-${store.saveStatus}`}>{store.saveStatus === 'saving' || store.saveStatus === 'pending' ? 'СОХРАНЕНИЕ…' : store.saveStatus === 'error' ? 'ОШИБКА СЕЙВА' : 'СЕЙВ ЗАЩИЩЁН'}</span><span>₡{store.captain.credits}</span><span>⛽{store.ship.fuel}</span></div>
  </header>;

  if (compact) {
    return <>
      {hud}
      <nav className="mobile-dock" aria-label="Быстрая навигация">
        <button className={store.screen === 'command' ? 'active' : ''} onClick={() => navigate('command')} aria-label="Мостик"><i>⌂</i><span>Мостик</span></button>
        <button className={store.screen === 'system' ? 'active' : ''} onClick={() => navigate('system')} aria-label="Система"><i>◎</i><span>Система</span></button>
        <button className={store.screen === 'galaxy' ? 'active' : ''} onClick={() => navigate('galaxy')} aria-label="Галактика"><i>✦</i><span>Галактика</span></button>
        <button className={open ? 'active' : ''} onClick={() => setOpen((value) => !value)} aria-label="Открыть остальные разделы"><i>•••</i><span>Ещё</span></button>
      </nav>
      {open && <div className="mobile-more-layer">
        <button className="mobile-more-scrim" aria-label="Закрыть разделы" onClick={() => setOpen(false)}/>
        <section className="mobile-more-menu" role="dialog" aria-label="Разделы корабельной системы">
          <header><div><span>ДОСТУПНЫЕ РАЗДЕЛЫ</span><b>{extraItems.length}</b></div><button aria-label="Закрыть" onClick={() => setOpen(false)}>×</button></header>
          <nav>{extraItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav>
        </section>
      </div>}
    </>;
  }

  return <>
    {hud}
    <button className={`drawer-overlay ${open ? 'open' : ''}`} aria-label="Закрыть меню" onClick={() => setOpen(false)}/>
    <aside className={`nav-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header><div className="drawer-brand"><img src={BRAND_MARK} alt="Void Chronicles"/><div><span className="eyebrow">КОРАБЕЛЬНАЯ СИСТЕМА</span><h2>VOID CHRONICLES</h2><div className="drawer-version"><VersionBadge/><span>{APP_CODENAME}</span></div></div></div><button className="icon-button" onClick={() => setOpen(false)}>×</button></header>
      <nav className="drawer-nav">{visibleNavigationGroups.map((group) => <section key={group.title}><span>{group.title}</span>{group.items.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><i>{item.icon}</i><b>{item.label}</b></button>)}</section>)}</nav>
    </aside>
  </>;
}
function SceneCard({ scene, featured = false }: { scene: StoryScene; featured?: boolean }) {
  const store = useGameStore();
  const [message, setMessage] = useState('');
  const system = store.galaxy?.systems.find((entry) => entry.id === scene.systemId);
  return <article className={`scene-card scene-${scene.category} ${featured ? 'featured' : ''}`}>
    <div className="scene-scanline"/>
    <header><span>{scene.category.toUpperCase()} · {scene.source}</span><b>{system?.name ?? 'неизвестная система'}</b></header>
    <div className="scene-body"><h3>{scene.title}</h3><p className="scene-summary">{scene.summary}</p><p>{scene.body}</p></div>
    <div className="scene-choices">{scene.choices.map((choice) => <button key={choice.id} className={`choice-risk-${choice.risk}`} disabled={Boolean(store.busyAction)} onClick={async () => { const result = await store.resolveStoryScene(scene.id, choice.id); setMessage(result.message); }}><span>{choice.label}</span><small>{choice.summary}</small><i>{choice.risk}</i></button>)}</div>
    {message && <div className="scene-result">{message}</div>}
  </article>;
}

function EncountersScreen() {
  const store = useGameStore();
  const available = store.storyScenes.filter((scene) => scene.status === 'available').sort((a, b) => b.createdYear - a.createdYear);
  const history = store.storyScenes.filter((scene) => scene.status !== 'available').slice(0, 30);
  return <div className="game-shell"><AppChrome/><main className="scroll-screen encounter-screen">
    <header className="screen-hero cinematic-hero"><div><span className="eyebrow">СВЯЗЬ · ВЫБОР · ПОСЛЕДСТВИЯ</span><h1>Сцены экспедиции</h1><p>Каждый вызов существует в конкретном месте, у конкретных людей и имеет продолжение. Неотвеченные сцены могут исчезнуть.</p></div><div className="hero-counter"><b>{available.length}</b><span>требуют решения</span></div></header>
    <section className="scene-gallery">{available.length ? available.map((scene, index) => <SceneCard key={scene.id} scene={scene} featured={index === 0}/>) : <article className="empty-panel museum-empty"><b>Канал чист</b><p>Новые сцены появятся в перелётах, хабах, экспедициях и после отложенных последствий.</p></article>}</section>
    <section className="resolved-scenes"><div className="section-heading"><div><span className="eyebrow">ПАМЯТЬ РЕШЕНИЙ</span><h2>Закрытые сцены</h2></div></div><div>{history.map((scene) => <article key={scene.id}><span>{scene.status}</span><b>{scene.title}</b><p>{scene.choices.find((choice) => choice.id === scene.resolvedChoiceId)?.label ?? 'Сцена завершена без решения'}</p></article>)}</div></section>
  </main></div>;
}

function TutorialController() {
  const tutorial = useGameStore((state) => state.tutorial);
  const skip = useGameStore((state) => state.skipTutorial);
  return <TutorialOverlay tutorial={tutorial} onSkip={() => void skip()}/>;
}

function CommandDeckScreen() {
  const store = useGameStore();
  const compact = useCompactLayout();
  const galaxy = store.galaxy;
  const current = galaxy?.systems.find((system) => system.id === store.currentSystemId);
  if (!galaxy || !current || !store.ship || !store.captain) return null;

  const knownHubs = current.scanned ? store.hubs.filter((hub) => hub.systemId === current.id) : [];
  const activeScenes = store.storyScenes.filter((scene) => scene.status === 'available');
  const activeObjectives = store.objectives.filter((objective) => objective.status === 'active' && objective.kind !== 'tutorial');
  const currentPoints = store.pointsOfInterest.filter((entry) => entry.systemId === current.id && entry.status !== 'resolved');
  const tutorialActive = store.tutorial.active && !store.tutorial.completed;

  const primary = tutorialActive
    ? { title: 'Первый маршрут', text: 'Открой локальную карту и выполни первый системный скан.', label: 'Открыть систему', action: () => store.setScreen('system'), tutorial: true }
    : !current.scanned
      ? { title: 'Система не изучена', text: 'Сканирование откроет планеты, сигналы и маршруты.', label: 'Начать сканирование', action: () => store.setScreen('system'), tutorial: false }
      : activeScenes[0]
        ? { title: activeScenes[0].title, text: activeScenes[0].summary, label: 'Ответить', action: () => store.setScreen('encounters'), tutorial: false }
        : currentPoints[0]
          ? { title: currentPoints[0].name, text: currentPoints[0].publicSummary, label: 'Открыть сигнал', action: () => store.setScreen('system'), tutorial: false }
          : knownHubs[0]
            ? { title: knownHubs[0].name, text: 'Безопасная стыковка и местные услуги.', label: 'Стыковка', action: () => void store.dockAtHub(knownHubs[0]!.id), tutorial: false }
            : { title: 'Следующий маршрут', text: 'Выбери известную соседнюю систему.', label: 'Открыть галактику', action: () => store.setScreen('galaxy'), tutorial: false };

  if (compact) {
    return <div className="game-shell"><AppChrome/><main className="mobile-dashboard">
      <header className="mobile-dashboard-status">
        <div><span className="eyebrow">МОСТИК</span><h1>{current.name}</h1></div>
        <div className="mobile-vitals"><span>КОРПУС <b>{store.ship.hull}%</b></span><span>ТОПЛИВО <b>{store.ship.fuel}%</b></span><span>₡ <b>{store.captain.credits}</b></span></div>
      </header>
      <section className="mobile-primary-action">
        <span className="eyebrow">СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</span><h2>{primary.title}</h2><p>{primary.text}</p>
        <button data-tutorial={primary.tutorial ? 'open-system' : undefined} className="primary-button" onClick={primary.action}>{primary.label}</button>
      </section>
      <nav className="mobile-action-grid" aria-label="Быстрые действия">
        <button onClick={() => store.setScreen('system')}><i>◎</i><b>Система</b></button>
        <button onClick={() => store.setScreen('galaxy')}><i>✦</i><b>Галактика</b></button>
        <button onClick={() => store.setScreen('ship')}><i>▲</i><b>Корабль</b></button>
        <button onClick={() => store.setScreen(activeScenes.length ? 'encounters' : 'operations')}><i>⚠</i><b>{activeScenes.length ? 'Сцены' : 'Угрозы'}</b></button>
      </nav>
      {activeObjectives[0] && <button className="mobile-objective-strip" onClick={() => activeObjectives[0].systemId && store.selectSystem(activeObjectives[0].systemId)}><span>АКТИВНАЯ ЦЕЛЬ</span><b>{activeObjectives[0].title}</b></button>}
    </main></div>;
  }

  return <div className="game-shell"><AppChrome/><main className="scroll-screen command-deck command-deck-clean">
    <section className="command-focus">
      <div className="command-focus-copy"><span className="eyebrow">КОМАНДНЫЙ МОСТИК · {current.scanned ? current.region.toUpperCase() : 'ДАННЫХ НЕТ'}</span><h1>{current.name}</h1><p>{current.scanned ? 'Навигационные данные подтверждены. Выбери одно следующее действие.' : 'Ты только прибыл. Карта, архив и сведения о местных силах пусты, пока их не подтвердит корабль.'}</p></div>
      <div className="command-vitals"><span>КОРПУС <b>{store.ship.hull}%</b></span><span>ТОПЛИВО <b>{store.ship.fuel}%</b></span><span>КРЕДИТЫ <b>₡{store.captain.credits}</b></span></div>
    </section>
    <section className="next-action-card"><span className="eyebrow">СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</span><h2>{primary.title}</h2><p>{primary.text}</p><button data-tutorial={primary.tutorial ? 'open-system' : undefined} className="primary-button large" onClick={primary.action}>{primary.label}</button></section>
    <section className="command-quick-grid"><button onClick={() => store.setScreen('system')}><span>ЛОКАЛЬНО</span><b>Карта системы</b><small>{current.scanned ? `${current.planets.length} орбит определено` : 'требуется скан'}</small></button><button onClick={() => store.setScreen('galaxy')}><span>МАРШРУТ</span><b>Галактика</b><small>{galaxy.systems.filter((entry) => entry.known).length} систем известно</small></button><button onClick={() => store.setScreen('ship')}><span>КОРАБЛЬ</span><b>{store.ship.name}</b><small>{store.ship.statuses.length ? store.ship.statuses.join(', ') : 'системы в норме'}</small></button><button onClick={() => store.setScreen('operations')}><span>УГРОЗЫ</span><b>Операции</b><small>{store.pursuits.filter((entry) => entry.status === 'active').length} ориентировок · {store.warFronts.filter((entry) => entry.status === 'active').length} фронтов</small></button></section>
    {(activeObjectives.length > 0 || store.logs.length > 0) && <details className="command-more"><summary>Журнал и долгие задачи</summary><div className="command-more-grid"><article><h3>Активные цели</h3>{activeObjectives.length ? activeObjectives.slice(0,4).map((entry) => <button key={entry.id} onClick={() => entry.systemId && store.selectSystem(entry.systemId)}><b>{entry.title}</b><small>{entry.description}</small></button>) : <p>Нет подтверждённых целей.</p>}</article><article><h3>Последние записи</h3>{store.logs.slice(0,5).map((entry) => <p key={entry.id}><b>{entry.title}</b><span>{entry.text}</span></p>)}</article></div></details>}
  </main></div>;
}

function GalaxyScreen() {
  const store = useGameStore();
  const compact = useCompactLayout();
  const mapRef = useRef<GalaxyCanvasHandle | null>(null);
  const [notice, setNotice] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!store.galaxy || !store.ship || !store.currentSystemId) return null;
  const current = store.galaxy.systems.find((system) => system.id === store.currentSystemId);
  const selected = store.galaxy.systems.find((system) => system.id === store.selectedSystemId) ?? current;
  if (!current || !selected) return null;
  const jumpDistance = Math.hypot(selected.coordinates.x - current.coordinates.x, selected.coordinates.y - current.coordinates.y);
  const canTravel = selected.id !== current.id && current.neighbors.includes(selected.id) && jumpDistance <= store.ship.jumpRange;
  const faction = selected.visited || selected.scanned ? store.factions.find((entry) => entry.id === selected.factionId) : undefined;
  const selectSystem = (id: string) => { store.selectSystem(id); setSheetOpen(true); };
  const travel = async () => { const result = await store.travelTo(selected.id); setNotice(result.message); };

  if (compact) {
    const knownCount = store.galaxy.systems.filter((entry) => entry.known).length;
    return <div className="game-shell"><AppChrome/><main className="mobile-map-screen galaxy-mobile-map">
      <section className="mobile-map-canvas"><GalaxyCanvas ref={mapRef} systems={store.galaxy.systems} currentSystemId={current.id} selectedSystemId={selected.id} jumpRange={store.ship.jumpRange} onSelect={selectSystem}/></section>
      <div className="mobile-map-status">КАТАЛОГ <b>{knownCount}</b> / {store.galaxy.systems.length}</div>
      <div className="mobile-map-controls"><button aria-label="Локальный сектор" onClick={() => mapRef.current?.center()}>◎</button><button aria-label="Обзор галактики" onClick={() => mapRef.current?.overview()}>▦</button><button aria-label="Уменьшить масштаб" onClick={() => mapRef.current?.zoomOut()}>−</button><button aria-label="Увеличить масштаб" onClick={() => mapRef.current?.zoomIn()}>+</button></div>
      {notice && <button className="mobile-toast" onClick={() => setNotice('')}>{notice}</button>}
      {sheetOpen && <><button className="mobile-window-scrim" aria-label="Закрыть окно маршрута" onClick={() => setSheetOpen(false)}/><aside className="mobile-map-window" role="dialog" aria-label={`Маршрут: ${selected.name}`}>
        <header className="mobile-window-header"><div><span>{selected.id === current.id ? 'ТЕКУЩАЯ СИСТЕМА' : 'ВЫБРАННЫЙ МАРШРУТ'}</span><h2>{selected.name}</h2></div><button aria-label="Закрыть" onClick={() => setSheetOpen(false)}>×</button></header>
        <div className="mobile-window-body"><div className="compact-stat"><span>Дистанция</span><b>{Math.round(jumpDistance)}</b></div><p>{selected.visited || selected.scanned ? `${selected.region} · угроза ${selected.danger}` : 'Неизученный навигационный узел'}</p>{faction && <small>{faction.name} · {faction.disposition}</small>}</div>
        {selected.id === current.id ? <button className="primary-button mobile-window-cta" onClick={() => store.setScreen('system')}>Открыть систему</button> : <button className="primary-button mobile-window-cta" disabled={!canTravel || Boolean(store.busyAction)} onClick={() => void travel()}>Прыжок · {Math.max(7, Math.ceil(jumpDistance / 14))} топлива</button>}
      </aside></>}
    </main></div>;
  }

  return <div className="game-shell"><AppChrome/><main className="map-screen galaxy-screen-separated"><section className="galaxy-map-full"><GalaxyCanvas ref={mapRef} systems={store.galaxy.systems} currentSystemId={current.id} selectedSystemId={selected.id} jumpRange={store.ship.jumpRange} onSelect={store.selectSystem}/>{notice && <button className="notice" onClick={() => setNotice('')}>{notice}</button>}</section><aside className="galaxy-route-panel"><span className="eyebrow">МЕЖЗВЁЗДНАЯ НАВИГАЦИЯ</span><h1>{selected.name}</h1><p>{selected.visited || selected.scanned ? `${selected.region} · угроза ${selected.danger}` : 'Неизученный навигационный узел'}</p>{faction && <div className={`faction-strip disposition-${faction.disposition}`}><b>{faction.name}</b><span>{faction.disposition} · репутация {faction.reputation}</span></div>}<div className="stat-row"><span>Дистанция</span><b>{Math.round(jumpDistance)}</b></div><div className="stat-row"><span>Хабы</span><b>{selected.visited || selected.scanned ? store.hubs.filter((hub) => hub.systemId === selected.id && hub.visited).length : '?'}</b></div><div className="stat-row"><span>Разумные сигналы</span><b>{selected.scanned ? selected.civilizationIds.length : '?'}</b></div>{selected.id === current.id ? <button className="primary-button" onClick={() => store.setScreen('system')}>Открыть карту системы</button> : <button className="primary-button" disabled={!canTravel || Boolean(store.busyAction)} onClick={() => void travel()}>Прыжок · {Math.max(7, Math.ceil(jumpDistance / 14))} топлива</button>}{!current.neighbors.includes(selected.id) && selected.id !== current.id && <p className="warning-text">Нет прямого маршрута.</p>}</aside></main></div>;
}

function artifactForPoint(point: PointOfInterest, artifacts: Artifact[]) {
  return artifacts.find((entry) => entry.civilizationId === point.civilizationId && !entry.discovered) ?? artifacts.find((entry) => !entry.discovered);
}

function SystemScreen() {
  const store = useGameStore();
  const compact = useCompactLayout();
  const [planetId, setPlanetId] = useState<string | null>(null);
  const [point, setPoint] = useState<PointOfInterest | null>(null);
  const [notice, setNotice] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!store.galaxy || !store.currentSystemId) return null;
  const system = store.galaxy.systems.find((entry) => entry.id === store.currentSystemId);
  if (!system) return null;
  const planet = system.planets.find((entry) => entry.id === planetId) ?? null;
  const planetPoints = planet?.scanLevel && planet.scanLevel >= 2 ? store.pointsOfInterest.filter((entry) => entry.planetId === planet.id) : [];
  const report = planet ? store.scanReports.find((entry) => entry.planetId === planet.id) : undefined;
  const localHubs = system.scanned ? store.hubs.filter((hub) => hub.systemId === system.id) : [];
  const systemCivilizations = system.scanned ? store.galaxy.civilizations.filter((civilization) => {
    const contact = store.civilizationContacts.find((entry) => entry.civilizationId === civilization.id);
    return contact && contact.stage !== 'unknown' && (system.civilizationIds.includes(civilization.id) || system.planets.some((entry) => entry.civilizationId === civilization.id));
  }) : [];

  const selectPlanet = (entry: Planet) => {
    setPlanetId(entry.id);
    setSheetOpen(true);
    if (entry.id === store.tutorial.targetPlanetId) void store.advanceTutorial(2);
  };
  const scanPlanet = async () => { if (!planet) return; setNotice((await store.detailedScanPlanet(planet.id)).message); setSheetOpen(true); };

  const expedition = point && planet ? <ExpeditionModal seed={store.galaxy.seed} planet={planet} point={point} artifact={artifactForPoint(point, store.galaxy.artifacts)} crew={store.crew} personalEquipment={store.equipmentInventory} locationState={store.locationStates.find((entry) => entry.pointOfInterestId === point.id)} onClose={() => setPoint(null)} onTutorialAction={(action) => { if (action === 'launch-expedition') void store.advanceTutorial(5); else if (action === 'collect-data') void store.advanceTutorial(6); else void store.advanceTutorial(7); }} onComplete={async (result) => { await store.completeExpedition(result); }}/> : null;

  if (compact) {
    return <div className="game-shell"><AppChrome/><main className="mobile-map-screen system-mobile-map">
      <header className="mobile-system-bar"><div><span>ЛОКАЛЬНАЯ СИСТЕМА</span><b>{system.name}</b></div><button data-tutorial="system-scan" className="primary-button" disabled={Boolean(store.busyAction)} onClick={() => void store.scanSystem(system.id)}>{system.scanned ? 'Скан' : 'Сканировать'}</button></header>
      <section className="mobile-system-canvas"><SystemMap system={system} selectedPlanetId={planetId} pointsOfInterest={system.scanned ? store.pointsOfInterest.filter((entry) => entry.systemId === system.id) : []} tutorialPlanetId={store.tutorial.targetPlanetId} onSelectPlanet={selectPlanet}/></section>
      {notice && <button className="mobile-toast" onClick={() => setNotice('')}>{notice}</button>}
      {sheetOpen && planet && <><button className="mobile-window-scrim" aria-label="Закрыть окно планеты" onClick={() => setSheetOpen(false)}/><aside className="mobile-map-window system-object-window" role="dialog" aria-label={`Объект: ${planet.name}`}>
        <header className="mobile-window-header"><div><span>{planet.scanLevel ? planet.type.toUpperCase() : 'НЕИЗВЕСТНЫЙ ОБЪЕКТ'}</span><h2>{planet.scanLevel ? planet.name : 'Орбитальная цель'}</h2></div><div className="mobile-window-tools"><span className={`mini-planet planet-${planet.type}`}/><button aria-label="Закрыть" onClick={() => setSheetOpen(false)}>×</button></div></header>
        <div className="mobile-window-body"><p>{planet.scanLevel ? `Угроза: ${planet.danger}` : 'Характеристики не подтверждены.'}</p>{report && <small>{report.summary}</small>}{planetPoints.length > 0 && <div className="mobile-poi-list">{planetPoints.map((entry) => { const state = store.locationStates.find((location) => location.pointOfInterestId === entry.id); return <button data-tutorial={entry.id === store.tutorial.targetPointOfInterestId ? 'open-expedition' : undefined} key={entry.id} onClick={() => { setPoint(entry); if (entry.id === store.tutorial.targetPointOfInterestId) void store.advanceTutorial(4); }} disabled={planet.type === 'gas' || store.captain?.commandIdentity === 'shipAI'}><b>{entry.name}</b><span>{entry.type} · угроз осталось {state?.enemyStates.filter((enemy) => enemy.health > 0).length ?? '?'}</span></button>; })}</div>}{system.scanned && (localHubs.length > 0 || systemCivilizations.length > 0) && <details className="mobile-window-details"><summary>Связь и поселения · {localHubs.length + systemCivilizations.length}</summary>{localHubs.map((hub) => <button key={hub.id} onClick={() => void store.dockAtHub(hub.id)}>{hub.name}</button>)}</details>}</div>
        <button data-tutorial={planet.id === store.tutorial.targetPlanetId ? 'detail-scan' : undefined} className="primary-button mobile-window-cta" disabled={!system.scanned || Boolean(store.busyAction)} onClick={() => void scanPlanet()}>{planet.scanLevel && planet.scanLevel >= 2 ? 'Обновить данные' : 'Детальный скан'}</button>
      </aside></>}
      {expedition}
    </main></div>;
  }

  return <div className="game-shell"><AppChrome/><main className="map-screen system-screen-separated system-screen-clean">
    <section className="system-map-shell"><header><div><span className="eyebrow">ЛОКАЛЬНАЯ НАВИГАЦИЯ</span><h1>{system.name}</h1><p>{system.scanned ? `${system.starClass} · ${system.planets.length} орбит · ${localHubs.length} гражданских узлов` : 'Орбиты, поселения и сигналы пока неизвестны.'}</p></div><button data-tutorial="system-scan" className="primary-button" disabled={Boolean(store.busyAction)} onClick={() => void store.scanSystem(system.id)}>{system.scanned ? 'Обновить скан' : 'Системный скан'}</button></header>
      <SystemMap system={system} selectedPlanetId={planetId} pointsOfInterest={system.scanned ? store.pointsOfInterest.filter((entry) => entry.systemId === system.id) : []} tutorialPlanetId={store.tutorial.targetPlanetId} onSelectPlanet={selectPlanet}/>
      {system.scanned && <details className="system-contacts"><summary>Связь и поселения · {systemCivilizations.length + localHubs.length}</summary><section className="system-subsection">{systemCivilizations.map((civilization) => { const contact = store.civilizationContacts.find((entry) => entry.civilizationId === civilization.id); return <article className="contact-row" key={civilization.id}><div><b>{civilization.name}</b><small>{contactStageLabel(contact?.stage ?? 'unknown')} · язык {contact?.languageLevel ?? 0}/5</small></div><button onClick={async () => setNotice((await store.attemptFirstContact(civilization.id)).message)}>Связь</button></article>; })}{localHubs.map((hub) => <article className="contact-row" key={hub.id}><div><b>{hub.name}</b><small>{hub.kind} · {hub.safety}</small></div><button onClick={async () => setNotice((await store.dockAtHub(hub.id)).message)}>Стыковка</button></article>)}</section></details>}
    </section>
    <aside className="system-object-panel">{notice && <p className="notice-inline">{notice}</p>}{planet ? <><div className={`planet-orb planet-${planet.type}`}><span/></div><h2>{planet.scanLevel ? planet.name : 'НЕИЗВЕСТНЫЙ ОБЪЕКТ'}</h2><p>{planet.scanLevel ? `${planet.type} · угроза ${planet.danger}` : 'Нет подтверждённых характеристик.'}</p><button data-tutorial={planet.id === store.tutorial.targetPlanetId ? 'detail-scan' : undefined} disabled={!system.scanned || Boolean(store.busyAction)} onClick={() => void scanPlanet()}>Детальный скан</button>{report && <article className="scan-report"><span>ДОСТОВЕРНОСТЬ {Math.round(report.confidence)}%</span><p>{report.summary}</p></article>}<div className="poi-list">{planetPoints.length ? planetPoints.map((entry) => { const state = store.locationStates.find((location) => location.pointOfInterestId === entry.id); return <article className={`poi-card poi-${entry.status}`} key={entry.id}><div><span className="eyebrow">{entry.type} · {entry.danger}</span><h3>{entry.name}</h3><p>{entry.publicSummary}</p>{state && <small>Визитов {state.visitCount} · угроз осталось {state.enemyStates.filter((enemy) => enemy.health > 0).length} · объектов забрано {state.resolvedObjectIds.length}</small>}</div>{planet.type !== 'gas' && store.captain?.commandIdentity !== 'shipAI' && <button data-tutorial={entry.id === store.tutorial.targetPointOfInterestId ? 'open-expedition' : undefined} onClick={() => { setPoint(entry); if (entry.id === store.tutorial.targetPointOfInterestId) void store.advanceTutorial(4); }}>Высадка</button>}</article>; }) : <p className="empty-state">{planet.scanLevel && planet.scanLevel >= 2 ? 'Значимых сигналов нет.' : 'Нужен детальный скан.'}</p>}</div></> : <div className="empty-selection"><b>Выбери орбитальный объект</b><p>До сканирования он останется без имени и характеристик.</p></div>}</aside>
    {expedition}
  </main></div>;
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
  const knownFactionIds = new Set(store.hubs.filter((hub) => hub.visited || hub.id === store.currentHubId).map((hub) => hub.factionId));
  store.contracts.filter((entry) => entry.status !== 'available').forEach((entry) => knownFactionIds.add(entry.issuerFactionId));
  const visible = store.factions.filter((entry) => knownFactionIds.has(entry.id));
  return <div className="game-shell"><AppChrome/><main className="scroll-screen factions-screen"><header><div><span className="eyebrow">ПОЛИТИЧЕСКАЯ КАРТА</span><h1>Известные фракции</h1><p>Досье появляется после реального контакта, стыковки или контракта.</p></div></header><section className="faction-grid">{visible.length ? visible.map((faction) => <article className={`faction-card disposition-${faction.disposition}`} key={faction.id}><span className="eyebrow">{faction.kind} · {faction.disposition}</span><h2>{faction.name}</h2><div className="stat-row"><span>Репутация</span><b>{faction.reputation}</b></div><div className="tags">{faction.laws.map((law) => <span key={law}>{law}</span>)}</div>{faction.memories.length > 0 && <details><summary>Память отношений</summary>{faction.memories.slice(0,4).map((memory) => <p key={memory.id}>{memory.text}</p>)}</details>}</article>) : <article className="empty-panel"><b>Контактов нет</b><p>Посети хаб, прими контракт или установи связь с местной властью.</p></article>}</section></main></div>;
}

function CivilizationsScreen() {
  const store = useGameStore();
  const compact = useCompactLayout();
  const allCivilizations = store.galaxy?.civilizations ?? [];
  const knownCivilizationIds = new Set(store.civilizationContacts.filter((entry) => entry.stage !== 'unknown').map((entry) => entry.civilizationId));
  store.archaeologyChains.filter((chain) => chain.stages.some((stage) => stage.status !== 'locked')).forEach((chain) => knownCivilizationIds.add(chain.civilizationId));
  const civilizations = allCivilizations.filter((entry) => knownCivilizationIds.has(entry.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const visible = civilizations.filter((civilization) => `${civilization.name} ${civilization.speciesName}`.toLowerCase().includes(query.toLowerCase()));
  const selected = civilizations.find((civilization) => civilization.id === selectedId) ?? (!compact ? visible[0] : undefined);
  const contact = selected ? store.civilizationContacts.find((entry) => entry.civilizationId === selected.id) : undefined;
  const chains = selected ? store.archaeologyChains.filter((chain) => chain.civilizationId === selected.id) : [];
  const currentSystem = store.galaxy?.systems.find((system) => system.id === store.currentSystemId);
  const contactAvailable = selected && selected.status !== 'dead' && Boolean(currentSystem?.civilizationIds.includes(selected.id) || currentSystem?.planets.some((planet) => planet.civilizationId === selected.id));

  if (compact) {
    return <div className="game-shell"><AppChrome/><main className="mobile-data-screen civilizations-mobile">
      {selected ? <MobileCivilizationDetail civilization={selected} contact={contact} chains={chains} contactAvailable={Boolean(contactAvailable)} onBack={() => setSelectedId(null)} onContact={() => void store.attemptFirstContact(selected.id)}/> : <>
        <header className="mobile-screen-header"><div><span className="eyebrow">КСЕНОЛОГИЧЕСКИЙ АРХИВ</span><h1>Цивилизации</h1></div><b>{civilizations.length}</b></header>
        <input className="mobile-search" placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)}/>
        <section className="mobile-list">{visible.length ? visible.map((civilization) => <button className="mobile-list-row" key={civilization.id} onClick={() => setSelectedId(civilization.id)}><span>{civilization.status} · tech {civilization.techLevel}</span><b>{civilization.name}</b><small>{civilization.speciesName} · {civilization.ideology}</small></button>) : <div className="mobile-empty"><b>Данных нет</b><p>Нужен контакт или археологическая улика.</p></div>}</section>
      </>}
    </main></div>;
  }

  return <div className="game-shell"><AppChrome/><main className="civilizations-screen"><aside className="civilization-index"><header><span className="eyebrow">КСЕНОЛОГИЧЕСКИЙ АРХИВ</span><h1>Цивилизации</h1><input placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)}/></header><div>{visible.map((civilization) => <button key={civilization.id} className={selected?.id === civilization.id ? 'active' : ''} onClick={() => setSelectedId(civilization.id)}><b>{civilization.name}</b><span>{civilization.status} · tech {civilization.techLevel}</span></button>)}</div></aside><section className="civilization-detail">{selected ? <CivilizationDetail civilization={selected} contact={contact} chains={chains} contactAvailable={Boolean(contactAvailable)} onContact={() => void store.attemptFirstContact(selected.id)}/> : <p>Нет данных.</p>}</section></main></div>;
}

function MobileCivilizationDetail({ civilization, contact, chains, contactAvailable, onBack, onContact }: { civilization: Civilization; contact?: ReturnType<typeof useGameStore.getState>['civilizationContacts'][number]; chains: ReturnType<typeof useGameStore.getState>['archaeologyChains']; contactAvailable: boolean; onBack(): void; onContact(): void }) {
  const store = useGameStore();
  const liveThread = store.worldThreads.find((thread) => thread.civilizationIds.includes(civilization.id));
  const hubs = store.hubs.filter((hub) => hub.civilizationId === civilization.id);
  const factions = store.factions.filter((faction) => faction.civilizationId === civilization.id);
  return <section className="mobile-detail-view civilization-mobile-detail">
    <button className="mobile-back" onClick={onBack}>← Все цивилизации</button>
    <span className="eyebrow">{civilization.status.toUpperCase()} · TECH {civilization.techLevel}</span><h2>{civilization.name}</h2><p className="mobile-lead">{civilization.speciesName} · {civilization.ideology}</p>
    {civilization.status !== 'dead' && <article className="mobile-action-card"><b>{contact ? contactStageLabel(contact.stage) : 'Нет канала связи'}</b><p>Язык {contact?.languageLevel ?? 0}/5 · доверие {contact?.trust ?? 0}</p><button className="primary-button" disabled={!contactAvailable} onClick={onContact}>Попытка контакта</button></article>}
    {liveThread && <button className="mobile-link-card" onClick={() => store.setScreen('world')}><span>СЕЙЧАС</span><b>{liveThread.title}</b><small>{liveThread.summary}</small></button>}
    <div className="mobile-inline-stats"><span>Поселения <b>{hubs.length}</b></span><span>Фракции <b>{factions.length}</b></span><span>Цепочки <b>{chains.length}</b></span></div>
    <details className="mobile-collapsible"><summary>Биология вида</summary><p><b>Тело:</b> {civilization.speciesProfile?.bodyPlan}</p><p><b>Обмен:</b> {civilization.speciesProfile?.metabolism}</p><p><b>Срок жизни:</b> {civilization.speciesProfile?.lifespan} лет</p><p>{civilization.speciesProfile?.unusualTrait}</p></details>
    <details className="mobile-collapsible"><summary>Происхождение и отношение</summary><p>{civilization.originMystery}</p><p>{civilization.outsiderPolicy}</p>{civilization.extinctionCause && <p className="warning-text">{civilization.extinctionCause}</p>}</details>
    <details className="mobile-collapsible"><summary>Культуры · {civilization.cultures?.length ?? 0}</summary>{civilization.cultures?.map((culture) => <article key={culture.id}><b>{culture.name}</b><p>{culture.values.join(', ')}</p><small>Табу: {culture.taboos.join(', ')}</small></article>)}</details>
    <details className="mobile-collapsible"><summary>Государства · {civilization.states?.length ?? 0}</summary>{civilization.states?.map((state) => <article key={state.id}><b>{state.name}</b><p>{state.government}</p><small>{state.status}</small></article>)}</details>
    {chains.length > 0 && <details className="mobile-collapsible"><summary>Археология · {chains.length}</summary>{chains.map((chain) => <article key={chain.id}><b>{chain.title}</b><p>{chain.summary}</p><small>{chain.status}</small></article>)}</details>}
  </section>;
}

function CivilizationDetail({ civilization, contact, chains, contactAvailable, onContact }: { civilization: Civilization; contact?: ReturnType<typeof useGameStore.getState>['civilizationContacts'][number]; chains: ReturnType<typeof useGameStore.getState>['archaeologyChains']; contactAvailable: boolean; onContact(): void }) {
  const store = useGameStore();
  const liveThreads = store.worldThreads.filter((thread) => thread.civilizationIds.includes(civilization.id));
  const civilizationFactions = store.factions.filter((faction) => faction.civilizationId === civilization.id);
  const civilizationHubs = store.hubs.filter((hub) => hub.civilizationId === civilization.id);
  const recentHistory = store.galaxy?.history.filter((event) => event.civilizationIds.includes(civilization.id)).slice(-4).reverse() ?? [];
  return <>
    <header className="civilization-hero"><div><span className="eyebrow">{civilization.status.toUpperCase()} · TECH {civilization.techLevel}</span><h1>{civilization.name}</h1><p>{civilization.speciesName} · {civilization.ideology}</p></div>{civilization.status !== 'dead' && <div className="contact-panel"><b>{contact ? contactStageLabel(contact.stage) : 'нет канала'}</b><span>язык {contact?.languageLevel ?? 0}/5 · доверие {contact?.trust ?? 0}</span><button className="primary-button" disabled={!contactAvailable} onClick={onContact}>Попытка контакта</button></div>}</header>
    <section className="civilization-live-strip"><article><span className="eyebrow">СЕЙЧАС</span><h3>{liveThreads[0]?.title ?? 'Изменения не подтверждены'}</h3><p>{liveThreads[0]?.summary ?? 'Контактные сети не передают свежих сведений.'}</p>{liveThreads[0] && <button onClick={() => store.setScreen('world')}>Следить за событием</button>}</article><article><span className="eyebrow">ПРИСУТСТВИЕ В ГАЛАКТИКЕ</span><h3>{civilizationHubs.length} поселений · {civilizationFactions.length} фракций</h3><p>{civilizationHubs.slice(0,3).map((hub) => hub.name).join(', ') || 'Известных действующих хабов нет.'}</p></article><article><span className="eyebrow">ПОСЛЕДНИЙ ИЗВЕСТНЫЙ ПОВОРОТ</span><h3>{recentHistory[0]?.title ?? 'Архив молчит'}</h3><p>{recentHistory[0]?.summary ?? civilization.originMystery}</p></article></section>
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
  const compact = useCompactLayout();
  const [tab, setTab] = useState<'discoveries' | 'evidence' | 'hypotheses' | 'chains' | 'locations' | 'history'>('discoveries');
  const [query, setQuery] = useState('');
  if (!store.galaxy) return null;
  const normalized = query.toLowerCase();
  const tabs = ['discoveries','evidence','hypotheses','chains','locations','history'] as const;
  const labels: Record<typeof tabs[number], string> = { discoveries: 'Открытия', evidence: 'Улики', hypotheses: 'Гипотезы', chains: 'Цепочки', locations: 'Локации', history: 'История' };
  return <div className="game-shell"><AppChrome/><main className="scroll-screen archive-screen"><header><div><span className="eyebrow">ИССЛЕДОВАТЕЛЬСКИЙ АРХИВ</span><h1>Архив</h1></div><input placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)}/></header>{compact ? <label className="mobile-tab-select">Раздел<select value={tab} onChange={(event) => setTab(event.target.value as typeof tab)}>{tabs.map((id) => <option key={id} value={id}>{labels[id]}</option>)}</select></label> : <nav className="tabs sticky-tabs">{tabs.map((id) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{labels[id]}</button>)}</nav>}<section className="archive-grid">
    {tab === 'discoveries' && store.discoveries.filter((entry) => `${entry.name} ${entry.description}`.toLowerCase().includes(normalized)).map((entry) => <article key={entry.id}><span>{entry.kind} · {entry.confidence}%</span><h3>{entry.name}</h3><p>{entry.description}</p></article>)}
    {tab === 'evidence' && store.evidence.filter((entry) => `${entry.title} ${entry.description}`.toLowerCase().includes(normalized)).map((entry) => <article key={entry.id}><span>{entry.kind} · {entry.reliability}%</span><h3>{entry.title}</h3><p>{entry.description}</p><small>{store.pointsOfInterest.find((point) => point.id === entry.pointOfInterestId)?.name}</small></article>)}
    {tab === 'hypotheses' && store.hypotheses.map((entry) => <article key={entry.id}><span>{entry.status} · {entry.confidence}% · {hypothesisDispositionLabel(entry)}</span><h3>{entry.title}</h3><p>{entry.summary}</p>{!entry.disposition && <div className="archive-actions"><button onClick={() => void store.resolveHypothesis(entry.id, 'published')}>Опубликовать</button><button onClick={() => void store.resolveHypothesis(entry.id, 'sold')}>Продать</button><button onClick={() => void store.resolveHypothesis(entry.id, 'suppressed')}>Скрыть</button></div>}</article>)}
    {tab === 'chains' && store.archaeologyChains.map((chain) => <article key={chain.id}><span>{chain.status}</span><h3>{chain.title}</h3><p>{chain.summary}</p>{chain.stages.map((stage) => <small key={stage.id}>{stage.status}: {stage.title}</small>)}</article>)}
    {tab === 'locations' && store.locationStates.map((state) => <article key={state.pointOfInterestId}><span>визитов {state.visitCount} · {state.lastOutcome}</span><h3>{store.pointsOfInterest.find((point) => point.id === state.pointOfInterestId)?.name ?? state.pointOfInterestId}</h3><p>Врагов осталось: {state.enemyStates.filter((enemy) => enemy.health > 0).length}. Объектов использовано: {state.resolvedObjectIds.length}. Данных забрано: {state.collectedEvidenceKeys.length}.</p></article>)}
    {tab === 'history' && store.galaxy.history.filter((entry) => entry.systemIds.some((id) => store.galaxy?.systems.find((system) => system.id === id)?.visited) || entry.civilizationIds.some((id) => store.civilizationContacts.find((contact) => contact.civilizationId === id && contact.stage !== 'unknown'))).slice(-160).reverse().map((entry) => <article key={entry.id}><span>{formatYear(entry.year)}</span><h3>{entry.title}</h3><p>{entry.summary}</p></article>)}
  </section><aside className="archive-summary"><b>Последние записи</b>{store.logs.slice(0, 5).map((entry) => <p key={entry.id}>{entry.title}</p>)}</aside></main></div>;
}

function ShipScreen() {
  const store = useGameStore();
  const compact = useCompactLayout();
  const [mobileTab, setMobileTab] = useState<'status' | 'systems' | 'cargo' | 'actions'>('status');
  if (!store.ship || !store.captain) return null;
  const snapshot = store.getSnapshot();

  if (compact) {
    return <div className="game-shell"><AppChrome/><main className="mobile-data-screen ship-mobile">
      <header className="mobile-screen-header"><div><span className="eyebrow">ЛИЧНЫЙ КОРАБЛЬ</span><h1>{store.ship.name}</h1></div><b>{store.ship.hull}%</b></header>
      <nav className="mobile-segmented four"><button className={mobileTab === 'status' ? 'active' : ''} onClick={() => setMobileTab('status')}>Статус</button><button className={mobileTab === 'systems' ? 'active' : ''} onClick={() => setMobileTab('systems')}>Системы</button><button className={mobileTab === 'cargo' ? 'active' : ''} onClick={() => setMobileTab('cargo')}>Груз</button><button className={mobileTab === 'actions' ? 'active' : ''} onClick={() => setMobileTab('actions')}>Действия</button></nav>
      <section className="mobile-tab-content">
        {mobileTab === 'status' && <><article className="mobile-status-card"><div className="meter"><span>Корпус</span><strong>{store.ship.hull}%</strong><i style={{ width: `${store.ship.hull}%` }}/></div><div className="meter"><span>Топливо</span><strong>{store.ship.fuel}%</strong><i style={{ width: `${store.ship.fuel}%` }}/></div><div className="compact-stat"><span>Регистрация</span><b>{store.ship.registration}</b></div><div className="compact-stat"><span>Транспондер</span><b>{store.ship.transponder}</b></div></article><article className="mobile-status-card"><span className="eyebrow">КАПИТАН</span><h2>{store.captain.name}</h2><p>Уровень {store.captain.level} · здоровье {store.captain.health}/{store.captain.maxHealth}</p><small>{store.captain.condition} · {store.captain.commandIdentity}</small></article><article className="mobile-status-card"><span className="eyebrow">КОРАБЕЛЬНЫЙ ИИ</span><h2>{store.ship.aiCore.name}</h2><p>{store.ship.aiCore.personality}</p><div className="meter"><span>Целостность</span><strong>{store.ship.aiCore.integrity}%</strong><i style={{ width: `${store.ship.aiCore.integrity}%` }}/></div></article></>}
        {mobileTab === 'systems' && <section>{store.ship.systems.map((system) => <div className={`mobile-system-row ${system.disabled ? 'disabled' : ''}`} key={system.id}><div><b>{system.label}</b><small>{system.effect}</small></div><strong>{Math.round(system.integrity)}%</strong><i><em style={{ width: `${system.integrity}%` }}/></i></div>)}<details className="mobile-collapsible"><summary>Установленные модули · {store.ship.modules.length}</summary>{store.ship.modules.map((module) => <article key={module.id}><b>{module.name}</b><p>{module.effect}</p><small>{module.slot}</small></article>)}</details></section>}
        {mobileTab === 'cargo' && <section className="mobile-list">{store.ship.cargo.length === 0 ? <div className="mobile-empty"><b>Трюм пуст</b></div> : store.ship.cargo.map((item) => { const knowledge = item.artifactId ? store.artifactKnowledge.find((entry) => entry.artifactId === item.artifactId) : undefined; return <article className="mobile-cargo-row" key={item.id}><span>{item.illegal ? 'КОНТРАБАНДА' : item.artifactId ? 'АРТЕФАКТ' : 'ГРУЗ'}</span><b>{item.name}</b><small>₡{item.value}{item.artifactId ? ` · знания ${knowledge?.level ?? 0}/6` : ''}</small>{item.artifactId && <button onClick={() => store.setScreen('laboratory')}>Лаборатория</button>}{!item.contractId && !item.commodityId && !item.artifactId && <button onClick={() => void store.sellCargo(item.id)}>Продать</button>}</article>; })}</section>}
        {mobileTab === 'actions' && <section className="mobile-action-list"><button onClick={() => void store.repairShip()}>Ремонт корабля</button><button onClick={() => void store.refuelShip()}>Заправка</button><button onClick={() => store.setScreen('operations')}>Оперативная обстановка</button>{snapshot && <button onClick={() => exportSnapshot(snapshot)}>Экспорт сохранения</button>}<button onClick={() => void store.createBackup()}>Создать backup ({store.backupCount})</button><button onClick={() => { if (window.confirm('Прервать текущее командование и выбрать преемника?')) void store.voluntarilyTransferCommand(); }}>Передать командование</button><button className="danger-button" onClick={() => { if (window.confirm('Удалить ironman-сейв и все резервные копии?')) void store.clearGame(); }}>Удалить ironman</button></section>}
      </section>
    </main></div>;
  }

  return <div className="game-shell"><AppChrome/><main className="scroll-screen ship-screen"><section className="ship-hero"><span className="eyebrow">ЛИЧНЫЙ КОРАБЛЬ</span><h1>{store.ship.name}</h1><div className="ship-silhouette"><div className="ship-core"/><div className="ship-wing left"/><div className="ship-wing right"/></div><div className="ship-actions"><button onClick={() => void store.repairShip()}>Ремонт</button><button onClick={() => void store.refuelShip()}>Заправка</button>{snapshot && <button onClick={() => exportSnapshot(snapshot)}>Экспорт</button>}<button onClick={() => void store.createBackup()}>Backup ({store.backupCount})</button><button onClick={() => { if (window.confirm('Прервать текущее командование и выбрать преемника?')) void store.voluntarilyTransferCommand(); }}>Передать командование</button><button className="danger-button" onClick={() => { if (window.confirm('Удалить ironman-сейв и все резервные копии?')) void store.clearGame(); }}>Удалить ironman</button></div></section><section className="ship-data"><article><h2>Состояние</h2><div className="meter"><span>Корпус</span><strong>{store.ship.hull}</strong><i style={{ width: `${store.ship.hull}%` }}/></div><div className="meter"><span>Топливо</span><strong>{store.ship.fuel}</strong><i style={{ width: `${store.ship.fuel}%` }}/></div><div className="stat-row"><span>Регистрация</span><b>{store.ship.registration}</b></div><div className="stat-row"><span>Транспондер</span><b>{store.ship.transponder}</b></div><button onClick={() => store.setScreen('operations')}>Оперативная обстановка</button></article><article><h2>Корабельные системы</h2>{store.ship.systems.map((system) => <div className={`operation-system-row ${system.disabled ? 'disabled' : ''}`} key={system.id}><div><b>{system.label}</b><small>{system.effect}</small></div><strong>{Math.round(system.integrity)}%</strong><i><em style={{ width: `${system.integrity}%` }}/></i></div>)}</article><article><h2>Модули</h2>{store.ship.modules.map((module) => <div className="module-row" key={module.id}><span>{module.slot}</span><div><b>{module.name}</b><p>{module.effect}</p></div></div>)}</article><article><h2>Капитан</h2><p>{store.captain.name} · уровень {store.captain.level}</p><p>Здоровье {store.captain.health}/{store.captain.maxHealth}</p><p>Статус: {store.captain.condition} · {store.captain.commandIdentity}</p></article><article><h2>Корабельный ИИ</h2><p><b>{store.ship.aiCore.name}</b></p><p>{store.ship.aiCore.personality}</p><div className="meter"><span>Целостность</span><strong>{store.ship.aiCore.integrity}%</strong><i style={{ width: `${store.ship.aiCore.integrity}%` }}/></div><small>{store.ship.aiCore.directives.join(' · ')}</small></article><article><h2>Груз и анализ</h2>{store.ship.cargo.length === 0 ? <p>Трюм пуст.</p> : store.ship.cargo.map((item) => { const knowledge = item.artifactId ? store.artifactKnowledge.find((entry) => entry.artifactId === item.artifactId) : undefined; return <div className="module-row cargo-analysis" key={item.id}><div><b>{item.name}</b><p>{item.illegal ? 'ЗАПРЕЩЁННЫЙ ГРУЗ · ' : ''}оценка ₡{item.value} · знания {knowledge?.level ?? 0}/6</p>{item.artifactId && <button onClick={() => store.setScreen('laboratory')}>Открыть в лаборатории</button>}{!item.contractId && !item.commodityId && !item.artifactId && <button onClick={() => void store.sellCargo(item.id)}>Продать ₡{Math.round(item.value * .72)}</button>}</div></div>; })}</article></section></main></div>;
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
  return <div className="game-shell">{store.galaxy && <AppChrome/>}<main className="scroll-screen settings-screen"><header><div><span className="eyebrow">СИСТЕМА</span><h1>Настройки</h1></div>{!store.galaxy && <button onClick={() => store.setScreen('menu')}>Назад</button>}</header><section className="settings-cards"><article><h2>Версия</h2><div className="version-hero">v{APP_VERSION}</div><p>{APP_CODENAME}</p><div className="stat-row"><span>Схема сейва</span><b>v{SAVE_SCHEMA_VERSION}</b></div><div className="stat-row"><span>Сборка</span><b>{BUILD_TIME === 'development' ? 'development' : new Date(BUILD_TIME).toLocaleString('ru-RU')}</b></div></article><article><h2>Обучение</h2><p>{store.tutorial.completed ? 'Вводный маршрут завершён.' : 'Обучение активно.'}</p><button onClick={() => void store.restartTutorial()}>Запустить обучение заново</button></article><article><h2>Обновление PWA</h2><button className="primary-button" disabled={updating} onClick={() => void update()}>{updating ? 'Обновление…' : 'Принудительно обновить игру'}</button><small>IndexedDB и ironman не удаляются.</small></article><article><h2>Ironman</h2>{snapshot && <button onClick={() => exportSnapshot(snapshot)}>Экспортировать</button>}<button onClick={() => void store.createBackup()}>Создать backup</button></article><article className="danger-settings"><h2>Кампания</h2><p>Сброс удаляет текущий сейв и backup. «Начать заново» сохранит параметры генерации для нового старта.</p><button className="danger-button" onClick={() => { if (window.confirm('Удалить текущую кампанию без возможности восстановления?')) void store.clearGame(); }}>Сбросить кампанию</button><button className="danger-button" onClick={() => { if (!store.galaxy || !window.confirm('Удалить текущую кампанию и подготовить новую с теми же настройками?')) return; try { localStorage.setItem('void-chronicles:new-campaign-preset', JSON.stringify(store.galaxy.settings)); } catch {} void store.clearGame(); }}>Начать заново</button></article></section></main></div>;
}

const BootScreen = () => <main className="boot-screen"><div className="boot-mark"><img src={BRAND_MARK} alt="Void Chronicles"/></div><span className="eyebrow">VOID CHRONICLES · v{APP_VERSION}</span><p>Проверка локального архива…</p></main>;

export default function App() {
  const screen = useGameStore((state) => state.screen);
  const galaxy = useGameStore((state) => state.galaxy);
  const hydration = useGameStore((state) => state.hydrationStatus);
  const hydrate = useGameStore((state) => state.hydrateFromStorage);
  useEffect(() => { void hydrate(); }, [hydrate]);
  if (hydration === 'idle' || hydration === 'loading') return <BootScreen/>;
  let content;
  if (screen === 'settings') content = <SettingsScreen/>;
  else if (screen === 'continuity') content = <ContinuityScreen/>;
  else if (screen === 'chronicle') content = <ChronicleScreen chrome={galaxy && useGameStore.getState().legacy.mode !== 'chronicle' ? <AppChrome/> : undefined}/>;
  else if (!galaxy || screen === 'menu') content = <MainMenu/>;
  else if (screen === 'command') content = <CommandDeckScreen/>;
  else if (screen === 'encounters') content = <EncountersScreen/>;
  else if (screen === 'galaxy') content = <GalaxyScreen/>;
  else if (screen === 'system') content = <SystemScreen/>;
  else if (screen === 'hub') content = <HubScreen/>;
  else if (screen === 'contracts') content = <ContractsScreen/>;
  else if (screen === 'factions') content = <FactionsScreen/>;
  else if (screen === 'civilizations') content = <CivilizationsScreen/>;
  else if (screen === 'crew') content = <CrewScreen/>;
  else if (screen === 'archive') content = <ArchiveScreen/>;
  else if (screen === 'laboratory') content = <LaboratoryScreen chrome={<AppChrome/>}/>;
  else if (screen === 'world') content = <WorldScreen chrome={<AppChrome/>}/>;
  else if (screen === 'operations') content = <OperationsScreen chrome={<AppChrome/>}/>;
  else content = <ShipScreen/>;
  return <Suspense fallback={<BootScreen/>}>{content}{galaxy && <TutorialController/>}{galaxy && <ShipCombatModal/>}</Suspense>;
}
