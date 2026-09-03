'use strict';
/**
 * morningBrief.js — first OpenFirehouse routine (scheduled watch).
 *
 * Reads the house through the same invoke() path Ask uses
 * (board_read, duty_read, roster_read, apparatus_status_read, incident_read).
 * Formats a short ops digest. Stays silent on the scheduled tick when the
 * house is calm or nothing changed. Never selects a write verb, never
 * authors legal narrative, never clears a unit, never auto-Accepts.
 *
 * Manual "Run morning brief now" is always visible so a chief can demo
 * without waiting on cron.
 */

const crypto = require('crypto');

function pool() {
  return require('../db').pool;
}

function invoke() {
  return require('./agentInvoke').invoke;
}

function resolveRole() {
  return require('./roleResolver').resolveRole;
}

const ROUTINE_NAME = 'morning_shift_brief';

const MORNING_BRIEF_READ_VERBS = Object.freeze([
  'board_read',
  'duty_read',
  'roster_read',
  'apparatus_status_read',
  'incident_read',
]);

const GATED_WRITE_VERBS = Object.freeze([
  'neris_submit',
  'notify_chief',
  'apparatus_status_update',
  'incident_update',
]);

const CLOSED_DISPOSITION = /^(closed|cleared|complete|completed|cancelled|canceled|unfounded|refused)$/i;
const OOS_STATUS = /^(out_of_service|oos|out of service)$/i;
const IN_SERVICE = /^(in_service|in service)$/i;
const WEEKEND = /^(Sat|Sun)/i;

const DEFAULT_TZ = 'America/New_York';
const DEFAULT_HOUR = 7;
const VERCEL_CRON = '0 11 * * *';

function scheduleConfig() {
  const timeZone = String(process.env.MORNING_BRIEF_TZ || DEFAULT_TZ).trim() || DEFAULT_TZ;
  const hourRaw = Number(process.env.MORNING_BRIEF_HOUR);
  const localHour = Number.isInteger(hourRaw) && hourRaw >= 0 && hourRaw <= 23 ? hourRaw : DEFAULT_HOUR;
  return {
    weekdays: true,
    localHour,
    timeZone,
    cron: VERCEL_CRON,
    cronNote: 'Vercel cron is 11:00 UTC daily (07:00 America/New_York during EDT). The handler stays silent on Saturday and Sunday so the house is not spammed. Change vercel.json, or set MORNING_BRIEF_TZ / MORNING_BRIEF_HOUR for the in-process ticker.',
  };
}

function localParts(now, timeZone) {
  const d = now instanceof Date ? now : new Date(now);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const bag = {};
  for (const part of fmt.formatToParts(d)) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  return {
    weekday: bag.weekday,
    year: bag.year,
    month: bag.month,
    day: bag.day,
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    dateKey: `${bag.year}-${bag.month}-${bag.day}`,
  };
}

function isWeekdayMorning(now, cfg) {
  const schedule = cfg || scheduleConfig();
  const parts = localParts(now, schedule.timeZone);
  return !WEEKEND.test(parts.weekday) && parts.hour === schedule.localHour;
}

function unwrapData(out) {
  const body = out && out.result;
  if (!body) return null;
  return Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body;
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return typeof raw === 'object' ? raw : {};
}

function isOpenIncident(inc) {
  const disp = String(inc && (inc.disposition || inc.status) || '').trim();
  if (!disp) return true;
  return !CLOSED_DISPOSITION.test(disp);
}

function prettyStatus(status) {
  return String(status || 'unknown').replace(/_/g, ' ');
}

