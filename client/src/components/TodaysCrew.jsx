import { useState, useEffect } from 'react';
import {
  Users, Clock, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../utils/api';

// Rank colors for avatars
const RANK_COLORS = {
  'chief': 'bg-red-600 text-white',
  'deputy-chief': 'bg-red-500 text-white',
  'captain': 'bg-red-400 text-white',
  'lieutenant': 'bg-blue-600 text-white',
  'firefighter': 'bg-gray-600 text-white',
  'driver': 'bg-orange-600 text-white',
  'emt': 'bg-green-600 text-white',
  'paramedic': 'bg-emerald-600 text-white',
};

function getInitials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getTimeStatus(timeStr) {
  if (!timeStr) return 'upcoming';
  const now = new Date();
  const time = new Date(timeStr);
  if (time < now) return 'past';
  if (time <= new Date(now.getTime() + 3600000)) return 'current'; // within 1 hour
  return 'upcoming';
}

function ActivityBadge({ role, time, status }) {
  const statusColors = {
    past: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    current: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 font-semibold',
    upcoming: 'bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  };

  const timeStr = time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${statusColors[status]}`}>
      <span className="text-sm font-medium">{role}</span>
      <span className="text-xs">{timeStr}</span>
    </div>
  );
}

function ProgressRing({ completed, total }) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="2"
          />
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{completed}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">of {total}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberCard({ member, activities, onExpand, isExpanded }) {
  const rankColor = RANK_COLORS[member.rank?.toLowerCase()] || RANK_COLORS.firefighter;
  const completed = activities.filter((a) => getTimeStatus(a.time) === 'past').length;
  const total = activities.length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={onExpand}
        className="w-full p-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-4 flex-1 text-left">
          {/* Avatar */}
          <div className={`w-12 h-12 rounded-lg ${rankColor} flex items-center justify-center font-bold text-sm shrink-0`}>
            {getInitials(member.name)}
          </div>

          {/* Member info */}
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100">{member.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{member.rank}</p>
          </div>

          {/* Progress ring */}
          <div className="ml-auto hidden sm:block">
            <ProgressRing completed={completed} total={total} />
          </div>
        </div>

        <div className="ml-4">
          {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
        </div>
      </button>

      {/* Expanded activities */}
      {isExpanded && (
        <div className="px-5 py-4 bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-700 space-y-2">
          {activities.length > 0 ? (
            activities.map((activity, idx) => {
              const status = getTimeStatus(activity.time);
              return (
                <ActivityBadge
                  key={idx}
                  role={activity.role || activity.name}
                  time={activity.time}
                  status={status}
                />
              );
            })
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-3">No scheduled activities</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TodaysCrew() {
  const [members, setMembers] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [dashboardRes, membersRes] = await Promise.all([
        api.get('/api/dashboard/today'),
        api.get('/api/members'),
      ]);

      // Extract timeline items
      const timelineItems = dashboardRes?.data || [];
      setTimeline(timelineItems);

      // Extract members list and augment with activities
      const membersList = membersRes?.data || [];
      const onDutyMembers = membersList.filter((m) => m.on_duty === true);

      // Group timeline items by member
      const memberMap = new Map();
      onDutyMembers.forEach((m) => {
        memberMap.set(m.id, { ...m, activities: [] });
      });

      timelineItems.forEach((item) => {
        if (memberMap.has(item.member_id)) {
          const member = memberMap.get(item.member_id);
          member.activities.push({
            name: item.activity || item.name,
            role: item.role,
            time: item.time || item.scheduled_at,
          });
        }
      });

      setMembers(Array.from(memberMap.values()));
    } catch (err) {
      setError(err.message || 'Failed to load crew data');
    } finally {
      setLoading(false);
    }
  }

  // Separate on-duty and on-leave members
  const onDutyMembers = members.filter((m) => m.on_duty !== false);
  const onLeaveMembers = members.filter((m) => m.on_duty === false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 size={32} className="text-red-600 dark:text-red-400 animate-spin mx-auto mb-2" />
          <p className="text-gray-600 dark:text-gray-300">Loading crew schedule...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-200">Error</h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
            <button
              onClick={loadData}
              className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Users size={32} className="text-red-600 dark:text-red-400" />
          Today's Crew
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mt-1">On-duty members and their scheduled activities</p>
      </div>

      {/* On-duty section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
          <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
          On Duty ({onDutyMembers.length})
        </h2>

        {onDutyMembers.length > 0 ? (
          <div className="space-y-3">
            {onDutyMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                activities={member.activities || []}
                onExpand={() => setExpandedId(expandedId === member.id ? null : member.id)}
                isExpanded={expandedId === member.id}
              />
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
            <Users size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400">No members on duty today</p>
          </div>
        )}
      </div>

      {/* On-leave section */}
      {onLeaveMembers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Clock size={20} className="text-amber-600 dark:text-amber-400" />
            On Leave ({onLeaveMembers.length})
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {onLeaveMembers.map((member) => (
              <div key={member.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                <div className={`w-10 h-10 rounded-lg ${RANK_COLORS[member.rank?.toLowerCase()] || RANK_COLORS.firefighter} flex items-center justify-center font-bold text-xs text-white mx-auto mb-2`}>
                  {getInitials(member.name)}
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{member.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize mt-1">{member.rank}</p>
                {member.leave_reason && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{member.leave_reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{onDutyMembers.length}</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">On Duty</p>
        </div>
        <div className="border-l border-r border-gray-200 dark:border-gray-700">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{onLeaveMembers.length}</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">On Leave</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{members.length}</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Total</p>
        </div>
      </div>
    </div>
  );
}
