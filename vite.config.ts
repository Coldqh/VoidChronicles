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
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['brand/**/*'],
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: '/VoidChronicles/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) => request.mode === 'navigate' && sameOrigin,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'void-pages-v030',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) => sameOrigin && ['script', 'style', 'image', 'font', 'worker'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'void-assets-v030',
              expiration: { maxEntries: 240, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      manifest: {
        name: 'Void Chronicles',
        short_name: 'Void',
        description: 'Procedural space exploration roguelike and living galaxy chronicle',
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
