/**
 * LeaveBankManager.jsx — chief-only leave-bank configuration (Phase 1.2e-c).
 *
 * Built to the 2026-07-24 admin market pass:
 *  - a LIST (one row per bank) with a plain-language accrual summary + an active state;
 *  - an EDITOR grouped into Identity / Accrual / Limits, with fields revealed conditionally
 *    by accrual method, a repeatable tenure-tier row editor, and max-balance vs carryover-cap
 *    kept DISTINCT with helper text (the most-confused pair);
 *  - FLSA §7(o) comp banks: a note that comp is never forfeited at year-end (the carryover
 *    run already exempts them server-side — this surfaces the legal rule to the chief);
 *  - deactivate (never hard-delete) so history/balances are preserved;
 *  - a live plain-language summary of the bank being edited (the top trust element).
 *
 * All writes are chief-gated server-side; this screen also hides the controls for non-chiefs.
 * NOTE: the "run accruals with preview" action is the next increment (1.2e-d).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Loader2, Check, X, Shield, Archive, RotateCcw, PlayCircle, AlertTriangle } from 'lucide-react';
import { api, getStoredUser } from '../utils/api';
import { isBcPlus } from '../data/auth';
import { accrualSummary, methodNeeds, validateBank } from '../utils/leaveBankSummary';

const METHODS = [
  { value: 'none', label: 'No automatic accrual (manual only)' },
  { value: 'per_period', label: 'Per pay period' },
  { value: 'annual_grant', label: 'Annual grant (front-loaded)' },
  { value: 'anniversary', label: 'On work anniversary' },
  { value: 'per_hours_worked', label: 'Per hour worked' },
];
const PERIODS = [{ value: 'biweekly', label: 'Bi-weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }];
const UNITS = [{ value: 'hours', label: 'Hours' }, { value: 'shifts', label: 'Shifts' }, { value: 'days', label: 'Days' }];

const EMPTY = {
  code: '', name: '', unit: 'hours', accrual_method: 'none', accrual_rate: '', period: '',
  accrual_cap: '', carryover_cap: '', allow_negative: false, negative_floor: '',
  tenure_tiers: [], is_flsa_comp: false, is_paid: true, active: true,
};

const input = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500';
const label = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1';
const help = 'text-[11px] text-gray-500 dark:text-gray-400 mt-1';

function toForm(bank) {
  return {
    code: bank.code || '', name: bank.name || '', unit: bank.unit || 'hours',
    accrual_method: bank.accrual_method || 'none',
    accrual_rate: bank.accrual_rate ?? '', period: bank.period || '',
    accrual_cap: bank.accrual_cap ?? '', carryover_cap: bank.carryover_cap ?? '',
    allow_negative: !!bank.allow_negative, negative_floor: bank.negative_floor ?? '',
    tenure_tiers: Array.isArray(bank.tenure_tiers) ? bank.tenure_tiers : [],
    is_flsa_comp: !!bank.is_flsa_comp, is_paid: bank.is_paid !== false, active: bank.active !== false,
  };
}

function toPayload(form) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const needs = methodNeeds(form.accrual_method);
  return {
    code: form.code.trim().toUpperCase(), name: form.name.trim(), unit: form.unit,
    accrual_method: form.accrual_method,
    // Only an accruing method carries a rate/tiers/period — drop them for a manual bank so the
    // saved config + the live summary can't contradict the method (e.g. "manual · tiered").
    accrual_rate: needs.rate ? (Number(form.accrual_rate) || 0) : 0,
    period: form.accrual_method === 'per_period' ? (form.period || null) : null,
    accrual_cap: num(form.accrual_cap), carryover_cap: num(form.carryover_cap),
    allow_negative: !!form.allow_negative, negative_floor: form.allow_negative ? (num(form.negative_floor) || 0) : 0,
    tenure_tiers: needs.tiers
      ? (form.tenure_tiers || []).filter((t) => t && t.years !== '' && t.rate !== '').map((t) => ({ years: Number(t.years), rate: Number(t.rate) }))
      : [],
    is_flsa_comp: !!form.is_flsa_comp, is_paid: !!form.is_paid, active: !!form.active,
  };
}

function toRunBody(run) {
  const body = { periodKey: String(run.periodKey || '').trim(), periodEnd: run.periodEnd };
  if (run.periodStart) body.periodStart = run.periodStart;
  return body;
}

export default function LeaveBankManager({ onBack }) {
  const canManage = isBcPlus(getStoredUser());
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { id?, form }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Run-accruals flow (1.2e-d): pick period → Preview (dry run) → Confirm → post → summary.
  const [runOpen, setRunOpen] = useState(false);
  const [run, setRun] = useState({ periodKey: '', periodStart: '', periodEnd: '' });
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await api.get('/api/leave-types');
      setBanks(r.data || []);
    } catch (e) { setError(e.message || 'Could not load leave banks.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const doPreview = useCallback(async () => {
    setRunning(true); setRunError(null); setSummary(null); setPreview(null);
    try {
      const r = await api.post('/api/leave-types/accrual-run', { ...toRunBody(run), dryRun: true });
      setPreview(r.data);
    } catch (e) { setRunError(e.message || 'Could not preview.'); }
    finally { setRunning(false); }
  }, [run]);

  const doRun = useCallback(async () => {
    setRunning(true); setRunError(null);
    try {
      const r = await api.post('/api/leave-types/accrual-run', toRunBody(run));
      setSummary(r.data); setPreview(null);
      await load();
    } catch (e) { setRunError(e.message || 'Could not run accruals.'); }
    finally { setRunning(false); }
  }, [run, load]);
  const canPreview = !!run.periodKey && !!run.periodEnd && !running;

  const form = editing?.form;
  const needs = form ? methodNeeds(form.accrual_method) : {};
  const errors = form ? validateBank(form) : [];
  const set = (patch) => setEditing((e) => ({ ...e, form: { ...e.form, ...patch } }));

  const save = useCallback(async () => {
    const errs = validateBank(editing.form);
    if (errs.length) { setFormError(errs[0]); return; }
    setSaving(true); setFormError(null);
    try {
      const payload = toPayload(editing.form);
      if (editing.id) await api.patch(`/api/leave-types/${editing.id}`, payload);
      else await api.post('/api/leave-types', payload);
      setEditing(null);
      await load();
    } catch (e) { setFormError(e.message || 'Could not save.'); }
    finally { setSaving(false); }
  }, [editing, load]);

  const setActive = useCallback(async (bank, active) => {
    try {
      if (active) await api.patch(`/api/leave-types/${bank.id}`, { active: true });
      else await api.delete(`/api/leave-types/${bank.id}`); // soft-deactivate (never hard-delete)
      await load();
    } catch (e) { setError(e.message || 'Could not change the bank.'); }
  }, [load]);

  const sorted = useMemo(
    () => [...banks].sort((a, b) => (b.active === a.active ? String(a.code).localeCompare(b.code) : (b.active ? 1 : -1))),
    [banks]);

  return (
    <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          {onBack && <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-900">&larr; Back</button>}
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Leave banks</h3>
        </div>
        {canManage && !editing && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setRunOpen((o) => !o); setSummary(null); setPreview(null); setRunError(null); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <PlayCircle className="w-4 h-4" aria-hidden="true" /> Run accruals
            </button>
            <button onClick={() => { setEditing({ form: { ...EMPTY } }); setFormError(null); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors">
              <Plus className="w-4 h-4" aria-hidden="true" /> New bank
            </button>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {!canManage && (
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-2 text-sm">
            <Shield className="w-4 h-4" aria-hidden="true" /> Only chiefs can configure leave banks. This is a read-only view.
          </div>
        )}
        {loading && <div className="flex items-center gap-2 text-gray-500 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
        {error && !loading && <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 text-sm">{error}</div>}

        {/* Run accruals — pick period → preview (posts nothing) → confirm → summary */}
        {canManage && runOpen && !editing && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100"><PlayCircle className="w-4 h-4" aria-hidden="true" /> Run accruals for a period</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className={label}>Period key</label><input className={input} value={run.periodKey} placeholder="2026-P15" onChange={(e) => setRun((r) => ({ ...r, periodKey: e.target.value }))} /><p className={help}>A unique id for the pay period — re-running the same key never double-credits.</p></div>
              <div><label className={label}>Period start (optional)</label><input type="date" className={input} value={run.periodStart} onChange={(e) => setRun((r) => ({ ...r, periodStart: e.target.value }))} /><p className={help}>Members hired after this date wait for the next full period.</p></div>
              <div><label className={label}>Period end</label><input type="date" className={input} value={run.periodEnd} onChange={(e) => setRun((r) => ({ ...r, periodEnd: e.target.value }))} /><p className={help}>Years of service (for tenure tiers) computed as of this date.</p></div>
            </div>
            {runError && <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 text-xs">{runError}</div>}

            {!preview && !summary && (
              <button disabled={!canPreview} onClick={doPreview}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-800 dark:bg-gray-200 dark:text-gray-900 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" aria-hidden="true" />} Preview
              </button>
            )}

            {preview && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-3 py-2 text-xs">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>Preview only — nothing is posted yet. Will credit <b>{preview.willCredit}</b>, skip {preview.willSkip}{preview.willClamp ? `, ${preview.willClamp} clamped at cap` : ''}, for <b>+{Math.round((preview.totalHours || 0) * 100) / 100}h</b> total.</span>
                </div>
                {preview.preview && preview.preview.length > 0 && (
                  <div className="max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100 dark:bg-gray-800 text-gray-500 sticky top-0"><tr>
                        <th className="text-left px-2 py-1.5 font-semibold">Member</th><th className="text-left px-2 py-1.5 font-semibold">Bank</th>
                        <th className="text-right px-2 py-1.5 font-semibold">Now</th><th className="text-right px-2 py-1.5 font-semibold">+</th><th className="text-right px-2 py-1.5 font-semibold">After</th>
                      </tr></thead>
                      <tbody>
                        {preview.preview.map((p, i) => (
                          <tr key={i} className={`border-t border-gray-100 dark:border-gray-800 ${p.already_accrued ? 'text-gray-400' : ''}`}>
                            <td className="px-2 py-1.5">{p.member_name || `#${p.member_id}`}</td>
                            <td className="px-2 py-1.5">{p.code}</td>
                            <td className="px-2 py-1.5 text-right">{Math.round(Number(p.current) * 100) / 100}</td>
                            <td className="px-2 py-1.5 text-right">{p.already_accrued ? '—' : `+${Math.round(Number(p.amount) * 100) / 100}`}{p.clamped && !p.already_accrued ? ' (cap)' : ''}</td>
                            <td className="px-2 py-1.5 text-right font-medium">{p.already_accrued ? 'already run' : Math.round(Number(p.new_balance) * 100) / 100}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button disabled={running || preview.willCredit === 0} onClick={doRun}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden="true" />} Confirm and run
                  </button>
                  <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Back</button>
                </div>
              </div>
            )}

            {summary && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 px-3 py-2 text-sm">
                  <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>Credited <b>{summary.credited}</b>, skipped {summary.skipped}{summary.clamped ? `, ${summary.clamped} clamped` : ''}, for <b>+{Math.round((summary.totalHours || 0) * 100) / 100}h</b> — period {summary.periodKey}.</span>
                </div>
                <button onClick={() => { setSummary(null); setRun({ periodKey: '', periodStart: '', periodEnd: '' }); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Done</button>
              </div>
            )}
          </div>
        )}

        {/* Editor */}
        {editing && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Identity</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={label}>Code</label><input className={input} value={form.code} placeholder="VAC" onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></div>
                <div><label className={label}>Name</label><input className={input} value={form.name} placeholder="Vacation" onChange={(e) => set({ name: e.target.value })} /></div>
                <div><label className={label}>Unit</label><select className={input} value={form.unit} onChange={(e) => set({ unit: e.target.value })}>{UNITS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></div>
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"><input type="checkbox" checked={form.is_paid} onChange={(e) => set({ is_paid: e.target.checked })} /> Paid</label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"><input type="checkbox" checked={form.is_flsa_comp} onChange={(e) => set({ is_flsa_comp: e.target.checked })} /> FLSA comp time</label>
                </div>
              </div>
              {form.is_flsa_comp && <p className={help}>FLSA comp time can't be forfeited at year-end — over-cap hours are paid out, not lost. The carryover run skips comp banks automatically.</p>}
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Accrual</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={label}>Method</label><select className={input} value={form.accrual_method} onChange={(e) => set({ accrual_method: e.target.value })}>{METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                {needs.rate && <div><label className={label}>Rate ({form.unit === 'shifts' ? 'shifts' : form.unit === 'days' ? 'days' : 'hours'})</label><input type="number" min="0" step="0.01" className={input} value={form.accrual_rate} placeholder="8" onChange={(e) => set({ accrual_rate: e.target.value })} /></div>}
                {needs.period && <div><label className={label}>Period</label><select className={input} value={form.period} onChange={(e) => set({ period: e.target.value })}><option value="">Select…</option>{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>}
              </div>
              {needs.tiers && (
                <div className="mt-3">
                  <div className="flex items-center justify-between"><span className={label}>Tenure tiers (rate steps by years of service)</span>
                    <button onClick={() => set({ tenure_tiers: [...(form.tenure_tiers || []), { years: '', rate: '' }] })} className="text-xs text-red-700 hover:text-red-800 font-semibold">+ Add tier</button></div>
                  {(form.tenure_tiers || []).length === 0 && <p className={help}>Optional. Without tiers everyone accrues at the base rate above.</p>}
                  {(form.tenure_tiers || []).map((t, i) => (
                    <div key={i} className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-gray-500">after</span>
                      <input type="number" min="0" step="1" className={`${input} w-20`} value={t.years} placeholder="5" onChange={(e) => { const tt = [...form.tenure_tiers]; tt[i] = { ...tt[i], years: e.target.value }; set({ tenure_tiers: tt }); }} />
                      <span className="text-xs text-gray-500">yrs →</span>
                      <input type="number" min="0" step="0.01" className={`${input} w-24`} value={t.rate} placeholder="6" onChange={(e) => { const tt = [...form.tenure_tiers]; tt[i] = { ...tt[i], rate: e.target.value }; set({ tenure_tiers: tt }); }} />
                      <button onClick={() => set({ tenure_tiers: form.tenure_tiers.filter((_, j) => j !== i) })} aria-label="Remove tier" className="text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Limits</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={label}>Max balance</label><input type="number" min="0" step="0.01" className={input} value={form.accrual_cap} placeholder="e.g. 480" onChange={(e) => set({ accrual_cap: e.target.value })} /><p className={help}>Accrual stops here — the bank never exceeds it.</p></div>
                <div><label className={label}>Carryover cap</label><input type="number" min="0" step="0.01" className={input} value={form.carryover_cap} placeholder="e.g. 40" onChange={(e) => set({ carryover_cap: e.target.value })} /><p className={help}>Max carried into next year — the excess is forfeited at the carryover run (comp banks exempt).</p></div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"><input type="checkbox" checked={form.allow_negative} onChange={(e) => set({ allow_negative: e.target.checked })} /> Allow negative balance</label>
                  {form.allow_negative && <div className="mt-2 w-40"><label className={label}>Down to (floor)</label><input type="number" max="0" step="0.5" className={input} value={form.negative_floor} placeholder="-24" onChange={(e) => set({ negative_floor: e.target.value })} /></div>}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-400">Summary</span>
              <p className="text-sm text-gray-800 dark:text-gray-100">{accrualSummary(toPayload(form))}</p>
            </div>

            {formError && <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 text-xs">{formError}</div>}
            <div className="flex items-center gap-2">
              <button disabled={saving || errors.length > 0} onClick={save}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden="true" />} {editing.id ? 'Save changes' : 'Create bank'}
              </button>
              <button onClick={() => { setEditing(null); setFormError(null); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            </div>
          </div>
        )}

        {/* Bank list */}
        {!loading && !error && !editing && (
          banks.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">No leave banks yet.{canManage ? ' Create your department\'s first bank above.' : ''}</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {sorted.map((bank) => (
                <li key={bank.id} className={`flex flex-wrap items-center justify-between gap-2 py-3 ${bank.active ? '' : 'opacity-60'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{bank.name}</span>
                      <span className="text-[11px] uppercase tracking-wide text-gray-400">{bank.code}</span>
                      {bank.is_flsa_comp && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">FLSA COMP</span>}
                      {!bank.active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Inactive</span>}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{accrualSummary(bank)}</div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditing({ id: bank.id, form: toForm(bank) }); setFormError(null); }} aria-label={`Edit ${bank.name}`} className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white"><Pencil className="w-4 h-4" /></button>
                      {bank.active
                        ? <button onClick={() => setActive(bank, false)} aria-label={`Deactivate ${bank.name}`} className="p-2 text-gray-400 hover:text-amber-600" title="Deactivate — keeps history and balances; reactivate anytime"><Archive className="w-4 h-4" /></button>
                        : <button onClick={() => setActive(bank, true)} aria-label={`Reactivate ${bank.name}`} className="p-2 text-gray-400 hover:text-emerald-600" title="Reactivate"><RotateCcw className="w-4 h-4" /></button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </section>
  );
}
