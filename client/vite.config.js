import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
// Imported as a BINDING rather than used as a global on purpose. The lint:undef ship
// gate runs no-undef at zero with --no-inline-config, so a /* global process */
// directive is ignored, and adding `process` to the shared languageProfiles would
// weaken the gate for BROWSER code — where a bare `process` really is a crash waiting
// for the first user to reach that line. Importing it keeps the gate exactly as
// strong everywhere else. (See eslint.undef.config.js: "fix the code, not the rule.")
import process from 'node:process'

// Use the config file's own directory so this works regardless of CWD
const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))
const fullVersion = `${pkg.version}.${pkg.buildNumber || 0}`

// ── OPT-IN: FAIL THE BUILD WHEN A DEPLOY THAT *EXPECTS* LIVE PUSH WON'T HAVE IT ──
//
// WHY THIS IS OPT-IN AND NOT THE DEFAULT. Vite inlines import.meta.env.VITE_* at
// BUILD time, so a missing var is silently `undefined` — never a build error. That
// fail-open behaviour is how live push died on our production for 34 days
// (2026-06-27 → 07-31): the open-core secret scrub moved the Supabase URL/key from
// hardcoded fallbacks to env-only, and the replacement Vercel var was created
// misspelled `VITE_SUPABASE_URl`.
//
// But asserting unconditionally would BREAK THREE THINGS THAT ARE CORRECT ON PURPOSE:
//   1. CI. No workflow sets any VITE_ var, and both .github/workflows/ci.yml and
//      e2e.yml build the client. A hard assert red-lines the blocking E2E gate and
//      recreates the exact failure 40ad010 was written to fix.
//   2. Self-hosters. OpenFirehouse is AGPL and self-hosting is a first-class,
//      advertised path ("run it on your own Vercel + Supabase for $0"). Running
//      WITHOUT Supabase Realtime is fully supported — the 20s poll backstops carry
//      every live surface. Their deploy must not fail over an optional feature.
//   3. The never-white-screen doctrine. Degrading beats crashing on a dispatch
//      surface, always.
//
// So the deploy DECLARES its own expectation. Set REQUIRE_REALTIME=1 only where live
// push is genuinely required (our hosted production); everywhere else this is inert.
// Default-off means CI, local dev and every self-host are untouched by construction.
//
// It also rejects PLACEHOLDER values, because copying client/.env.example verbatim
// is the other way to ship a build that looks configured and isn't — on 06-27 the
// bundle shipped a live client pointed at `YOUR_PROJECT_REF.supabase.co` for 18 days.
if (/^(1|true)$/i.test(process.env.REQUIRE_REALTIME || '')) {
  // Read from process.env: this guard is for platform builds (Vercel, CI), where the
  // host injects env vars into the build process. It deliberately does not read .env
  // files — a local dev has no reason to set REQUIRE_REALTIME at all.
  const isPlaceholder = (v) => /YOUR_PROJECT_REF|^your_/i.test(v)
  const problems = []
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    const val = (process.env[key] || '').trim()
    if (!val) problems.push(`${key} is not set`)
    else if (isPlaceholder(val)) problems.push(`${key} still holds a placeholder value`)
  }
  if (problems.length) {
    throw new Error(
      'REQUIRE_REALTIME=1 but this build would ship with live push DISABLED:\n' +
      problems.map((p) => `  - ${p}`).join('\n') +
      '\n\nDispatch, unit status and the maps would fall back to a 20s poll.\n' +
      'Fix the env vars on the deploy, or unset REQUIRE_REALTIME if this deploy\n' +
      'genuinely does not need live push.\n' +
      'NOTE: VITE_SUPABASE_URL is the CLIENT var — it is not the server\'s SUPABASE_URL.\n' +
      'Watch the final character: VITE_SUPABASE_URl (lowercase L) is not VITE_SUPABASE_URL.'
    )
  }
}

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
