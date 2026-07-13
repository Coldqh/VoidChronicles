import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom')) return 'react';
          if (id.includes('/node_modules/zustand') || id.includes('/node_modules/dexie')) return 'state';
          if (id.includes('/node_modules/zod')) return 'validation';
          return undefined;
        }
      }
    }
  },
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  base: '/VoidChronicles/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/VoidChronicles/index.html'
      },
      manifest: {
        name: 'Void Chronicles',
        short_name: 'Void',
        description: 'Procedural space exploration roguelike',
        lang: 'ru',
        theme_color: '#071018',
        background_color: '#071018',
        display: 'standalone',
        id: '/VoidChronicles/',
        scope: '/VoidChronicles/',
        start_url: '/VoidChronicles/',
        icons: [
          { src: '/VoidChronicles/brand/void-chronicles-mark-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/VoidChronicles/brand/void-chronicles-mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/VoidChronicles/brand/void-chronicles-mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts']
  }
});