function extractFacts(replies) {
  const facts = {
    boardActive: false,
    boardLine: 'no active command board',
    dutyMissing: false,
    dutyEmpty: false,
    dutyCount: 0,
    riders: [],
    rosterCount: 0,
    oos: [],
    oosCount: 0,
    inServiceCount: 0,
    unitCount: 0,
    openIncidents: [],
    openIncidentCount: 0,
    readErrors: [],
  };

  for (const reply of replies || []) {
    const verb = reply.verb;
    const out = reply.out;
    if (!out || (!out.ok && !out.queued && (out.status || 0) >= 400)) {
      facts.readErrors.push(`${verb.replace(/_/g, ' ')}: ${(out && out.error) || 'read failed'}`);
      continue;
    }
    const data = unwrapData(out);

    if (verb === 'board_read') {
      const board = Array.isArray(data) ? data[0] : data;
      if (board && typeof board === 'object') {
        const type = board.incident_type || board.incidentType || board.type;
        const addr = board.address || board.location || '';
        if (type || addr) {
          facts.boardActive = true;
          const bits = [type || 'Active call', addr].filter(Boolean);
          const units = board.units_count ?? board.unitsCount;
          const people = board.personnel_count ?? board.personnelCount;
          if (units != null) bits.push(`${units} units`);
          if (people != null) bits.push(`${people} personnel`);
          facts.boardLine = bits.join(' · ');
        }
      }
      continue;
    }

    if (verb === 'duty_read') {
      if (!data) {
        facts.dutyMissing = true;
        continue;
      }
      const payload = parsePayload(data.payload);
      const crew = Array.isArray(payload.crew) ? payload.crew : [];
      facts.dutyCount = crew.length;
      facts.dutyEmpty = crew.length === 0;
      facts.riders = crew.slice(0, 8).map((c) => {
        const name = c.member_name || c.name || 'Member';
        const pos = c.position_name || c.position || c.member_rank || '';
        const rig = c.designation || c.apparatus
          || (c.apparatus_id != null ? `Unit ${c.apparatus_id}` : '');
        return [name, pos, rig].filter(Boolean).join(' · ');
      });
      continue;
    }

    if (verb === 'roster_read') {
      facts.rosterCount = asList(data).length;
      continue;
    }

    if (verb === 'apparatus_status_read') {
      const list = asList(data);
      facts.unitCount = list.length;
      const oos = list.filter((u) => OOS_STATUS.test(String(u.status || '')));
      const inService = list.filter((u) => IN_SERVICE.test(String(u.status || '')));
      facts.oos = oos.slice(0, 8).map((u) => `${u.designation || `Unit ${u.apparatus_id}`}: ${prettyStatus(u.status)}`);
      facts.oosCount = oos.length;
      facts.inServiceCount = inService.length;
      continue;
    }

    if (verb === 'incident_read') {
      const open = asList(data).filter(isOpenIncident);
      facts.openIncidentCount = open.length;
      facts.openIncidents = open.slice(0, 6).map((inc) => {
        const num = inc.incidentNumber || inc.incident_number || `#${inc.id}`;
        const type = inc.type || 'Call';
        const addr = inc.address || inc.location || '';
        return [num, type, addr].filter(Boolean).join(' · ');
      });
    }
  }

  return facts;
}

function isNoteworthy(facts) {
  if (!facts) return false;
  return !!(
    facts.boardActive
    || facts.oosCount > 0
    || facts.openIncidentCount > 0
    || facts.dutyMissing
    || facts.dutyEmpty
    || (facts.readErrors && facts.readErrors.length)
  );
}

function fingerprint(facts) {
  const key = {
    board: facts.boardActive ? facts.boardLine : '',
    duty: facts.dutyMissing ? 'missing' : (facts.dutyEmpty ? 'empty' : facts.dutyCount),
    riders: facts.riders || [],
    oos: facts.oos || [],
    open: facts.openIncidents || [],
  };
  return crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 32);
}

