import { useEffect, useRef, useState } from 'react';
import { GalaxyCanvas } from './components/GalaxyCanvas';
import { ExpeditionModal } from './components/ExpeditionModal';
import { ShipCombatModal } from './components/ShipCombatModal';
import { SystemMap } from './components/SystemMap';
import type { GenerationProgress } from './generation/generateGalaxy';
import { generateGalaxyInWorker } from './generation/generateInWorker';
import type { Artifact, GalaxySettings, Planet, PointOfInterest } from './game/types';
import { useGameStore } from './game/store';
import { exportSnapshot, readSnapshotFile } from './persistence/db';
import { forceApplicationUpdate } from './runtime/update';
import { APP_CODENAME, APP_VERSION, BUILD_TIME, SAVE_SCHEMA_VERSION } from './version';
import './styles/app.css';

const defaultSettings: GalaxySettings = {
  seed: 'VOID-CHRONICLES-002',
  systemCount: 300,
  historyYears: 2_000_000,
  civilizationCount: 12,
  lifeFrequency: 0.34,
  anomalyFrequency: 0.035,
  difficulty: 'standard'
};

function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year).toLocaleString('ru-RU')} лет до старта` : `Год ${year}`;
}

function VersionBadge() {
  return <span className="version-badge">v{APP_VERSION}</span>;
}

function MainMenu() {
  const startGame = useGameStore((state) => state.startGame);
  const resumeGame = useGameStore((state) => state.resumeGame);
  const restoreSnapshot = useGameStore((state) => state.restoreSnapshot);
  const saveAvailable = useGameStore((state) => state.saveAvailable);
  const saveError = useGameStore((state) => state.saveError);
  const dismissSaveError = useGameStore((state) => state.dismissSaveError);
  const clearGame = useGameStore((state) => state.clearGame);
  const generationActive = useGameStore((state) => state.generationActive);
  const setGenerationActive = useGameStore((state) => state.setGenerationActive);
  const busyAction = useGameStore((state) => state.busyAction);
  const recoveryNotice = useGameStore((state) => state.recoveryNotice);
  const dismissRecoveryNotice = useGameStore((state) => state.dismissRecoveryNotice);
  const setScreen = useGameStore((state) => state.setScreen);
  const [settings, setSettings] = useState(defaultSettings);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const create = async () => {
    if (generationActive || busyAction) return;
    setGenerationActive(true);
    setProgress({ stage: 'start', progress: 0.01, message: 'Инициализация генератора' });
    try {
      const galaxy = await generateGalaxyInWorker(settings, setProgress);
      await startGame(galaxy);
    } catch (error) {
      setProgress({ stage: 'error', progress: 0, message: error instanceof Error ? error.message : 'Ошибка генерации' });
    } finally {
      setGenerationActive(false);
    }
  };

  const importSave = async (file: File | undefined) => {
    if (!file) return;
    try {
      const snapshot = await readSnapshotFile(file);
      await restoreSnapshot(snapshot);
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
      <p className="menu-subtitle">Неизвестный сигнал теперь ведёт к месту, истории, риску и доказательствам.</p>
      {recoveryNotice && <div className="recovery-notice"><b>Система сохранений</b><p>{recoveryNotice}</p><button onClick={dismissRecoveryNotice}>Закрыть</button></div>}
      {saveError && <div className="save-error"><b>Сейв не загружен</b><p>{saveError}</p><div className="menu-actions"><button onClick={dismissSaveError}>Скрыть</button><button className="danger-button" onClick={() => void clearGame()}>Удалить повреждённый сейв</button></div></div>}
      {progress ? <div className="generation-panel">
        <div className="generation-line"><span>{progress.stage.toUpperCase()}</span><strong>{Math.round(progress.progress * 100)}%</strong></div>
        <div className="progress-track"><i style={{ width: `${progress.progress * 100}%` }} /></div>
        <p>{progress.message}</p>
        {progress.stage === 'error' && <button onClick={() => setProgress(null)}>Вернуться к настройкам</button>}
      </div> : <>
        <div className="seed-row"><label>SEED<input value={settings.seed} onChange={(event) => setSettings({ ...settings, seed: event.target.value || 'VOID' })} /></label><button onClick={() => setSettings({ ...settings, seed: `VOID-${Math.random().toString(36).slice(2, 10).toUpperCase()}` })}>Случайный</button></div>
        <div className="settings-grid">
          <label>Системы<input type="number" min="20" max="1500" value={settings.systemCount} onChange={(event) => setSettings({ ...settings, systemCount: Number(event.target.value) })} /></label>
          <label>История, лет<select value={settings.historyYears} onChange={(event) => setSettings({ ...settings, historyYears: Number(event.target.value) })}><option value={100000}>100 000</option><option value={2000000}>2 000 000</option><option value={10000000}>10 000 000</option></select></label>
          <label>Цивилизации<input type="number" min="2" max="80" value={settings.civilizationCount} onChange={(event) => setSettings({ ...settings, civilizationCount: Number(event.target.value) })} /></label>
          <label>Сложность<select value={settings.difficulty} onChange={(event) => setSettings({ ...settings, difficulty: event.target.value as GalaxySettings['difficulty'] })}><option value="explorer">Исследователь</option><option value="standard">Стандарт</option><option value="brutal">Жестокая</option></select></label>
        </div>
        <div className="menu-actions">
          <button className="primary-button large" disabled={generationActive || Boolean(busyAction)} onClick={create}>{generationActive ? 'Генерация…' : 'Создать галактику'}</button>
          {saveAvailable && <button disabled={Boolean(busyAction)} onClick={() => void resumeGame()}>Продолжить ironman</button>}
          <button disabled={Boolean(busyAction)} onClick={() => fileRef.current?.click()}>Импорт сохранения</button>
          <button onClick={() => setScreen('settings')}>Настройки и обновление</button>
          <input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => importSave(event.target.files?.[0])} />
        </div>
      </>}
      <footer>v{APP_VERSION} · {APP_CODENAME}</footer>
    </section>
  </main>;
}

function TopBar() {
  const { captain, ship, gameYear, screen, setScreen, saveStatus, busyAction } = useGameStore();
  if (!captain || !ship) return null;
  return <header className="topbar">
    <button className="brand-button" onClick={() => setScreen('galaxy')}><b>VOID</b><span>CHRONICLES</span><VersionBadge/></button>
    <nav>
      <button className={screen === 'galaxy' ? 'active' : ''} onClick={() => setScreen('galaxy')}>Карта</button>
      <button className={screen === 'ship' ? 'active' : ''} onClick={() => setScreen('ship')}>Корабль</button>
      <button className={screen === 'archive' ? 'active' : ''} onClick={() => setScreen('archive')}>Архив</button>
      <button className={screen === 'settings' ? 'active' : ''} onClick={() => setScreen('settings')}>Настройки</button>
    </nav>
    <div className="top-stats"><span className={`save-state save-${saveStatus}`}>{saveStatus === 'saving' || saveStatus === 'pending' ? 'СОХРАНЕНИЕ…' : saveStatus === 'error' ? 'ОШИБКА СЕЙВА' : saveStatus === 'saved' ? 'IRONMAN СОХРАНЁН' : 'IRONMAN'}</span><span>{busyAction ? `ОПЕРАЦИЯ: ${busyAction.toUpperCase()}` : formatYear(gameYear)}</span><span>₡ {captain.credits}</span><span>ТОПЛИВО {ship.fuel}/{ship.maxFuel}</span><span>КОРПУС {ship.hull}/{ship.maxHull}</span></div>
  </header>;
}

function artifactForPoint(point: PointOfInterest, artifacts: Artifact[]): Artifact | undefined {
  return artifacts.find((entry) => entry.civilizationId === point.civilizationId && !entry.discovered)
    ?? artifacts.find((entry) => !entry.discovered);
}

function GalaxyScreen() {
  const store = useGameStore();
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(null);
  const [expeditionPoint, setExpeditionPoint] = useState<PointOfInterest | null>(null);
  const [shipCombat, setShipCombat] = useState(false);
  const [notice, setNotice] = useState('');
  if (!store.galaxy || !store.ship || !store.captain || !store.currentSystemId) return null;
  const selectedSystem = store.galaxy.systems.find((system) => system.id === store.selectedSystemId) ?? store.galaxy.systems.find((system) => system.id === store.currentSystemId);
  const current = store.galaxy.systems.find((system) => system.id === store.currentSystemId);
  if (!selectedSystem || !current) return null;
  const selectedPlanet = selectedSystem.planets.find((planet) => planet.id === selectedPlanetId) ?? selectedSystem.planets[0] ?? null;
  const systemPoints = store.pointsOfInterest.filter((entry) => entry.systemId === selectedSystem.id);
  const planetPoints = selectedPlanet ? systemPoints.filter((entry) => entry.planetId === selectedPlanet.id) : [];
  const latestReport = selectedPlanet ? store.scanReports.find((entry) => entry.planetId === selectedPlanet.id) : undefined;
  const jumpDistance = Math.hypot(selectedSystem.coordinates.x - current.coordinates.x, selectedSystem.coordinates.y - current.coordinates.y);
  const direct = current.neighbors.includes(selectedSystem.id);
  const canTravel = selectedSystem.id !== current.id && direct && jumpDistance <= store.ship.jumpRange && !store.busyAction && store.ship.hull > 0;

  const doTravel = async () => {
    const result = await store.travelTo(selectedSystem.id);
    setNotice(result.message);
    setSelectedPlanetId(null);
    if (result.encounter === 'shipCombat') setShipCombat(true);
  };

  const detailScan = async (planet: Planet) => {
    const result = await store.detailedScanPlanet(planet.id);
    setNotice(result.message);
  };

  return <div className="game-shell">
    <TopBar />
    <div className="galaxy-layout deep-discovery-layout">
      <section className="map-panel galaxy-mini-panel">
        <GalaxyCanvas systems={store.galaxy.systems} currentSystemId={store.currentSystemId} selectedSystemId={store.selectedSystemId} jumpRange={store.ship.jumpRange} onSelect={(id) => { store.selectSystem(id); setSelectedPlanetId(null); }} />
        <div className="map-legend"><span><i className="dot safe"/> известная</span><span><i className="dot danger"/> опасная</span><span><i className="dot anomaly"/> аномалия</span></div>
        {notice && <button className="notice" onClick={() => setNotice('')}>{notice}</button>}
      </section>

      <main className="system-explorer">
        <header className="system-explorer-header">
          <div><span className="eyebrow">{selectedSystem.region.toUpperCase()} · {selectedSystem.starClass}</span><h1>{selectedSystem.name}</h1><p>{selectedSystem.starCount} звезда · {selectedSystem.planets.length} планет · угроза {selectedSystem.danger}</p></div>
          <div className="action-row">
            {selectedSystem.id === current.id
              ? <button className="primary-button" disabled={Boolean(store.busyAction)} onClick={() => store.scanSystem(selectedSystem.id)}>{selectedSystem.scanned ? 'Обновить системный скан' : 'Системный скан'}</button>
              : <button className="primary-button" disabled={!canTravel} onClick={doTravel}>Прыжок · {Math.max(7, Math.ceil(jumpDistance / 14))} топлива</button>}
          </div>
        </header>
        {!direct && selectedSystem.id !== current.id && <p className="warning-text">Прямой маршрут отсутствует.</p>}
        <SystemMap system={selectedSystem} selectedPlanetId={selectedPlanet?.id ?? null} pointsOfInterest={systemPoints} onSelectPlanet={(planet) => setSelectedPlanetId(planet.id)} />
      </main>

      <aside className="discovery-panel">
        {selectedPlanet ? <>
          <div className="planet-inspector"><div className={`planet-orb large planet-${selectedPlanet.type}`}><span /></div><div><span className="eyebrow">ОРБИТА {selectedPlanet.orbit} · СКАН {selectedPlanet.scanLevel ?? 0}/3</span><h2>{selectedPlanet.scanLevel ? selectedPlanet.name : 'НЕИЗВЕСТНЫЙ ОБЪЕКТ'}</h2><p>{selectedPlanet.scanLevel ? `${selectedPlanet.type} · пригодность ${selectedPlanet.habitability}% · ${selectedPlanet.moons} спутн.` : 'Выполните системный скан.'}</p></div></div>
          {selectedSystem.id === current.id && selectedSystem.scanned && <button className="primary-button full" disabled={Boolean(store.busyAction)} onClick={() => void detailScan(selectedPlanet)}>{(selectedPlanet.scanLevel ?? 0) >= 2 ? 'Повторить детальный скан' : 'Детальный скан планеты'}</button>}
          {latestReport && <article className="scan-report"><span>ДОСТОВЕРНОСТЬ {Math.round(latestReport.confidence)}%</span><p>{latestReport.summary}</p>{latestReport.warnings.map((warning) => <small key={warning}>{warning}</small>)}</article>}
          <div className="poi-list">
            {planetPoints.length === 0 ? <p className="empty-state">Точки интереса не определены. Требуется детальный скан.</p> : planetPoints.map((point) => <article className={`poi-card poi-${point.status}`} key={point.id}>
              <div><span className="eyebrow">{point.type} · {point.danger} · {point.status}</span><h3>{point.name}</h3><p>{point.publicSummary}</p><div className="tags"><span>скан {point.scanConfidence}%</span><span>визитов {point.visits}</span>{point.requiredEquipment.slice(0, 2).map((item) => <span key={item}>{item}</span>)}</div></div>
              {selectedSystem.id === current.id && selectedPlanet.type !== 'gas' && <button disabled={Boolean(store.busyAction)} onClick={() => setExpeditionPoint(point)}>{point.status === 'resolved' ? 'Вернуться' : 'Высадка'}</button>}
            </article>)}
          </div>
        </> : <p className="empty-state">Выберите планету на карте системы.</p>}
      </aside>

      <aside className="log-panel"><span className="eyebrow">ЖУРНАЛ КОРАБЛЯ</span>{store.logs.slice(0, 8).map((entry) => <article className={`log-entry ${entry.tone}`} key={entry.id}><b>{entry.title}</b><p>{entry.text}</p><small>{formatYear(entry.year)}</small></article>)}</aside>
    </div>
    {expeditionPoint && selectedPlanet && <ExpeditionModal
      seed={`${store.galaxy.seed}:${selectedPlanet.id}`}
      planet={selectedPlanet}
      point={expeditionPoint}
      artifact={artifactForPoint(expeditionPoint, store.galaxy.artifacts)}
      onClose={() => setExpeditionPoint(null)}
      onComplete={async (result) => { await store.completeExpedition(result); }}
    />}
    {shipCombat && <ShipCombatModal playerHull={store.ship.hull} onDamage={store.damageShip} onVictory={async () => { await store.earnCredits(620, 'Победа в корабельном бою'); setShipCombat(false); }} onEscape={() => setShipCombat(false)} onDefeat={() => { setShipCombat(false); store.setScreen('ship'); }} />}
  </div>;
}

function ArchiveScreen() {
  const { galaxy, discoveries, logs, evidence, hypotheses, pointsOfInterest } = useGameStore();
  const [tab, setTab] = useState<'discoveries' | 'evidence' | 'hypotheses' | 'history' | 'civilizations'>('discoveries');
  const [query, setQuery] = useState('');
  if (!galaxy) return null;
  const normalized = query.toLowerCase();
  return <div className="game-shell"><TopBar/><main className="archive-screen"><header><div><span className="eyebrow">ИССЛЕДОВАТЕЛЬСКИЙ АРХИВ</span><h1>Архив экспедиции</h1></div><input placeholder="Поиск по архиву" value={query} onChange={(event) => setQuery(event.target.value)} /></header><nav className="tabs"><button className={tab==='discoveries'?'active':''} onClick={()=>setTab('discoveries')}>Открытия {discoveries.length}</button><button className={tab==='evidence'?'active':''} onClick={()=>setTab('evidence')}>Улики {evidence.length}</button><button className={tab==='hypotheses'?'active':''} onClick={()=>setTab('hypotheses')}>Гипотезы {hypotheses.length}</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>История</button><button className={tab==='civilizations'?'active':''} onClick={()=>setTab('civilizations')}>Цивилизации</button></nav><section className="archive-grid">
    {tab === 'discoveries' && discoveries.filter((entry)=>`${entry.name} ${entry.description}`.toLowerCase().includes(normalized)).map((entry)=><article key={entry.id}><span className="eyebrow">{entry.kind} · достоверность {entry.confidence}%</span><h3>{entry.name}</h3><p>{entry.description}</p><div className="tags">{entry.tags.map((tag)=><span key={tag}>{tag}</span>)}</div></article>)}
    {tab === 'evidence' && evidence.filter((entry)=>`${entry.title} ${entry.description}`.toLowerCase().includes(normalized)).map((entry)=><article key={entry.id}><span className="eyebrow">{entry.kind} · надёжность {entry.reliability}%</span><h3>{entry.title}</h3><p>{entry.description}</p><small>{pointsOfInterest.find((point)=>point.id===entry.pointOfInterestId)?.name}</small></article>)}
    {tab === 'hypotheses' && hypotheses.filter((entry)=>`${entry.title} ${entry.summary}`.toLowerCase().includes(normalized)).map((entry)=><article key={entry.id}><span className="eyebrow">{entry.status} · уверенность {entry.confidence}%</span><h3>{entry.title}</h3><p>{entry.summary}</p><div className="hypothesis-meter"><i style={{width:`${entry.confidence}%`}}/></div><small>Улик: {entry.evidenceIds.length}</small></article>)}
    {tab === 'history' && galaxy.history.filter((entry)=>`${entry.title} ${entry.summary}`.toLowerCase().includes(normalized)).slice(-120).reverse().map((entry)=><article key={entry.id}><span className="eyebrow">{formatYear(entry.year)}</span><h3>{entry.title}</h3><p>{entry.summary}</p><small>{entry.consequences.join(' · ')}</small></article>)}
    {tab === 'civilizations' && galaxy.civilizations.filter((entry)=>`${entry.name} ${entry.speciesName}`.toLowerCase().includes(normalized)).map((entry)=><article key={entry.id}><span className="eyebrow">{entry.status} · tech {entry.techLevel}</span><h3>{entry.name}</h3><p>{entry.speciesName}. {entry.ideology}.</p><div className="tags">{entry.traits.map((tag)=><span key={tag}>{tag}</span>)}</div></article>)}
  </section><aside className="archive-summary"><b>Последние записи</b>{logs.slice(0,5).map((entry)=><p key={entry.id}>{entry.title}</p>)}</aside></main></div>;
}

function ShipScreen() {
  const { ship, captain, repairShip, refuelShip, sellCargo, analyzeArtifact, artifactKnowledge, getSnapshot, clearGame, createBackup, backupCount, busyAction, saveMeta, saveStatus } = useGameStore();
  if (!ship || !captain) return null;
  const snapshot = getSnapshot();
  return <div className="game-shell"><TopBar/><main className="ship-screen"><section className="ship-hero"><span className="eyebrow">ЛИЧНЫЙ ИССЛЕДОВАТЕЛЬСКИЙ КОРАБЛЬ</span><h1>{ship.name}</h1><div className="ship-silhouette"><div className="ship-core"/><div className="ship-wing left"/><div className="ship-wing right"/></div><div className="ship-actions"><button disabled={Boolean(busyAction)} onClick={repairShip}>Полный ремонт</button><button disabled={Boolean(busyAction)} onClick={refuelShip}>Заправить</button>{snapshot && <button disabled={Boolean(busyAction)} onClick={()=>exportSnapshot(snapshot)}>Экспорт сейва</button>}<button disabled={Boolean(busyAction)} onClick={()=>void createBackup()}>Резервная копия ({backupCount})</button><button className="danger-button" disabled={Boolean(busyAction)} onClick={clearGame}>Удалить ironman</button></div><p className={`save-details save-${saveStatus}`}>{saveMeta ? `Сейв #${saveMeta.sequence} · ${new Date(saveMeta.savedAt).toLocaleString('ru-RU')} · ${saveMeta.reason}` : 'Сохранение ещё не создано'}</p></section><section className="ship-data"><article><h2>Состояние</h2><div className="meter"><span>Корпус</span><strong>{ship.hull}/{ship.maxHull}</strong><i style={{width:`${ship.hull}%`}}/></div><div className="meter"><span>Топливо</span><strong>{ship.fuel}/{ship.maxFuel}</strong><i style={{width:`${ship.fuel}%`}}/></div><div className="stat-row"><span>Дальность</span><b>{ship.jumpRange}</b></div><div className="stat-row"><span>Груз</span><b>{ship.cargo.length}/{ship.cargoCapacity}</b></div></article><article><h2>Модули</h2>{ship.modules.map((module)=><div className="module-row" key={module.id}><span>{module.slot}</span><div><b>{module.name}</b><p>{module.effect}</p></div><em>R{module.rarity}</em></div>)}</article><article><h2>Капитан</h2><div className="stat-row"><span>Имя</span><b>{captain.name}</b></div><div className="stat-row"><span>Уровень</span><b>{captain.level}</b></div><div className="stat-row"><span>Здоровье</span><b>{captain.health}/{captain.maxHealth}</b></div><h3>Травмы</h3>{captain.injuries.length===0?<p>Травм нет.</p>:captain.injuries.map((injury)=><p key={injury.id}>{injury.bodyPart}: {injury.type} ({injury.severity}/10)</p>)}</article><article><h2>Груз и анализ</h2>{ship.cargo.length===0?<p>Трюм пуст.</p>:ship.cargo.map((item)=>{const knowledge=item.artifactId?artifactKnowledge.find((entry)=>entry.artifactId===item.artifactId):undefined;return <div className="module-row cargo-analysis" key={item.id}><span>{item.kind}</span><div><b>{item.name}</b><p>Оценка: ₡ {item.value} · знания {knowledge?.level ?? 0}/4</p><div><button disabled={Boolean(busyAction)||!item.artifactId||(knowledge?.level??0)>=4} onClick={()=>item.artifactId&&analyzeArtifact(item.artifactId)}>Анализ ₡120</button><button disabled={Boolean(busyAction)} onClick={()=>sellCargo(item.id)}>Продать ₡{Math.round(item.value*.72)}</button></div>{knowledge?.revealedTruth&&<small>{knowledge.revealedTruth}</small>}</div><em>x{item.quantity}</em></div>})}</article></section></main></div>;
}

