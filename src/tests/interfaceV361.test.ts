import appSource from '../App.tsx?raw';
import chromeSource from '../components/ExperienceChrome.tsx?raw';
import commandSource from '../screens/MobileCommandScreenV361.tsx?raw';
import operationsSource from '../screens/MobileOperationsScreenV361.tsx?raw';
import situationSource from '../screens/MobileSituationScreenV361.tsx?raw';
import chronicleSource from '../screens/MobileChronicleScreenV361.tsx?raw';
import factionsSource from '../screens/MobileFactionsScreenV361.tsx?raw';
import versionSource from '../version.ts?raw';
import { describe, expect, it } from 'vitest';

describe('v0.36.1 mobile command UI', () => {
  it('promotes the current system into the five-button phone dock', () => {
    expect(chromeSource).toContain("{ id: 'system', label: 'Система'");
    expect(chromeSource).toContain('mainItems.map');
    expect(chromeSource).toContain('v361-mobile-dock');
    expect(appSource).toContain("import './styles/mobileCommandV361.css';");
  });

  it('routes phone information screens into dedicated compact compositions', () => {
    expect(appSource).toContain('MobileCommandScreenV361');
    expect(appSource).toContain('MobileOperationsScreenV361');
    expect(appSource).toContain('MobileSituationScreenV361');
    expect(appSource).toContain('MobileChronicleScreenV361');
    expect(appSource).toContain('MobileFactionsScreenV361');
    expect(appSource).toContain("screen === 'system'");
    expect(appSource).toContain('compact ? <SystemScreen/>');
  });

  it('uses tabs and list dossier transitions instead of stacked phone dashboards', () => {
    expect(commandSource).toContain("type JournalTab = 'order' | 'voyage' | 'career' | 'consequences'");
    expect(operationsSource).toContain("type OperationsTab = 'requests' | 'active' | 'contracts' | 'completed'");
    expect(situationSource).toContain("type SituationTab = 'crises' | 'wars' | 'states' | 'news'");
    expect(chronicleSource).toContain("type ChronicleTab = 'feed' | 'player' | 'captains'");
    expect(factionsSource).toContain("type DossierTab = 'overview' | 'relations' | 'laws' | 'links'");
  });

  it('uses one bounded phone workspace with controlled content scrolling', () => {
    expect(commandSource).toContain('game-shell v361-shell');
    expect(commandSource).toContain('v361-screen v361-command-screen');
    expect(commandSource).toContain('v361-tabs four');
    expect(commandSource).toContain('v361-tab-body');
    expect(chromeSource).toContain('v361-mobile-hud');
    expect(chromeSource).toContain('v361-mobile-dock');
  });

  it('keeps save compatibility while advancing the interface release', () => {
    expect(versionSource).toContain('export const APP_VERSION');
    expect(versionSource).toContain('export const APP_CODENAME');
    expect(versionSource).toContain('SAVE_SCHEMA_VERSION = 13');
  });
});
