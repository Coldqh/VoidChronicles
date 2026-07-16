import { describe, expect, it } from 'vitest';
import { normalizeMainScreenRoute } from '../routing/routes';

describe('v0.35.3 route normalization', () => {
  it('redirects the retired contracts route into operations', () => {
    expect(normalizeMainScreenRoute('contracts')).toBe('operations');
  });

  it('does not alter active routes', () => {
    expect(normalizeMainScreenRoute('system')).toBe('system');
    expect(normalizeMainScreenRoute('archive')).toBe('archive');
    expect(normalizeMainScreenRoute('command')).toBe('command');
  });
});
