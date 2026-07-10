import { useEffect, useMemo, useRef, useState } from 'react';
import { GalaxyCanvas } from './components/GalaxyCanvas';
import { ExpeditionModal } from './components/ExpeditionModal';
import { ShipCombatModal } from './components/ShipCombatModal';
import type { GenerationProgress } from './generation/generateGalaxy';
import { generateGalaxyInWorker } from './generation/generateInWorker';
import type { Artifact, GalaxySettings, Planet } from './game/types';
import { useGameStore } from './game/store';
import { exportSnapshot, readSnapshotFile } from './persistence/db';
import './styles/app.css';

const defaultSettings: GalaxySettings = {
  seed: 'VOID-CHRONICLES-001',
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

function MainMenu() {
  const startGame = useGameStore((state) => state.startGame);
  const resumeGame = useGameStore((state) => state.resumeGame);
  const restoreSnapshot = useGameStore((state) => state.restoreSnapshot);
  const [settings, setSettings] = useState(defaultSettings);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [canResume, setCanResume] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    resumeGame().then((ok) => {
      setCanResume(ok);
      if (ok) useGameStore.getState().setScreen('menu');
    }).catch(() => setCanResume(false));
  }, [resumeGame]);

  const create = async () => {
    setProgress({ stage: 'start', progress: 0.01, message: 'Инициализация генератора' });
    try {
      const galaxy = await generateGalaxyInWorker(settings, setProgress);
      await startGame(galaxy);
    } catch (error) {
      setProgress({ stage: 'error', progress: 0, message: error instanceof Error ? error.message : 'Ошибка генерации' });
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
      <span className="eyebrow">PROCEDURAL SPACE ROGUELIKE</span>
      <h1>VOID<br/>CHRONICLES</h1>
      <p className="menu-subtitle">Каждая галактика имеет собственную историю. Каждая экспедиция может стать последней.</p>
      {progress ? <div className="generation-panel">
        <div className="generation-line"><span>{progress.stage.toUpperCase()}</span><strong>{Math.round(progress.progress * 100)}%</strong></div>
        <div className="progress-track"><i style={{ width: `${progress.progress * 100}%` }} /></div>
        <p>{progress.message}</p>
      </div> : <>
        <div className="seed-row"><label>SEED<input value={settings.seed} onChange={(event) => setSettings({ ...settings, seed: event.target.value || 'VOID' })} /></label><button onClick={() => setSettings({ ...settings, seed: `VOID-${Math.random().toString(36).slice(2, 10).toUpperCase()}` })}>Случайный</button></div>
        <div className="settings-grid">
          <label>Системы<input type="number" min="20" max="1500" value={settings.systemCount} onChange={(event) => setSettings({ ...settings, systemCount: Number(event.target.value) })} /></label>
          <label>История, лет<select value={settings.historyYears} onChange={(event) => setSettings({ ...settings, historyYears: Number(event.target.value) })}><option value={100000}>100 000</option><option value={2000000}>2 000 000</option><option value={10000000}>10 000 000</option></select></label>
          <label>Цивилизации<input type="number" min="2" max="80" value={settings.civilizationCount} onChange={(event) => setSettings({ ...settings, civilizationCount: Number(event.target.value) })} /></label>
          <label>Сложность<select value={settings.difficulty} onChange={(event) => setSettings({ ...settings, difficulty: event.target.value as GalaxySettings['difficulty'] })}><option value="explorer">Исследователь</option><option value="standard">Стандарт</option><option value="brutal">Жестокая</option></select></label>
        </div>
        <div className="menu-actions">
          <button className="primary-button large" onClick={create}>Создать галактику</button>
          {canResume && <button onClick={() => resumeGame()}>Продолжить ironman</button>}
          <button onClick={() => fileRef.current?.click()}>Импорт сохранения</button>
          <input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => importSave(event.target.files?.[0])} />
        </div>
      </>}
      <footer>v0.1 · FIRST EXPEDITION FOUNDATION</footer>
    </section>
  </main>;
}