function SettingsScreen() {
  const { galaxy, getSnapshot, createBackup, backupCount, clearGame, setScreen, busyAction } = useGameStore();
  const [updating, setUpdating] = useState(false);
  const snapshot = getSnapshot();
  const update = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      await forceApplicationUpdate();
    } catch (error) {
      setUpdating(false);
      alert(error instanceof Error ? error.message : 'Не удалось принудительно обновить приложение');
    }
  };
  return <div className="game-shell">{galaxy && <TopBar/>}<main className="settings-screen"><header><div><span className="eyebrow">СИСТЕМА</span><h1>Настройки</h1></div>{!galaxy&&<button onClick={()=>setScreen('menu')}>Назад</button>}</header><section className="settings-cards"><article><h2>Версия</h2><div className="version-hero">v{APP_VERSION}</div><p>{APP_CODENAME}</p><div className="stat-row"><span>Схема сейва</span><b>v{SAVE_SCHEMA_VERSION}</b></div><div className="stat-row"><span>Сборка</span><b>{BUILD_TIME === 'development' ? 'development' : new Date(BUILD_TIME).toLocaleString('ru-RU')}</b></div></article><article><h2>Обновление PWA</h2><p>Проверяет новый service worker, очищает старый кэш и загружает свежую сборку с GitHub Pages.</p><button className="primary-button" disabled={updating} onClick={()=>void update()}>{updating?'Обновление…':'Принудительно обновить'}</button><small>Сейв хранится в IndexedDB и при очистке Cache Storage не удаляется.</small></article><article><h2>Ironman</h2><p>Резервные копии создаются перед миграциями и вручную.</p><div className="settings-actions">{snapshot&&<button disabled={Boolean(busyAction)} onClick={()=>exportSnapshot(snapshot)}>Экспортировать сейв</button>}<button disabled={Boolean(busyAction)||!galaxy} onClick={()=>void createBackup()}>Создать backup ({backupCount})</button><button className="danger-button" disabled={Boolean(busyAction)||!galaxy} onClick={()=>void clearGame()}>Удалить локальную партию</button></div></article></section></main></div>;
}

function BootScreen() {
  return <main className="boot-screen"><div className="boot-mark">◆</div><span className="eyebrow">VOID CHRONICLES · v{APP_VERSION}</span><p>Проверка локального архива…</p></main>;
}

export default function App() {
  const screen = useGameStore((state) => state.screen);
  const galaxy = useGameStore((state) => state.galaxy);
  const hydrationStatus = useGameStore((state) => state.hydrationStatus);
  const hydrateFromStorage = useGameStore((state) => state.hydrateFromStorage);

  useEffect(() => { void hydrateFromStorage(); }, [hydrateFromStorage]);

  if (hydrationStatus === 'idle' || hydrationStatus === 'loading') return <BootScreen/>;
  if (screen === 'settings') return <SettingsScreen/>;
  if (!galaxy || screen === 'menu') return <MainMenu/>;
  if (screen === 'archive') return <ArchiveScreen/>;
  if (screen === 'ship') return <ShipScreen/>;
  return <GalaxyScreen/>;
}
