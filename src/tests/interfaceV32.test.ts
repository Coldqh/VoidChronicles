import appSource from '../App.tsx?raw';
import operationsSource from '../screens/OperationsScreen.tsx?raw';
import contactsSource from '../screens/ContactsScreen.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('v0.32 interface consolidation', () => {
  it('routes civilizations through the contact workspace', () => {
    expect(appSource).toContain("label: 'Контакты'");
    expect(appSource).toContain("<ContactsScreen chrome={<AppChrome/>}/>");
  });

  it('turns operations into a playable workspace', () => {
    expect(operationsSource).toContain("'accept-operation'");
    expect(operationsSource).toContain('>Принять</button>');
    expect(operationsSource).toContain('store.advanceOperation');
    expect(operationsSource).toContain('Карьера');
    expect(contactsSource).toContain('Открыть запросы');
  });
});
