import appSource from '../App.tsx?raw';
import contactsSource from '../screens/ContactsScreen.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('v0.31 interface integration', () => {
  it('routes the civilizations navigation entry to the new contacts screen', () => {
    expect(appSource).toContain("label: 'Контакты'");
    expect(appSource).toContain('ContactsScreen chrome={<AppChrome/>}');
  });

  it('keeps intelligence progressive while exposing real diplomatic actions', () => {
    expect(contactsSource).toContain('stageRank[contact.stage]');
    expect(contactsSource).toContain('availableDiplomaticActions');
    expect(contactsSource).toContain('executeDiplomaticAction');
  });
});
