import type { Civilization } from '../game/types';
import { createRng } from '../generation/rng';
import type { PlanetEcologyState } from '../ecology/types';
import type { SimulationContext } from './context';
import { cultureSummaryForCivilization } from './culture';
import { economyForCivilization } from './economy';
import type { SimulationState, WorldEvent, WorldEventDraft } from './types';
import { liveWars } from './war';

const HOURS_PER_YEAR = 365 * 24;
const STATE_TAG = 'planetary-consequence-state';
const SEP = '|';

export interface CivilizationPlanetImpactState {
  id: string;
  planetId: string;
  civilizationIds: string[];
  settlementIds: string[];
  population: number;
  industrialPressure: number;
  agriculturalPressure: number;
  extractionPressure: number;
  militaryPressure: number;
  conservation: number;
  terraforming: number;
  invasiveRisk: number;
  diseaseSpillover: number;
  netPressure: number;
  lastUpdatedHour: number;
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function split(value: unknown): string[] {
  return typeof value === 'string'
    ? [...new Set(value.split(SEP).map((entry) => entry.trim()).filter(Boolean))]
    : [];
}

function join(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(SEP);
}

function impactFromEvent(event: WorldEvent): CivilizationPlanetImpactState | undefined {
  const planetId = stringValue(event.data?.impactPlanetId);
  if (!planetId) return undefined;
  return {
    id: `planet-impact_${planetId}`,
    planetId,
    civilizationIds: split(event.data?.impactCivilizationIds),
    settlementIds: split(event.data?.impactSettlementIds),
    population: Math.max(0, Math.round(numberValue(event.data?.impactPopulation, 0))),
    industrialPressure: clamp(numberValue(event.data?.impactIndustry, 0)),
    agriculturalPressure: clamp(numberValue(event.data?.impactAgriculture, 0)),
    extractionPressure: clamp(numberValue(event.data?.impactExtraction, 0)),
    militaryPressure: clamp(numberValue(event.data?.impactMilitary, 0)),
    conservation: clamp(numberValue(event.data?.impactConservation, 0)),
    terraforming: clamp(numberValue(event.data?.impactTerraforming, 0)),
    invasiveRisk: clamp(numberValue(event.data?.impactInvasiveRisk, 0)),
    diseaseSpillover: clamp(numberValue(event.data?.impactDiseaseSpillover, 0)),
    netPressure: clamp(numberValue(event.data?.impactNetPressure, 0)),
    lastUpdatedHour: numberValue(event.data?.impactUpdatedHour, event.atHour)
  };
}

function deriveImpact(
  state: SimulationState,
  context: SimulationContext,
  planetId: string
): CivilizationPlanetImpactState | undefined {
  const settlements = Object.values(state.settlements).filter(
    (settlement) => settlement.planetId === planetId && !settlement.abandoned
  );
  if (!settlements.length) return undefined;
  const civilizationIds = [...new Set(
    settlements.map((settlement) => settlement.civilizationId).filter((id): id is string => Boolean(id))
  )];
  const population = settlements.reduce((sum, settlement) => sum + settlement.population, 0);
  const infrastructure = settlements.reduce((sum, settlement) => sum + settlement.infrastructure, 0) / settlements.length;
  const production = (resource: 'food' | 'energy' | 'parts' | 'rareMaterials' | 'weapons') =>
    settlements.reduce((sum, settlement) => sum + settlement.production[resource], 0);
  const economies = civilizationIds
    .map((id) => economyForCivilization(state, context, id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const industrialCapacity = economies.length
    ? economies.reduce((sum, economy) => sum + economy.industrialCapacity, 0) / economies.length
    : infrastructure;
  const warSystems = new Set(
    liveWars(state)
      .filter((war) => war.status === 'active')
      .flatMap((war) => war.fronts.map((front) => front.systemId))
  );
  const systemId = settlements[0]!.systemId;
  const militaryPressure = clamp(
    (warSystems.has(systemId) ? 55 : 0) + production('weapons') * 0.08
  );
  const culturalConservation = civilizationIds.reduce((sum, civilizationId) => {
    const summary = cultureSummaryForCivilization(state, context, civilizationId);
    const values = summary.dominantCulture?.values.map((value) => value.toLowerCase()) ?? [];
    return sum + (values.some((value) => value.includes('прир') || value.includes('гармон')) ? 65 : 25);
  }, 0) / Math.max(1, civilizationIds.length);
  const advanced = civilizationIds.reduce((sum, id) => {
    const civilization = context.galaxy.civilizations.find((entry) => entry.id === id);
    const era = civilization?.era ?? civilization?.development?.era;
    return sum + (era === 'advanced' ? 90 : era === 'interstellar' ? 70 : era === 'interplanetary' ? 45 : 10);
  }, 0) / Math.max(1, civilizationIds.length);
  const routes = Object.values(state.tradeRoutes).filter((route) => {
    const origin = state.settlements[route.originSettlementId];
    const destination = state.settlements[route.destinationSettlementId];
    return origin?.planetId === planetId || destination?.planetId === planetId;
  });
  const invasiveRisk = clamp(routes.reduce((sum, route) => sum + route.traffic * (route.disrupted ? 0.4 : 0.7), 0) / Math.max(1, routes.length));
  const industrialPressure = clamp(industrialCapacity * 0.55 + infrastructure * 0.25 + production('energy') * 0.08);
  const agriculturalPressure = clamp(production('food') * 0.22 + population / 200_000);
  const extractionPressure = clamp(production('rareMaterials') * 0.26 + production('parts') * 0.08);
  const conservation = clamp(culturalConservation * 0.55 + advanced * 0.25 + (100 - militaryPressure) * 0.1);
  const terraforming = clamp(advanced * 0.7 + industrialCapacity * 0.2 - militaryPressure * 0.15);
  const diseaseSpillover = clamp(population / 120_000 + invasiveRisk * 0.45 + agriculturalPressure * 0.25);
  const netPressure = clamp(
    industrialPressure * 0.34 +
    agriculturalPressure * 0.2 +
    extractionPressure * 0.2 +
    militaryPressure * 0.22 +
    invasiveRisk * 0.12 +
    diseaseSpillover * 0.1 -
    conservation * 0.28 -
    terraforming * 0.08
  );
  return {
    id: `planet-impact_${planetId}`,
    planetId,
    civilizationIds,
    settlementIds: settlements.map((settlement) => settlement.id),
    population,
    industrialPressure,
    agriculturalPressure,
    extractionPressure,
    militaryPressure,
    conservation,
    terraforming,
    invasiveRisk,
    diseaseSpillover,
    netPressure,
    lastUpdatedHour: state.clock.absoluteHour
  };
}

export function planetaryImpacts(
  state: SimulationState,
  context: SimulationContext
): CivilizationPlanetImpactState[] {
  const byPlanet = new Map<string, CivilizationPlanetImpactState>();
  for (const planetId of Object.keys(state.ecosystems)) {
    const derived = deriveImpact(state, context, planetId);
    if (derived) byPlanet.set(planetId, derived);
  }
  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(STATE_TAG)) continue;
    const projected = impactFromEvent(event);
    if (projected) byPlanet.set(projected.planetId, projected);
  }
  return [...byPlanet.values()].sort((a, b) => b.netPressure - a.netPressure);
}

function writeImpactSnapshot(
  state: SimulationState,
  impact: CivilizationPlanetImpactState,
  systemId: string,
  atHour: number
): void {
  const event: WorldEvent = {
    id: `state_planet_impact_${impact.planetId}`,
    atHour,
    kind: 'ecology',
    title: 'Антропогенная нагрузка',
    summary: 'Служебный снимок влияния цивилизаций на планету.',
    severity: 0,
    visibility: 'hidden',
    systemIds: [systemId],
    civilizationIds: impact.civilizationIds,
    factionIds: [],
    tags: ['simulation', 'living-history', STATE_TAG, 'state-snapshot'],
    data: {
      impactPlanetId: impact.planetId,
      impactCivilizationIds: join(impact.civilizationIds),
      impactSettlementIds: join(impact.settlementIds),
      impactPopulation: impact.population,
      impactIndustry: impact.industrialPressure,
      impactAgriculture: impact.agriculturalPressure,
      impactExtraction: impact.extractionPressure,
      impactMilitary: impact.militaryPressure,
      impactConservation: impact.conservation,
      impactTerraforming: impact.terraforming,
      impactInvasiveRisk: impact.invasiveRisk,
      impactDiseaseSpillover: impact.diseaseSpillover,
      impactNetPressure: impact.netPressure,
      impactUpdatedHour: atHour
    }
  };
  state.events = [event, ...state.events.filter(
    (entry) => !(entry.tags.includes(STATE_TAG) && entry.data?.impactPlanetId === impact.planetId)
  )].slice(0, 8_500);
}

function applyImpact(
  ecology: PlanetEcologyState,
  impact: CivilizationPlanetImpactState,
  rng: ReturnType<typeof createRng>,
  atHour: number
): PlanetEcologyState {
  const contaminationDelta =
    impact.industrialPressure * 0.025 +
    impact.extractionPressure * 0.018 +
    impact.militaryPressure * 0.028 -
    impact.conservation * 0.02 -
    impact.terraforming * 0.012;
  const biomassDelta =
    impact.terraforming * 0.035 +
    impact.conservation * 0.025 -
    impact.agriculturalPressure * 0.025 -
    impact.militaryPressure * 0.02 -
    impact.extractionPressure * 0.014;
  const biodiversityDelta =
    impact.conservation * 0.018 -
    impact.invasiveRisk * 0.022 -
    impact.diseaseSpillover * 0.012 -
    impact.netPressure * 0.01;
  const climateDelta =
    impact.terraforming * 0.028 +
    impact.conservation * 0.012 -
    impact.industrialPressure * 0.018 -
    impact.militaryPressure * 0.012;
  const invasiveSpeciesIds = [...ecology.invasiveSpeciesIds];
  if (impact.invasiveRisk >= 65 && ecology.species.length && rng.chance(0.25)) {
    const candidate = ecology.species.find((species) => !invasiveSpeciesIds.includes(species.id));
    if (candidate) invasiveSpeciesIds.push(candidate.id);
  }
  const pathogens = ecology.pathogens.map((pathogen, index) => ({
    ...pathogen,
    active: pathogen.active || (impact.diseaseSpillover >= 70 && index === 0 && rng.chance(0.3))
  }));
  return {
    ...ecology,
    contamination: clamp(ecology.contamination + contaminationDelta),
    biomass: Math.max(0, ecology.biomass * (1 + biomassDelta / 1_000)),
    biodiversity: clamp(ecology.biodiversity + biodiversityDelta),
    resilience: clamp(ecology.resilience + impact.conservation * 0.01 - impact.netPressure * 0.012),
    climateStability: clamp(ecology.climateStability + climateDelta),
    carryingCapacity: Math.max(
      0,
      ecology.carryingCapacity * (1 + (impact.terraforming - impact.netPressure) / 5_000)
    ),
    resources: {
      biomass: Math.max(0, ecology.resources.biomass * (1 - impact.agriculturalPressure / 8_000)),
      medicinal: Math.max(0, ecology.resources.medicinal * (1 - impact.netPressure / 10_000)),
      organics: Math.max(0, ecology.resources.organics * (1 - impact.extractionPressure / 7_000)),
      rareCompounds: Math.max(0, ecology.resources.rareCompounds * (1 - impact.extractionPressure / 5_000))
    },
    invasiveSpeciesIds,
    pathogens,
    lastUpdatedHour: atHour
  };
}

function recentEvent(state: SimulationState, civilizationId: string, tag: string, atHour: number, years: number): boolean {
  return state.events.some((event) =>
    event.visibility !== 'hidden' &&
    event.civilizationIds.includes(civilizationId) &&
    event.tags.includes(tag) &&
    atHour - event.atHour < years * HOURS_PER_YEAR
  );
}

export function simulatePlanetaryConsequencesCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const impacts = planetaryImpacts(state, context).filter(
    (impact) => impact.civilizationIds.includes(civilization.id)
  );
  if (!impacts.length) return null;
  const relevantLastUpdate = Math.max(...impacts.map((impact) => impact.lastUpdatedHour));
  if (atHour - relevantLastUpdate < 180 * 24) return null;
  const rng = createRng(`${context.seed}:planet-impact:${civilization.id}:${Math.floor(atHour / HOURS_PER_YEAR)}`);
  const updated: Array<{ impact: CivilizationPlanetImpactState; ecology: PlanetEcologyState; systemId: string }> = [];

