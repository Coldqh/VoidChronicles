import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/VoidChronicles/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/VoidChronicles/index.html'
      },
      manifest: {
        name: 'Void Chronicles',
        short_name: 'Void',
        description: 'Procedural space exploration roguelike',
        theme_color: '#071018',
        background_color: '#071018',
        display: 'standalone',
        id: '/VoidChronicles/',
        scope: '/VoidChronicles/',
        start_url: '/VoidChronicles/',
        icons: [{ src: '/VoidChronicles/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts']
  }
});
