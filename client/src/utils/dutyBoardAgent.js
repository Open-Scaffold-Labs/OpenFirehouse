/**
 * dutyBoardAgent.js — first Ask mode: Duty / Board, read-only.
 *
 * Maps a plain-language question to department read verbs and formats
 * a dense operational answer. Does not invent staffing minimums, does
 * not write incident narrative, and never selects a gated write verb.
 */

import {
  DUTY_BOARD_READ_VERBS,
  GATED_WRITE_VERBS,
  invokeData,
  invokeRows,
} from './askVerbs';

const WRITE_HINT = /\b(neris|submit|notify\s+chief|clear\s+unit|unit\s+clear|release\s+unit|mark\s+oos|out of service|update\s+incident|write\s+narrative|draft\s+narrative)\b/i;

const BOARD_HINT = /\b(board|command board|active (call|incident)|what's on|whats on|on the air)\b/i;
const DUTY_HINT = /\b(run list|riding list|who'?s riding|who is riding|on duty|duty (board|list|today)|today'?s duty)\b/i;
const INCIDENT_HINT = /\b(incident|open (call|medical)|structure fire|dispatched calls?|call log)\b/i;
const ROSTER_HINT = /\b(roster|members?|headcount)\b/i;
const STAFFING_HINT = /\b(staff(?:ing)?|minimums?|coverage|manpower|crew|who'?s on|who is on)\b/i;
const APPARATUS_HINT = /\b(apparatus|rig|engine|ladder|rescue|unit status|in service|in-service|oos|out of service)\b/i;
const TRAINING_HINT = /\b(training|hours|ceu|losap|drill hours)\b/i;
const OVERVIEW_HINT = /\b(overview|sitrep|status of (the )?(house|station)|how are we looking|full picture)\b/i;

const CLOSED_DISPOSITION = /^(closed|cleared|complete|completed|cancelled|canceled|unfounded|refused)$/i;

export const DUTY_BOARD_WELCOME =
  'Duty / Board. Ask about the Command Board, who is riding, the roster, or apparatus in service. I read as your badge. I do not write incident narrative or clear units.';

export const CLOSEOUT_PLACEHOLDER =
  'Incident closeout is coming next. Duty / Board can read the board now. Unit clear and NERIS stay human-confirmed on the Dashboard — I will not write those from this chat.';

export const TRAINING_APPARATUS_PLACEHOLDER =
  'A dedicated Training & Apparatus mode is coming next. Duty / Board can already read apparatus in service and training hours — ask there.';

export const GATED_WRITE_REFUSAL =
  'Duty / Board is read-only. Unit clear, NERIS submit, and incident narrative stay human-confirmed on the Dashboard. I cannot write those from this chat.';

export function planDutyBoard(message) {
  const text = String(message || '').trim();
  if (!text) {
    return { kind: 'empty', verbs: [], text: 'Ask about the board, roster, or apparatus.' };
  }
  if (WRITE_HINT.test(text)) {
    return { kind: 'gated', verbs: [], text: GATED_WRITE_REFUSAL };
  }

  const verbs = [];
  const overview = OVERVIEW_HINT.test(text);
  if (overview || BOARD_HINT.test(text)) verbs.push('board_read');
  if (overview || DUTY_HINT.test(text) || STAFFING_HINT.test(text)) verbs.push('duty_read');
  if (overview || INCIDENT_HINT.test(text)) verbs.push('incident_read');
  if (overview || ROSTER_HINT.test(text) || STAFFING_HINT.test(text)) verbs.push('roster_read');
  if (overview || APPARATUS_HINT.test(text)) verbs.push('apparatus_status_read');
  if (overview || TRAINING_HINT.test(text)) verbs.push('training_hours_read');

  if (!verbs.length) {
    // Default Duty/Board question → live Command Board (held draft verb).
    verbs.push('board_read');
  }

  for (const v of verbs) {
    if (GATED_WRITE_VERBS.includes(v)) {
      return { kind: 'gated', verbs: [], text: GATED_WRITE_REFUSAL };
    }
    if (!DUTY_BOARD_READ_VERBS.includes(v)) {
      return { kind: 'gated', verbs: [], text: GATED_WRITE_REFUSAL };
    }
  }

  return { kind: 'reads', verbs: [...new Set(verbs)], text: '' };
}

function asList(rows) {
  return Array.isArray(rows) ? rows : [];
}

function isOpenIncident(inc) {
  const disp = String(inc?.disposition || inc?.status || '').trim();
  if (!disp) return true;
  return !CLOSED_DISPOSITION.test(disp);
}

function incidentLine(inc) {
  const num = inc.incidentNumber || inc.incident_number || `#${inc.id}`;
  const type = inc.type || 'Call';
  const addr = inc.address || inc.location || '';
  const when = [inc.date, inc.time].filter(Boolean).join(' ');
  const alarm = inc.alarmLevel || inc.alarm_level;
  const bits = [num, type, addr, alarm, when].filter(Boolean);
  return bits.join(' · ');
}

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return typeof raw === 'object' ? raw : {};
}

export function formatCommandBoard(data) {
  const board = Array.isArray(data) ? data[0] : data;
  if (!board || typeof board !== 'object') return 'Board: no active command board.';
  const type = board.incident_type || board.incidentType || board.type;
  const addr = board.address || board.location || '';
  if (!type && !addr) return 'Board: no active command board.';
  const dispatched = board.dispatched_at || board.dispatchedAt || board.date;
  let when = '';
  if (dispatched) {
    try { when = new Date(dispatched).toLocaleString(); } catch { when = String(dispatched); }
  }
  const units = board.units_count ?? board.unitsCount;
  const people = board.personnel_count ?? board.personnelCount;
  const first = board.first_on_scene_unit;
  const bits = [type || 'Active call', addr];
  if (when) bits.push(`dispatched ${when}`);
  if (units != null) bits.push(`${units} units`);
  if (people != null) bits.push(`${people} personnel`);
  if (first) bits.push(`first on scene ${first}`);
  return `Board: ACTIVE — ${bits.filter(Boolean).join(' · ')}.`;
}

export function formatDuty(data) {
  if (!data) {
    return 'Duty: no published run list for today. Check Daily Staffing to see who is riding.';
  }
  const payload = parsePayload(data.payload);
  const crew = Array.isArray(payload.crew) ? payload.crew : [];
  if (!crew.length) {
    return 'Duty: published run list is empty. Check Daily Staffing for the riding board.';
  }
  const shown = crew.slice(0, 8).map((c) => {
    const name = c.member_name || c.name || 'Member';
    const pos = c.position_name || c.position || c.member_rank || '';
    const rig = c.designation || c.apparatus
      || (c.apparatus_id != null ? `Unit ${c.apparatus_id}` : '');
    return [name, pos, rig].filter(Boolean).join(' · ');
  });
  const extra = crew.length > shown.length ? ` (+${crew.length - shown.length} more)` : '';
  return `Duty: ${crew.length} riding.\n${shown.map((l) => `• ${l}`).join('\n')}${extra}`;
}

export function formatIncidents(rows) {
  const list = asList(rows);
  const open = list.filter(isOpenIncident);
  if (!open.length) {
    return list.length
      ? `Board: ${list.length} incident${list.length === 1 ? '' : 's'} on file, none look open.`
      : 'Board: no incidents on file.';
  }
  const shown = open.slice(0, 6).map(incidentLine);
  const extra = open.length > shown.length ? ` (+${open.length - shown.length} more open)` : '';
  return `Board: ${open.length} open.\n${shown.map((l) => `• ${l}`).join('\n')}${extra}`;
}

export function formatRoster(rows) {
  const list = asList(rows);
  if (!list.length) return 'Roster: no members on file.';
  const byStatus = new Map();
  for (const m of list) {
    const st = String(m.status || 'Unknown').trim() || 'Unknown';
    byStatus.set(st, (byStatus.get(st) || 0) + 1);
  }
  const parts = [...byStatus.entries()].map(([k, n]) => `${n} ${k}`);
  const inactive = [...byStatus.entries()]
    .filter(([k]) => /inactive|leave|resigned|retired/i.test(k))
    .reduce((n, [, c]) => n + c, 0);
  const concern = inactive
    ? `${inactive} listed inactive/leave — check Daily Staffing for shift minimums.`
    : 'Shift minimums are not in this roster read — confirm on Daily Staffing if you need the riding board.';
  return `Roster: ${list.length} on file (${parts.join(', ')}). ${concern}`;
}

function prettyStatus(status) {
  return String(status || 'unknown').replace(/_/g, ' ');
}

export function formatApparatus(rows) {
  const list = asList(rows);
  if (!list.length) return 'Apparatus: no unit status on file.';
  const inService = list.filter((u) => /in_service|in service/i.test(String(u.status || '')));
  const other = list.filter((u) => !/in_service|in service/i.test(String(u.status || '')));
  const line = (u) => `${u.designation || `Unit ${u.apparatus_id}`}: ${prettyStatus(u.status)}`;
  const bits = [];
  bits.push(`${inService.length} in service of ${list.length}`);
  if (other.length) {
    bits.push(other.slice(0, 8).map(line).join('; '));
  }
  return `Apparatus: ${bits.join(' — ')}.`;
}

export function formatTraining(rows) {
  const list = asList(rows);
  if (!list.length) return 'Training: no hour records on file.';
  const total = list.reduce((n, r) => n + (Number(r.hours) || 0), 0);
  const recent = list.slice(0, 4).map((r) => {
    const name = r.courseName || r.course_name || r.type || 'Course';
    const hrs = r.hours != null ? `${r.hours}h` : '';
    return [name, hrs].filter(Boolean).join(' ');
  });
  return `Training: ${list.length} records, ${total} hours logged. Recent: ${recent.join('; ')}.`;
}

export function formatDutyBoardReplies(plan, replies) {
  if (plan.kind !== 'reads') return plan.text;
  const chunks = [];
  for (const reply of replies) {
    if (!reply.ok) {
      const msg = reply.error?.message || 'Read failed.';
      if (reply.error?.status === 401) {
        chunks.push('Session expired. Sign in again — I use your badge, not a separate bot.');
        continue;
      }
      if (reply.error?.status === 404) {
        chunks.push('Department tools are not on this install yet. Duty / Board needs the agent invoke route.');
        continue;
      }
      if (reply.error?.code === 'STATION_REQUIRED' || /multiple stations|station_id/i.test(msg)) {
        chunks.push('Duty: this department has more than one house. Name the station on Daily Staffing — I will not guess.');
        continue;
      }
      chunks.push(`${reply.verb.replace(/_/g, ' ')}: ${msg}`);
      continue;
    }
    if (reply.verb === 'board_read') {
      chunks.push(formatCommandBoard(invokeData(reply.out)));
      continue;
    }
    if (reply.verb === 'duty_read') {
      chunks.push(formatDuty(invokeData(reply.out)));
      continue;
    }
    const rows = invokeRows(reply.out);
    if (reply.verb === 'incident_read') chunks.push(formatIncidents(rows));
    else if (reply.verb === 'roster_read') chunks.push(formatRoster(rows));
    else if (reply.verb === 'apparatus_status_read') chunks.push(formatApparatus(rows));
    else if (reply.verb === 'training_hours_read') chunks.push(formatTraining(rows));
  }
  return chunks.filter(Boolean).join('\n\n') || 'No data returned.';
}

/**
 * Run one Duty/Board turn against live invoke (session JWT via api.js).
 * @param {string} message
 * @param {{ invoke?: typeof invokeAgent }} [opts]
 */
export async function runDutyBoardTurn(message, opts = {}) {
  const invoke = opts.invoke || (await import('./askInvoke')).invokeAgent;
  const plan = planDutyBoard(message);
  if (plan.kind !== 'reads') {
    return { plan, text: plan.text, replies: [] };
  }
  const replies = [];
  for (const verb of plan.verbs) {
    try {
      const out = await invoke(verb, {});
      replies.push({ verb, ok: true, out });
    } catch (error) {
      replies.push({ verb, ok: false, error });
    }
  }
  return { plan, text: formatDutyBoardReplies(plan, replies), replies };
}
