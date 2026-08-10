import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initTheme } from './utils/theme'

// W4.2: apply saved/OS theme before first paint (no light flash at night)
initTheme()

// ── Recover from stale lazy-chunk imports after a deploy ──────────────────────
// Every build gives each lazy route a new hashed chunk filename. A user whose tab
// or installed PWA still holds the OLD index will fail to import() a chunk that the
// new deploy replaced — "importing a module script failed" on the first lazy route
// (e.g. Pre-Plans). Vite fires 'vite:preloadError' for exactly this. Reload ONCE to
// pick up the fresh index + chunks; guard against a loop so a genuinely-missing
// chunk still surfaces the error boundary instead of reloading forever.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'of_preload_reload_at'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 10000) return  // reloaded within 10s already — let it surface
  sessionStorage.setItem(KEY, String(Date.now()))
  event.preventDefault?.()
  window.location.reload()
})

// ── Error boundary ────────────────────────────────────────────────────────────
// Catches any uncaught render error in the whole tree and shows a recovery
// screen instead of a blank white page.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div style={{ minHeight: '100vh', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '32px', maxWidth: '520px', width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#111', marginBottom: '8px' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
              OpenFirehouse hit an unexpected error. Click below to reload — your data is safe.
            </p>
            <pre style={{ fontSize: '11px', background: '#f3f4f6', color: '#374151', padding: '10px 12px', borderRadius: '8px', textAlign: 'left', marginBottom: '20px', overflow: 'auto', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
              {msg}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '10px 24px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Service worker registration (PWA) ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failing is non-fatal — app still works online
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
