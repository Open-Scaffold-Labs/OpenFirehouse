import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, X, CalendarOff, CheckCircle,
  XCircle, Clock, Loader2, AlertTriangle, Users, UserPlus, Shield,
} from 'lucide-react';
import { api } from '../utils/api';
import { SHIFT_TIMES } from '../data/schedule';
import DeleteConfirm from './DeleteConfirm';
import CoverageWorkbench from './CoverageWorkbench';

const LEAVE_TYPES = ['PTO', 'Sick', 'Personal', 'Training', 'LODD', 'Military', 'Other'];
const STATUS_OPTIONS = ['Pending', 'Approved', 'Denied', 'Cancelled'];

const STATUS_STYLES = {
  Pending:   'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  Approved:  'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  Denied:    'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  Cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

const STATUS_ICONS = {
  Pending:   <Clock className="h-3 w-3" />,
  Approved:  <CheckCircle className="h-3 w-3" />,
  Denied:    <XCircle className="h-3 w-3" />,
  Cancelled: <XCircle className="h-3 w-3" />,
};

// ── Impact Preview Card ──────────────────────────────────────────────────────
function ImpactPreview({ impact }) {
  if (!impact || impact.totalAffectedShifts === 0) {
    return (
      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 ring-1 ring-emerald-200 px-3 py-2">
        <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
          <CheckCircle className="h-3.5 w-3.5" />
          No scheduled shifts affected by this leave period.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 ring-1 ring-amber-200 p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        Coverage Impact: {impact.totalAffectedShifts} shift{impact.totalAffectedShifts !== 1 ? 's' : ''} affected
      </p>

      {impact.dropsBelowMinimum > 0 && (
        <p className="text-xs text-red-700 dark:text-red-300">
          {impact.dropsBelowMinimum} shift{impact.dropsBelowMinimum !== 1 ? 's' : ''} will drop below minimum crew
        </p>
      )}

      {impact.shifts.length > 0 && (
        <div className="space-y-1">
          {impact.shifts.slice(0, 5).map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-amber-700 dark:text-amber-300">
                {new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {' — '}{s.shiftType}
              </span>
              <span className={`font-medium ${s.needsCoverage ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {s.crewBefore} → {s.crewAfter} crew
                {s.needsCoverage && ' ⚠'}
              </span>
            </div>
          ))}
          {impact.shifts.length > 5 && (
            <p className="text-xs text-amber-500 italic">+{impact.shifts.length - 5} more shifts…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Workflow Result Banner ────────────────────────────────────────────────────
function WorkflowBanner({ result, onDismiss }) {
  if (!result) return null;
  return (
    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 ring-1 ring-blue-200 px-4 py-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            Leave approved — scheduling updated automatically
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            {result.shiftsModified} shift{result.shiftsModified !== 1 ? 's' : ''} updated
            {result.swapRequestsCreated > 0 && (
              <span> · {result.swapRequestsCreated} coverage request{result.swapRequestsCreated !== 1 ? 's' : ''} opened</span>
            )}
          </p>
          {result.coverageGaps.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              <p className="text-xs font-medium text-red-700 dark:text-red-300">Coverage gaps needing attention:</p>
              {result.coverageGaps.map((g, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400 pl-3">
                  {new Date(g.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' — '}{g.shiftType}: need {g.needed} more member{g.needed !== 1 ? 's' : ''}
                </p>
              ))}
            </div>
          )}
        </div>
        <button onClick={onDismiss} aria-label="Dismiss notification" className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-400">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Coverage Gaps Panel ──────────────────────────────────────────────────────
function CoverageGapsPanel({ gaps, members, onAssign }) {
  if (!gaps || gaps.length === 0) return null;

  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-red-200 overflow-hidden">
      <div className="px-5 py-3 bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-900">
        <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Open Coverage Gaps ({gaps.length})
        </h3>
        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">These shifts need additional crew assigned</p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {gaps.map((gap, i) => (
          <div key={i} className="px-5 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {new Date(gap.shift.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'short', day: 'numeric'
                  })}
                  <span className="text-gray-400 ml-2">
                    {gap.shift.shiftType} ({SHIFT_TIMES[gap.shift.shiftType]?.label})
                  </span>
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    <Users className="h-3 w-3 inline mr-1" />
                    {gap.shift.crewCount} assigned
                  </span>
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                    Need coverage from: {gap.swap.requesterName}
                  </span>
                  {gap.swap.status === 'Claimed' && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      Claimed by: {gap.swap.coveredByName}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
                  gap.swap.status === 'Open'
                    ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900'
                    : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900'
                }`}>
                  {gap.swap.status}
                </span>
                {gap.swap.status === 'Open' && onAssign && (
                  <button
                    onClick={() => onAssign(gap)}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
                  >
                    <UserPlus className="h-3 w-3" /> Assign
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Assign Coverage Modal ────────────────────────────────────────────────────
function AssignCoverageModal({ gap, members, onSave, onClose }) {
  const [selectedMemberId, setSelectedMemberId] = useState('');

  const available = members.filter(m =>
    (m.status === 'Active' || m.status === 'Probationary') &&
    !gap.shift.crew.includes(m.name) &&
    m.name !== gap.swap.requesterName
  );

  function handleSubmit(e) {
    e.preventDefault();
    const member = members.find(m => m.id === Number(selectedMemberId));
    if (member) onSave(gap, member);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-red-700">
          <div>
            <h2 className="text-base font-semibold text-white">Assign Coverage</h2>
            <p className="text-xs text-red-200 mt-0.5">
              {gap.shift.shiftType} — {new Date(gap.shift.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="text-red-200 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Available Member</label>
            <select
              value={selectedMemberId}
              onChange={e => setSelectedMemberId(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
            >
              <option value="">Choose member…</option>
              {available.map(m => (
                <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>
              ))}
            </select>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            This member will be added to the shift crew and the swap request will be marked as covered.
          </p>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
              Assign
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Leave Form Modal (with impact preview) ───────────────────────────────────
function LeaveFormModal({ leave, members, onSave, onClose }) {
  const [form, setForm] = useState({
    memberId: '',
    memberName: '',
    type: 'PTO',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reason: '',
    notes: '',
  });
  const [impact, setImpact] = useState(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  useEffect(() => {
    if (leave) {
      setForm({
        memberId: leave.memberId || '',
        memberName: leave.memberName || '',
        type: leave.type || 'PTO',
        startDate: leave.startDate || '',
        endDate: leave.endDate || '',
        reason: leave.reason || '',
        notes: leave.notes || '',
      });
    }
  }, [leave]);

  // Auto-fetch impact when member + dates are set
  useEffect(() => {
    if (!form.memberName || !form.startDate || !form.endDate || leave) return;
    if (form.endDate < form.startDate) return;

    const timer = setTimeout(async () => {
      setLoadingImpact(true);
      try {
        const res = await api.post('/api/leave/impact', {
          memberName: form.memberName,
          startDate: form.startDate,
          endDate: form.endDate,
        });
        setImpact(res.data || res.impact || null);
      } catch (err) {
        console.error('Impact analysis failed:', err);
        setImpact(null);
      } finally {
        setLoadingImpact(false);
      }
    }, 500); // debounce

    return () => clearTimeout(timer);
  }, [form.memberName, form.startDate, form.endDate, leave]);

  function handleMemberChange(e) {
    const id = parseInt(e.target.value);
    const m = members.find(m => m.id === id);
    setForm(p => ({ ...p, memberId: id, memberName: m?.name || '' }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, id: leave?.id });
  }

  const activeMembers = members.filter(m => m.status === 'Active' || m.status === 'Probationary');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-red-700">
          <div>
            <h2 className="text-base font-semibold text-white">
              {leave ? 'Edit Leave Request' : 'New Leave Request'}
            </h2>
            <p className="text-xs text-red-200 mt-0.5">Request time off or report absence</p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="text-red-200 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Member */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Member</label>
            <select
              value={form.memberId}
              onChange={handleMemberChange}
              required
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
            >
              <option value="">Select member…</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>
              ))}
            </select>
          </div>

          {/* Leave type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Leave Type</label>
            <div className="flex flex-wrap gap-2">
              {LEAVE_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, type }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.type === type
                      ? 'bg-red-700 text-white border-red-700'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-red-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
              />
            </div>
          </div>

          {/* Impact Preview — shows before submit */}
          {!leave && (
            loadingImpact ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Analyzing schedule impact…
              </div>
            ) : impact ? (
              <ImpactPreview impact={impact} />
            ) : null
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
            <input
              type="text"
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              placeholder="Brief reason…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 resize-none dark:bg-gray-900"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
              {leave ? 'Save Changes' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function LeaveManager({ onBack, onOpenCoverage }) {
  const [requests, setRequests] = useState([]);
  const [members, setMembers] = useState([]);
  const [coverageGaps, setCoverageGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [workflowResult, setWorkflowResult] = useState(null);
  const [assigningGap, setAssigningGap] = useState(null);
  const [coverageLeave, setCoverageLeave] = useState(null);
  const [denying, setDenying] = useState(null);            // the request being denied (a reason is required)
  const [denyReason, setDenyReason] = useState('');
  const [balancesByKey, setBalancesByKey] = useState({});  // `${member_id}:${leave_type_id}` → enriched balance row

  const fetchData = useCallback(async () => {
    try {
      const [lRes, mRes, gRes, bRes] = await Promise.all([
        api.get('/api/leave'),
        api.get('/api/members'),
        api.get('/api/leave/coverage-gaps'),
        api.get('/api/leave-types/balances').catch(() => ({ data: [] })), // banks may not be set up yet
      ]);
      const requests = Array.isArray(lRes?.data) ? lRes.data : Array.isArray(lRes) ? lRes : [];
      const members = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      const gaps = Array.isArray(gRes?.data) ? gRes.data : Array.isArray(gRes) ? gRes : [];
      const balRows = Array.isArray(bRes?.data) ? bRes.data : [];
      const balMap = {};
      for (const b of balRows) balMap[`${b.member_id}:${b.leave_type_id}`] = b;
      setRequests(requests);
      setMembers(members);
      setCoverageGaps(gaps);
      setBalancesByKey(balMap);
    } catch (err) {
      console.error('Failed to load leave data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave(formData) {
    try {
      if (formData.id) {
        await api.patch(`/api/leave/${formData.id}`, formData);
      } else {
        const res = await api.post('/api/leave', formData);
        // Show impact from the response
        if (res.impact && res.impact.totalAffectedShifts > 0) {
          setWorkflowResult({
            shiftsModified: 0,
            swapRequestsCreated: 0,
            coverageGaps: [],
            message: `Request submitted. ${res.impact.totalAffectedShifts} shift${res.impact.totalAffectedShifts !== 1 ? 's' : ''} will be affected if approved.`,
          });
        }
      }
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to save leave request');
    }
    setFormOpen(false);
    setEditing(null);
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/api/leave/${id}`);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to delete leave request');
    }
    setDeleting(null);
  }

  async function handleStatusChange(req, newStatus, reason) {
    try {
      const res = await api.patch(`/api/leave/${req.id}`, {
        status: newStatus,
        approvedBy: newStatus === 'Approved' || newStatus === 'Denied' ? 'Chief' : undefined,
        ...(reason ? { reason } : {}),
      });
      // Show workflow result if approval triggered changes
      if (res.workflow) {
        setWorkflowResult(res.workflow);
      }
      setDenying(null);
      setDenyReason('');
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to update status');
    }
  }

  async function handleAssignCoverage(gap, member) {
    try {
      // Add member to shift crew
      const shiftRes = await api.get(`/api/shifts/${gap.shift.id}`);
      const shift = shiftRes.data;
      const newCrew = [...(shift.crew || []), member.name];
      await api.patch(`/api/shifts/${gap.shift.id}`, { crew: newCrew });

      // Update swap request to claimed/approved
      await api.patch(`/api/shift-swaps/${gap.swap.id}`, {
        coveredById: member.id,
        coveredByName: member.name,
        status: 'Approved',
      });

      await fetchData();
      setAssigningGap(null);
    } catch (err) {
      alert(err.message || 'Failed to assign coverage');
    }
  }

  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter);

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function dayCount(start, end) {
    if (!start || !end) return 0;
    const diff = new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00');
    return Math.max(1, Math.round(diff / (24 * 60 * 60 * 1000)) + 1);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading leave requests…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              ← Back to Schedule
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <CalendarOff className="h-5 w-5 text-red-700 dark:text-red-300" />
              Leave &amp; Time Off
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {requests.filter(r => r.status === 'Pending').length} pending
              {coverageGaps.length > 0 && (
                <span className="text-red-600 dark:text-red-400 font-medium"> · {coverageGaps.length} coverage gap{coverageGaps.length !== 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition-colors">
          <Plus className="h-3.5 w-3.5" /> New Request
        </button>
      </div>

      {/* Workflow result banner */}
      <WorkflowBanner result={workflowResult} onDismiss={() => setWorkflowResult(null)} />

      {/* Coverage gaps panel */}
      <CoverageGapsPanel
        gaps={coverageGaps}
        members={members}
        onAssign={gap => setAssigningGap(gap)}
      />

      {/* Filter pills */}
      <div className="flex gap-2">
        {['all', ...STATUS_OPTIONS].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-red-700 text-white border-red-700'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-red-400'
            }`}
          >
            {s === 'all' ? 'All' : s}
            {s !== 'all' && (
              <span className="ml-1 opacity-70">
                ({requests.filter(r => r.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Request list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 p-12 text-center">
          <CalendarOff className="mx-auto h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No leave requests</p>
          <p className="text-xs text-gray-400 mt-1">
            {statusFilter !== 'all' ? `No ${statusFilter.toLowerCase()} requests` : 'Submit a request for PTO, sick leave, or other time off'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <div key={req.id} className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 overflow-hidden">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="h-8 w-8 rounded-full bg-red-700 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                      {(req.memberName || '?').split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{req.memberName}</h3>
                      <span className="text-xs text-gray-400">{req.type}</span>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${STATUS_STYLES[req.status]}`}>
                      {STATUS_ICONS[req.status]}
                      {req.status}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {req.status === 'Pending' && (
                      <>
                        <button onClick={() => setCoverageLeave(coverageLeave?.id === req.id ? null : req)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                            coverageLeave?.id === req.id
                              ? 'bg-red-700 text-white'
                              : 'border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-red-400 hover:text-red-700 dark:hover:text-red-300'
                          }`}
                          title="Find coverage for this request">
                          <Shield className="h-3 w-3" /> Coverage
                        </button>
                        <button onClick={() => handleStatusChange(req, 'Approved')}
                          className="p-1.5 rounded text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                          title="Approve — will auto-update shifts and open coverage requests"
                          aria-label="Approve leave request">
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button onClick={() => { setDenying(denying?.id === req.id ? null : req); setDenyReason(''); }}
                          className={`p-1.5 rounded transition-colors ${denying?.id === req.id ? 'text-red-600 bg-red-50 dark:bg-red-950/50' : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50'}`}
                          title="Deny — a reason is required"
                          aria-label="Deny leave request">
                          <XCircle className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button onClick={() => { setEditing(req); setFormOpen(true); }}
                      aria-label="Edit leave request"
                      className="p-1.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleting({ ...req, name: `${req.memberName}'s ${req.type} request` })}
                      aria-label="Delete leave request"
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Dates:</span>{' '}
                    {formatDate(req.startDate)} — {formatDate(req.endDate)}
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Duration:</span>{' '}
                    {dayCount(req.startDate, req.endDate)} day{dayCount(req.startDate, req.endDate) !== 1 ? 's' : ''}
                  </div>
                  {req.approvedBy && (
                    <div>
                      <span className="font-medium text-gray-500 dark:text-gray-400">By:</span>{' '}
                      {req.approvedBy}
                    </div>
                  )}
                </div>

                {/* Requester's bank balance for this request (1.2e-e) */}
                {req.leave_type_id != null && req.hours != null && (() => {
                  const bal = balancesByKey[`${req.memberId}:${req.leave_type_id}`];
                  if (!bal) return null;
                  const avail = Number(bal.available_to_request);
                  const asks = Number(req.hours);
                  const short = asks > avail;
                  return (
                    <div className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${short ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                      {short && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                      <span><span className="font-semibold">{bal.code}</span>: {avail}h available · asks {asks}h{short ? ` · ${Math.round((asks - avail) * 100) / 100}h short` : ''}</span>
                    </div>
                  );
                })()}

                {req.reason && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{req.reason}</p>
                )}

                {/* Deny requires a reason — it's stored on the record and shown to the member (1.2e-e) */}
                {denying?.id === req.id && (
                  <div className="mt-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3">
                    <label htmlFor={`deny-${req.id}`} className="block text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Reason for denial (the member will see this)</label>
                    <textarea id={`deny-${req.id}`} rows={2} value={denyReason}
                      onChange={e => setDenyReason(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="e.g. would drop the shift below minimum staffing — resubmit for another day" />
                    <div className="mt-2 flex items-center gap-2">
                      <button disabled={!denyReason.trim()} onClick={() => handleStatusChange(req, 'Denied', denyReason.trim())}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors">
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Confirm denial
                      </button>
                      <button onClick={() => { setDenying(null); setDenyReason(''); }}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Inline Coverage Workbench */}
              {coverageLeave?.id === req.id && (
                <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
                  <CoverageWorkbench
                    leaveRequest={req}
                    onClose={() => setCoverageLeave(null)}
                    onRefresh={fetchData}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {formOpen && (
        <LeaveFormModal
          leave={editing}
          members={members}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
      {deleting && (
        <DeleteConfirm
          member={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {assigningGap && (
        <AssignCoverageModal
          gap={assigningGap}
          members={members}
          onSave={handleAssignCoverage}
          onClose={() => setAssigningGap(null)}
        />
      )}
    </div>
  );
}
