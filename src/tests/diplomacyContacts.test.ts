import { describe, expect, it } from 'vitest';
import type { Civilization, CivilizationContact } from '../game/types';
import type { WorldEvent } from '../simulation/types';
import { availableDiplomaticActions, diplomaticProfile, diplomaticStanding, resolveDiplomaticOutcome } from '../diplomacy/model';

const civilization: Civilization = {
  id: 'civ-test', name: 'Союз Семи Рек', speciesName: 'ареи', status: 'living', techLevel: 7,
  ideology: 'торговая республика', homeSystemId: 'system-a', controlledSystems: ['system-a'],
  foundedYear: -5000, traits: [], outsiderPolicy: 'открытая торговля под наблюдением'
};
const contact: CivilizationContact = {
  civilizationId: civilization.id, stage: 'contacted', languageLevel: 3, trust: 25, attempts: 2,
  firstContactYear: 1, lastContactYear: 2, notes: []
};
const events: WorldEvent[] = [{
  id: 'event-diplomacy', atHour: 100, kind: 'politics', title: 'Торговое предложение', summary: 'Принято.',
  severity: 3, visibility: 'public', systemIds: ['system-a'], civilizationIds: [civilization.id], factionIds: [],
  tags: ['diplomacy', 'offer-trade', 'accepted'], data: {
    diplomaticAction: 'offer-trade', diplomaticOutcome: 'accepted', diplomaticTrustDelta: 8,
    diplomaticRespectDelta: 5, diplomaticSuspicionDelta: -3, diplomaticAgreement: 'trade'
  }
}];

describe('living civilization contacts', () => {
  it('rebuilds agreements and relationship dimensions from causal events', () => {
    const profile = diplomaticProfile(civilization, contact, events);
    expect(profile.agreements).toContain('trade');
    expect(profile.respect).toBe(5);
    expect(profile.messages[0]?.action).toBe('offer-trade');
    expect(diplomaticStanding(profile)).toBe('рабочее');
  });

  it('unlocks actions gradually instead of exposing everything immediately', () => {
    const profile = diplomaticProfile(civilization, contact, events);
    const actions = availableDiplomaticActions(profile, { hasHeritage: false, hasSettlement: true, hasCrisis: true, hasTradeAgreement: true, hasLandingAccess: false });
    expect(actions.find((entry) => entry.id === 'send-aid')?.available).toBe(true);
    expect(actions.find((entry) => entry.id === 'return-heritage')?.available).toBe(false);
    expect(actions.find((entry) => entry.id === 'mediate-crisis')?.available).toBe(false);
  });

  it('uses culture and relationship state when resolving a proposal', () => {
    const profile = diplomaticProfile(civilization, { ...contact, trust: 65 }, events);
    expect(resolveDiplomaticOutcome('offer-trade', profile, civilization, 0.2, 0.14)).toBe('accepted');
    const isolationist = { ...civilization, ideology: 'изоляционистская военная директория', outsiderPolicy: 'изоляция до проверки намерений' };
    expect(resolveDiplomaticOutcome('mediate-crisis', { ...profile, trust: -20, suspicion: 70 }, isolationist, 0.85, 0)).toBe('rejected');
  });
});
