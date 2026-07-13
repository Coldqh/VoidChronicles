import { describe, expect, it } from 'vitest';
import type { Captain, CrewMember, Ship } from '../game/types';
import {
  buildSuccessionCandidates,
  captainFromAI,
  captainFromCrew,
  closeCurrentCaptain,
  createInitialLegacy
} from '../world/legacy';
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
  systems: createShipSystems(), transponder: 'VOID-001', registration: 'REG-001',
  aiCore: { id: 'ai-one', name: 'МНЕМОЗИНА', personality: 'наблюдательная', directives: ['сохранить архив'], integrity: 88, operational: true, journal: [] }
};

const crew: CrewMember[] = [{
  id: 'crew-engineer', name: 'Мира Келл', species: 'человек', culture: 'пограничные колонии',
  primaryRole: 'engineer', level: 3, health: 84, maxHealth: 100, morale: 66, loyalty: 79,
  salary: 180, sharePercent: 4, contractYears: 8, joinedYear: 0, paidUntilYear: 2,
  traits: ['верная', 'бережливая'], belief: 'экипаж нельзя бросать', status: 'active', injuries: [], memories: []
}];

describe('legacy and continuity', () => {
  it('creates the first captain record and command chronicle', () => {
    const legacy = createInitialLegacy(captain, ship, 0, 'sys-start');
    expect(legacy.mode).toBe('active');
    expect(legacy.captains).toHaveLength(1);
    expect(legacy.currentCaptainRecordId).toBe(legacy.captains[0]?.id);
    expect(legacy.chronicle[0]?.title).toBe('Начало командования');
  });

  it('offers living crew and the operational ship AI as successors', () => {
    const candidates = buildSuccessionCandidates(crew, ship);
    expect(candidates.some((entry) => entry.source === 'crew' && entry.sourceId === 'crew-engineer')).toBe(true);
    expect(candidates.some((entry) => entry.source === 'ai' && entry.sourceId === 'ai-one')).toBe(true);
  });

  it('closes the old command and enters succession mode', () => {
    const legacy = createInitialLegacy(captain, ship, 0, 'sys-start');
    const closed = closeCurrentCaptain(
      legacy, captain, ship, crew, 9, 'sys-loss', 'dead', 'Капитан погиб во время абордажа.',
      { systemsVisited: 6, discoveries: 13, battles: 4 }
    );
    expect(closed.mode).toBe('succession');
    expect(closed.captains[0]?.fate).toBe('dead');
    expect(closed.captains[0]?.endedYear).toBe(9);
    expect(closed.successionCandidates).toHaveLength(2);
  });

  it('promotes a crew member without copying the old personal reputation completely', () => {
    const successor = captainFromCrew(crew[0]!, captain);
    expect(successor.id).toBe('crew-engineer');
    expect(successor.commandIdentity).toBe('organic');
    expect(successor.skills.research).toBeGreaterThan(1);
    expect(successor.reputation).toBeLessThan(captain.reputation);
  });

  it('allows the ship AI to continue when no organic captain remains', () => {
    const successor = captainFromAI(ship, captain);
    expect(successor.id).toBe('ai-one');
    expect(successor.commandIdentity).toBe('shipAI');
    expect(successor.health).toBe(88);
    expect(successor.credits).toBe(captain.credits);
  });
});
