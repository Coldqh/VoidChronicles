import commandSource from '../screens/CommandDeckV35.tsx?raw';
import journalSource from '../screens/CaptainJournalV36.tsx?raw';
import tutorialSource from '../components/TutorialOverlay.tsx?raw';
import journeySource from '../journey/captainJourney.ts?raw';
import versionSource from '../version.ts?raw';
import { buildCaptainJourney } from '../journey/captainJourney';
import { describe, expect, it } from 'vitest';

const baseInput = {
  tutorial: { enabled: true, active: true, currentStep: 0, completed: false },
  captain: {
    id: 'captain', name: 'Captain', level: 1, xp: 0, health: 100, maxHealth: 100, credits: 1000,
    reputation: 0, skills: { research: 1, archaeology: 1, trade: 1, combat: 1, crime: 0 },
    injuries: [], alive: true, condition: 'active', commandIdentity: 'organic',
    career: { renown: {}, titles: [], completedOperations: 0 }
  },
  ship: {
    id: 'ship', name: 'Ship', hull: 100, maxHull: 100, fuel: 100, maxFuel: 100, jumpRange: 100,
    cargoCapacity: 10, cargo: [], modules: [], statuses: [], systems: [], transponder: 'T', registration: 'R'
  },
  currentSystem: {
    id: 'system', name: 'Предел-7', coordinates: { x: 0, y: 0 }, starClass: 'K', starCount: 1,
    planets: [], neighbors: [], danger: 'safe', civilizationIds: [], known: true, visited: true,
    scanned: false, anomaly: false, region: 'core'
  },
  storyScenes: [],
  objectives: [],
  worldThreads: [],
  researchProjects: [],
  archaeologyChains: [],
  navigation: { history: [], knownSectorIds: [] },
  discoveries: [],
  logs: [],
  openShipIssues: 0
} as Parameters<typeof buildCaptainJourney>[0];

describe('v0.36 first voyage and captain journey', () => {
  it('turns the tutorial into one readable voyage chain', () => {
    const start = buildCaptainJourney(baseInput);
    expect(start.focus.title).toContain('локальную систему');
    expect(start.firstVoyageProgress).toBe(0);
    expect(start.firstVoyageStages[0]?.status).toBe('active');

    const field = buildCaptainJourney({ ...baseInput, tutorial: { ...baseInput.tutorial, currentStep: 6 } });
    expect(field.focus.title).toContain('подтверждённые данные');
    expect(field.firstVoyageStages.find((stage) => stage.id === 'evidence')?.status).toBe('active');
  });

  it('prioritizes real operations after the first voyage', () => {
    const journey = buildCaptainJourney({
      ...baseInput,
      tutorial: { enabled: true, active: false, currentStep: 7, completed: true },
      objectives: [{
        id: 'operation', title: 'Спасти колонну', description: 'Провести эвакуацию.', kind: 'story',
        status: 'active', createdYear: 0, progress: 25,
        operation: {
          requestId: 'request', threadId: 'thread', category: 'evacuation', issuerName: 'Port',
          reward: 300, targetSystemId: 'system', stages: [], currentStageIndex: 0, quality: 0,
          attempts: 0, log: []
        }
      }]
    });
    expect(journey.focus.title).toBe('Спасти колонну');
    expect(journey.focus.action).toEqual({ kind: 'screen', screen: 'operations' });
  });

  it('integrates the journal into the command deck without changing saves', () => {
    expect(commandSource).toContain('buildCaptainJourney');
    expect(commandSource).toContain('<CaptainJournalV36');
    expect(commandSource).toContain("data-tutorial={store.tutorial.currentStep === 0");
    expect(journalSource).toContain('ЖУРНАЛ КАПИТАНА');
    expect(journalSource).toContain('ЦЕПОЧКА РЕЙСА');
    expect(journeySource).toContain('firstVoyageStages');
    expect(tutorialSource).toContain('ПЕРВЫЙ РЕЙС');
    expect(versionSource).toContain('export const APP_VERSION');
    expect(versionSource).toContain('export const APP_CODENAME');
    expect(versionSource).toContain('SAVE_SCHEMA_VERSION = 13');
  });
});
