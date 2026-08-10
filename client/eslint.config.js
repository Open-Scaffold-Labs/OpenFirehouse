import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// ── SHARED LANGUAGE PROFILE ──────────────────────────────────────────────────
// Exported so eslint.undef.config.js (the CI gate) can reuse it VERBATIM. If the two
// ever drift, the gate starts reporting globals as undefined and someone switches it
// off — which is exactly how a protective rule stops protecting anything.
export const languageProfiles = [
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Injected by Vite's `define` at build time, so it is a real binding at runtime
        // even though nothing declares it in source.
        __APP_VERSION__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
  },
  // The service worker runs in a ServiceWorkerGlobalScope, not a window — `clients`,
  // `self` and friends are real there and undefined everywhere else.
  {
    files: ['public/sw.js', 'src/sw.js', '**/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  // Node test files: browser globals are shimmed by the test itself.
  {
    files: ['src/**/__tests__/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]

export default defineConfig([
  globalIgnores(['dist']),
  ...languageProfiles,
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
