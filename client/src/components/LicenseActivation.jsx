import { useState } from 'react';
import { api } from '../utils/api';

/**
 * LicenseActivation — shown when /api/license/status reports activated=false for
 * the logged-in user's department. Accepts a JWT pasted by a chief and posts to
 * /api/license/activate (authed; the server verifies the JWT's dept_id matches
 * the chief's department). On success calls onActivated(status). ADR-0001 Step 13.
 */
export default function LicenseActivation({ user, onActivated }) {
  const [jwt, setJwt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleActivate(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Authed: api.post sends the access token and throws on non-2xx (e.g. a
      // 403 DEPT_MISMATCH if the license isn't for this chief's department).
      const data = await api.post('/api/license/activate', {
        jwt: jwt.trim(),
        activated_by: user?.name || user?.username || null,
      });
      onActivated(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-950" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700" style={{ maxWidth: 640, width: '100%', borderRadius: 12, padding: 32 }}>
        <div className="text-red-500" style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 13 }}>
          OpenFirehouse — License Activation Required
        </div>
        <h1 className="text-gray-900 dark:text-gray-100" style={{ margin: '12px 0 8px', fontSize: 26 }}>Activate this install</h1>
        <p className="text-gray-500 dark:text-gray-400" style={{ margin: '0 0 20px', fontSize: 15 }}>
          This OpenFirehouse install hasn't been activated for a department yet. Paste your activation token below to continue. If you haven't signed up, do that first at <a href="https://openfirehouse.openscaffoldlabs.com/signup" className="text-blue-600 dark:text-blue-400">openfirehouse.openscaffoldlabs.com/signup</a>.
        </p>

        <form onSubmit={handleActivate}>
          <label className="text-gray-900 dark:text-gray-100" style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Activation token</label>
          <textarea
            value={jwt}
            onChange={(e) => setJwt(e.target.value)}
            placeholder="Paste the JWT from your activation email — starts with eyJ..."
            required
            rows={6}
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
            style={{
              width: '100%', padding: 12, fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
              fontSize: 11, borderRadius: 8, resize: 'vertical', wordBreak: 'break-all',
            }}
          />
          <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: 12, margin: '6px 0 16px' }}>
            Your token arrived by email when you completed signup. If you can't find it, you can re-retrieve it from <code>openfirehouse.openscaffoldlabs.com/license/&lt;your-invoice-id&gt;</code>.
          </p>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 border-l-4 border-l-red-500 text-red-900 dark:text-red-300" style={{
              padding: '12px 16px', borderRadius: 8, fontSize: 14, marginBottom: 16,
            }}>
              <strong>Activation failed.</strong> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !jwt.trim()}
            className={submitting || !jwt.trim() ? 'bg-gray-300 dark:bg-gray-600 text-white' : 'bg-red-500 text-white'}
            style={{
              width: '100%', border: 'none', borderRadius: 8, padding: 14, fontSize: 16, fontWeight: 600,
              cursor: submitting || !jwt.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Activating…' : 'Activate license'}
          </button>
        </form>

        <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: 13, marginTop: 24, textAlign: 'center' }}>
          Questions? <a href="mailto:support@openscaffoldlabs.com" className="text-blue-600 dark:text-blue-400">support@openscaffoldlabs.com</a>
        </p>
      </div>
    </div>
  );
}
