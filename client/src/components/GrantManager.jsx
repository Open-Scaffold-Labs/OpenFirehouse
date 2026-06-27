import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Plus, Search, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, Clock, Pencil, CalendarDays, Loader2,
} from 'lucide-react';
import { GRANT_TYPES, GRANT_STATUSES, STATUS_COLORS } from '../data/grants';
import { api } from '../utils/api';
import FieldTooltip from './FieldTooltip';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import DictateTextarea from './DictateTextarea';
import AIActionButton from './AIActionButton';

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(n) { return n != null ? `$${Number(n).toLocaleString()}` : '—'; }

function deadlineDays(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - new Date('2026-03-06')) / 86400000);
}

function StatusChip({ status }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
      {status}
    </span>
  );
}

function SpendBar({ awarded, spent }) {
  if (!awarded || !spent) return null;
  const pct = Math.min(100, Math.round((spent / awarded) * 100));
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 w-10 text-right">{pct}%</span>
    </div>
  );
}

// ─── Expanded detail ──────────────────────────────────────────────────────

function GrantDetail({ grant, onEdit }) {
  const spent = grant.expenditures.reduce((s, e) => s + e.amount, 0);
  const remaining = grant.amountAwarded != null ? grant.amountAwarded - spent : null;

  const Field = ({ label, value }) => (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{value || '—'}</p>
    </div>
  );

  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-4">

      {/* Overview grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Funding Agency"    value={grant.fundingAgency} />
        <Field label="Program Year"      value={grant.programYear} />
        <Field label="Application Date"  value={grant.applicationDate} />
        <Field label="Award Date"        value={grant.awardDate} />
        <Field label="Amount Requested"  value={fmt(grant.amountRequested)} />
        <Field label="Amount Awarded"    value={fmt(grant.amountAwarded)} />
        <Field label="Match Required"    value={grant.matchRequired ? `${grant.matchPercent}% — ${fmt(grant.matchAmount)}` : 'No match required'} />
        <Field label="Contact"           value={[grant.contactName, grant.contactEmail].filter(Boolean).join(' · ')} />
        <Field label="Period Start"      value={grant.grantPeriodStart} />
        <Field label="Period End"        value={grant.grantPeriodEnd} />
      </div>

      {/* Financial summary */}
      {grant.amountAwarded != null && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Financial Summary</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { l: 'Awarded',   v: fmt(grant.amountAwarded), color: 'text-green-700 dark:text-green-300' },
              { l: 'Spent',     v: fmt(spent),               color: 'text-gray-800 dark:text-gray-100'  },
              { l: 'Remaining', v: fmt(remaining),           color: remaining != null && remaining < 0 ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300' },
            ].map(({ l, v, color }) => (
              <div key={l} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 text-center">
                <p className={`text-lg font-black ${color}`}>{v}</p>
                <p className="text-[10px] text-gray-400">{l}</p>
              </div>
            ))}
          </div>
          <SpendBar awarded={grant.amountAwarded} spent={spent} />
        </div>
      )}

      {/* Reporting deadlines */}
      {grant.reportingDeadlines?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Reporting Deadlines</p>
          <div className="space-y-1.5">
            {grant.reportingDeadlines.map((d, i) => {
              const days = deadlineDays(d.date);
              const overdue = days != null && days < 0;
              const soon    = days != null && days >= 0 && days <= 60;
              return (
                <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                  d.submitted ? 'bg-green-50 dark:bg-green-950/50 border border-green-100 dark:border-green-900' :
                  overdue     ? 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900' :
                  soon        ? 'bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900' : 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700'
                }`}>
                  {d.submitted
                    ? <CheckCircle size={13} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                    : overdue ? <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                    : <Clock size={13} className="text-gray-400 flex-shrink-0" />
                  }
                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 font-medium">{d.label}</span>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{d.date}</span>
                  <span className={`text-[10px] font-bold ml-2 ${
                    d.submitted ? 'text-green-700 dark:text-green-300' : overdue ? 'text-red-700 dark:text-red-300' : soon ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400'
                  }`}>
                    {d.submitted ? 'Submitted' : days === null ? '' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expenditures */}
      {grant.expenditures?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Expenditures</p>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="grid grid-cols-[1fr_3fr_1fr] gap-4 px-4 py-2 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">
              <span>Date</span><span>Description</span><span className="text-right">Amount</span>
            </div>
            {grant.expenditures.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_3fr_1fr] gap-4 px-4 py-2 border-b border-gray-50 last:border-b-0">
                <span className="text-xs text-gray-600 dark:text-gray-300">{e.date}</span>
                <span className="text-xs text-gray-700 dark:text-gray-300">{e.description}</span>
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 text-right">{fmt(e.amount)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_3fr_1fr] gap-4 px-4 py-2 bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-700">
              <span /><span className="text-xs font-bold text-gray-600 dark:text-gray-300">Total Spent</span>
              <span className="text-xs font-black text-gray-900 dark:text-gray-100 text-right">{fmt(spent)}</span>
            </div>
          </div>
        </div>
      )}

      {/* AI Actions */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Actions</p>
        <div className="flex flex-wrap gap-2">
          <AIActionButton
            action="draft_grant_narrative"
            context={{ module: 'grants', recordId: grant.id, data: grant }}
            label="Draft Narrative"
            variant="inline"
          />
        </div>
      </div>

      {/* Linked Meetings */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
        <LinkedMeetings module="grants" recordId={grant.id} recordLabel={grant.title} />
        <Attachments module="grants" recordId={grant.id} recordLabel={grant.title} />
      </div>

      {/* Notes */}
      {grant.notes && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 leading-relaxed">{grant.notes}</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={() => onEdit(grant)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">
          <Pencil size={11} /> Edit Grant
        </button>
      </div>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────

function GrantForm({ initial, onSave, onClose }) {
  const blank = {
    grantName: '', type: GRANT_TYPES[0], fundingAgency: '', programYear: new Date().getFullYear(),
    status: 'Planning', applicationDate: '', awardDate: '',
    amountRequested: '', amountAwarded: '',
    matchRequired: false, matchPercent: 5, matchAmount: '',
    grantPeriodStart: '', grantPeriodEnd: '',
    reportingDeadlines: [{ label: '', date: '', submitted: false }],
    expenditures: [],
    contactName: '', contactEmail: '', notes: '',
  };
  const [form, setForm] = useState(initial ?? blank);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function setDeadline(i, key, val) {
    setForm(f => {
      const d = [...f.reportingDeadlines];
      d[i] = { ...d[i], [key]: val };
      return { ...f, reportingDeadlines: d };
    });
  }
  function addDeadline() { setForm(f => ({ ...f, reportingDeadlines: [...f.reportingDeadlines, { label: '', date: '', submitted: false }] })); }
  function removeDeadline(i) { setForm(f => ({ ...f, reportingDeadlines: f.reportingDeadlines.filter((_, j) => j !== i) })); }

  function setExpenditure(i, key, val) {
    setForm(f => {
      const e = [...f.expenditures];
      e[i] = { ...e[i], [key]: val };
      return { ...f, expenditures: e };
    });
  }
  function addExpenditure() { setForm(f => ({ ...f, expenditures: [...f.expenditures, { date: '', description: '', amount: '' }] })); }
  function removeExpenditure(i) { setForm(f => ({ ...f, expenditures: f.expenditures.filter((_, j) => j !== i) })); }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      ...form,
      id: form.id ?? Date.now(),
      reportingDeadlines: form.reportingDeadlines.filter(d => d.label.trim()),
      expenditures: form.expenditures.filter(e => e.description.trim()).map(e => ({ ...e, amount: Number(e.amount) })),
      amountRequested: form.amountRequested !== '' ? Number(form.amountRequested) : null,
      amountAwarded:   form.amountAwarded   !== '' ? Number(form.amountAwarded)   : null,
      matchAmount:     form.matchAmount     !== '' ? Number(form.matchAmount)     : null,
    });
  }

  const TF = ({ label, k, type = 'text', required, tooltip }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {tooltip && <FieldTooltip text={tooltip} />}
      </label>
      <input type={type} value={form[k] ?? ''} onChange={e => set(k, e.target.value)}
        className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
        required={required} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700 rounded-t-2xl">
          <h2 className="text-base font-bold text-white">{initial ? 'Edit Grant' : 'Add Grant'}</h2>
          <button onClick={onClose} aria-label="Close form" className="text-red-200 hover:text-white"><XCircle size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          <TF label="Grant Name" k="grantName" required />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Type
                <FieldTooltip text="The grant program category. AFG = FEMA Assistance to Firefighters Grant. SAFER = Staffing grants. State/Local = funded through your state fire marshal or county. Private = foundation or corporate grants." />
              </label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                aria-label="Grant type"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
                {GRANT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Status
                <FieldTooltip text="Track the grant lifecycle: Planned → Applied → Under Review → Awarded → Active → Closed. Use 'Denied' or 'Withdrawn' to keep a complete history without deleting the record." />
              </label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                aria-label="Grant status"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
                {GRANT_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TF label="Funding Agency" k="fundingAgency"
              tooltip="The organization issuing the grant (e.g. FEMA, DHS, MN Dept of Public Safety). Used for reporting and correspondence." />
            <TF label="Program Year" k="programYear" type="number"
              tooltip="The fiscal year the grant was offered (e.g. 2025). Some grants span multiple years — enter the year the application period opened." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TF label="Application Date" k="applicationDate" type="date" />
            <TF label="Award Date" k="awardDate" type="date" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TF label="Amount Requested ($)" k="amountRequested" type="number" />
            <TF label="Amount Awarded ($)" k="amountAwarded" type="number" />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={form.matchRequired} onChange={e => set('matchRequired', e.target.checked)} className="rounded" />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Match Required
                <FieldTooltip text="Many federal grants (e.g. AFG) require the department to provide a cash or in-kind match. Check this box if the grant requires your department to contribute a portion of the total project cost." />
              </span>
            </label>
            {form.matchRequired && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TF label="Match %" k="matchPercent" type="number"
                  tooltip="Your department's required contribution as a percentage of the total project cost. AFG career departments = 20%, volunteer/mostly volunteer = 5%." />
                <TF label="Match Amount ($)" k="matchAmount" type="number"
                  tooltip="The dollar value of your match. Can be calculated from Match % × (Amount Awarded / (1 − Match%)). Include both cash and documented in-kind contributions." />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TF label="Grant Period Start" k="grantPeriodStart" type="date"
              tooltip="The first day expenses can be charged to this grant. Purchases made before this date are typically ineligible for reimbursement." />
            <TF label="Grant Period End" k="grantPeriodEnd" type="date"
              tooltip="The last day eligible expenses can be incurred. After this date, unused funds are typically returned. Set a reporting deadline reminder well before this date." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TF label="Contact Name" k="contactName" />
            <TF label="Contact Email" k="contactEmail" type="email" />
          </div>

          {/* Reporting Deadlines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Reporting Deadlines</label>
              <button type="button" onClick={addDeadline} className="text-[10px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">+ Add</button>
            </div>
            <div className="space-y-2">
              {form.reportingDeadlines.map((d, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={d.label} onChange={e => setDeadline(i, 'label', e.target.value)} aria-label="Report label" placeholder="Report label"
                    className="flex-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
                  <input type="date" value={d.date} onChange={e => setDeadline(i, 'date', e.target.value)} aria-label="Deadline date"
                    className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    <input type="checkbox" checked={d.submitted} onChange={e => setDeadline(i, 'submitted', e.target.checked)} className="rounded" />
                    Done
                  </label>
                  {form.reportingDeadlines.length > 1 && (
                    <button type="button" onClick={() => removeDeadline(i)} aria-label="Remove reporting deadline" className="text-gray-300 dark:text-gray-600 hover:text-red-500"><XCircle size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Expenditures */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Expenditures</label>
              <button type="button" onClick={addExpenditure} className="text-[10px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">+ Add</button>
            </div>
            <div className="space-y-2">
              {form.expenditures.map((e, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="date" value={e.date} onChange={ev => setExpenditure(i, 'date', ev.target.value)} aria-label="Expenditure date"
                    className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 w-32 dark:bg-gray-900 dark:text-gray-100" />
                  <input value={e.description} onChange={ev => setExpenditure(i, 'description', ev.target.value)} aria-label="Expenditure description" placeholder="Description"
                    className="flex-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
                  <input type="number" value={e.amount} onChange={ev => setExpenditure(i, 'amount', ev.target.value)} aria-label="Expenditure amount" placeholder="Amount"
                    className="w-24 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
                  <button type="button" onClick={() => removeExpenditure(i)} aria-label="Remove expenditure" className="text-gray-300 dark:text-gray-600 hover:text-red-500"><XCircle size={14} /></button>
                </div>
              ))}
              {form.expenditures.length === 0 && (
                <p className="text-[10px] text-gray-400 italic">No expenditures logged yet.</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
            <DictateTextarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              name="notes" id="grant-notes" className="text-xs" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700">
              {initial ? 'Save Changes' : 'Add Grant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function GrantManager() {
  const [grants,     setGrants]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [statusFlt,  setStatusFlt]  = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState(null);

  const load = useCallback(async () => {
    try { setLoading(true); setError(null); const r = await api.get('/api/grants'); setGrants(r.data ?? []); }
    catch(e) { setError('Could not load grants.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = grants.filter(g => {
    const q = search.toLowerCase();
    const matchQ = !q || g.grantName.toLowerCase().includes(q) || g.fundingAgency.toLowerCase().includes(q) || g.type.toLowerCase().includes(q);
    const matchS = statusFlt === 'All' || g.status === statusFlt;
    return matchQ && matchS;
  });

  const totalAwarded = grants.filter(g => g.amountAwarded != null).reduce((s, g) => s + g.amountAwarded, 0);
  const totalActive  = grants.filter(g => g.status === 'Active' || g.status === 'Awarded').length;
  const upcomingDeadlines = grants.flatMap(g =>
    (g.reportingDeadlines || [])
      .filter(d => !d.submitted && d.date)
      .map(d => ({ ...d, grantName: g.grantName, days: deadlineDays(d.date) }))
  ).filter(d => d.days != null && d.days <= 90).sort((a, b) => a.days - b.days);

  async function handleSave(data) {
    try {
      if (data.id && grants.find(g => g.id === data.id)) {
        const res = await api.patch(`/api/grants/${data.id}`, data);
        setGrants(prev => prev.map(g => g.id === data.id ? res.data : g));
      } else {
        const res = await api.post('/api/grants', data);
        setGrants(prev => [...prev, res.data]);
      }
      setFormOpen(false); setEditing(null);
    } catch(e) { console.error('Failed to save grant', e); }
  }
  function openEdit(g) { setEditing(g); setFormOpen(true); }

  if (loading) return <div className="p-6 flex items-center gap-2 text-gray-500 dark:text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading grants…</div>;
  if (error)   return <div className="p-6 space-y-2"><p className="text-red-600 dark:text-red-400 text-sm">{error}</p><button onClick={load} className="text-sm text-red-600 dark:text-red-400 underline">Retry</button></div>;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">Grant Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">AFG · SAFER · State grants · Expenditure tracking · Reporting deadlines</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-sm">
          <Plus size={15} /> Add Grant
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Grants',     value: grants.length,                   color: 'text-gray-900 dark:text-gray-100'  },
          { label: 'Active / Awarded', value: totalActive,                     color: 'text-green-700 dark:text-green-300' },
          { label: 'Total Awarded',    value: `$${totalAwarded.toLocaleString()}`, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Upcoming Deadlines', value: upcomingDeadlines.length,      color: upcomingDeadlines.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3 shadow-sm">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Upcoming deadlines banner */}
      {upcomingDeadlines.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 space-y-1.5">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <CalendarDays size={13} /> Upcoming Reporting Deadlines (next 90 days)
          </p>
          {upcomingDeadlines.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={`font-bold w-20 flex-shrink-0 ${d.days < 0 ? 'text-red-700 dark:text-red-300' : d.days <= 30 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-300'}`}>
                {d.days < 0 ? `${Math.abs(d.days)}d overdue` : `${d.days}d`}
              </span>
              <span className="text-gray-700 dark:text-gray-300">{d.grantName}</span>
              <span className="text-gray-400">— {d.label}</span>
              <span className="font-mono text-gray-500 dark:text-gray-400 ml-auto">{d.date}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Search grants"
            placeholder="Search grants…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100" />
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 flex-wrap">
          {['All', 'Planning', 'Submitted', 'Awarded', 'Active', 'Closed', 'Denied'].map(s => (
            <button key={s} onClick={() => setStatusFlt(s)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                statusFlt === s ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Grant list */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[2fr_1.5fr_0.8fr_1fr_1fr_1fr_24px] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <span>Grant</span><span>Agency</span><span>Year</span><span>Requested</span><span>Awarded</span><span>Status</span><span />
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">No grants match your filters.</p>
        )}

        {filtered.map(g => {
          const spent = g.expenditures.reduce((s, e) => s + e.amount, 0);
          const isOpen = expandedId === g.id;
          return (
            <div key={g.id} className="border-b border-gray-50 last:border-b-0">
              <div onClick={() => setExpandedId(isOpen ? null : g.id)}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                aria-label={`Toggle details for grant ${g.grantName}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isOpen ? null : g.id); } }}
                className="grid grid-cols-[2fr_1.5fr_0.8fr_1fr_1fr_1fr_24px] gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 items-center">
                <div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{g.grantName}</p>
                  <p className="text-[10px] text-gray-400">{g.type}</p>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{g.fundingAgency}</span>
                <span className="text-xs text-gray-600 dark:text-gray-300">{g.programYear}</span>
                <span className="text-xs text-gray-700 dark:text-gray-300">{fmt(g.amountRequested)}</span>
                <div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{fmt(g.amountAwarded)}</p>
                  {g.amountAwarded && <SpendBar awarded={g.amountAwarded} spent={spent} />}
                </div>
                <span><StatusChip status={g.status} /></span>
                {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </div>
              {isOpen && <GrantDetail grant={g} onEdit={openEdit} />}
            </div>
          );
        })}
      </div>

      {formOpen && (
        <GrantForm initial={editing} onSave={handleSave} onClose={() => { setFormOpen(false); setEditing(null); }} />
      )}
    </div>
  );
}
