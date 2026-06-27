import { useState, useEffect, useCallback } from 'react';
import {
  Phone, Mail, MessageSquare, UserPlus, CheckCircle, XCircle,
  Clock, Loader2, AlertTriangle, Users, ChevronDown, ChevronUp,
  Send, Copy, X, Shield,
} from 'lucide-react';
import { api } from '../utils/api';
import { SHIFT_TIMES } from '../data/schedule';

// ── Message Templates ────────────────────────────────────────────────────────

function coverageMessage(memberName, shiftType, date, requesterName, leaveType) {
  const firstName = memberName.split(' ')[0];
  const reqFirst = requesterName.split(' ')[0];
  const dateStr = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const timeStr = SHIFT_TIMES[shiftType]?.label || shiftType;
  const shiftInfo = `${shiftType} shift (${timeStr}) on ${dateStr}`;

  // Today or tomorrow detection for urgency
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const shiftDate = new Date(date + 'T00:00:00');
  const daysOut = Math.round((shiftDate - today) / (24 * 60 * 60 * 1000));
  const isUrgent = daysOut <= 1;

  const type = (leaveType || '').toLowerCase();

  if (type === 'sick') {
    // Sick call — urgent tone, no advance notice
    return isUrgent
      ? `Hi ${firstName}, ${reqFirst} called out sick and we need someone for the ${shiftInfo}. Can you come in? Reply Y or N. Thanks!`
      : `Hi ${firstName}, ${reqFirst} is out sick and we need coverage for the ${shiftInfo}. Are you available? Reply Y or N. Thanks!`;
  }

  if (type === 'pto' || type === 'personal' || type === 'vacation') {
    // Planned time off — professional, advance notice
    return `Hi ${firstName}, ${reqFirst} has requested time off and we're looking for someone to cover the ${shiftInfo}. Would you be available? Reply Y or N. Thanks!`;
  }

  if (type === 'training') {
    return `Hi ${firstName}, ${reqFirst} is away at training and we need someone for the ${shiftInfo}. Can you cover? Reply Y or N. Thanks!`;
  }

  if (type === 'military') {
    return `Hi ${firstName}, ${reqFirst} is on military duty and we need coverage for the ${shiftInfo}. Are you available? Reply Y or N. Thanks!`;
  }

  if (type === 'lodd') {
    return `Hi ${firstName}, we need additional coverage for the ${shiftInfo}. Are you available to come in? Reply Y or N. Thank you.`;
  }

  // Generic fallback
  return isUrgent
    ? `Hi ${firstName}, we need someone for the ${shiftInfo} — ${reqFirst} is unavailable. Can you come in? Reply Y or N. Thanks!`
    : `Hi ${firstName}, ${reqFirst} is unavailable and we need coverage for the ${shiftInfo}. Are you available? Reply Y or N. Thanks!`;
}

// ── Outreach Status Styles ───────────────────────────────────────────────────

const OUTREACH_STYLES = {
  Pending:      'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  Sent:         'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900',
  Accepted:     'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  Declined:     'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  'No Response': 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
};

const OUTREACH_ICONS = {
  Pending:      <Clock className="h-3 w-3" />,
  Sent:         <Send className="h-3 w-3" />,
  Accepted:     <CheckCircle className="h-3 w-3" />,
  Declined:     <XCircle className="h-3 w-3" />,
  'No Response': <AlertTriangle className="h-3 w-3" />,
};

// ── Available Member Row ─────────────────────────────────────────────────────

