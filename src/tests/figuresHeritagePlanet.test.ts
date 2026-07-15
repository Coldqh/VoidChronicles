import { describe, expect, it } from 'vitest';
import type { Civilization, Galaxy } from '../game/types';
import type { SimulationContext } from '../simulation/context';
import { simulateCivilizationDevelopmentCycle } from '../simulation/development';
import {
  liveHistoricalFigures,
  liveInstitutions,
  simulateHistoricalFiguresCycle
} from '../simulation/figures';
import {
  liveArchives,
  liveArtifacts,
  liveRuins,
  simulateHeritageCycle
} from '../simulation/heritage';
import {
  planetaryImpacts,
  simulatePlanetaryConsequencesCycle
} from '../simulation/planetaryConsequences';
import type { PopulationGroupState, SettlementState, SimulationState } from '../simulation/types';

const stockpile = (value: number) => ({
  food: value,
  water: value,
  energy: value,
  medicine: value,
  parts: value,
  weapons: value,
  luxury: value,
  rareMaterials: value
});

function fixture(): {
  civilization: Civilization;
  context: SimulationContext;
  simulation: SimulationState;
} {
  const civilization: Civilization = {
    id: 'civ_legacy',
    name: 'Союз Лиры',
    speciesName: 'Лирийцы',
    status: 'living',
    techLevel: 8,
    ideology: 'научный федерализм',
    homeSystemId: 'sys_lyra',
    controlledSystems: ['sys_lyra'],
    foundedYear: -3_000,
    traits: ['adaptive'],
    era: 'interstellar',
    speciesProfile: {
      bodyPlan: 'двуногий',
      metabolism: 'углеродный',
      reproduction: 'половое',
      lifespan: 110,
      homeAdaptation: 'умеренный климат',
      unusualTrait: 'долгая память'
    },
    languages: [{ id: 'lang_lyra', name: 'Лирский', script: 'линейная запись', complexity: 70 }],
    religions: [{ id: 'rel_lyra', name: 'Путь Памяти', doctrine: 'хранение прошлого', taboos: [], sacredObjects: [] }],
    cultures: [{ id: 'culture_lyra', name: 'Лирская культура', values: ['знание', 'гармония с природой'], taboos: [], artForms: ['архивная музыка'], languageId: 'lang_lyra', religionIds: ['rel_lyra'] }],
    development: {
      civilizationId: 'civ_legacy',
      era: 'interstellar',
      eraStartedYear: -500,
      technology: {
        subsistence: 80,
        agriculture: 82,
        materials: 85,
        writing: 90,
        governance: 82,
        medicine: 86,
        navigation: 88,
        military: 75,
        industry: 84,
        energy: 88,
        computing: 86,
        biology: 82,
        spaceflight: 90,
        ftl: 75
      },
      population: 180_000,
      urbanization: 80,
      literacy: 92,
      industrialization: 84,
      energyUse: 80,
      ecologicalPressure: 30,
      stability: 70,
      innovation: 86,
      spaceAccess: 'ftl',
      regressionCount: 0,
      collapseRisk: 8,
      extinct: false
    }
  } as Civilization;

  const galaxy = {
    id: 'galaxy_legacy',
    seed: 'FIGURES-HERITAGE-PLANETS',
    createdAt: new Date(0).toISOString(),
    currentYear: 0,
    settings: {
      seed: 'FIGURES-HERITAGE-PLANETS',
      systemCount: 1,
      historyYears: 20_000,
      civilizationCount: 1,
      lifeFrequency: 1,
      anomalyFrequency: 0,
      difficulty: 'standard'
    },
    systems: [{
      id: 'sys_lyra',
      name: 'Лира',
      coordinates: { x: 0, y: 0 },
      starClass: 'G',
      starCount: 1,
      planets: [{
        id: 'planet_lyra',
        name: 'Лира-Прайм',
        type: 'jungle',
        orbit: 1,
        moons: 1,
        habitability: 85,
        danger: 'safe',
        hasLife: true,
        civilizationId: 'civ_legacy',
        pointsOfInterest: 2,
        scanned: true,
        scanLevel: 3,
        imageKey: 'jungle'
      }],
      neighbors: [],
      danger: 'safe',
      civilizationIds: ['civ_legacy'],
      known: true,
      visited: true,
      scanned: true,
      anomaly: false,
      region: 'core'
    }],
    civilizations: [civilization],
    figures: [{
      id: 'figure_archivist',
      name: 'Ира Лис',
      civilizationId: 'civ_legacy',
      role: 'ведущий учёный',
      bornYear: -62,
      importance: 85,
      achievements: ['создание планетарного архива']
    }],
    history: [],
    artifacts: [{
      id: 'artifact_memory_core',
      name: 'Ядро Памяти',
      kind: 'архивный кристалл',
      civilizationId: 'civ_legacy',
      createdYear: -400,
      creatorId: 'figure_archivist',
      ownerHistory: ['Союз Лиры'],
      value: 50_000,
      danger: 2,
      truth: 'подлинный архив',
      publicDescription: 'национальная реликвия',
      discovered: true
    }],
    deepTime: {
      version: 1,
      startYear: -20_000,
      endYear: 0,
      species: [],
      cultures: [{ id: 'culture_lyra', civilizationId: 'civ_legacy', name: 'Лирская культура', originYear: -3_000, status: 'living', values: ['знание', 'гармония с природой'], adaptation: 'лесные города' }],
      polities: [{
        id: 'polity_lyra',
        civilizationId: 'civ_legacy',
        name: 'Союз Лиры',
        form: 'stellar-state',
        status: 'active',
        formedYear: -900,
        capitalSystemId: 'sys_lyra',
        territorySystemIds: ['sys_lyra'],
        cultureIds: ['culture_lyra'],
        population: 180_000,
        stability: 70,
        legitimacy: 72,
        military: 68
      }],
      civilizations: {},
      transitions: [],
      events: [],
      historicalSettlements: [],
      wars: [],
      migrations: [],
      discoveries: [],
      ruins: [{
        id: 'ruin_old_lyra',
        settlementId: 'settlement_old_lyra',
        civilizationId: 'civ_legacy',
        systemId: 'sys_lyra',
        planetId: 'planet_lyra',
        createdYear: -1_100,
        cause: 'старый экологический кризис',
        integrity: 72,
        remains: ['архивные камеры'],
        artifactIds: ['artifact_memory_core']
      }],
      statistics: {
        generatedCivilizations: 1,
        livingCivilizations: 1,
        extinctCivilizations: 0,
        hiddenCivilizations: 0,
        preSpaceCivilizations: 0,
        spacefaringCivilizations: 1,
        transitions: 0,
        regressions: 0,
        events: 0
      }
    },
    startSystemId: 'sys_lyra'
  } as unknown as Galaxy;

  const settlement: SettlementState = {
    id: 'settlement_lyra',
    name: 'Город Памяти',
    kind: 'city',
    systemId: 'sys_lyra',
    planetId: 'planet_lyra',
    civilizationId: 'civ_legacy',
    ownerFactionId: 'faction_council',
    population: 180_000,
    infrastructure: 82,
    security: 70,
    unrest: 15,
    housing: 75,
    health: 80,
    production: { ...stockpile(35), energy: 90, parts: 65, rareMaterials: 55, food: 50, weapons: 28 },
    consumption: stockpile(8),
    stocks: stockpile(2_000),
    foundedHour: 0,
    abandoned: false,
    lastUpdatedHour: 0
  };
  const groups: Record<string, PopulationGroupState> = {
    workers: {
      id: 'workers',
      settlementId: settlement.id,
      civilizationId: 'civ_legacy',
      species: 'Лирийцы',
      culture: 'Лирская культура',
      socialClass: 'workers',
      profession: 'производство и обслуживание',
      population: 100_000,
      wealth: 45,
      health: 76,
      loyalty: 70,
      radicalization: 10,
      migrationDesire: 12
    },
    specialists: {
      id: 'specialists',
      settlementId: settlement.id,
      civilizationId: 'civ_legacy',
      species: 'Лирийцы',
      culture: 'Лирская культура',
      socialClass: 'specialists',
      profession: 'исследования и инженерия',
      population: 80_000,
      wealth: 68,
      health: 82,
      loyalty: 75,
      radicalization: 6,
      migrationDesire: 8
    }
  };

  const simulation: SimulationState = {
    version: 3,
    clock: { epochYear: 0, absoluteHour: 0 },
    systems: {
      sys_lyra: {
        systemId: 'sys_lyra',
        population: 180_000,
        prosperity: 75,
        security: 70,
        supply: 80,
        tradePressure: 20,
        migrationPressure: 15,
        lastUpdatedHour: 0
      }
    },
    civilizations: {
      civ_legacy: {
        civilizationId: 'civ_legacy',
        population: 180_000,
        stability: 70,
        economy: 76,
        military: 68,
        research: 84,
        cohesion: 72,
        expansionPressure: 30,
        alive: true,
        lastUpdatedHour: 0
      }
    },
    factions: {
      faction_council: {
        factionId: 'faction_council',
        wealth: 72,
        military: 65,
        research: 82,
        influence: 70,
        tension: 18,
        lastUpdatedHour: 0
      }
    },
    ecosystems: {
      planet_lyra: {
        planetId: 'planet_lyra',
        climateStability: 78,
        biomass: 1_000_000,
        biodiversity: 82,
        resilience: 74,
        contamination: 20,
        carryingCapacity: 2_000_000,
        resources: { biomass: 80, medicinal: 70, organics: 75, rareCompounds: 60 },
        biomes: [],
        species: [{ id: 'species_lyra', name: 'Лирский древень', biomeIds: [], trophicLevel: 'producer', abundance: 70, resilience: 70, mobility: 10, aggression: 0, toxicity: 5, traits: [], preyIds: [], predatorIds: [], status: 'stable' }],
        pathogens: [{ id: 'pathogen_lyra', name: 'Лирская лихорадка', hostSpeciesIds: ['species_lyra'], virulence: 30, spread: 35, lethality: 10, active: false }],
        extinctSpeciesIds: [],
        invasiveSpeciesIds: [],
        cycle: 0,
        lastUpdatedHour: 0
      }
    },
    settlements: { [settlement.id]: settlement },
    populationGroups: groups,
    tradeRoutes: {},
    scheduledEvents: [],
    events: [],
    nextSequence: 1,
    lastAdvanceReason: 'fixture'
  };

  const context: SimulationContext = {
    seed: galaxy.seed,
    galaxy,
    factions: [{
      id: 'faction_council',
      name: 'Совет Лиры',
      kind: 'government',
      civilizationId: 'civ_legacy',
      disposition: 'neutral',
      reputation: 20,
      wealth: 72,
      military: 65,
      research: 82,
      laws: [],
      allies: [],
      enemies: [],
      memories: []
    }],
    hubs: []
  };
  return { civilization, context, simulation };
}

