import appSource from '../App.tsx?raw';
import chromeSource from '../components/ExperienceChrome.tsx?raw';
import commandSource from '../screens/CommandDeckV35.tsx?raw';
import operationsSource from '../screens/OperationsScreen.tsx?raw';
import crewSource from '../screens/CrewScreen.tsx?raw';
import shipSource from '../screens/ShipScreen.tsx?raw';
import contactsSource from '../screens/ContactsScreen.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('v0.35 cinematic UI/UX rebuild', () => {
  it('uses one persistent experience shell and a rebuilt command deck', () => {
    expect(appSource).toContain("import { ExperienceChrome }");
    expect(appSource).toContain("import { CommandDeckV35 }");
    expect(appSource).toContain('<ExperienceChrome/>');
    expect(appSource).toContain('<CommandDeckV35 chrome={<AppChrome/>}/>');
    expect(appSource).toContain("import './styles/experienceV35.css'");
  });

  it('reduces the primary navigation to five player spaces with actionable badges', () => {
    expect(chromeSource).toContain("label: 'Мостик'");
    expect(chromeSource).toContain("label: 'Карта'");
    expect(chromeSource).toContain("label: 'Операции'");
    expect(chromeSource).toContain("label: 'Мир'");
    expect(chromeSource).toContain("label: 'Корабль'");
    expect(chromeSource).toContain('requestCount + activeOperationCount');
    expect(chromeSource).toContain('shipIssueCount');
  });

  it('keeps fuel visible on mobile and restores useful mobile metrics', () => {
    expect(chromeSource).toContain('ТОПЛИВО');
    expect(appSource).toContain("import './styles/experienceV35.css'");
    expect(chromeSource).toContain('v35-hud-vitals');
    expect(chromeSource).toContain('v35-mobile-dock');
  });

  it('turns core systems into distinct game spaces instead of generic dashboards', () => {
    expect(commandSource).toContain('v35-command-cosmos');
    expect(commandSource).toContain('v35-primary-decision');
    expect(operationsSource).toContain('v35-featured-mission');
    expect(operationsSource).toContain('v35-approach-grid');
    expect(crewSource).toContain('v35-crew-dossier');
    expect(crewSource).toContain('v35-portrait');
    expect(shipSource).toContain('v35-hull-diagram');
    expect(shipSource).toContain("reactor: '◉'");
  });

  it('does not open a civilization modal when the player only selects a contact', () => {
    const clickIndex = contactsSource.indexOf('setSelectedId(entry.civilization.id)');
    const clickBlock = contactsSource.slice(clickIndex, clickIndex + 150);
    expect(clickBlock).not.toContain('setProfileCivilizationId');
    expect(contactsSource).toContain('Открыть полный профиль');
  });

  it('ships motion safely with reduced-motion support', () => {
    expect(commandSource).toContain('v35-command-cosmos');
    expect(commandSource).toContain('v35-scan-line');
    expect(chromeSource).toContain('v35-command-menu-panel');
  });
});
