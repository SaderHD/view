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
  build: {
    // Big libraries go in their own files. They rarely change, so after an app
    // update the phone only re-downloads the (small) app code.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'msal', test: /node_modules[\\/]@azure[\\/]/, priority: 3 },
            { name: 'calendar', test: /node_modules[\\/]@fullcalendar[\\/]/, priority: 2 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom service worker (src/sw/sw.ts) so the app can receive Android shares.
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
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
        // Shows "View" in Android's Share menu for photos, PDFs and other files.
        share_target: {
          action: `${base}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'files', accept: ['image/*', 'video/*', 'application/pdf', '*/*'] }],
          },
        },
      },
    }),
  ],
})
