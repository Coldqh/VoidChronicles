import { describe, expect, it } from 'vitest';
import type { CivilizationContact, Galaxy } from '../game/types';
import type { SimulationContext } from '../simulation/context';
import {
  buildKnownChronicle,
  compareKnownChroniclePeriods,
  traceKnownCausalChain
} from '../simulation/chronicle';
import {
  civilizationIntelligence,
  eventIntelligence,
  intelligenceAtLeast,
  intelligenceFor
} from '../simulation/intelligence';
import type { PlayerKnowledgeState, SimulationState, WorldEvent } from '../simulation/types';

const emptyKnowledge = (): PlayerKnowledgeState => ({ version: 1, records: {} });

function fixture(): { state: SimulationState; context: SimulationContext; publicEvent: WorldEvent; hiddenEvent: WorldEvent } {
  const galaxy = {
    id: 'galaxy_intel', seed: 'INTEL', createdAt: new Date(0).toISOString(), currentYear: 0,
    settings: { seed: 'INTEL', systemCount: 1, historyYears: 1000, civilizationCount: 1, lifeFrequency: 1, anomalyFrequency: 0, difficulty: 'standard' },
    systems: [{ id: 'sys', name: 'Система', coordinates: { x: 0, y: 0 }, starClass: 'G', starCount: 1, planets: [], neighbors: [], danger: 'caution', factionId: 'fac', civilizationIds: ['civ'], known: false, visited: false, scanned: false, anomaly: false, region: 'core' }],
    civilizations: [{ id: 'civ', name: 'Союз', speciesName: 'Люди', status: 'living', techLevel: 5, ideology: 'совет', homeSystemId: 'sys', controlledSystems: ['sys'], foundedYear: -1000, traits: [] }],
    figures: [],
    history: [{ id: 'foundation', year: -500, title: 'Основание Союза', summary: 'Города объединились.', civilizationIds: ['civ'], systemIds: ['sys'], figureIds: [], consequences: ['создано государство'] }],
    artifacts: [], startSystemId: 'sys'
  } as unknown as Galaxy;
  const cause: WorldEvent = { id: 'cause', atHour: 10, kind: 'politics', title: 'Раскол', summary: 'Совет потерял 40 процентов поддержки.', severity: 6, visibility: 'public', systemIds: ['sys'], civilizationIds: ['civ'], factionIds: ['fac'], tags: ['politics'], data: { resultedInEventIds: 'public' } };
  const publicEvent: WorldEvent = { id: 'public', atHour: 20, kind: 'conflict', title: 'Война Союза', summary: 'Погибли 12000 жителей.', severity: 8, visibility: 'public', systemIds: ['sys'], civilizationIds: ['civ'], factionIds: ['fac'], tags: ['war'], data: { causedByEventIds: 'cause', casualties: 12000 } };
  const hiddenEvent: WorldEvent = { id: 'hidden', atHour: 30, kind: 'politics', title: 'Тайный переворот', summary: 'Заговорщики сменили правительство.', severity: 8, visibility: 'hidden', systemIds: ['sys'], civilizationIds: ['civ'], factionIds: ['fac'], tags: ['politics'] };
  const state: SimulationState = {
    version: 3, clock: { absoluteHour: 100, epochYear: 0 }, systems: {}, civilizations: {}, factions: {}, ecosystems: {}, settlements: {}, populationGroups: {}, tradeRoutes: {}, scheduledEvents: [], events: [hiddenEvent, publicEvent, cause], nextSequence: 4, lastAdvanceReason: 'test'
  };
  return { state, context: { seed: galaxy.seed, galaxy, factions: [], hubs: [] }, publicEvent, hiddenEvent };
}

function recordKnowledge(confidence: number, fields: string[], source: 'scan' | 'direct' | 'archive' = 'scan'): PlayerKnowledgeState {
  return { version: 1, records: { sys: { entityId: 'sys', entityType: 'system', confidence, discoveredAtHour: 0, lastConfirmedAtHour: 100, source, knownFields: fields } } };
}

const noContacts: CivilizationContact[] = [];