  for (const current of impacts) {
    const fresh = deriveImpact(state, context, current.planetId) ?? current;
    const impact = { ...fresh, lastUpdatedHour: atHour };
    const ecology = state.ecosystems[impact.planetId];
    const system = context.galaxy.systems.find((entry) =>
      entry.planets.some((planet) => planet.id === impact.planetId)
    );
    if (!ecology || !system) continue;
    const nextEcology = applyImpact(ecology, impact, rng, atHour);
    state.ecosystems[impact.planetId] = nextEcology;
    writeImpactSnapshot(state, impact, system.id, atHour);
    updated.push({ impact, ecology: nextEcology, systemId: system.id });
  }

  const collapse = updated.sort((a, b) => b.impact.netPressure - a.impact.netPressure)[0];
  if (
    collapse &&
    (collapse.impact.netPressure >= 72 || collapse.ecology.contamination >= 78) &&
    !recentEvent(state, civilization.id, 'civilization-ecological-crisis', atHour, 2)
  ) {
    return {
      kind: 'ecology',
      title: `${civilization.name}: экологический кризис`,
      summary: `Промышленная, военная и ресурсная нагрузка достигла ${Math.round(collapse.impact.netPressure)}/100. Загрязнение планеты ${Math.round(collapse.ecology.contamination)}/100.`,
      severity: 8,
      visibility: 'public',
      systemIds: [collapse.systemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'planetary-consequences', 'civilization-ecological-crisis'],
      data: {
        planetId: collapse.impact.planetId,
        netPressure: collapse.impact.netPressure,
        contamination: collapse.ecology.contamination,
        biodiversity: collapse.ecology.biodiversity
      }
    };
  }

