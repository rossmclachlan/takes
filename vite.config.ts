import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served from GitHub Pages at https://rossmclachlan.github.io/takes/
export default defineConfig({
  base: '/takes/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Takes',
        short_name: 'Takes',
        description: 'Sort, listen to and annotate music demos',
        theme_color: '#F3EEE3',
        background_color: '#F3EEE3',
        display: 'standalone',
        orientation: 'portrait',
        id: '/takes/',
        start_url: '/takes/',
        scope: '/takes/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Audio is cached by the app itself (src/lib/audioCache.ts), not the service worker.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
