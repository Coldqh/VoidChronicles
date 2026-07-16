import { useMemo, useState } from 'react';
import { ExpeditionModal } from '../components/ExpeditionModal';
import { SystemMap } from '../components/SystemMap';
import type { Artifact, Planet, PointOfInterest } from '../game/types';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';
import { contactStageLabel } from '../world/civilizations';

const artifactForPoint = (point: PointOfInterest, artifacts: Artifact[]) => (point.artifactIds ?? [])
  .map((id) => artifacts.find((entry) => entry.id === id))
  .find((entry): entry is Artifact => Boolean(entry && !entry.discovered));

export function SystemWorkspaceV352() {
  const store = useGameStore();
  const [planetId, setPlanetId] = useState<string | null>(null);
  const [point, setPoint] = useState<PointOfInterest | null>(null);
  const [notice, setNotice] = useState('');
  const system = store.galaxy?.systems.find((entry) => entry.id === store.currentSystemId);

  const selectedPlanet = useMemo(() => {
    if (!system) return null;
    return system.planets.find((entry) => entry.id === planetId) ?? system.planets[0] ?? null;
  }, [planetId, system]);

  if (!store.galaxy || !system) return null;

  const selectPlanet = (planet: Planet) => {
    setPlanetId(planet.id);
    if (planet.id === store.tutorial.targetPlanetId) void store.advanceTutorial(2);
  };

  const report = selectedPlanet ? store.scanReports.find((entry) => entry.planetId === selectedPlanet.id) : undefined;
  const ecology = selectedPlanet?.scanLevel && selectedPlanet.scanLevel >= 2 ? store.simulation?.ecosystems[selectedPlanet.id] : undefined;
  const planetPoints = selectedPlanet?.scanLevel && selectedPlanet.scanLevel >= 2
    ? store.pointsOfInterest.filter((entry) => entry.planetId === selectedPlanet.id)
    : [];
  const localHubs = system.scanned ? store.hubs.filter((hub) => hub.systemId === system.id) : [];
  const systemCivilizations = system.scanned ? store.galaxy.civilizations.filter((civilization) => {
    const contact = store.civilizationContacts.find((entry) => entry.civilizationId === civilization.id);
    return contact && contact.stage !== 'unknown' && (system.civilizationIds.includes(civilization.id) || system.planets.some((entry) => entry.civilizationId === civilization.id));
  }) : [];

  const scanPlanet = async () => {
    if (!selectedPlanet) return;
    setNotice((await store.detailedScanPlanet(selectedPlanet.id)).message);
  };

  const expedition = point && selectedPlanet ? <ExpeditionModal
    seed={store.galaxy.seed}
    planet={selectedPlanet}
    point={point}
    artifact={artifactForPoint(point, store.galaxy.artifacts)}
    crew={store.crew}
    personalEquipment={store.equipmentInventory}
    locationState={store.locationStates.find((entry) => entry.pointOfInterestId === point.id)}
    onClose={() => setPoint(null)}
    onTutorialAction={(action) => {
      if (action === 'launch-expedition') void store.advanceTutorial(5);
      else if (action === 'collect-data') void store.advanceTutorial(6);
      else void store.advanceTutorial(7);
    }}
    onComplete={async (result) => { await store.completeExpedition(result); }}
  /> : null;

  return <main className="v352-workspace v352-system-workspace">
    <header className="v352-workspace-hero">
      <div><span className="eyebrow">ТАКТИЧЕСКАЯ КАРТА СИСТЕМЫ</span><h1>{system.name}</h1><p>{system.scanned ? `${system.starClass} · ${system.planets.length} орбит · ${localHubs.length} узлов` : 'Система не обследована. Объекты остаются неподтверждёнными.'}</p></div>
      <button data-tutorial="system-scan" className="primary-button" disabled={Boolean(store.busyAction)} onClick={async () => { await store.scanSystem(system.id); setNotice('Системный скан завершён.'); }}>{system.scanned ? 'Обновить системный скан' : 'Запустить системный скан'}</button>
    </header>

    {notice && <button className="v352-toast" onClick={() => setNotice('')}>{notice}</button>}

    <section className="v352-system-grid">
      <aside className="v352-object-list">
        <header><span className="eyebrow">ОРБИТАЛЬНЫЕ ОБЪЕКТЫ</span><b>{system.planets.length}</b></header>
        <div>{system.planets.map((planet, index) => <button key={planet.id} className={(selectedPlanet?.id === planet.id ? 'active ' : '') + `planet-${planet.type}`} onClick={() => selectPlanet(planet)}>
          <i>{index + 1}</i><span><b>{planet.scanLevel ? planet.name : `Объект ${index + 1}`}</b><small>{planet.scanLevel ? `${planet.type} · угроза ${planet.danger}` : 'данные отсутствуют'}</small></span><em>{planet.scanLevel ?? 0}</em>
        </button>)}</div>
        <footer><span>Сигналы <b>{store.pointsOfInterest.filter((entry) => entry.systemId === system.id).length}</b></span><span>Поселения <b>{localHubs.length}</b></span></footer>
      </aside>

      <section className="v352-system-map">
        <SystemMap
          system={system}
          selectedPlanetId={selectedPlanet?.id ?? null}
          pointsOfInterest={system.scanned ? store.pointsOfInterest.filter((entry) => entry.systemId === system.id) : []}
          tutorialPlanetId={store.tutorial.targetPlanetId}
          onSelectPlanet={selectPlanet}
        />
        <div className="v352-map-caption"><span>ЗВЕЗДА <b>{system.starClass}</b></span><span>РЕГИОН <b>{system.region}</b></span><span>СКАН <b>{system.scanned ? 'ПОДТВЕРЖДЁН' : 'НЕ ПРОВЕДЁН'}</b></span></div>
      </section>

      <aside className="v352-dossier">
        {selectedPlanet ? <>
          <header><div className={`v352-planet-mark planet-${selectedPlanet.type}`}><i/></div><div><span className="eyebrow">ДОСЬЕ ОБЪЕКТА</span><h2>{selectedPlanet.scanLevel ? selectedPlanet.name : 'НЕИЗВЕСТНЫЙ ОБЪЕКТ'}</h2><p>{selectedPlanet.scanLevel ? `${selectedPlanet.type} · уровень угрозы ${selectedPlanet.danger}` : 'Нужен системный и детальный скан.'}</p></div></header>
          <button data-tutorial={selectedPlanet.id === store.tutorial.targetPlanetId ? 'detail-scan' : undefined} className="primary-button" disabled={!system.scanned || Boolean(store.busyAction)} onClick={() => void scanPlanet()}>{selectedPlanet.scanLevel && selectedPlanet.scanLevel >= 2 ? 'Обновить данные объекта' : 'Провести детальный скан'}</button>
          {report && <article className="v352-dossier-block"><span>ОТЧЁТ · ДОСТОВЕРНОСТЬ {Math.round(report.confidence)}%</span><p>{report.summary}</p></article>}
          {ecology && <article className="v352-dossier-block"><span>ЭКОСИСТЕМА · ЦИКЛ {formatInteger(ecology.cycle)}</span><dl><div><dt>Биомасса</dt><dd>{formatInteger(ecology.biomass)}</dd></div><div><dt>Разнообразие</dt><dd>{formatInteger(ecology.biodiversity)}</dd></div><div><dt>Стабильность</dt><dd>{formatInteger(ecology.climateStability)}</dd></div></dl><p>{ecology.biomes.slice(0, 4).map((entry) => entry.name).join(' · ')}</p></article>}
          <section className="v352-signal-list"><header><span>ТОЧКИ ИНТЕРЕСА</span><b>{planetPoints.length}</b></header>{planetPoints.length ? planetPoints.map((entry) => {
            const state = store.locationStates.find((location) => location.pointOfInterestId === entry.id);
            const surface = entry.access === 'surface';
            return <article key={entry.id}><div><span>{entry.type} · {entry.access}</span><b>{entry.name}</b><p>{entry.publicSummary}</p>{state && <small>визитов {state.visitCount} · данных {state.collectedEvidenceKeys.length}</small>}</div><button disabled={!surface && entry.status === 'resolved'} data-tutorial={entry.id === store.tutorial.targetPointOfInterestId ? 'open-expedition' : undefined} onClick={async () => {
              if (surface) {
                setPoint(entry);
                if (entry.id === store.tutorial.targetPointOfInterestId) void store.advanceTutorial(4);
              } else setNotice((await store.investigatePoint(entry.id)).message);
            }}>{surface ? 'Высадка' : 'Анализ'}</button></article>;
          }) : <p className="v352-empty">{selectedPlanet.scanLevel && selectedPlanet.scanLevel >= 2 ? 'Подтверждённых сигналов нет.' : 'Сначала проведи детальный скан.'}</p>}</section>
        </> : <div className="v352-empty"><b>Нет выбранного объекта</b><p>Выбери планету или орбитальную цель слева.</p></div>}
      </aside>
    </section>

    {system.scanned && (localHubs.length > 0 || systemCivilizations.length > 0) && <section className="v352-system-network">
      <header><span className="eyebrow">СВЯЗЬ И ПОСЕЛЕНИЯ</span><b>{localHubs.length + systemCivilizations.length}</b></header>
      <div>{systemCivilizations.map((civilization) => {
        const contact = store.civilizationContacts.find((entry) => entry.civilizationId === civilization.id);
        return <article key={civilization.id}><div><span>ЦИВИЛИЗАЦИЯ</span><b>{civilization.name}</b><small>{contactStageLabel(contact?.stage ?? 'unknown')} · язык {contact?.languageLevel ?? 0}/5</small></div><button onClick={async () => setNotice((await store.attemptFirstContact(civilization.id)).message)}>Выйти на связь</button></article>;
      })}{localHubs.map((hub) => <article key={hub.id}><div><span>{hub.kind.toUpperCase()}</span><b>{hub.name}</b><small>{hub.safety} · население {formatInteger(hub.population)}</small></div><button onClick={async () => setNotice((await store.dockAtHub(hub.id)).message)}>Стыковка</button></article>)}</div>
    </section>}
    {expedition}
  </main>;
}
