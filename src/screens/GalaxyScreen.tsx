import { useMemo, useRef, useState, type ReactNode } from 'react';
import { GalaxyCanvas, type GalaxyCanvasHandle } from '../components/GalaxyCanvas';
import type { GalacticRoutePlan, RoutePreference } from '../game/types';
import { useGameStore } from '../game/store';
import { useCompactLayout } from '../hooks/useCompactLayout';
import {
  buildGalacticGeography,
  planRouteOptions,
  routeBetween,
  routePreferenceLabels,
  routeVisuals
} from '../navigation/geography';
import { formatInteger } from '../ui/format';

const routeKindLabel = {
  standard: 'Обычный коридор',
  trade: 'Торговый путь',
  military: 'Военный маршрут',
  smuggler: 'Теневой коридор',
  ancient: 'Древний переход',
  quarantine: 'Карантинный путь'
} as const;

const routeKindIcon = {
  standard: '·',
  trade: '₡',
  military: '⚔',
  smuggler: '◐',
  ancient: '◇',
  quarantine: '⚠'
} as const;

function RoutePlanCard({
  plan,
  selected,
  onSelect,
  systemNames
}: {
  plan: GalacticRoutePlan;
  selected: boolean;
  onSelect(): void;
  systemNames: Map<string, string>;
}) {
  return <button className={`v34-route-option ${selected ? 'active' : ''}`} onClick={onSelect}>
    <header><b>{routePreferenceLabels[plan.preference]}</b><span>{plan.legs.length} прыж.</span></header>
    <div><span>Топливо <b>{formatInteger(plan.totalFuel)}</b></span><span>Время <b>{formatInteger(plan.totalHours)} ч</b></span><span>Риск <b>{formatInteger(plan.totalRisk)}</b></span></div>
    <small>{plan.systemIds.slice(1).map((id) => systemNames.get(id) ?? id).join(' → ')}</small>
  </button>;
}