  const invasive = updated.find((entry) =>
    entry.impact.invasiveRisk >= 65 && entry.ecology.invasiveSpeciesIds.length > 0
  );
  if (invasive && !recentEvent(state, civilization.id, 'invasive-species-spread', atHour, 3)) {
    return {
      kind: 'ecology',
      title: `${civilization.name}: распространение инвазивного вида`,
      summary: 'Торговые и миграционные маршруты перенесли организм за пределы его устойчивой экологической ниши. Местная пищевая сеть начала меняться.',
      severity: 6,
      visibility: 'local',
      systemIds: [invasive.systemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'planetary-consequences', 'invasive-species-spread'],
      data: { planetId: invasive.impact.planetId, invasiveRisk: invasive.impact.invasiveRisk }
    };
  }

  const restored = updated.find((entry) =>
    entry.impact.terraforming >= 65 &&
    entry.impact.conservation >= 55 &&
    entry.impact.netPressure <= 35
  );
  if (restored && !recentEvent(state, civilization.id, 'planetary-restoration', atHour, 4)) {
    return {
      kind: 'ecology',
      title: `${civilization.name}: восстановление планеты`,
      summary: `Терраформирование и охрана среды снизили давление до ${Math.round(restored.impact.netPressure)}/100. Климатическая стабильность выросла до ${Math.round(restored.ecology.climateStability)}/100.`,
      severity: 6,
      visibility: 'public',
      systemIds: [restored.systemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'planetary-consequences', 'planetary-restoration'],
      data: {
        planetId: restored.impact.planetId,
        terraforming: restored.impact.terraforming,
        conservation: restored.impact.conservation
      }
    };
  }
  return null;
}