function MemberRow({ member, shiftId, leaveId, leaveRequest, onOutreach, onAssign }) {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  const message = coverageMessage(
    member.name,
    leaveRequest.shiftType,
    leaveRequest.shiftDate,
    leaveRequest.requesterName,
    leaveRequest.leaveType
  );

  function smsUrl() {
    const encoded = encodeURIComponent(message);
    // iOS uses &body=, Android uses ?body=
    return member.phone
      ? `sms:${member.phone}?&body=${encoded}`
      : null;
  }

  function mailUrl() {
    const type = (leaveRequest.leaveType || '').toLowerCase();
    const urgencyPrefix = type === 'sick' ? 'URGENT: ' : '';
    const subject = encodeURIComponent(`${urgencyPrefix}Coverage Needed: ${leaveRequest.shiftType} shift on ${leaveRequest.shiftDate}`);
    const body = encodeURIComponent(message);
    return member.personal_email
      ? `mailto:${member.personal_email}?subject=${subject}&body=${body}`
      : null;
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = message;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleContact(method) {
    // Record the outreach
    await onOutreach({
      leaveRequestId: leaveId,
      shiftId,
      memberId: member.id,
      memberName: member.name,
      contactMethod: method,
      status: 'Sent',
      sentAt: new Date().toISOString(),
    });

    // Open the contact method
    if (method === 'sms' && smsUrl()) window.open(smsUrl(), '_self');
    else if (method === 'email' && mailUrl()) window.open(mailUrl(), '_self');
    else if (method === 'call' && member.phone) window.open(`tel:${member.phone}`, '_self');
  }

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs flex items-center justify-center font-bold flex-shrink-0">
            {member.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
          </span>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{member.name}</p>
            <p className="text-xs text-gray-400">{member.rank}{member.phone ? ` · ${member.phone}` : ''}</p>
          </div>
          {member.outreachStatus && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${OUTREACH_STYLES[member.outreachStatus] || OUTREACH_STYLES.Pending}`}>
              {OUTREACH_ICONS[member.outreachStatus] || OUTREACH_ICONS.Pending}
              {member.outreachStatus}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!member.outreachStatus ? (
            <>
              {member.phone && (
                <button onClick={() => handleContact('sms')}
                  className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                  title="Send text message"
                  aria-label={`Send text message to ${member.name}`}>
                  <MessageSquare className="h-4 w-4" />
                </button>
              )}
              {member.phone && (
                <button onClick={() => handleContact('call')}
                  className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/50 transition-colors"
                  title="Call"
                  aria-label={`Call ${member.name}`}>
                  <Phone className="h-4 w-4" />
                </button>
              )}
              {member.personal_email && (
                <button onClick={() => handleContact('email')}
                  className="p-1.5 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors"
                  title="Send email"
                  aria-label={`Send email to ${member.name}`}>
                  <Mail className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setShowActions(!showActions)}
                aria-label="Show message preview" aria-expanded={showActions}
                className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {showActions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </>
          ) : member.outreachStatus === 'Accepted' ? (
            <button onClick={() => onAssign(member)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
              <UserPlus className="h-3 w-3" /> Assign to Shift
            </button>
          ) : member.outreachStatus === 'Sent' ? (
            <div className="flex gap-1">
              <button onClick={() => onOutreach({ id: member.outreachId, status: 'Accepted', respondedAt: new Date().toISOString(), response: 'Accepted' })}
                className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                title="Mark accepted"
                aria-label={`Mark ${member.name} accepted`}>
                <CheckCircle className="h-4 w-4" />
              </button>
              <button onClick={() => onOutreach({ id: member.outreachId, status: 'Declined', respondedAt: new Date().toISOString(), response: 'Declined' })}
                className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                title="Mark declined"
                aria-label={`Mark ${member.name} declined`}>
                <XCircle className="h-4 w-4" />
              </button>
              <button onClick={() => onOutreach({ id: member.outreachId, status: 'No Response', respondedAt: new Date().toISOString() })}
                className="p-1.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors"
                title="Mark no response"
                aria-label={`Mark ${member.name} as no response`}>
                <Clock className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Expanded: message preview & copy */}
      {showActions && (
        <div className="px-4 pb-3 space-y-2">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-950 p-3">
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{message}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copyMessage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              {copied ? <CheckCircle className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied!' : 'Copy Message'}
            </button>
            <button onClick={() => { handleContact('in-person'); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Users className="h-3 w-3" /> Mark In-Person
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shift Coverage Card ──────────────────────────────────────────────────────
// One card per affected shift, showing available members and outreach status.

function ShiftCoverageCard({ shift, leaveRequest, leaveId, onRefresh }) {
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const raw = await api.get(`/api/coverage/available/${shift.id}`);
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setAvailable(arr);
      } catch (err) {
        console.error('Failed to fetch available members:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [shift.id]);

  async function handleOutreach(data) {
    try {
      if (data.id) {
        // Update existing outreach
        await api.patch(`/api/coverage/outreach/${data.id}`, data);
      } else {
        // Create new outreach
        await api.post('/api/coverage/outreach', data);
      }
      // Refresh available members to update outreach status
      const raw = await api.get(`/api/coverage/available/${shift.id}`);
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setAvailable(arr);
    } catch (err) {
      alert(err.message || 'Failed to record outreach');
    }
  }

  async function handleAssign(member) {
    try {
      await api.post('/api/coverage/assign', {
        shiftId: shift.id,
        memberId: member.id,
        memberName: member.name,
        outreachId: member.outreachId || null,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to assign member');
    }
  }

  const contacted = available.filter(m => m.outreachStatus);
  const accepted = available.filter(m => m.outreachStatus === 'Accepted');
  const declined = available.filter(m => m.outreachStatus === 'Declined');
  const waiting = available.filter(m => m.outreachStatus === 'Sent');

  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-left">
              {new Date(shift.date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              })}
              <span className="text-gray-400 font-normal ml-2">
                {shift.shiftType} ({SHIFT_TIMES[shift.shiftType]?.label})
              </span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-left">
              <Users className="h-3 w-3 inline mr-1" />
              {shift.crewCount} on crew
              {contacted.length > 0 && (
                <span className="ml-2">
                  · {contacted.length} contacted
                  {accepted.length > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · {accepted.length} accepted</span>}
                  {declined.length > 0 && <span className="text-red-500"> · {declined.length} declined</span>}
                  {waiting.length > 0 && <span className="text-blue-500"> · {waiting.length} waiting</span>}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {shift.crewCount < 3 && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
              <AlertTriangle className="h-3 w-3" /> Below min
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {/* Member list */}
      {expanded && (
        loading ? (
          <div className="px-5 py-6 text-center text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            <p className="text-xs">Finding available members…</p>
          </div>
        ) : available.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <AlertTriangle className="h-6 w-6 text-red-300 mx-auto mb-2" />
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">No available members found</p>
            <p className="text-xs text-gray-400 mt-1">Everyone is either on shift, on leave, or inactive</p>
          </div>
        ) : (
          <div>
            {/* Accepted first, then un-contacted, then sent, then declined */}
            {[...available].sort((a, b) => {
              const order = { Accepted: 0, null: 1, undefined: 1, Sent: 2, 'No Response': 3, Declined: 4 };
              return (order[a.outreachStatus] ?? 1) - (order[b.outreachStatus] ?? 1);
            }).map(m => (
              <MemberRow
                key={m.id}
                member={m}
                shiftId={shift.id}
                leaveId={leaveId}
                leaveRequest={{
                  shiftType: shift.shiftType,
                  shiftDate: shift.date,
                  requesterName: leaveRequest.memberName,
                  leaveType: leaveRequest.type,
                }}
                onOutreach={handleOutreach}
                onAssign={handleAssign}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Main Coverage Workbench ──────────────────────────────────────────────────

export default function CoverageWorkbench({ leaveRequest, onClose, onRefresh }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const raw = await api.get('/api/coverage/dashboard');
      const obj = raw?.data && typeof raw.data === 'object' ? raw.data : typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
      setDashboard(obj);
    } catch (err) {
      console.error('Failed to load coverage dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  function handleRefresh() {
    fetchDashboard();
    if (onRefresh) onRefresh();
  }

  // If we have a specific leave request, show its affected shifts
  // Otherwise show the full dashboard
  // Dashboard returns leaveId, but the prop uses id — handle both
  const targetLeave = leaveRequest
    ? dashboard?.pendingLeave?.find(l => (l.leaveId || l.id) === leaveRequest.id) || leaveRequest
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">Loading coverage workbench…</span>
      </div>
    );
  }

  // Single leave request view
  if (targetLeave) {
    // Dashboard API returns 'shifts' array with shiftId; 'affectedShifts' is a count (number)
    const rawShifts = Array.isArray(targetLeave.shifts) ? targetLeave.shifts
      : Array.isArray(targetLeave.affectedShifts) ? targetLeave.affectedShifts
      : [];
    const affectedShifts = rawShifts.map(s => ({
      ...s,
      id: s.id || s.shiftId,
      crewCount: s.crewCount ?? s.crewBefore ?? 0,
    }));
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-700 dark:text-red-300" />
              Coverage Workbench
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Finding coverage for {targetLeave.memberName}'s {targetLeave.type} leave
              ({targetLeave.startDate} – {targetLeave.endDate})
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} aria-label="Close coverage workbench"
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white dark:bg-gray-900 p-3 ring-1 ring-gray-200 text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{affectedShifts.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Shifts Affected</p>
          </div>
          <div className="rounded-lg bg-white dark:bg-gray-900 p-3 ring-1 ring-gray-200 text-center">
            <p className="text-lg font-bold text-red-600 dark:text-red-400">
              {affectedShifts.filter(s => s.crewCount < 3).length}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Below Minimum</p>
          </div>
          <div className="rounded-lg bg-white dark:bg-gray-900 p-3 ring-1 ring-gray-200 text-center">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {affectedShifts.filter(s => s.swapStatus === 'Approved').length}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Covered</p>
          </div>
        </div>

        {/* Shift cards */}
        {affectedShifts.length === 0 ? (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 ring-1 ring-emerald-200 p-6 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-emerald-700 dark:text-emerald-300">No shifts need coverage</p>
          </div>
        ) : (
          <div className="space-y-3">
            {affectedShifts.map(shift => (
              <ShiftCoverageCard
                key={shift.id}
                shift={shift}
                leaveRequest={targetLeave}
                leaveId={targetLeave.id}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full dashboard view (all pending leave)
  const pending = dashboard?.pendingLeave || [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-700 dark:text-red-300" />
            Coverage Workbench
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {pending.length} pending leave request{pending.length !== 1 ? 's' : ''} needing coverage work
            {dashboard?.openSwaps > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium"> · {dashboard.openSwaps} open swap{dashboard.openSwaps !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close coverage workbench"
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 ring-1 ring-emerald-200 p-8 text-center">
          <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">All clear</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">No pending leave requests to process</p>
        </div>
      ) : (
        pending.map(leave => (
          <div key={leave.id} className="space-y-3">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 ring-1 ring-amber-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-center font-bold flex-shrink-0">
                  {(leave.memberName || '?').split(' ').map(n => n[0]).slice(0, 2).join('')}
                </span>
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    {leave.memberName} — {leave.type}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {leave.startDate} – {leave.endDate}
                    {leave.reason && <span className="ml-2 italic">"{leave.reason}"</span>}
                  </p>
                </div>
              </div>
            </div>
            {(Array.isArray(leave.shifts) ? leave.shifts : Array.isArray(leave.affectedShifts) ? leave.affectedShifts : []).map(s => {
              const shift = { ...s, id: s.id || s.shiftId, crewCount: s.crewCount ?? s.crewBefore ?? 0 };
              return (
                <ShiftCoverageCard
                  key={shift.id}
                  shift={shift}
                  leaveRequest={leave}
                  leaveId={leave.leaveId || leave.id}
                  onRefresh={handleRefresh}
                />
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
