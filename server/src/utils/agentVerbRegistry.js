'use strict';
/**
 * agentVerbRegistry.js — fire-verb contract for the department-local MCP.
 *
 * This is NOT aiActionRegistry. That file is an LLM prompt catalog (draft
 * facts, briefings, forecasts). These verbs wrap existing Express routes
 * under the same JWT / role gates the app already uses.
 *
 * gate:
 *   none               — execute immediately (reads)
 *   strip_legal_record — execute immediately after stripping narrative keys
 *   approval           — enqueue; a chief/officer accepts on the Dashboard
 */

const { stripForbiddenKeys } = require('./aiNarrativeGuard');
const { effectiveLevel } = require('../middleware/requireRole');

// Same closed set the AI-narrative guard already enforces on LLM results.
// An agent PATCH must not write the subpoenable incident narrative.
const LEGAL_RECORD_KEYS = [
  'notes', 'narrative', 'outcome_narrative', 'impediment_narrative', 'narrativeStatement', 'description',
];

// Closed set for incident_update. A denylist is not enough: incUpdate also
// allowlists NERIS axis fields (and notes). Extra keys must never ride through.
const INCIDENT_UPDATE_ALLOWED = [
  'type', 'alarmLevel', 'address', 'units', 'personnel', 'disposition', 'injuries', 'date', 'time',
];

function numId(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return { error: `${label} must be a positive integer`, code: 'INVALID_ARGS', status: 400 };
  }
  return { value: n };
}

const VERBS = {
  incident_read: {
    description: 'Read one incident by id, or list incidents for this department.',
    gate: 'none',
    minLevel: 1,
    minLevelLabel: 'member',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Incident id. Omit to list.' },
      },
    },
    prepare(args) {
      if (args.id != null) {
        const id = numId(args.id, 'id');
        if (id.error) return id;
        return {
          route: { router: 'incidents', method: 'GET', url: `/${id.value}`, body: {} },
          summary: `Read incident ${id.value}`,
        };
      }
      return {
        route: { router: 'incidents', method: 'GET', url: '/', body: {} },
        summary: 'List incidents',
      };
    },
  },

  incident_update: {
    description:
      'Update factual incident fields (type, address, units, times). Cannot write notes or narrative.',
    gate: 'strip_legal_record',
    minLevel: 1,
    minLevelLabel: 'member',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer', description: 'Incident id' },
        type: { type: 'string' },
        alarmLevel: { type: 'string' },
        address: { type: 'string' },
        units: { type: 'array', items: { type: 'string' } },
        personnel: { type: 'array', items: { type: 'string' } },
        disposition: { type: 'string' },
        injuries: { type: 'integer' },
        date: { type: 'string' },
        time: { type: 'string' },
      },
    },
    prepare(args) {
      const id = numId(args.id, 'id');
      if (id.error) return id;
      const body = {};
      const droppedKeys = [];
      for (const [key, value] of Object.entries(args || {})) {
        if (key === 'id') continue;
        if (INCIDENT_UPDATE_ALLOWED.includes(key)) body[key] = value;
        else droppedKeys.push(key);
      }
      // Belt: even an allowlist slip must not carry narrative keys.
      droppedKeys.push(...stripForbiddenKeys(body, LEGAL_RECORD_KEYS));
      if (!Object.keys(body).length) {
        const legal = droppedKeys.some((k) => LEGAL_RECORD_KEYS.includes(k));
        return {
          error: legal
            ? 'No allowed fields to update. Incident notes/narrative are officer-written only.'
            : 'No allowed fields to update. Only type, alarmLevel, address, units, personnel, disposition, injuries, date, and time are writable.',
          code: legal ? 'LEGAL_RECORD_FORBIDDEN' : 'UNKNOWN_FIELD',
          status: 400,
          droppedKeys,
        };
      }
      return {
        route: { router: 'incidents', method: 'PATCH', url: `/${id.value}`, body },
        summary: `Update incident ${id.value} fields: ${Object.keys(body).join(', ')}`,
        droppedKeys,
      };
    },
  },

  roster_read: {
    description: 'Read the department member roster.',
    gate: 'none',
    minLevel: 1,
    minLevelLabel: 'member',
    inputSchema: { type: 'object', properties: {} },
    prepare() {
      return {
        route: { router: 'members', method: 'GET', url: '/', body: {} },
        summary: 'Read roster',
      };
    },
  },

  duty_read: {
    description:
      'Read today\'s published duty / run list (who is riding). Same snapshot Duty Board and Unit Status use.',
    gate: 'none',
    minLevel: 1,
    minLevelLabel: 'member',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD. Omit for today.' },
        station_id: { type: 'integer', description: 'Required only in a multi-house department.' },
      },
    },
    prepare(args) {
      const query = {};
      if (args.date != null && String(args.date).trim()) {
        const date = String(args.date).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return { error: 'date must be YYYY-MM-DD', code: 'INVALID_ARGS', status: 400 };
        }
        query.date = date;
      }
      if (args.station_id != null) {
        const stationId = numId(args.station_id, 'station_id');
        if (stationId.error) return stationId;
        query.station_id = stationId.value;
      }
      return {
        route: { router: 'runList', method: 'GET', url: '/today', query, body: {} },
        summary: query.date ? `Read duty run list for ${query.date}` : "Read today's duty run list",
      };
    },
  },

  board_read: {
    description:
      'Read the live Command Board (active incident). Same GET /api/active-board the Duty/Command screens poll.',
    gate: 'none',
    minLevel: 1,
    minLevelLabel: 'member',
    inputSchema: { type: 'object', properties: {} },
    prepare() {
      return {
        route: { router: 'activeBoard', method: 'GET', url: '/', body: {} },
        summary: 'Read active command board',
      };
    },
  },

  training_hours_read: {
    description: 'Read training records (includes hours) for this department.',
    gate: 'none',
    minLevel: 1,
    minLevelLabel: 'member',
    inputSchema: { type: 'object', properties: {} },
    prepare() {
      return {
        route: { router: 'training', method: 'GET', url: '/', body: {} },
        summary: 'Read training hours',
      };
    },
  },

  neris_submit: {
    description:
      'Request NERIS submission for an incident. Queued for a chief/officer to approve; does not write the record itself.',
    gate: 'approval',
    minLevel: 1,
    minLevelLabel: 'member',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer', description: 'Incident id to submit' },
      },
    },
    prepare(args) {
      const id = numId(args.id, 'id');
      if (id.error) return id;
      return {
        route: { router: 'incidents', method: 'POST', url: `/${id.value}/neris-status`, body: { action: 'approve' } },
        summary: `Submit incident ${id.value} to NERIS (human approval required)`,
        executePlan: { kind: 'neris_submit', incidentId: id.value },
      };
    },
  },

  notify_chief: {
    description:
      'Request an in-app message to department chiefs. Queued for human approval before it is sent.',
    gate: 'approval',
    minLevel: 1,
    minLevelLabel: 'member',
    inputSchema: {
      type: 'object',
      required: ['body'],
      properties: {
        subject: { type: 'string' },
        body: { type: 'string', description: 'Message text' },
      },
    },
    prepare(args) {
      const body = String(args.body || args.message || '').trim();
      if (!body) {
        return { error: 'body is required', code: 'INVALID_ARGS', status: 400 };
      }
      const subject = String(args.subject || 'Agent notification').trim() || 'Agent notification';
      return {
        route: { router: 'messages', method: 'POST', url: '/', body: { subject, body } },
        summary: `Notify chiefs: ${subject}`,
        executePlan: { kind: 'notify_chief', subject, body },
      };
    },
  },

  apparatus_status_read: {
    description: 'Read live apparatus / unit status for this department.',
    gate: 'none',
    minLevel: 1,
    minLevelLabel: 'member',
    inputSchema: { type: 'object', properties: {} },
    prepare() {
      return {
        route: { router: 'units', method: 'GET', url: '/status', body: {} },
        summary: 'Read apparatus status',
      };
    },
  },

  apparatus_status_update: {
    description:
      'Request an apparatus status change (including unit clear/release). Queued for human approval — the app never auto-flips unit status.',
    gate: 'approval',
    minLevel: 2,
    minLevelLabel: 'officer',
    inputSchema: {
      type: 'object',
      required: ['apparatusId', 'status'],
      properties: {
        apparatusId: { type: 'integer' },
        status: { type: 'string', description: 'Unit status value (e.g. in_service, returning, on_scene)' },
        incidentId: { type: 'integer' },
      },
    },
    prepare(args) {
      const apparatusId = numId(args.apparatusId, 'apparatusId');
      if (apparatusId.error) return apparatusId;
      const status = String(args.status || '').trim();
      if (!status) {
        return { error: 'status is required', code: 'INVALID_ARGS', status: 400 };
      }
      const body = { status };
      if (args.incidentId != null) {
        const incidentId = numId(args.incidentId, 'incidentId');
        if (incidentId.error) return incidentId;
        body.incidentId = incidentId.value;
      }
      return {
        route: {
          router: 'units',
          method: 'PATCH',
          url: `/${apparatusId.value}/status`,
          body,
        },
        summary: `Set apparatus ${apparatusId.value} to ${status} (human approval required)`,
        executePlan: { kind: 'route' },
      };
    },
  },
};

