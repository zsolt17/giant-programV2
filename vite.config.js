import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Client env vars must be prefixed VITE_ (see .env.local / .env.production).
// base: GitHub Pages serves a project site under /<repo>/, so the production
// build uses that path; dev server stays at '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/giant-programV2/' : '/',
  // Vitest: pure unit tests (engine + data mappers). globals so tests need no imports.
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{js,ts}'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // ship updates without a manual "reload to update"
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'The Giant Program',
        short_name: 'Giant',
        description: 'Personal training log for The Giant Program.',
        theme_color: '#1a2535',
        background_color: '#1a2535',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built app shell so it opens & renders offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // Cache Google Fonts at runtime so the brand fonts survive offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
}))
