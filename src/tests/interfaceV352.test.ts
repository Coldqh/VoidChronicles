import appSource from '../App.tsx?raw';
import chromeSource from '../components/ExperienceChrome.tsx?raw';
import operationsSource from '../screens/OperationsScreen.tsx?raw';
import laboratorySource from '../screens/LaboratoryScreen.tsx?raw';
import archiveSource from '../screens/ArchiveWorkspaceV352.tsx?raw';
import systemSource from '../screens/SystemWorkspaceV352.tsx?raw';
import stylesSource from '../styles/interfaceV352.css?raw';
import versionSource from '../version.ts?raw';
import { describe, expect, it } from 'vitest';

describe('v0.35.2 unified operations and workspaces', () => {
  it('keeps contracts inside operations and normalizes the retired route', () => {
    expect(operationsSource).toContain("type Tab = 'requests' | 'active' | 'contracts' | 'intel'");
    expect(operationsSource).toContain('ОПЛАЧИВАЕМАЯ РАБОТА');
    expect(operationsSource).toContain('store.acceptContract');
    expect(operationsSource).toContain('store.refreshContracts');
    expect(chromeSource).not.toContain("label: 'Контракты'");
    expect(appSource).toContain('normalizeMainScreenRoute');
    expect(appSource).toContain("screen === 'contracts'");
    expect(appSource).toContain('<OperationsScreen chrome={<AppChrome/>}/>');
  });

  it('owns system and archive routes in App instead of rendering them from chrome', () => {
    expect(appSource).toContain("import { ArchiveWorkspaceV352 }");
    expect(appSource).toContain("import { SystemWorkspaceV352 }");
    expect(appSource).toContain('<ArchiveWorkspaceV352/>');
    expect(appSource).toContain('<SystemWorkspaceV352/>');
    expect(chromeSource).not.toContain('ArchiveWorkspaceV352');
    expect(chromeSource).not.toContain('SystemWorkspaceV352');
    expect(systemSource).toContain('v352-object-list');
    expect(systemSource).toContain('v352-dossier');
    expect(systemSource).toContain('<ExpeditionModal');
    expect(archiveSource).toContain('v352-archive-list');
    expect(archiveSource).toContain('v352-archive-dossier');
    expect(stylesSource).not.toContain('html.v352-screen-archive');
    expect(stylesSource).not.toContain('html.v352-screen-system');
  });

  it('turns the laboratory into a master detail workspace without removing mechanics', () => {
    expect(laboratorySource).toContain('v352-lab-list');
    expect(laboratorySource).toContain('v352-lab-dossier');
    expect(laboratorySource).toContain('store.advanceResearch');
    expect(laboratorySource).toContain('store.startResearch');
    expect(laboratorySource).toContain('store.installBlueprint');
    expect(laboratorySource).toContain('store.assignEquipment');
  });

  it('keeps save compatibility across later releases', () => {
    expect(versionSource).toContain('export const APP_VERSION');
    expect(versionSource).toContain('export const APP_CODENAME');
    expect(versionSource).toContain('SAVE_SCHEMA_VERSION = 13');
  });
});