function TopBar() {
  const { captain, ship, gameYear, screen, setScreen } = useGameStore();
  if (!captain || !ship) return null;
  return <header className="topbar">
    <button className="brand-button" onClick={() => setScreen('galaxy')}><b>VOID</b><span>CHRONICLES</span></button>
    <nav>
      <button className={screen === 'galaxy' ? 'active' : ''} onClick={() => setScreen('galaxy')}>Карта</button>
      <button className={screen === 'ship' ? 'active' : ''} onClick={() => setScreen('ship')}>Корабль</button>
      <button className={screen === 'archive' ? 'active' : ''} onClick={() => setScreen('archive')}>Архив</button>
    </nav>
    <div className="top-stats"><span>{formatYear(gameYear)}</span><span>₡ {captain.credits}</span><span>ТОПЛИВО {ship.fuel}/{ship.maxFuel}</span><span>КОРПУС {ship.hull}/{ship.maxHull}</span></div>
  </header>;
}

function GalaxyScreen() {
  const store = useGameStore();
  const [expeditionPlanet, setExpeditionPlanet] = useState<Planet | null>(null);
  const [shipCombat, setShipCombat] = useState(false);
  const [notice, setNotice] = useState('');
  if (!store.galaxy || !store.ship || !store.captain || !store.currentSystemId) return null;
  const selected = store.galaxy.systems.find((system) => system.id === store.selectedSystemId) ?? store.galaxy.systems.find((system) => system.id === store.currentSystemId);
  const current = store.galaxy.systems.find((system) => system.id === store.currentSystemId);
  if (!selected || !current) return null;
  const jumpDistance = Math.hypot(selected.coordinates.x - current.coordinates.x, selected.coordinates.y - current.coordinates.y);
  const direct = current.neighbors.includes(selected.id);
  const canTravel = selected.id !== current.id && direct && jumpDistance <= store.ship.jumpRange;
  const artifactFor = (planet: Planet): Artifact | undefined => {
    const civ = store.galaxy?.civilizations.find((entry) => entry.id === planet.civilizationId) ?? store.galaxy?.civilizations.find((entry) => entry.status === 'dead');
    return store.galaxy?.artifacts.find((entry) => entry.civilizationId === civ?.id && !entry.discovered);
  };
  const doTravel = async () => {
    const result = await store.travelTo(selected.id);
    setNotice(result.message);
    if (result.encounter === 'shipCombat') setShipCombat(true);
  };
  return <div className="game-shell">
    <TopBar />
    <div className="galaxy-layout">
      <section className="map-panel">
        <GalaxyCanvas systems={store.galaxy.systems} currentSystemId={store.currentSystemId} selectedSystemId={store.selectedSystemId} jumpRange={store.ship.jumpRange} onSelect={store.selectSystem} />
        <div className="map-legend"><span><i className="dot safe"/> известная система</span><span><i className="dot danger"/> высокая угроза</span><span><i className="dot anomaly"/> аномалия</span></div>
        {notice && <button className="notice" onClick={() => setNotice('')}>{notice}</button>}
      </section>
      <aside className="system-panel">
        <div className="system-heading"><span className="eyebrow">{selected.region.toUpperCase()} · {selected.starClass}</span><h2>{selected.name}</h2><p>{selected.starCount} звезда · {selected.planets.length} планет · угроза: {selected.danger}</p></div>
        <div className="action-row">
          {selected.id === current.id ? <button className="primary-button" onClick={() => store.scanSystem(selected.id)}>{selected.scanned ? 'Повторный скан' : 'Сканировать'}</button> : <button className="primary-button" disabled={!canTravel} onClick={doTravel}>Прыжок · {Math.max(7, Math.ceil(jumpDistance / 14))} топлива</button>}
        </div>
        {!direct && selected.id !== current.id && <p className="warning-text">Прямой маршрут отсутствует.</p>}
        <div className="planet-list">
          {selected.planets.map((planet) => <article className={`planet-card ${!selected.scanned ? 'locked' : ''}`} key={planet.id}>
            <div className={`planet-orb planet-${planet.type}`}><span /></div>
            <div><h3>{selected.scanned ? planet.name : 'НЕИЗВЕСТНЫЙ ОБЪЕКТ'}</h3><p>{selected.scanned ? `${planet.type} · пригодность ${planet.habitability}% · ${planet.moons} спутн.` : 'Требуется сканирование'}</p>{selected.scanned && <div className="tags"><span>{planet.danger}</span>{planet.hasLife && <span>жизнь</span>}{planet.civilizationId && <span>цивилизация</span>}</div>}</div>
            {selected.id === current.id && selected.scanned && planet.type !== 'gas' && <button onClick={() => setExpeditionPlanet(planet)}>Высадка</button>}
          </article>)}
        </div>
      </aside>
      <aside className="log-panel"><span className="eyebrow">ЖУРНАЛ КОРАБЛЯ</span>{store.logs.slice(0, 8).map((entry) => <article className={`log-entry ${entry.tone}`} key={entry.id}><b>{entry.title}</b><p>{entry.text}</p><small>{formatYear(entry.year)}</small></article>)}</aside>
    </div>
    {expeditionPlanet && <ExpeditionModal seed={store.galaxy.seed} planet={expeditionPlanet} artifact={artifactFor(expeditionPlanet)} onClose={() => setExpeditionPlanet(null)} onComplete={async (artifact, injury) => { await store.completeExpedition(current.id, expeditionPlanet.id, artifact, injury); setExpeditionPlanet(null); }} />}
    {shipCombat && <ShipCombatModal playerHull={store.ship.hull} onDamage={store.damageShip} onVictory={async () => { await store.earnCredits(620, 'Победа в корабельном бою'); setShipCombat(false); }} onEscape={() => setShipCombat(false)} />}
  </div>;
}

