import appSource from '../App.tsx?raw';
import sharedSource from '../components/MobileCoverageV362.tsx?raw';
import shipSource from '../screens/MobileShipScreenV362.tsx?raw';
import crewSource from '../screens/MobileCrewScreenV362.tsx?raw';
import contactsSource from '../screens/MobileContactsScreenV362.tsx?raw';
import archiveSource from '../screens/MobileArchiveScreenV362.tsx?raw';
import laboratorySource from '../screens/MobileLaboratoryScreenV362.tsx?raw';
import hubSource from '../screens/MobileHubScreenV362.tsx?raw';
import settingsSource from '../screens/MobileSettingsScreenV362.tsx?raw';
import versionSource from '../version.ts?raw';
import { describe, expect, it } from 'vitest';

describe('v0.36.2 full mobile coverage', () => {
  it('routes every remaining heavy phone screen into a compact composition', () => {
    expect(appSource).toContain('MobileShipScreenV362');
    expect(appSource).toContain('MobileCrewScreenV362');
    expect(appSource).toContain('MobileContactsScreenV362');
    expect(appSource).toContain('MobileArchiveScreenV362');
    expect(appSource).toContain('MobileLaboratoryScreenV362');
    expect(appSource).toContain('MobileHubScreenV362');
    expect(appSource).toContain('MobileSettingsScreenV362');
    expect(appSource).toContain("screen === 'hub'");
    expect(appSource).toContain("screen === 'archive'");
    expect(appSource).toContain("screen === 'laboratory'");
  });

  it('uses one shared phone shell with fixed header, tabs and one content body', () => {
    expect(sharedSource).toContain('MobileCoverageV362');
    expect(sharedSource).toContain('game-shell v361-shell v362-shell');
    expect(sharedSource).toContain('v361-screen v362-screen');
    expect(sharedSource).toContain('v361-tabs v362-tabs');
    expect(sharedSource).toContain('v361-tab-body v362-body');
    expect(sharedSource).toContain("tabs.length >= 5 ? 'five'");
    expect(appSource).toContain("import './styles/mobileCoverageV362.css';");
  });

  it('keeps the original mechanics reachable from the compact screens', () => {
    expect(shipSource).toContain('store.repairShip');
    expect(shipSource).toContain('store.repairCompartment');
    expect(crewSource).toContain('store.resolveCrewIssue');
    expect(crewSource).toContain('store.hireCrew');
    expect(contactsSource).toContain('executeDiplomaticAction');
    expect(contactsSource).toContain('store.attemptFirstContact');
    expect(archiveSource).toContain('store.resolveHypothesis');
    expect(laboratorySource).toContain('store.advanceResearch');
    expect(laboratorySource).toContain('store.installBlueprint');
    expect(hubSource).toContain('store.buyMarketGood');
    expect(hubSource).toContain('store.sellArtifactToHub');
    expect(settingsSource).toContain('forceApplicationUpdate');
    expect(settingsSource).toContain('store.createBackup');
  });

  it('splits information into stable tabs instead of vertical dashboards', () => {
    expect(shipSource).toContain("type ShipTab = 'status' | 'compartments' | 'cargo' | 'modules'");
    expect(crewSource).toContain("type CrewTab = 'crew' | 'issues' | 'hiring'");
    expect(contactsSource).toContain("type ContactDossierTab = 'overview' | 'diplomacy' | 'memory'");
    expect(archiveSource).toContain("type ArchiveTab = 'discoveries' | 'evidence' | 'hypotheses' | 'chains'");
    expect(laboratorySource).toContain("type LabTab = 'projects' | 'artifacts' | 'technology'");
    expect(hubSource).toContain("type HubTab = 'market' | 'people' | 'work' | 'authority' | 'cargo'");
    expect(settingsSource).toContain("type SettingsTab = 'game' | 'saves' | 'pwa' | 'campaign'");
  });

  it('keeps save compatibility across interface releases', () => {
    expect(versionSource).toContain('export const APP_VERSION');
    expect(versionSource).toContain('export const APP_CODENAME');
    expect(versionSource).toContain('SAVE_SCHEMA_VERSION = 13');
  });
});
