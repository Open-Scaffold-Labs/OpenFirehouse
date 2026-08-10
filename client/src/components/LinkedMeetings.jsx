/**
 * LinkedMeetings — A shared component for displaying and creating meetings
 * linked to any module's records via the module + record_id pattern.
 *
 * Usage:
 *   <LinkedMeetings module="aid-agreements" recordId={42} recordLabel="Riverside FD Agreement" />
 *   <LinkedMeetings module="grievances" recordId={7} recordLabel="GRV-2026-001" />
 *
 * Features:
 *   - Lists all meetings linked to a specific module record
 *   - "New Meeting" button that pre-fills linked_module + linked_record_id
 *   - Expandable meeting detail (agenda, motions, action items)
 *   - Compact mode for embedding in tabs/panels
 */

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Plus, ChevronDown, ChevronUp, Clock, Users,
  CheckCircle, Circle, Calendar, FileText, ExternalLink, Loader2,
} from 'lucide-react';
import { api } from '../utils/api';

const TYPE_LABELS = {
  regular: 'Regular', special: 'Special', emergency: 'Emergency',
  executive: 'Executive Board', committee: 'Committee', training: 'Training',
  budget: 'Budget', planning: 'Planning', annual: 'Annual', other: 'Other',
};
const STATUS_COLORS = {
  draft: 'bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300',
  approved: 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
  final: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300',
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ActionItemStatus({ status }) {
  if (status === 'completed') return <CheckCircle size={12} className="text-green-600 dark:text-green-400 flex-shrink-0" />;
  if (status === 'in_progress') return <Clock size={12} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />;
  return <Circle size={12} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />;
}

// ── Single Meeting Card ──────────────────────────────────────────────────────

function MeetingCard({ meeting }) {
  const [expanded, setExpanded] = useState(false);
  const attendeeCount = Array.isArray(meeting.attendees) ? meeting.attendees.length : 0;
  const actionItems = Array.isArray(meeting.action_items) ? meeting.action_items : [];
  const motions = Array.isArray(meeting.motions) ? meeting.motions : [];
  const agenda = Array.isArray(meeting.agenda) ? meeting.agenda : [];
  const completedActions = actionItems.filter(a => a.status === 'completed').length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3 text-left min-w-0">
          <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 flex-shrink-0">
            <MessageSquare size={14} className="text-slate-600 dark:text-slate-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{meeting.title}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[meeting.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                {meeting.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <span className="flex items-center gap-1">
                <Calendar size={10} /> {fmtDate(meeting.meeting_date)}
              </span>
              <span className="flex items-center gap-1">
                <FileText size={10} /> {TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type}
              </span>
              {attendeeCount > 0 && (
                <span className="flex items-center gap-1">
                  <Users size={10} /> {attendeeCount}
                </span>
              )}
              {actionItems.length > 0 && (
                <span className="flex items-center gap-1">
                  <CheckCircle size={10} /> {completedActions}/{actionItems.length} actions
                </span>
              )}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-500 dark:text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-3 bg-gray-50/50">
          {/* Notes */}
          {meeting.notes && (
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{meeting.notes}</p>
          )}

          {/* Agenda */}
          {agenda.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Agenda</p>
              <div className="space-y-1">
                {agenda.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400 font-mono w-4 flex-shrink-0">{i + 1}.</span>
                    <span>{item.item || item}</span>
                    {item.presenter && <span className="text-gray-500 dark:text-gray-400 ml-auto flex-shrink-0">— {item.presenter}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Motions */}
          {motions.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Motions</p>
              <div className="space-y-1.5">
                {motions.map((m, i) => (
                  <div key={i} className="text-xs bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                    <p className="text-gray-800 dark:text-gray-100 font-medium">{m.text}</p>
                    <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                      Moved: {m.moved_by} · Seconded: {m.seconded_by} · <span className="font-semibold text-gray-600 dark:text-gray-300">{m.result}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Items */}
          {actionItems.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Action Items</p>
              <div className="space-y-1">
                {actionItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <ActionItemStatus status={item.status} />
                    <div className="min-w-0">
                      <span className={`text-gray-800 dark:text-gray-100 ${item.status === 'completed' ? 'line-through text-gray-500 dark:text-gray-400' : ''}`}>
                        {item.task}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400"> — {item.assigned_to}</span>
                      {item.due_date && <span className="text-gray-500 dark:text-gray-400"> (due {fmtDate(item.due_date)})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attendees */}
          {attendeeCount > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Attendees</p>
              <div className="flex flex-wrap gap-1.5">
                {meeting.attendees.map((a, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {a.name || a}
                    {a.role && <span className="text-gray-500 dark:text-gray-400"> · {a.role}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function LinkedMeetings({ module, recordId, recordLabel, onNavigateToMeetings }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMeetings = useCallback(async () => {
    if (!module || !recordId) { setLoading(false); return; }
    try {
      const res = await api.get(`/api/meeting-minutes?linked_module=${module}&linked_record_id=${recordId}`);
      const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      // Parse JSONB fields if they come as strings
      setMeetings(data.map(m => ({
        ...m,
        attendees: typeof m.attendees === 'string' ? JSON.parse(m.attendees) : (m.attendees || []),
        agenda: typeof m.agenda === 'string' ? JSON.parse(m.agenda) : (m.agenda || []),
        motions: typeof m.motions === 'string' ? JSON.parse(m.motions) : (m.motions || []),
        action_items: typeof m.action_items === 'string' ? JSON.parse(m.action_items) : (m.action_items || []),
      })));
    } catch (e) {
      console.error('Failed to fetch linked meetings:', e);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [module, recordId]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const handleNewMeeting = () => {
    // Navigate to MeetingMinutes with pre-filled link context
    if (onNavigateToMeetings) {
      onNavigateToMeetings({
        linked_module: module,
        linked_record_id: recordId,
        linked_label: recordLabel || '',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin mr-2" />
        <span className="text-sm">Loading meetings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-slate-500 dark:text-slate-400" />
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
            Linked Meetings
            {meetings.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                {meetings.length}
              </span>
            )}
          </span>
        </div>
        {onNavigateToMeetings && (
          <button
            onClick={handleNewMeeting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
          >
            <Plus size={12} />
            New Meeting
          </button>
        )}
      </div>

      {/* Meeting List */}
      {meetings.length === 0 ? (
        <div className="text-center py-6 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700">
          <MessageSquare size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No meetings linked to this record.</p>
          {onNavigateToMeetings && (
            <p className="text-xs mt-1">Click "New Meeting" to create one.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {meetings
            .sort((a, b) => (b.meeting_date || '').localeCompare(a.meeting_date || ''))
            .map(m => <MeetingCard key={m.id} meeting={m} />)
          }
        </div>
      )}
    </div>
  );
}
