import chromeSource from '../components/ExperienceChrome.tsx?raw';
import operationsSource from '../screens/OperationsScreen.tsx?raw';
import laboratorySource from '../screens/LaboratoryScreen.tsx?raw';
import archiveSource from '../screens/ArchiveWorkspaceV352.tsx?raw';
import systemSource from '../screens/SystemWorkspaceV352.tsx?raw';
import stylesSource from '../styles/interfaceV352.css?raw';
import versionSource from '../version.ts?raw';
import { describe, expect, it } from 'vitest';

describe('v0.35.2 unified operations and workspaces', () => {
  it('moves contracts into operations and retires the duplicate route', () => {
    expect(operationsSource).toContain("type Tab = 'requests' | 'active' | 'contracts' | 'intel'");
    expect(operationsSource).toContain('ОПЛАЧИВАЕМАЯ РАБОТА');
    expect(operationsSource).toContain('store.acceptContract');
    expect(operationsSource).toContain('store.refreshContracts');
    expect(chromeSource).not.toContain("label: 'Контракты'");
    expect(chromeSource).toContain("store.screen === 'contracts'");
    expect(chromeSource).toContain("store.setScreen('operations')");
  });

  it('rebuilds system and archive as selection plus dossier workspaces', () => {
    expect(chromeSource).toContain('<ArchiveWorkspaceV352/>');
    expect(chromeSource).toContain('<SystemWorkspaceV352/>');
    expect(systemSource).toContain('v352-object-list');
    expect(systemSource).toContain('v352-dossier');
    expect(systemSource).toContain('<ExpeditionModal');
    expect(archiveSource).toContain('v352-archive-list');
    expect(archiveSource).toContain('v352-archive-dossier');
    expect(stylesSource).toContain('html.v352-screen-archive main.archive-screen');
  });

  it('turns the laboratory into a master detail workspace without removing mechanics', () => {
    expect(laboratorySource).toContain('v352-lab-list');
    expect(laboratorySource).toContain('v352-lab-dossier');
    expect(laboratorySource).toContain('store.advanceResearch');
    expect(laboratorySource).toContain('store.startResearch');
    expect(laboratorySource).toContain('store.installBlueprint');
    expect(laboratorySource).toContain('store.assignEquipment');
  });

  it('keeps save compatibility and publishes the patch version', () => {
    expect(versionSource).toContain("APP_VERSION = '0.35.2'");
    expect(versionSource).toContain("APP_CODENAME = 'UNIFIED_OPERATIONS'");
    expect(versionSource).toContain('SAVE_SCHEMA_VERSION = 13');
  });
});
