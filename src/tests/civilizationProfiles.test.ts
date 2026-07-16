import appSource from '../App.tsx?raw';
import profileSource from '../components/CivilizationProfileWindow.tsx?raw';
import contactsSource from '../screens/ContactsScreen.tsx?raw';
import worldSource from '../screens/WorldScreen.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('civilization profiles and routing', () => {
  it('opens a dedicated profile window from contacts and the living world', () => {
    expect(contactsSource).toContain('setSelectedId(entry.civilization.id)');
    expect(contactsSource).toContain('Открыть полный профиль');
    expect(contactsSource).toContain('setProfileCivilizationId(civilization.id)');
    expect(contactsSource).not.toContain('setProfileCivilizationId(entry.civilization.id)');
    expect(contactsSource).toContain('<CivilizationProfileWindow');
    expect(worldSource).toContain('setProfileCivilizationId(polity.civilizationId)');
    expect(worldSource).toContain('<CivilizationProfileWindow');
  });

  it('contains species, culture, politics and history without instant omniscience', () => {
    expect(profileSource).toContain("type ProfileTab = 'overview' | 'species' | 'culture' | 'politics' | 'history'");
    expect(profileSource).toContain('civilization.speciesProfile');
    expect(profileSource).toContain('civilization.cultures');
    expect(profileSource).toContain('civilization.religions');
    expect(profileSource).toContain('civilization.states');
    expect(profileSource).toContain('stageRank');
    expect(profileSource).toContain('rank >= 5');
    expect(profileSource).toContain('НЕТ ПОДТВЕРЖДЁННЫХ ДАННЫХ');
  });

  it('formats ecosystem values instead of rendering raw floating point values', () => {
    expect(appSource).toContain('formatInteger(ecology.biomass)');
    expect(appSource).toContain('formatInteger(ecology.biodiversity)');
    expect(appSource).toContain('formatInteger(ecology.climateStability)');
    expect(appSource).not.toContain('<b>{ecology.biomass}</b>');
    expect(appSource).not.toContain('численность {entry.abundance}');
  });
});
