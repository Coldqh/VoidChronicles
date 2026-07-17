import appSource from '../App.tsx?raw';
import chromeSource from '../components/ExperienceChrome.tsx?raw';
import commandSource from '../screens/MobileCommandScreenV361.tsx?raw';
import expeditionSource from '../components/ExpeditionModal.tsx?raw';
import tokenSource from '../components/ExpeditionTokens.tsx?raw';
import versionSource from '../version.ts?raw';
import { describe, expect, it } from 'vitest';

describe('v0.36.3 tactical mobile polish', () => {
  it('removes duplicated compact header controls and groups the sections menu', () => {
    expect(chromeSource).not.toContain('v361-menu-button');
    expect(chromeSource).not.toContain('v361-mobile-brand');
    expect(chromeSource).toContain('v363-menu-group');
    expect(chromeSource).toContain('<h2>Разделы</h2>');
    expect(chromeSource).toContain('v363-menu-footer');
  });

  it('bounds bridge rows and removes the duplicate order action', () => {
    expect(commandSource).toContain('v363-command-screen');
    expect(commandSource).toContain('v363-primary-card');
    expect(commandSource).toContain('v363-quick-rows');
    expect(commandSource).toContain('v363-order-hint');
  });

  it('uses textured SVG tokens and immediate reachable-tile state', () => {
    expect(expeditionSource).toContain('ExpeditionPlayerToken');
    expect(expeditionSource).toContain('ExpeditionEnemyToken');
    expect(expeditionSource).toContain('ExpeditionObjectToken');
    expect(expeditionSource).toContain('tile-reachable');
    expect(expeditionSource).toContain('STEP_DELAY_MS = 72');
    expect(tokenSource).toContain("type ExpeditionEnemyVisual = 'creature' | 'drone' | 'humanoid' | 'swarm' | 'anomaly'");
  });

  it('keeps the mobile polish layer and save compatibility across later releases', () => {
    expect(appSource).toContain("import './styles/mobilePolishV363.css';");
    expect(versionSource).toContain('export const APP_VERSION');
    expect(versionSource).toContain('export const APP_CODENAME');
    expect(versionSource).toContain('SAVE_SCHEMA_VERSION = 13');
  });
});