function catalog() {
  return Object.entries(VERBS).map(([name, def]) => ({
    name,
    description: def.description,
    gate: def.gate,
    minLevel: def.minLevel,
    inputSchema: def.inputSchema,
  }));
}

function mcpTools() {
  return catalog().map((v) => ({
    name: v.name,
    description: v.description,
    inputSchema: v.inputSchema,
  }));
}

/**
 * Authz-check + shape a verb call. Pure besides stripForbiddenKeys (in-place on a copy).
 * Does not write anything.
 */
function prepareInvocation(verbName, args, user) {
  const def = VERBS[verbName];
  if (!def) {
    return {
      ok: false,
      status: 400,
      error: `Unknown verb: ${verbName}`,
      code: 'UNKNOWN_VERB',
      available: Object.keys(VERBS),
    };
  }
  if (!user) {
    return { ok: false, status: 401, error: 'Authentication required.', code: 'UNAUTHENTICATED' };
  }
  const level = effectiveLevel(user);
  if (level < def.minLevel) {
    return {
      ok: false,
      status: 403,
      error: `This verb requires ${def.minLevelLabel} authority.`,
      code: 'FORBIDDEN_ROLE',
    };
  }

  const prepared = def.prepare(args && typeof args === 'object' ? { ...args } : {}, user);
  if (prepared.error) {
    return {
      ok: false,
      status: prepared.status || 400,
      error: prepared.error,
      code: prepared.code || 'INVALID_ARGS',
      droppedKeys: prepared.droppedKeys || [],
    };
  }

  return {
    ok: true,
    verb: verbName,
    gate: def.gate,
    route: prepared.route,
    summary: prepared.summary,
    droppedKeys: prepared.droppedKeys || [],
    executePlan: prepared.executePlan || { kind: 'route' },
  };
}

module.exports = {
  VERBS,
  LEGAL_RECORD_KEYS,
  INCIDENT_UPDATE_ALLOWED,
  catalog,
  mcpTools,
  prepareInvocation,
};
