/**
 * theme.js — dark mode for night operations (W4.2, roadmap 3.3, 2026-06-10).
 *
 * Apparatus-mounted displays and night incidents need a low-glare UI. Theme
 * is class-based (`.dark` on <html>), explicitly toggleable, persisted in
 * localStorage, and falls back to the OS preference on first run.
 *
 * Command screens get the toggle first (CommandBoard, LiveDispatch, unit
 * board); the rest of the app inherits dark: variants opportunistically.
 */

const STORAGE_KEY = 'of-theme'; // 'dark' | 'light'

export function getTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (_) { /* private mode etc. */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setTheme(theme) {
  try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) { /* best effort */ }
  applyTheme(theme);
}

export function toggleTheme() {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Call once at app boot (main.jsx). */
export function initTheme() {
  applyTheme(getTheme());
}