function formatDigest(facts, opts) {
  const options = opts || {};
  if (options.silent) {
    return options.unchanged
      ? 'House is quiet. Nothing changed since the last check.'
      : 'House is quiet. Board clear, no OOS apparatus, no open calls.';
  }

  const lines = ['Morning shift brief'];
  if (facts.boardActive) lines.push(`Board: ACTIVE — ${facts.boardLine}.`);
  else lines.push('Board: clear — no active command board.');

  if (facts.dutyMissing) {
    lines.push('Duty: no published run list for today.');
  } else if (facts.dutyEmpty) {
    lines.push('Duty: published run list is empty.');
  } else if (facts.dutyCount) {
    const extra = facts.dutyCount > facts.riders.length ? ` (+${facts.dutyCount - facts.riders.length} more)` : '';
    lines.push(`Duty: ${facts.dutyCount} riding.`);
    for (const rider of facts.riders) lines.push(`• ${rider}`);
    if (extra) lines.push(extra.trim());
  } else {
    lines.push('Duty: no riding list in this read.');
  }

  if (facts.unitCount) {
    const oosBit = facts.oosCount
      ? `OOS: ${facts.oos.join('; ')}`
      : 'none OOS';
    lines.push(`Apparatus: ${facts.inServiceCount} in service of ${facts.unitCount} — ${oosBit}.`);
  } else {
    lines.push('Apparatus: no unit status on file.');
  }

  if (facts.openIncidentCount) {
    lines.push(`Open incidents: ${facts.openIncidentCount}.`);
    for (const row of facts.openIncidents) lines.push(`• ${row}`);
  }

  if (facts.rosterCount) {
    lines.push(`Roster: ${facts.rosterCount} on file.`);
  }

  if (facts.readErrors && facts.readErrors.length) {
    lines.push(`Reads that failed: ${facts.readErrors.join('; ')}.`);
  }

  lines.push('Read-only. I do not write incident narrative, clear units, or Accept.');
  return lines.join('\n');
}

function decideSilence(facts, lastFingerprint, triggerKind, forceVisible) {
  if (forceVisible || triggerKind === 'manual') {
    return { silent: false, unchanged: lastFingerprint === fingerprint(facts) };
  }
  const unchanged = !!(lastFingerprint && lastFingerprint === fingerprint(facts));
  const calm = !isNoteworthy(facts);
  return { silent: unchanged || calm, unchanged };
}

async function latestRuns(departmentId) {
  const { rows } = await pool().query(
    `SELECT * FROM agent_routine_runs
      WHERE department_id = $1 AND routine_name = $2
      ORDER BY created_at DESC
      LIMIT 20`,
    [departmentId, ROUTINE_NAME]
  );
  const lastCheck = rows[0] || null;
  const latestVisible = rows.find((r) => !r.silent) || null;
  return { lastCheck, latestVisible, rows };
}

