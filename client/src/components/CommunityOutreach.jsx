import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, X, Heart, Users, Zap, Calendar,
  ChevronDown, ChevronUp, Check, AlertCircle,
} from 'lucide-react';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import { openTimePicker } from '../utils/timeInput';

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  'School Visit',
  'Station Tour',
  'Community Fair / Festival',
  'Parade / Detail',
  'Public Education Class',
  'Senior Outreach',
  'Smoke Detector Program',
  'Youth Program',
  'Media / PR',
  'Open House',
];

const AUDIENCE_TYPES = ['toddler', 'elementary', 'middle', 'high', 'adult', 'senior', 'mixed'];

const AUDIENCE_LABELS = {
  toddler: 'Toddlers/Preschool (2-5)',
  elementary: 'Elementary (6-10)',
  middle: 'Middle School (11-14)',
  high: 'High School (15-18)',
  adult: 'Adults (18+)',
  senior: 'Seniors (65+)',
  mixed: 'Mixed/Public',
};

const STATUS_OPTIONS = ['planned', 'confirmed', 'completed', 'cancelled'];

const STATUS_COLORS = {
  planned: { bg: 'bg-yellow-100 dark:bg-yellow-950/50', text: 'text-yellow-700 dark:text-yellow-300', label: 'Planned' },
  confirmed: { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300', label: 'Confirmed' },
  completed: { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300', label: 'Completed' },
  cancelled: { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-300', label: 'Cancelled' },
};

const EVENT_TYPE_COLORS = {
  'School Visit': { bg: 'bg-purple-100 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300' },
  'Station Tour': { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300' },
  'Community Fair / Festival': { bg: 'bg-pink-100 dark:bg-pink-950/50', text: 'text-pink-700 dark:text-pink-300' },
  'Parade / Detail': { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-300' },
  'Public Education Class': { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300' },
  'Senior Outreach': { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300' },
  'Smoke Detector Program': { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-300' },
  'Youth Program': { bg: 'bg-indigo-100 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-300' },
  'Media / PR': { bg: 'bg-cyan-100 dark:bg-cyan-950/50', text: 'text-cyan-700 dark:text-cyan-300' },
  'Open House': { bg: 'bg-rose-100 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-300' },
};

const SAFETY_CHECKLISTS = {
  toddler: [
    { item: 'Parent/guardian waivers collected', completed: false },
    { item: 'Childproofing reviewed', completed: false },
    { item: 'Quiet area available', completed: false },
    { item: 'Background checks completed', completed: false },
    { item: 'First aid kit accessible', completed: false },
    { item: 'No loud noises/sirens', completed: false },
  ],
  elementary: [
    { item: 'Parent waivers collected', completed: false },
    { item: 'Equipment age-appropriate', completed: false },
    { item: 'Background checks completed', completed: false },
    { item: 'School administration briefed', completed: false },
    { item: 'Exit routes marked', completed: false },
    { item: 'No unsupervised access to dangerous areas', completed: false },
  ],
  middle: [
    { item: 'Parent consent forms signed', completed: false },
    { item: 'Instructional materials prepared', completed: false },
    { item: 'Staff background verified', completed: false },
    { item: 'School liaison confirmed', completed: false },
    { item: 'Emergency protocols briefed', completed: false },
    { item: 'Transportation confirmed', completed: false },
  ],
  high: [
    { item: 'Permission slips signed', completed: false },
    { item: 'Curriculum aligned materials', completed: false },
    { item: 'Staff backgrounds checked', completed: false },
    { item: 'School principal notified', completed: false },
    { item: 'Emergency procedures reviewed', completed: false },
  ],
  adult: [
    { item: 'Liability waiver signed', completed: false },
    { item: 'Emergency contacts collected', completed: false },
    { item: 'Insurance coverage verified', completed: false },
    { item: 'Instructor certifications current', completed: false },
    { item: 'Facility safety inspection complete', completed: false },
  ],
  senior: [
    { item: 'Accessibility verified', completed: false },
    { item: 'Medical staff on-site', completed: false },
    { item: 'Large print materials provided', completed: false },
    { item: 'Mobility assistance available', completed: false },
    { item: 'Quiet environment maintained', completed: false },
  ],
  mixed: [
    { item: 'Site perimeter marked', completed: false },
    { item: 'Traffic control in place', completed: false },
    { item: 'Insurance certificate verified', completed: false },
    { item: 'Emergency services contact confirmed', completed: false },
    { item: 'Equipment inspection completed', completed: false },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtDateTime(date, time) {
  const dateStr = fmtDate(date);
  return time ? `${dateStr} at ${time}` : dateStr;
}

// ─── Badge Components ────────────────────────────────────────────────────────

function EventTypeBadge({ type }) {
  const colors = EVENT_TYPE_COLORS[type] || EVENT_TYPE_COLORS['Other'];
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
      {type}
    </span>
  );
}

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.planned;
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
      {colors.label}
    </span>
  );
}

function AudienceBadge({ type }) {
  return (
    <span className="inline-block px-2 py-1 rounded text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300">
      {AUDIENCE_LABELS[type] || type}
    </span>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event, members, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const getLeadMemberName = (memberId) => {
    return members.find(m => m.id === memberId)?.name || 'Unknown';
  };

  const eventDate = event.date ? new Date(event.date) : null;
  const isUpcoming = eventDate && eventDate > new Date();
  const isPast = eventDate && eventDate < new Date();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div
        className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
        role="button" tabIndex={0} aria-expanded={expanded} aria-label={`Toggle details for ${event.title}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">{event.title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{fmtDateTime(event.date, event.start_time)}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(event);
              }}
              aria-label={`Edit ${event.title}`}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(event.id);
              }}
              aria-label={`Delete ${event.title}`}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <EventTypeBadge type={event.event_type} />
          <StatusBadge status={event.status} />
          <AudienceBadge type={event.audience_type} />
          {isPast && <span className="text-xs text-gray-500 dark:text-gray-400">Past event</span>}
          {isUpcoming && <span className="text-xs text-green-600 dark:text-green-400 font-semibold">Upcoming</span>}
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 space-y-3 border-t border-gray-100 dark:border-gray-700">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Location</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{event.location || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Address</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{event.address || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Lead Member</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                {event.lead_member_id ? getLeadMemberName(event.lead_member_id) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Attendance</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                {event.actual_attendance !== null ? `${event.actual_attendance} actual` : `Est. ${event.estimated_attendance || 0}`}
              </p>
            </div>
          </div>

          {/* Partner Info */}
          {event.partner_org && (
            <div className="bg-gray-50 dark:bg-gray-950 rounded p-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">Partner</p>
              <p className="text-sm text-gray-900 dark:text-gray-100">{event.partner_org}</p>
              {event.partner_contact_name && (
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{event.partner_contact_name}</p>
              )}
            </div>
          )}

          {/* Resources & Metrics */}
          {(event.volunteer_hours || event.detectors_installed || event.cpr_certifications || event.escape_plans_created) && (
            <div className="grid grid-cols-4 gap-2">
              {event.volunteer_hours > 0 && (
                <div className="bg-blue-50 dark:bg-blue-950/50 rounded p-2">
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-semibold">{event.volunteer_hours}h</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Volunteer</p>
                </div>
              )}
              {event.detectors_installed > 0 && (
                <div className="bg-orange-50 dark:bg-orange-950/50 rounded p-2">
                  <p className="text-xs text-orange-700 dark:text-orange-300 font-semibold">{event.detectors_installed}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400">Detectors</p>
                </div>
              )}
              {event.cpr_certifications > 0 && (
                <div className="bg-green-50 dark:bg-green-950/50 rounded p-2">
                  <p className="text-xs text-green-700 dark:text-green-300 font-semibold">{event.cpr_certifications}</p>
                  <p className="text-xs text-green-600 dark:text-green-400">CPR Certs</p>
                </div>
              )}
              {event.escape_plans_created > 0 && (
                <div className="bg-pink-50 dark:bg-pink-950/50 rounded p-2">
                  <p className="text-xs text-pink-700 dark:text-pink-300 font-semibold">{event.escape_plans_created}</p>
                  <p className="text-xs text-pink-600 dark:text-pink-400">Plans</p>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">Description</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{event.description}</p>
            </div>
          )}

          {/* Linked Meetings & Attachments */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-2 space-y-2">
            <LinkedMeetings module="community-outreach" recordId={event.id} recordLabel={event.title} />
            <Attachments module="community-outreach" recordId={event.id} recordLabel={event.title} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Event Form Modal ──────────────────────────────────────────────────────────

function EventForm({ event, members, onSave, onCancel }) {
  const [title, setTitle] = useState(event?.title || '');
  const [eventType, setEventType] = useState(event?.event_type || 'School Visit');
  const [date, setDate] = useState(event?.date || '');
  const [startTime, setStartTime] = useState(event?.start_time || '');
  const [endTime, setEndTime] = useState(event?.end_time || '');
  const [location, setLocation] = useState(event?.location || '');
  const [address, setAddress] = useState(event?.address || '');
  const [status, setStatus] = useState(event?.status || 'planned');
  const [audienceType, setAudienceType] = useState(event?.audience_type || 'mixed');
  const [audienceAgeRange, setAudienceAgeRange] = useState(event?.audience_age_range || '');
  const [estimatedAttendance, setEstimatedAttendance] = useState(event?.estimated_attendance || 0);
  const [actualAttendance, setActualAttendance] = useState(event?.actual_attendance || '');
  const [partnerOrg, setPartnerOrg] = useState(event?.partner_org || '');
  const [partnerContactName, setPartnerContactName] = useState(event?.partner_contact_name || '');
  const [partnerContactPhone, setPartnerContactPhone] = useState(event?.partner_contact_phone || '');
  const [partnerContactEmail, setPartnerContactEmail] = useState(event?.partner_contact_email || '');
  const [assignedMembers, setAssignedMembers] = useState(
    Array.isArray(event?.assigned_members) ? event.assigned_members : (event?.assigned_members ? JSON.parse(event.assigned_members) : [])
  );
  const [leadMemberId, setLeadMemberId] = useState(event?.lead_member_id || '');
  const [safetyChecklist, setSafetyChecklist] = useState(
    Array.isArray(event?.safety_checklist) ? event.safety_checklist : (event?.safety_checklist ? JSON.parse(event.safety_checklist) : SAFETY_CHECKLISTS[audienceType] || [])
  );
  const [safetyNotes, setSafetyNotes] = useState(event?.safety_notes || '');
  const [specialAccommodations, setSpecialAccommodations] = useState(event?.special_accommodations || '');
  const [volunteerHours, setVolunteerHours] = useState(event?.volunteer_hours || 0);
  const [detectorsInstalled, setDetectorsInstalled] = useState(event?.detectors_installed || 0);
  const [cprCertifications, setCprCertifications] = useState(event?.cpr_certifications || 0);
  const [escapePlansCreated, setEscapePlansCreated] = useState(event?.escape_plans_created || 0);
  const [description, setDescription] = useState(event?.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-populate safety checklist when audience type changes
  useEffect(() => {
    if (!event) {
      setSafetyChecklist(SAFETY_CHECKLISTS[audienceType] || []);
    }
  }, [audienceType, event]);

  const handleChecklistChange = (index) => {
    const updated = [...safetyChecklist];
    updated[index] = { ...updated[index], completed: !updated[index].completed };
    setSafetyChecklist(updated);
  };

  const handleMemberToggle = (memberId) => {
    if (assignedMembers.includes(memberId)) {
      setAssignedMembers(assignedMembers.filter(m => m !== memberId));
    } else {
      setAssignedMembers([...assignedMembers, memberId]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Event title is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        event_type: eventType,
        date: date || null,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location.trim(),
        address: address.trim(),
        status,
        audience_type: audienceType,
        audience_age_range: audienceAgeRange.trim(),
        estimated_attendance: parseInt(estimatedAttendance) || 0,
        actual_attendance: actualAttendance ? parseInt(actualAttendance) : null,
        partner_org: partnerOrg.trim(),
        partner_contact_name: partnerContactName.trim(),
        partner_contact_phone: partnerContactPhone.trim(),
        partner_contact_email: partnerContactEmail.trim(),
        assigned_members: JSON.stringify(assignedMembers),
        lead_member_id: leadMemberId ? parseInt(leadMemberId) : null,
        safety_checklist: JSON.stringify(safetyChecklist),
        safety_notes: safetyNotes.trim(),
        special_accommodations: specialAccommodations.trim(),
        volunteer_hours: parseFloat(volunteerHours) || 0,
        detectors_installed: parseInt(detectorsInstalled) || 0,
        cpr_certifications: parseInt(cprCertifications) || 0,
        escape_plans_created: parseInt(escapePlansCreated) || 0,
        description: description.trim(),
      };

      if (event?.id) {
        await api.put(`/api/community-outreach/${event.id}`, payload);
      } else {
        await api.post('/api/community-outreach', payload);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden my-8">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {event ? 'Edit Event' : 'New Community Event'}
          </h2>
          <button onClick={onCancel} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Title & Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="Event title"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="e.g., Lincoln Elementary Fire Safety"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                aria-label="Event type"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
              <input
                type="time" onClick={openTimePicker}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-label="Start time"
                className="cursor-pointer w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
              <input
                type="time" onClick={openTimePicker}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-label="End time"
                className="cursor-pointer w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              />
            </div>
          </div>

          {/* Location Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                aria-label="Location"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="e.g., Lincoln Elementary School"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                aria-label="Address"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="Street address"
                disabled={loading}
              />
            </div>
          </div>

          {/* Audience */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Audience Type</label>
              <select
                value={audienceType}
                onChange={(e) => setAudienceType(e.target.value)}
                aria-label="Audience type"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                {AUDIENCE_TYPES.map((t) => (
                  <option key={t} value={t}>{AUDIENCE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age Range</label>
              <input
                type="text"
                value={audienceAgeRange}
                onChange={(e) => setAudienceAgeRange(e.target.value)}
                aria-label="Age range"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="e.g., 6-10 years"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Status"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_COLORS[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Attendance */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated Attendance</label>
              <input
                type="number"
                value={estimatedAttendance}
                onChange={(e) => setEstimatedAttendance(e.target.value)}
                aria-label="Estimated attendance"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="0"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Actual Attendance</label>
              <input
                type="number"
                value={actualAttendance}
                onChange={(e) => setActualAttendance(e.target.value)}
                aria-label="Actual attendance"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="0"
                disabled={loading}
              />
            </div>
          </div>

          {/* Partner Info */}
          <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Partner Organization</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Organization</label>
                <input
                  type="text"
                  value={partnerOrg}
                  onChange={(e) => setPartnerOrg(e.target.value)}
                  aria-label="Partner organization"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Partner name"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={partnerContactName}
                  onChange={(e) => setPartnerContactName(e.target.value)}
                  aria-label="Partner contact name"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Contact person"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={partnerContactPhone}
                  onChange={(e) => setPartnerContactPhone(e.target.value)}
                  aria-label="Partner contact phone"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Phone number"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={partnerContactEmail}
                  onChange={(e) => setPartnerContactEmail(e.target.value)}
                  aria-label="Partner contact email"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Email address"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Assigned Members */}
          <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Assigned Members</h4>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {members.map((member) => (
                <label key={member.id} className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded hover:bg-white dark:hover:bg-gray-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignedMembers.includes(member.id)}
                    onChange={() => handleMemberToggle(member.id)}
                    disabled={loading}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{member.name}</span>
                </label>
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lead Member</label>
              <select
                value={leadMemberId}
                onChange={(e) => setLeadMemberId(e.target.value)}
                aria-label="Lead member"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                <option value="">None</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Safety Checklist */}
          <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Safety Checklist</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {safetyChecklist.map((item, idx) => (
                <label key={idx} className="flex items-center gap-2 p-2 hover:bg-white dark:hover:bg-gray-900 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => handleChecklistChange(idx)}
                    disabled={loading}
                    className="rounded"
                  />
                  <span className={`text-sm ${item.completed ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                    {item.item}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Safety Notes</label>
              <textarea
                value={safetyNotes}
                onChange={(e) => setSafetyNotes(e.target.value)}
                aria-label="Safety notes"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="Any safety observations or concerns"
                rows="2"
                disabled={loading}
              />
            </div>
          </div>

          {/* Impact Metrics */}
          <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Impact Metrics</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Volunteer Hours</label>
                <input
                  type="number"
                  value={volunteerHours}
                  onChange={(e) => setVolunteerHours(e.target.value)}
                  aria-label="Volunteer hours"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                  step="0.5"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Detectors Installed</label>
                <input
                  type="number"
                  value={detectorsInstalled}
                  onChange={(e) => setDetectorsInstalled(e.target.value)}
                  aria-label="Detectors installed"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CPR Certifications</label>
                <input
                  type="number"
                  value={cprCertifications}
                  onChange={(e) => setCprCertifications(e.target.value)}
                  aria-label="CPR certifications"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Escape Plans Created</label>
                <input
                  type="number"
                  value={escapePlansCreated}
                  onChange={(e) => setEscapePlansCreated(e.target.value)}
                  aria-label="Escape plans created"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Description & Accommodations */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-label="Description"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="Event details"
                rows="3"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Special Accommodations</label>
              <textarea
                value={specialAccommodations}
                onChange={(e) => setSpecialAccommodations(e.target.value)}
                aria-label="Special accommodations"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="Any special needs or accommodations"
                rows="2"
                disabled={loading}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommunityOutreach() {
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAudience, setFilterAudience] = useState('');

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [eventsData, membersData] = await Promise.all([
          api.get('/api/community-outreach'),
          api.get('/api/members'),
        ]);
        setEvents(eventsData?.data || []);
        setMembers(membersData?.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCreate = () => {
    setEditTarget(null);
    setShowForm(true);
  };

  const handleEdit = (evt) => {
    setEditTarget(evt);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    try {
      await api.delete(`/api/community-outreach/${id}`);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSave = async () => {
    setShowForm(false);
    setEditTarget(null);
    try {
      const data = await api.get('/api/community-outreach');
      setEvents(data?.data || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditTarget(null);
  };

  // Compute stats
  const stats = useMemo(() => {
    const completed = events.filter(e => e.status === 'completed');
    return {
      total_events: events.length,
      people_reached: completed.reduce((sum, e) => sum + (e.actual_attendance || e.estimated_attendance || 0), 0),
      total_detectors: events.reduce((sum, e) => sum + (e.detectors_installed || 0), 0),
      total_volunteer_hours: events.reduce((sum, e) => sum + (e.volunteer_hours || 0), 0),
    };
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterStatus && e.status !== filterStatus) return false;
      if (filterType && e.event_type !== filterType) return false;
      if (filterAudience && e.audience_type !== filterAudience) return false;
      return true;
    });
  }, [events, filterStatus, filterType, filterAudience]);

  if (loading) {
    return (
      <div className="w-full p-6 bg-gray-50 dark:bg-gray-950 rounded-lg">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart size={24} className="text-red-600 dark:text-red-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Community Outreach</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Total Events</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_events}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">People Reached</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.people_reached}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Detectors Installed</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.total_detectors}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Volunteer Hours</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total_volunteer_hours.toFixed(1)}h</p>
        </div>
      </div>

      {/* Filters & Create Button */}
      <div className="space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-sm">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter by status"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_COLORS[s].label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-sm">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter by Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Filter by type"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Types</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-sm">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter by Audience</label>
            <select
              value={filterAudience}
              onChange={(e) => setFilterAudience(e.target.value)}
              aria-label="Filter by audience"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Audiences</option>
              {AUDIENCE_TYPES.map((t) => (
                <option key={t} value={t}>{AUDIENCE_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={18} />
            New Event
          </button>
        </div>
      </div>

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <Heart size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No community events yet</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              members={members}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <EventForm
          event={editTarget}
          members={members}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