function ArchiveScreen() {
  const { galaxy, discoveries, logs } = useGameStore();
  const [tab, setTab] = useState<'discoveries' | 'history' | 'civilizations'>('discoveries');
  const [query, setQuery] = useState('');
  if (!galaxy) return null;
  const normalized = query.toLowerCase();
  return <div className="game-shell"><TopBar/><main className="archive-screen"><header><div><span className="eyebrow">КАРТОГРАФИЧЕСКИЙ И НАУЧНЫЙ АРХИВ</span><h1>Архив экспедиции</h1></div><input placeholder="Поиск по архиву" value={query} onChange={(event) => setQuery(event.target.value)} /></header><nav className="tabs"><button className={tab==='discoveries'?'active':''} onClick={()=>setTab('discoveries')}>Открытия {discoveries.length}</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>История {galaxy.history.length}</button><button className={tab==='civilizations'?'active':''} onClick={()=>setTab('civilizations')}>Цивилизации {galaxy.civilizations.length}</button></nav><section className="archive-grid">
    {tab === 'discoveries' && discoveries.filter((entry)=>`${entry.name} ${entry.description}`.toLowerCase().includes(normalized)).map((entry)=><article key={entry.id}><span className="eyebrow">{entry.kind} · достоверность {entry.confidence}%</span><h3>{entry.name}</h3><p>{entry.description}</p><div className="tags">{entry.tags.map((tag)=><span key={tag}>{tag}</span>)}</div></article>)}
    {tab === 'history' && galaxy.history.filter((entry)=>`${entry.title} ${entry.summary}`.toLowerCase().includes(normalized)).slice(-120).reverse().map((entry)=><article key={entry.id}><span className="eyebrow">{formatYear(entry.year)}</span><h3>{entry.title}</h3><p>{entry.summary}</p><small>{entry.consequences.join(' · ')}</small></article>)}
    {tab === 'civilizations' && galaxy.civilizations.filter((entry)=>`${entry.name} ${entry.speciesName}`.toLowerCase().includes(normalized)).map((entry)=><article key={entry.id}><span className="eyebrow">{entry.status} · tech {entry.techLevel}</span><h3>{entry.name}</h3><p>{entry.speciesName}. {entry.ideology}.</p><div className="tags">{entry.traits.map((tag)=><span key={tag}>{tag}</span>)}</div></article>)}
  </section><aside className="archive-summary"><b>Последние записи</b>{logs.slice(0,5).map((entry)=><p key={entry.id}>{entry.title}</p>)}</aside></main></div>;
}

