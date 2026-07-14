import { describe, expect, it } from 'vitest';
import type { Captain, CrewMember, Ship } from '../game/types';
import { closeCurrentCaptain, createInitialLegacy } from '../world/legacy';
import { createShipSystems } from '../world/warfare';

const captain: Captain = {
  id: 'captain-one', name: 'Капитан Один', level: 4, xp: 200, health: 100, maxHealth: 100,
  credits: 1400, reputation: 12,
  skills: { research: 2, archaeology: 2, trade: 1, combat: 3, crime: 0 },
  injuries: [], alive: true, condition: 'active', commandIdentity: 'organic'
};

const ship: Ship = {
  id: 'ship-one', name: 'Странник', hull: 72, maxHull: 100, fuel: 60, maxFuel: 100,
  jumpRange: 230, cargoCapacity: 10, cargo: [], modules: [], statuses: [],
  systems: createShipSystems(), transponder: 'VOID-001', registration: 'REG-001'
};

const crew: CrewMember[] = [{
  id: 'crew-engineer', name: 'Мира Келл', species: 'человек', culture: 'пограничные колонии',
  primaryRole: 'engineer', level: 3, health: 84, maxHealth: 100, morale: 66, loyalty: 79,
  salary: 180, sharePercent: 4, contractYears: 8, joinedYear: 0, paidUntilYear: 2,
  traits: ['верная', 'бережливая'], belief: 'экипаж нельзя бросать', status: 'active', injuries: [], memories: []
}];

describe('ironman legacy', () => {
  it('creates the first captain record and command chronicle', () => {
    const legacy = createInitialLegacy(captain, ship, 0, 'sys-start');
    expect(legacy.mode).toBe('active');
    expect(legacy.captains).toHaveLength(1);
    expect(legacy.currentCaptainRecordId).toBe(legacy.captains[0]?.id);
    expect(legacy.chronicle[0]?.title).toBe('Начало командования');
  });

  it('ends the playable campaign when the captain dies', () => {
    const legacy = createInitialLegacy(captain, ship, 0, 'sys-start');
    const closed = closeCurrentCaptain(
      legacy, captain, ship, crew, 9, 'sys-loss', 'dead', 'Капитан погиб во время абордажа.',
      { systemsVisited: 6, discoveries: 13, battles: 4 }
    );
    expect(closed.mode).toBe('succession');
    expect(closed.campaignEnded).toBe(true);
    expect(closed.captains[0]?.fate).toBe('dead');
    expect(closed.captains[0]?.endedYear).toBe(9);
    expect(closed.successionCandidates).toEqual([]);
    expect(closed.continuityReason).toContain('погиб');
  });

  it('does not turn surviving crew or the ship into a successor', () => {
    const legacy = createInitialLegacy(captain, ship, 0, 'sys-start');
    const closed = closeCurrentCaptain(
      legacy, captain, ship, crew, 3, 'sys-loss', 'dead', 'Экспедиция уничтожена.',
      { systemsVisited: 2, discoveries: 1, battles: 1 }
    );
    expect(closed.successionCandidates).toHaveLength(0);
    expect(closed.campaignEnded).toBe(true);
  });
});