describe('living figures institutions heritage and planetary consequences', () => {
  it('projects active historical figures and institutions', () => {
    const { context, simulation } = fixture();
    expect(liveHistoricalFigures(simulation, context).some((figure) => figure.id === 'figure_archivist')).toBe(true);
    expect(liveInstitutions(simulation, context).some((institution) => institution.kind === 'archive')).toBe(true);
  });

  it('persists figure and institution state snapshots', () => {
    const { civilization, context, simulation } = fixture();
    simulateHistoricalFiguresCycle(simulation, civilization, context, 400 * 24);
    expect(simulation.events.some((event) => event.tags.includes('living-figure-state'))).toBe(true);
    expect(simulation.events.some((event) => event.tags.includes('living-institution-state'))).toBe(true);
  });

  it('projects artifacts archives and ruins from real history', () => {
    const { context, simulation } = fixture();
    expect(liveArtifacts(simulation, context).some((artifact) => artifact.id === 'artifact_memory_core')).toBe(true);
    expect(liveArchives(simulation, context).length).toBeGreaterThan(0);
    expect(liveRuins(simulation, context).some((ruin) => ruin.id === 'ruin_old_lyra')).toBe(true);
  });

  it('persists heritage state without exposing service snapshots', () => {
    const { civilization, context, simulation } = fixture();
    simulateHeritageCycle(simulation, civilization, context, 500 * 24);
    expect(simulation.events.some((event) => event.tags.includes('living-artifact-state') && event.visibility === 'hidden')).toBe(true);
    expect(simulation.events.some((event) => event.tags.includes('living-archive-state') && event.visibility === 'hidden')).toBe(true);
    expect(simulation.events.some((event) => event.tags.includes('living-ruin-state') && event.visibility === 'hidden')).toBe(true);
  });

  it('applies civilization pressure directly to a planetary ecosystem', () => {
    const { civilization, context, simulation } = fixture();
    const before = simulation.ecosystems.planet_lyra!.contamination;
    const impacts = planetaryImpacts(simulation, context);
    expect(impacts[0]?.planetId).toBe('planet_lyra');
    simulatePlanetaryConsequencesCycle(simulation, civilization, context, 365 * 24);
    expect(simulation.ecosystems.planet_lyra!.contamination === before).toBe(false);
    expect(simulation.events.some((event) => event.tags.includes('planetary-consequence-state'))).toBe(true);
  });

  it('runs the integrated civilization cycle with all three layers enabled', () => {
    const { civilization, context, simulation } = fixture();
    let failed = false;
    try { simulateCivilizationDevelopmentCycle(simulation, civilization, context, 500 * 24); } catch { failed = true; }
    expect(failed).toBe(false);
    expect(simulation.events.some((event) => event.tags.includes('living-figure-state'))).toBe(true);
    expect(simulation.events.some((event) => event.tags.includes('living-artifact-state'))).toBe(true);
    expect(simulation.events.some((event) => event.tags.includes('planetary-consequence-state'))).toBe(true);
  });
});