export function GalaxyScreen({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const compact = useCompactLayout();
  const mapRef = useRef<GalaxyCanvasHandle | null>(null);
  const [notice, setNotice] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewPreference, setPreviewPreference] = useState<RoutePreference>('fast');

  const geography = useMemo(() => {
    if (!store.galaxy || !store.simulation) return null;
    return buildGalacticGeography({
      galaxy: store.galaxy,
      simulation: store.simulation,
      warFronts: store.warFronts,
      factions: store.factions,
      contacts: store.civilizationContacts
    });
  }, [store.galaxy, store.simulation, store.warFronts, store.factions, store.civilizationContacts]);

  if (!store.galaxy || !store.ship || !store.currentSystemId || !geography) return null;
  const current = store.galaxy.systems.find((system) => system.id === store.currentSystemId);
  const selected = store.galaxy.systems.find((system) => system.id === store.selectedSystemId) ?? current;
  if (!current || !selected) return null;

  const knownSystemIds = new Set(store.galaxy.systems.filter((system) => system.known).map((system) => system.id));
  const systemNames = new Map(store.galaxy.systems.map((system) => [system.id, system.name]));
  const routeOptions = selected.id === current.id ? [] : planRouteOptions({
    geography,
    fromSystemId: current.id,
    toSystemId: selected.id,
    jumpRange: store.ship.jumpRange,
    knownSystemIds,
    crewSize: store.crew.filter((member) => member.status === 'active').length,
    year: store.gameYear
  });
  const previewPlan = routeOptions.find((plan) => plan.preference === previewPreference) ?? routeOptions[0];
  const activePlan = store.navigation.activePlan?.status === 'active' ? store.navigation.activePlan : undefined;
  const nextLeg = activePlan?.legs[activePlan.currentLegIndex];
  const sector = geography.sectors.find((entry) => entry.systemIds.includes(selected.id));
  const controller = sector?.controllingCivilizationId
    ? store.galaxy.civilizations.find((entry) => entry.id === sector.controllingCivilizationId)
    : undefined;
  const direct = routeBetween(geography, current.id, selected.id);
  const currentVisualPlan = previewPlan ?? activePlan;
  const visuals = routeVisuals(geography, currentVisualPlan);
  const life = store.ship.life;
  const canSupport = !previewPlan || (
    store.ship.fuel >= previewPlan.totalFuel
    && (life?.supplies.food ?? 100) >= previewPlan.foodCost
    && (life?.supplies.oxygen ?? 100) >= previewPlan.oxygenCost
  );

  const selectSystem = (id: string) => {
    store.selectSystem(id);
    setSheetOpen(true);
    setNotice('');
  };
  const activatePlan = (plan: GalacticRoutePlan) => {
    store.setNavigationPlan(plan);
    setPreviewPreference(plan.preference);
    setNotice(`Маршрут сохранён: ${plan.legs.length} прыжков.`);
  };
  const travelNext = async () => {
    if (!nextLeg) return;
    const result = await store.travelTo(nextLeg.toSystemId);
    setNotice(result.message);
  };
  const travelDirect = async () => {
    if (!direct) return;
    const result = await store.travelTo(selected.id);
    setNotice(result.message);
  };

  const map = <GalaxyCanvas
    ref={mapRef}
    systems={store.galaxy.systems}
    currentSystemId={current.id}
    selectedSystemId={selected.id}
    jumpRange={store.ship.jumpRange}
    livingCivilizationIds={store.galaxy.civilizations.filter((civilization) => civilization.status === 'living').map((civilization) => civilization.id)}
    routeVisuals={visuals}
    onSelect={selectSystem}
  />;

  const selectedPanel = <>
    <header className="v34-route-header">
      <div><span className="eyebrow">{selected.id === current.id ? 'ТЕКУЩАЯ СИСТЕМА' : 'ЦЕЛЬ МАРШРУТА'}</span><h1>{selected.name}</h1></div>
      {compact && <button aria-label="Закрыть" onClick={() => setSheetOpen(false)}>×</button>}
    </header>
    <p className="v34-sector-name">{sector?.name ?? 'Сектор не определён'} · {sector?.contested ? 'оспаривается' : controller?.name ?? 'нейтральный контроль'}</p>
    <section className="v34-system-facts">
      <span>Регион <b>{selected.region}</b></span>
      <span>Угроза <b>{selected.danger}</b></span>
      <span>Маршрутов <b>{selected.neighbors.filter((id) => knownSystemIds.has(id)).length}</b></span>
      <span>Сигналов <b>{selected.scanned ? selected.civilizationIds.length : '?'}</b></span>
    </section>

    {selected.id === current.id ? <button className="primary-button" onClick={() => store.setScreen('system')}>Открыть систему</button> : <>
      {routeOptions.length ? <section className="v34-route-options">
        <h2>Варианты пути</h2>
        {routeOptions.map((plan) => <RoutePlanCard key={plan.id} plan={plan} selected={previewPlan?.id === plan.id} onSelect={() => setPreviewPreference(plan.preference)} systemNames={systemNames}/>) }
      </section> : <div className="v34-route-blocked"><b>Путь не найден</b><p>Известная сеть не даёт безопасного прохода в пределах дальности двигателя.</p></div>}

      {previewPlan && <article className="v34-route-summary">
        <header><span>{routePreferenceLabels[previewPlan.preference]}</span><b>{previewPlan.systemIds.length - 1} прыжков</b></header>
        <div className="v34-route-totals"><span>Топливо <b>{previewPlan.totalFuel}</b></span><span>Еда <b>{previewPlan.foodCost}</b></span><span>Кислород <b>{previewPlan.oxygenCost}</b></span><span>Время <b>{previewPlan.totalHours} ч</b></span></div>
        <ol>{previewPlan.legs.map((leg) => <li key={`${leg.fromSystemId}-${leg.toSystemId}`} className={`kind-${leg.kind}`}><i>{routeKindIcon[leg.kind]}</i><span><b>{routeKindLabel[leg.kind]}</b><small>{systemNames.get(leg.fromSystemId) ?? leg.fromSystemId} → {systemNames.get(leg.toSystemId) ?? leg.toSystemId} · риск {leg.risk} · топливо {leg.fuelCost}</small></span>{leg.access !== 'open' && <em>{leg.access}</em>}</li>)}</ol>
        {previewPlan.warnings.map((warning) => <p className="warning-text" key={warning}>{warning}</p>)}
        <button className="primary-button" disabled={!canSupport} onClick={() => activatePlan(previewPlan)}>{canSupport ? 'Проложить маршрут' : 'Недостаточно ресурсов на весь путь'}</button>
      </article>}

      {direct && direct.access !== 'blocked' && <button className="v34-direct-jump" disabled={store.ship.fuel < direct.fuelCost || Boolean(store.busyAction)} onClick={() => void travelDirect()}>Прямой прыжок · {direct.fuelCost} топлива · риск {direct.risk}</button>}
    </>}
  </>;

  const activeRouteBar = activePlan && nextLeg ? <section className="v34-active-route">
    <div><span className="eyebrow">АКТИВНЫЙ МАРШРУТ · {routePreferenceLabels[activePlan.preference]}</span><b>{current.name} → {systemNames.get(nextLeg.toSystemId) ?? nextLeg.toSystemId}</b><small>Этап {activePlan.currentLegIndex + 1}/{activePlan.legs.length} · {routeKindLabel[nextLeg.kind]} · риск {nextLeg.risk}</small></div>
    <div><button onClick={() => store.clearNavigationPlan()}>Отменить</button><button className="primary-button" disabled={store.ship.fuel < nextLeg.fuelCost || Boolean(store.busyAction)} onClick={() => void travelNext()}>Следующий прыжок · {nextLeg.fuelCost}</button></div>
  </section> : null;

  if (compact) return <div className="game-shell">{chrome}<main className="v34-galaxy v34-galaxy-mobile">
    <section className="v34-map">{map}</section>
    <div className="v34-map-controls"><button onClick={() => mapRef.current?.center()}>◎</button><button onClick={() => mapRef.current?.overview()}>▦</button><button onClick={() => mapRef.current?.zoomOut()}>−</button><button onClick={() => mapRef.current?.zoomIn()}>+</button></div>
    {activeRouteBar}
    {notice && <button className="mobile-toast" onClick={() => setNotice('')}>{notice}</button>}
    {sheetOpen && <><button className="mobile-window-scrim" aria-label="Закрыть маршрут" onClick={() => setSheetOpen(false)}/><aside className="v34-route-panel mobile">{selectedPanel}</aside></>}
  </main></div>;

  return <div className="game-shell">{chrome}<main className="v34-galaxy">
    <section className="v34-map">{map}{notice && <button className="notice" onClick={() => setNotice('')}>{notice}</button>}{activeRouteBar}</section>
    <aside className="v34-route-panel">{selectedPanel}</aside>
  </main></div>;
}
