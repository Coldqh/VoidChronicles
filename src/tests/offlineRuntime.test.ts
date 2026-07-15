import viteConfigSource from '../../vite.config.ts?raw';
import mainSource from '../main.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('true offline configuration', () => {
  it('precaches application assets and keeps updates under player control', () => {
    expect(viteConfigSource).toContain("registerType: 'prompt'");
    expect(viteConfigSource).toContain('globPatterns');
    expect(viteConfigSource).toContain('runtimeCaching');
    expect(viteConfigSource).toContain('skipWaiting: false');
  });

  it('does not force a controllerchange reload', () => {
    expect(mainSource).not.toContain("addEventListener('controllerchange'");
    expect(mainSource).toContain('onOfflineReady');
    expect(mainSource).toContain('onNeedRefresh');
    expect(mainSource).toContain('flushPendingSave');
  });
});