async function persistRun(row) {
  const { rows } = await pool().query(
    `INSERT INTO agent_routine_runs
       (department_id, routine_name, trigger_kind, silent, fingerprint, digest, facts,
        actor_id, actor_name, actor_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      row.department_id,
      ROUTINE_NAME,
      row.trigger_kind,
      row.silent,
      row.fingerprint,
      row.digest,
      JSON.stringify(row.facts || {}),
      row.actor_id || null,
      row.actor_name || '',
      row.actor_role || '',
    ]
  );
  return rows[0];
}

async function invokeReads(parentReq) {
  const replies = [];
  for (const verb of MORNING_BRIEF_READ_VERBS) {
    if (GATED_WRITE_VERBS.includes(verb)) {
      throw new Error(`morning brief refused write verb ${verb}`);
    }
    try {
      const out = await invoke()(parentReq, verb, {});
      replies.push({ verb, out });
    } catch (err) {
      replies.push({
        verb,
        out: { ok: false, status: 500, error: err.message || 'invoke failed' },
      });
    }
  }
  return replies;
}

async function runMorningBrief(parentReq, opts) {
  const options = opts || {};
  const triggerKind = options.triggerKind === 'scheduled' ? 'scheduled' : 'manual';
  const user = parentReq && parentReq.user;
  if (!user || !user.department_id) {
    return { ok: false, status: 401, error: 'Authentication required.', code: 'UNAUTHENTICATED' };
  }

  const replies = await invokeReads(parentReq);
  const facts = extractFacts(replies);
  const fp = fingerprint(facts);
  const { lastCheck } = await latestRuns(user.department_id);
  const decision = decideSilence(facts, lastCheck && lastCheck.fingerprint, triggerKind, options.forceVisible);
  const digest = formatDigest(facts, decision);
  const saved = await persistRun({
    department_id: user.department_id,
    trigger_kind: triggerKind,
    silent: decision.silent,
    fingerprint: fp,
    digest,
    facts,
    actor_id: user.id,
    actor_name: user.name || user.username || '',
    actor_role: user.role || '',
  });

  return {
    ok: true,
    status: 200,
    silent: decision.silent,
    unchanged: decision.unchanged,
    run: saved,
    digest,
    facts,
    verbs: [...MORNING_BRIEF_READ_VERBS],
  };
}

/**
 * Build a request-like object for a real department member so scheduled
 * invoke() respects that badge. Not a superuser and not a second login.
 */
async function loadRoutineActor(departmentId) {
  const preferred = String(process.env.OPENFIREHOUSE_ROUTINE_ACTOR || '').trim();
  let userRow = null;
  if (preferred) {
    const named = await pool().query(
      `SELECT u.id, u.username, u.name, u.role, u.station_id, u.apparatus_id,
              u.fleet_maintenance, u.cs_manager
         FROM users u
         JOIN of_user_departments ud ON ud.user_id = u.id
        WHERE ud.department_id = $1 AND LOWER(u.username) = LOWER($2)
        LIMIT 1`,
      [departmentId, preferred]
    );
    userRow = named.rows[0] || null;
  }
  if (!userRow) {
    const officers = await pool().query(
      `SELECT u.id, u.username, u.name, u.role, u.station_id, u.apparatus_id,
              u.fleet_maintenance, u.cs_manager
         FROM users u
         JOIN of_user_departments ud ON ud.user_id = u.id
        WHERE ud.department_id = $1
          AND ud.role IN ('chief','deputy_chief','battalion_chief','training_battalion',
                          'officer','lieutenant','training_captain','admin')
          AND COALESCE(u.role, '') <> 'unit'
        ORDER BY u.id ASC
        LIMIT 1`,
      [departmentId]
    );
    userRow = officers.rows[0] || null;
  }
  if (!userRow) {
    const any = await pool().query(
      `SELECT u.id, u.username, u.name, u.role, u.station_id, u.apparatus_id,
              u.fleet_maintenance, u.cs_manager
         FROM users u
         JOIN of_user_departments ud ON ud.user_id = u.id
        WHERE ud.department_id = $1
          AND COALESCE(u.role, '') <> 'unit'
        ORDER BY u.id ASC
        LIMIT 1`,
      [departmentId]
    );
    userRow = any.rows[0] || null;
  }
  if (!userRow || !userRow.station_id) return null;

  const resolved = await resolveRole()(userRow.role, departmentId);
  return {
    method: 'GET',
    url: '/routines/morning-brief',
    headers: {},
    user: {
      id: userRow.id,
      username: userRow.username,
      name: userRow.name || userRow.username,
      role: userRow.role,
      roleLevel: resolved.level,
      roleLabel: resolved.label,
      roleIsBuiltin: resolved.isBuiltin,
      rolePages: resolved.pages,
      stationId: userRow.station_id,
      department_id: departmentId,
      fleet_maintenance: userRow.fleet_maintenance === true,
      cs_manager: userRow.cs_manager === true,
      apparatusId: null,
      session_kind: 'member',
      client_kind: 'command',
    },
    get() { return undefined; },
  };
}

async function listDepartments() {
  const { rows } = await pool().query('SELECT id FROM departments ORDER BY id ASC');
  return rows.map((r) => r.id);
}

async function runScheduledForDepartment(departmentId, now, opts) {
  const cfg = scheduleConfig();
  // The Vercel weekday slot IS the morning tick. Re-checking the house clock
  // here would skip a whole day on DST drift. The in-process ticker already
  // gated on isWeekdayMorning before calling with requireLocalHour.
  if (opts && opts.requireLocalHour && !isWeekdayMorning(now || new Date(), cfg)) {
    return { skipped: true, reason: 'not_local_morning' };
  }
  const actorReq = await loadRoutineActor(departmentId);
  if (!actorReq) return { skipped: true, reason: 'no_actor' };
  return runMorningBrief(actorReq, { triggerKind: 'scheduled' });
}

function publicRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    routine: run.routine_name,
    triggerKind: run.trigger_kind,
    silent: !!run.silent,
    digest: run.digest,
    facts: run.facts,
    actorName: run.actor_name,
    actorRole: run.actor_role,
    createdAt: run.created_at,
  };
}

function isSameLocalDay(iso, timeZone) {
  if (!iso) return false;
  const created = localParts(iso, timeZone).dateKey;
  const today = localParts(new Date(), timeZone).dateKey;
  return created === today;
}

async function getMorningBrief(departmentId) {
  const schedule = scheduleConfig();
  const { lastCheck, latestVisible } = await latestRuns(departmentId);
  const visibleToday = latestVisible && isSameLocalDay(latestVisible.created_at, schedule.timeZone)
    ? latestVisible
    : null;
  return {
    routine: ROUTINE_NAME,
    schedule,
    latest: publicRun(visibleToday),
    lastCheck: lastCheck ? {
      createdAt: lastCheck.created_at,
      silent: !!lastCheck.silent,
      triggerKind: lastCheck.trigger_kind,
    } : null,
  };
}

async function runScheduledAll(now, opts) {
  const cfg = scheduleConfig();
  const when = now || new Date();
  const parts = localParts(when, cfg.timeZone);
  if (WEEKEND.test(parts.weekday) && !(opts && opts.forceWeekend)) {
    return { departments: 0, ran: 0, silent: 0, skipped: 0, failed: 0, weekend: true };
  }
  const ids = await listDepartments();
  const summary = { departments: ids.length, ran: 0, silent: 0, skipped: 0, failed: 0 };
  for (const id of ids) {
    try {
      const out = await runScheduledForDepartment(id, now, opts);
      if (out && out.skipped) summary.skipped += 1;
      else if (out && out.ok && out.silent) { summary.ran += 1; summary.silent += 1; }
      else if (out && out.ok) summary.ran += 1;
      else summary.failed += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

let ticker = null;

function startMorningBriefTicker() {
  if (ticker) return ticker;
  const enabled = String(process.env.MORNING_BRIEF_INPROCESS || '').trim().toLowerCase() === 'true'
    || String(process.env.OPENFIREHOUSE_DEMO || '').trim().toLowerCase() === 'true';
  if (!enabled || process.env.VERCEL) return null;
  const fired = new Set();
  ticker = setInterval(() => {
    const cfg = scheduleConfig();
    const now = new Date();
    const parts = localParts(now, cfg.timeZone);
    if (!isWeekdayMorning(now, cfg) || parts.minute > 2) return;
    if (fired.has(parts.dateKey)) return;
    fired.add(parts.dateKey);
    runScheduledAll(now, { requireLocalHour: true }).catch((err) => {
      console.warn('[morningBrief] in-process tick failed:', err.message);
    });
  }, 60 * 1000);
  if (typeof ticker.unref === 'function') ticker.unref();
  return ticker;
}

module.exports = {
  ROUTINE_NAME,
  MORNING_BRIEF_READ_VERBS,
  GATED_WRITE_VERBS,
  scheduleConfig,
  localParts,
  isWeekdayMorning,
  unwrapData,
  extractFacts,
  isNoteworthy,
  fingerprint,
  formatDigest,
  decideSilence,
  runMorningBrief,
  loadRoutineActor,
  listDepartments,
  runScheduledForDepartment,
  runScheduledAll,
  getMorningBrief,
  publicRun,
  startMorningBriefTicker,
};