describe('progressive world legibility', () => {
  it('does not expose public or deep-history events without knowledge', () => {
    const { state, context } = fixture();
    const records = buildKnownChronicle(state, context, { knowledge: emptyKnowledge(), contacts: noContacts, currentHour: 100 }, { minimumIntelligence: 'rumor' });
    expect(records.length).toBe(0);
  });

  it('shows only a redacted rumor after a weak signal', () => {
    const { state, context } = fixture();
    const records = buildKnownChronicle(state, context, { knowledge: recordKnowledge(42, ['identity']), contacts: noContacts, currentHour: 100 }, { minimumIntelligence: 'rumor' });
    const war = records.find((entry) => entry.id === 'public');
    expect(war).toBeDefined();
    expect(war?.intelligenceLevel).toBe('rumor');
    expect(war?.title).toContain('Непроверенные сведения');
    expect(war?.summary).toContain('обрывочный сигнал');
  });

  it('reveals narrative but redacts exact figures after observation', () => {
    const { state, context } = fixture();
    const records = buildKnownChronicle(state, context, { knowledge: recordKnowledge(65, ['identity', 'events']), contacts: noContacts, currentHour: 100 }, { minimumIntelligence: 'observed' });
    const war = records.find((entry) => entry.id === 'public');
    expect(war).toBeDefined();
    expect(war?.title).toBe('Война Союза');
    expect(war?.summary).toContain('неуточнённое значение');
    expect(war?.causedByEventIds.length).toBe(0);
  });

  it('reveals full causal links only with verified access', () => {
    const { state, context } = fixture();
    const knowledge = recordKnowledge(96, ['identity', 'events', 'history', 'visited'], 'direct');
    const records = buildKnownChronicle(state, context, { knowledge, contacts: noContacts, currentHour: 100 }, { minimumIntelligence: 'observed' });
    const war = records.find((entry) => entry.id === 'public');
    expect(war?.intelligenceLevel).toBe('verified');
    expect(war?.causedByEventIds).toContain('cause');
    const chain = traceKnownCausalChain(state, 'public', { knowledge, contacts: noContacts, currentHour: 100 }, 'observed');
    expect(chain.map((entry) => entry.id)).toContain('cause');
  });

  it('keeps hidden events secret without verified access', () => {
    const { state, hiddenEvent } = fixture();
    const observed = eventIntelligence(hiddenEvent, recordKnowledge(80, ['identity', 'events']), noContacts, 100);
    expect(observed.level).toBe('unknown');
    const verified = eventIntelligence(hiddenEvent, recordKnowledge(98, ['identity', 'events', 'visited'], 'direct'), noContacts, 100);
    expect(verified.level).toBe('verified');
  });

  it('opens civilization fields gradually through contact stages', () => {
    const knowledge = emptyKnowledge();
    const signals = civilizationIntelligence(knowledge, { civilizationId: 'civ', stage: 'signals', languageLevel: 0, trust: 0, attempts: 1, notes: [] }, 'civ', 0);
    const contacted = civilizationIntelligence(knowledge, { civilizationId: 'civ', stage: 'contacted', languageLevel: 60, trust: 20, attempts: 2, notes: [] }, 'civ', 0);
    const trusted = civilizationIntelligence(knowledge, { civilizationId: 'civ', stage: 'trusted', languageLevel: 100, trust: 80, attempts: 3, notes: [] }, 'civ', 0);
    expect(signals.knownFields).toContain('signals');
    expect(signals.knownFields.includes('politics')).toBe(false);
    expect(contacted.knownFields).toContain('politics');
    expect(contacted.knownFields.includes('military')).toBe(false);
    expect(trusted.knownFields).toContain('military');
  });

  it('degrades stale operational intelligence', () => {
    const knowledge: PlayerKnowledgeState = { version: 1, records: { sys: { entityId: 'sys', entityType: 'system', confidence: 96, discoveredAtHour: 0, lastConfirmedAtHour: 0, source: 'scan', knownFields: ['identity', 'events'] } } };
    const fresh = intelligenceFor(knowledge, 'system', 'sys', 0);
    const stale = intelligenceFor(knowledge, 'system', 'sys', 60 * 365 * 24);
    expect(intelligenceAtLeast(fresh, 'verified')).toBe(true);
    expect(intelligenceAtLeast(stale, 'verified')).toBe(false);
  });

  it('period comparison counts only accessible events', () => {
    const { state, context } = fixture();
    const unknown = compareKnownChroniclePeriods(state, context, { knowledge: emptyKnowledge(), contacts: noContacts, currentHour: 100 }, -1000, 10, 'rumor');
    expect(unknown.events).toBe(0);
    const known = compareKnownChroniclePeriods(state, context, { knowledge: recordKnowledge(96, ['identity', 'events', 'history', 'visited'], 'direct'), contacts: noContacts, currentHour: 100 }, -1000, 10, 'observed');
    expect(known.events).toBeGreaterThan(0);
  });
});
