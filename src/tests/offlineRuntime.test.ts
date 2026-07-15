import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('true offline configuration', () => {
  it('precaches application assets and keeps updates under player control', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("registerType: 'prompt'");
    expect(config).toContain('globPatterns');
    expect(config).toContain('runtimeCaching');
    expect(config).toContain('skipWaiting: false');
  });

  it('does not force a controllerchange reload', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).not.toContain("addEventListener('controllerchange'");
    expect(main).toContain('onOfflineReady');
    expect(main).toContain('onNeedRefresh');
    expect(main).toContain('flushPendingSave');
  });
});