function ShipScreen() {
  const { ship, captain, repairShip, refuelShip, sellCargo, getSnapshot, clearGame } = useGameStore();
  if (!ship || !captain) return null;
  const snapshot = getSnapshot();
  return <div className="game-shell"><TopBar/><main className="ship-screen"><section className="ship-hero"><span className="eyebrow">ЛИЧНЫЙ ИССЛЕДОВАТЕЛЬСКИЙ КОРАБЛЬ</span><h1>{ship.name}</h1><div className="ship-silhouette"><div className="ship-core"/><div className="ship-wing left"/><div className="ship-wing right"/></div><div className="ship-actions"><button onClick={repairShip}>Полный ремонт</button><button onClick={refuelShip}>Заправить</button>{snapshot && <button onClick={()=>exportSnapshot(snapshot)}>Экспорт сейва</button>}<button className="danger-button" onClick={clearGame}>Удалить ironman</button></div></section><section className="ship-data"><article><h2>Состояние</h2><div className="meter"><span>Корпус</span><strong>{ship.hull}/{ship.maxHull}</strong><i style={{width:`${ship.hull}%`}}/></div><div className="meter"><span>Топливо</span><strong>{ship.fuel}/{ship.maxFuel}</strong><i style={{width:`${ship.fuel}%`}}/></div><div className="stat-row"><span>Дальность</span><b>{ship.jumpRange}</b></div><div className="stat-row"><span>Груз</span><b>{ship.cargo.length}/{ship.cargoCapacity}</b></div></article><article><h2>Модули</h2>{ship.modules.map((module)=><div className="module-row" key={module.id}><span>{module.slot}</span><div><b>{module.name}</b><p>{module.effect}</p></div><em>R{module.rarity}</em></div>)}</article><article><h2>Капитан</h2><div className="stat-row"><span>Имя</span><b>{captain.name}</b></div><div className="stat-row"><span>Уровень</span><b>{captain.level}</b></div><div className="stat-row"><span>Здоровье</span><b>{captain.health}/{captain.maxHealth}</b></div><h3>Травмы</h3>{captain.injuries.length===0?<p>Травм нет.</p>:captain.injuries.map((injury)=><p key={injury.id}>{injury.bodyPart}: {injury.type} ({injury.severity}/10)</p>)}</article><article><h2>Груз</h2>{ship.cargo.length===0?<p>Трюм пуст.</p>:ship.cargo.map((item)=><div className="module-row" key={item.id}><span>{item.kind}</span><div><b>{item.name}</b><p>Оценка: ₡ {item.value}</p><button onClick={()=>sellCargo(item.id)}>Продать за ₡ {Math.round(item.value*.72)}</button></div><em>x{item.quantity}</em></div>)}</article></section></main></div>;
}

export default function App() {
  const screen = useGameStore((state) => state.screen);
  const galaxy = useGameStore((state) => state.galaxy);
  if (!galaxy || screen === 'menu') return <MainMenu/>;
  if (screen === 'archive') return <ArchiveScreen/>;
  if (screen === 'ship') return <ShipScreen/>;
  return <GalaxyScreen/>;
}
