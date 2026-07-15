import type { PlanetEcologyState } from '../ecology/types';

export type SimulationEventKind =
  | 'demography'
  | 'migration'
  | 'economy'
  | 'shortage'
  | 'conflict'
  | 'politics'
  | 'research'
  | 'discovery'
  | 'disaster'
  | 'ecology';

export type SimulationEventVisibility = 'public' | 'local' | 'hidden';
export type SimulationEntityType =
  | 'system'
  | 'planet'
  | 'civilization'
  | 'faction'
  | 'hub'
  | 'artifact'
  | 'ecosystem'
  | 'species'
  | 'settlement'
  | 'populationGroup'
  | 'tradeRoute';
export type KnowledgeSource = 'direct' | 'scan' | 'contact' | 'news' | 'archive' | 'rumor';

export type SettlementKind = 'city' | 'orbital' | 'mining' | 'research' | 'military' | 'trade' | 'illegal' | 'colony' | 'abandoned';
export type SettlementResource = 'food' | 'water' | 'energy' | 'medicine' | 'parts' | 'weapons' | 'luxury' | 'rareMaterials';
export type SettlementStockpile = Record<SettlementResource, number>;

export interface WorldClock {
  /** Hours elapsed since the player campaign began. */
  absoluteHour: number;
  /** Calendar year at campaign start. Kept separate from deep-history negative years. */
  epochYear: number;
}

export interface SimulationSystemState {
  systemId: string;
  population: number;
  prosperity: number;
  security: number;
  supply: number;
  tradePressure: number;
  migrationPressure: number;
  lastUpdatedHour: number;
}

export interface SimulationCivilizationState {
  civilizationId: string;
  population: number;
  stability: number;
  economy: number;
  military: number;
  research: number;
  cohesion: number;
  expansionPressure: number;
  alive: boolean;
  lastUpdatedHour: number;
}

export interface SimulationFactionState {
  factionId: string;
  wealth: number;
  military: number;
  research: number;
  influence: number;
  tension: number;
  lastUpdatedHour: number;
}

export interface SettlementState {
  id: string;
  name: string;
  kind: SettlementKind;
  systemId: string;
  planetId?: string;
  hubId?: string;
  civilizationId?: string;
  ownerFactionId?: string;
  population: number;
  infrastructure: number;
  security: number;
  unrest: number;
  housing: number;
  health: number;
  production: SettlementStockpile;
  consumption: SettlementStockpile;
  stocks: SettlementStockpile;
  foundedHour: number;
  abandoned: boolean;
  lastUpdatedHour: number;
}

export interface PopulationGroupState {
  id: string;
  settlementId: string;
  civilizationId?: string;
  species: string;
  culture: string;
  socialClass: 'workers' | 'specialists' | 'security' | 'elite' | 'migrants';
  profession: string;
  population: number;
  wealth: number;
  health: number;
  loyalty: number;
  radicalization: number;
  migrationDesire: number;
}

export interface TradeRouteState {
  id: string;
  originSettlementId: string;
  destinationSettlementId: string;
  pathSystemIds: string[];
  cargo: SettlementResource[];
  capacity: number;
  traffic: number;
  danger: number;
  disrupted: boolean;
  lastUpdatedHour: number;
}

export interface WorldEvent {
  id: string;
  atHour: number;
  kind: SimulationEventKind;
  title: string;
  summary: string;
  severity: number;
  visibility: SimulationEventVisibility;
  systemIds: string[];
  civilizationIds: string[];
  factionIds: string[];
  tags: string[];
  data?: Record<string, string | number | boolean>;
}

export type ScheduledEventKind =
  | 'civilization-cycle'
  | 'faction-cycle'
  | 'system-cycle'
  | 'war-cycle'
  | 'ecology-cycle'
  | 'settlement-cycle'
  | 'trade-cycle'
  | 'migration-cycle';

export interface ScheduledWorldEvent {
  id: string;
  kind: ScheduledEventKind;
  dueHour: number;
  repeatHours?: number;
  entityId?: string;
  seedKey: string;
}

export interface SimulationState {
  version: 3;
  clock: WorldClock;
  systems: Record<string, SimulationSystemState>;
  civilizations: Record<string, SimulationCivilizationState>;
  factions: Record<string, SimulationFactionState>;
  ecosystems: Record<string, PlanetEcologyState>;
  settlements: Record<string, SettlementState>;
  populationGroups: Record<string, PopulationGroupState>;
  tradeRoutes: Record<string, TradeRouteState>;
  scheduledEvents: ScheduledWorldEvent[];
  events: WorldEvent[];
  nextSequence: number;
  lastAdvanceReason: string;
}

export interface KnowledgeRecord {
  entityId: string;
  entityType: SimulationEntityType;
  confidence: number;
  discoveredAtHour: number;
  lastConfirmedAtHour: number;
  source: KnowledgeSource;
  knownFields: string[];
}

export interface PlayerKnowledgeState {
  version: 1;
  records: Record<string, KnowledgeRecord>;
}

export interface SimulationAdvanceResult {
  simulation: SimulationState;
  emittedEvents: WorldEvent[];
}

export type WorldEventDraft = Omit<WorldEvent, 'id' | 'atHour'>;
