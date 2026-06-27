import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Use the config file's own directory so this works regardless of CWD
const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))
const fullVersion = `${pkg.version}.${pkg.buildNumber || 0}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use the existing manually-managed service worker (push notifications, etc.)
      // instead of generating a new one — injectManifest mode merges precaching
      // into our hand-written SW so both offline caching AND push logic coexist.
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectManifest: {
        // Cache the app shell + all JS/CSS chunks so the UI loads offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        // Don't precache large vendor maps — they're huge and rarely needed offline
        globIgnores: ['**/*.map'],
      },
      manifest: {
        name: 'Open Firehouse',
        short_name: 'Firehouse',
        description: 'Fire station management platform',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      devOptions: {
        // Enable PWA in dev so you can test offline behaviour with vite dev server
        enabled: false,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(fullVersion),
  },
  build: {
    // Split large vendor libraries into separate cacheable chunks
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — cached long-term, rarely changes
          'vendor-react': ['react', 'react-dom'],
          // Charting — only loaded by pages that use charts
          'vendor-charts': ['recharts'],
          // PDF/export — only loaded when exporting
          'vendor-pdf': ['jspdf', 'html2canvas'],
        },
      },
    },
    // Raise the warning threshold (our lazy chunks are fine)
    chunkSizeWarningLimit: 800,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
    },
  },
})
