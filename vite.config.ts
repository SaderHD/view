import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH is the URL path the app is served from:
//   GitHub Pages → "/view/"   Cloudflare Pages / localhost → "/"
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  // The Microsoft sign-in library (MSAL) alone is ~350 kB; that's expected.
  build: { chunkSizeWarningLimit: 800 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'View',
        short_name: 'View',
        description: 'Calendar-first job organizer for Outlook and OneDrive',
        theme_color: '#2563eb',
        background_color: '#f7f8fa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the app's own files are cached. Microsoft sign-in and Graph
        // API calls are cross-origin and always go to the network.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
})
