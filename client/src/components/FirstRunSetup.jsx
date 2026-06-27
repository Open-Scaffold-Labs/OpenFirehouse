/**
 * FirstRunSetup.jsx — Shown when the server reports no users exist.
 *
 * Creates the first chief account via the public
 * /api/setup-status/bootstrap-chief endpoint, then logs that chief in.
 * After this screen, the existing DepartmentSetupWizard takes over to
 * configure stations, apparatus, shift patterns, etc.
 */

import { useState } from 'react';
import { Shield, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { api, setToken } from '../utils/api';

const INPUT = 'w-full border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-red-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400';

export default function FirstRunSetup({ onComplete }) {
  const [form, setForm] = useState({ name: '', username: '', password: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) return setError('Your full name is required.');
    if (!form.username.trim()) return setError('A username is required.');
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(form.username)) {
      return setError('Username must be 3–30 characters: letters, numbers, dot, dash, or underscore.');
    }
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');

    setSaving(true);
    try {
      // 1. Create the first chief account (public endpoint, gated on no users existing)
      const bootstrap = await api.post('/api/setup-status/bootstrap-chief', {
        username: form.username,
        password: form.password,
        name: form.name,
      });
      if (bootstrap?.data?.error) throw new Error(bootstrap.data.error);

      // 2. Log in immediately as the new chief
      const login = await api.post('/api/auth/login', {
        username: form.username,
        password: form.password,
      });
      if (!login?.data?.token) throw new Error('Account created but auto-login failed. Please log in manually.');

      setToken(login.data.token);
      onComplete?.(login.data.user);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Setup failed. Try again or check the server logs.');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-600 mb-4 shadow-lg shadow-red-900/40">
            <Shield className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Welcome to OpenFirehouse</h1>
          <p className="text-slate-400 mt-2 text-sm">
            This is a fresh install. Create your chief account to begin —
            you can configure the rest of your department after you log in.
          </p>
        </div>

        {/* Form card */}
        <form onSubmit={submit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Your full name
            </label>
            <input
              type="text"
              className={INPUT}
              aria-label="Your full name"
              placeholder="Chief Sarah Mitchell"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Username (you'll log in with this)
            </label>
            <input
              type="text"
              className={INPUT}
              aria-label="Username"
              placeholder="smitchell"
              value={form.username}
              onChange={(e) => update('username', e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Password (8+ characters)
            </label>
            <input
              type="password"
              className={INPUT}
              aria-label="Password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Confirm password
            </label>
            <input
              type="password"
              className={INPUT}
              aria-label="Confirm password"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-bold py-3.5 rounded-xl text-base flex items-center justify-center gap-2 transition shadow-lg shadow-red-900/30"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                Create chief account
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            After login, you'll be guided through department setup —
            stations, apparatus, shift patterns, and ranks.
            <br />Hazmat reference library + NFPA course catalog are already loaded.
          </p>
        </form>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-slate-500">
            This screen only appears on a fresh install. After your account is created,
            the standard login screen replaces it.
          </p>
        </div>
      </div>
    </div>
  );
}
