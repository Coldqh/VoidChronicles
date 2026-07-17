import { readFileSync } from 'node:fs';
import appSource from '../App.tsx?raw';
import chromeSource from '../components/ExperienceChrome.tsx?raw';
import commandSource from '../screens/MobileCommandScreenV361.tsx?raw';
import operationsSource from '../screens/MobileOperationsScreenV361.tsx?raw';
import situationSource from '../screens/MobileSituationScreenV361.tsx?raw';
import chronicleSource from '../screens/MobileChronicleScreenV361.tsx?raw';
import factionsSource from '../screens/MobileFactionsScreenV361.tsx?raw';
import versionSource from '../version.ts?raw';
import { describe, expect, it } from 'vitest';

const mobileCss = readFileSync(new URL('../styles/mobileCommandV361.css', import.meta.url), 'utf8');

describe('v0.36.1 mobile command UI', () => {
  it('promotes the current system into the five-button phone dock', () => {
    expect(chromeSource).toContain("{ id: 'system', label: 'Система'");
    expect(chromeSource).toContain('mainItems.map');
    expect(chromeSource).toContain('v361-mobile-dock');
    expect(mobileCss).toContain('grid-template-columns: repeat(5');
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

  it('owns the iPhone viewport with one scroll body and safe-area chrome', () => {
    expect(mobileCss.length).toBeGreaterThan(1000);
    expect(mobileCss).toContain('height: 100dvh');
    expect(mobileCss).toContain('env(safe-area-inset-top)');
    expect(mobileCss).toContain('env(safe-area-inset-bottom)');
    expect(mobileCss).toContain('.v361-tab-body');
    expect(mobileCss).toContain('overflow-y: auto');
    expect(mobileCss).toContain('.v361-command-screen');
  });

  it('keeps save compatibility while advancing the interface release', () => {
    expect(versionSource).toContain('export const APP_VERSION');
    expect(versionSource).toContain('export const APP_CODENAME');
    expect(versionSource).toContain('SAVE_SCHEMA_VERSION = 13');
  });
});
