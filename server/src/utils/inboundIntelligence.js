'use strict';
/**
 * inboundIntelligence.js — Layer 3: Inbound Intelligence Pipeline
 *
 * Connects email ingest and radio ingest to the incident pipeline:
 *
 *   1. Email Intelligence — AI classifies incoming emails and auto-attaches
 *      them to the correct incident or module with context tags
 *
 *   2. Radio Intelligence — AI analyzes radio transcripts for actionable
 *      intelligence: dispatch signals, status updates, critical alerts,
 *      and auto-links relevant traffic to active incidents
 *
 *   3. Intelligence Feed — Aggregates signals from both sources into a
 *      unified actionable intelligence stream
 */

const { pool } = require('../db');

// ═══════════════════════════════════════════════════════════════════════════════
// RADIO INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

// Keywords that indicate actionable radio traffic
const CRITICAL_PATTERNS = [
  { pattern: /mayday|may\s*day/i,                     priority: 'critical', tag: 'MAYDAY' },
  { pattern: /firefighter\s*down|man\s*down|ff\s*down/i, priority: 'critical', tag: 'FF_DOWN' },
  { pattern: /evacuate|abandon|pull\s*out|emergency\s*traffic/i, priority: 'critical', tag: 'EVACUATE' },
  { pattern: /collapse|structural\s*failure/i,         priority: 'critical', tag: 'COLLAPSE' },
  { pattern: /explosion|backdraft/i,                   priority: 'critical', tag: 'EXPLOSION' },
  { pattern: /entrap|trapped|pin/i,                    priority: 'high',     tag: 'ENTRAPMENT' },
  { pattern: /second\s*alarm|third\s*alarm|general\s*alarm|strike.*alarm/i, priority: 'high', tag: 'ALARM_UPGRADE' },
  { pattern: /mutual\s*aid|request.*assist/i,          priority: 'high',     tag: 'MUTUAL_AID_REQUEST' },
  { pattern: /all\s*clear|under\s*control|fire.*out/i, priority: 'medium',   tag: 'ALL_CLEAR' },
  { pattern: /responding|en\s*route|rolling/i,         priority: 'normal',   tag: 'RESPONDING' },
  { pattern: /on\s*scene|arrived|on\s*location/i,      priority: 'normal',   tag: 'ON_SCENE' },
  { pattern: /available|in\s*service|back\s*in/i,      priority: 'normal',   tag: 'IN_SERVICE' },
  { pattern: /transport|hospital|trauma\s*center/i,    priority: 'medium',   tag: 'TRANSPORT' },
  { pattern: /hazmat|hazardous|chemical/i,             priority: 'high',     tag: 'HAZMAT' },
  { pattern: /water\s*supply|tanker|shuttle/i,         priority: 'medium',   tag: 'WATER_SUPPLY' },
];

/**
 * Analyze a radio transcript for actionable intelligence.
 * Returns tags, priority, and whether it matches an active incident.
 */
function analyzeRadioTranscript(transcript) {
  if (!transcript || typeof transcript !== 'string') {
    return { tags: [], priority: 'normal', signals: [] };
  }

  const signals = [];
  let highestPriority = 'normal';
  const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, normal: 1 };

  for (const rule of CRITICAL_PATTERNS) {
    if (rule.pattern.test(transcript)) {
      signals.push({ tag: rule.tag, priority: rule.priority });
      if (PRIORITY_RANK[rule.priority] > PRIORITY_RANK[highestPriority]) {
        highestPriority = rule.priority;
      }
    }
  }

  return {
    tags: signals.map(s => s.tag),
    priority: highestPriority,
    signals,
    isCritical: highestPriority === 'critical',
    isActionable: signals.length > 0,
  };
}

/**
 * Try to match a radio transcript to an active incident by address or unit.
 */
async function matchRadioToIncident(transcript, stationId) {
  try {
    // Get recent incidents (last 24h)
    const { rows: recentIncidents } = await pool.query(
      `SELECT id, "incidentNumber", type, address, units, "alarmLevel"
       FROM incidents WHERE department_id = $1 AND deleted_at IS NULL
         AND "createdAt" > NOW() - INTERVAL '24 hours'
       ORDER BY "createdAt" DESC LIMIT 10`,
      [stationId]
    );

    if (recentIncidents.length === 0) return null;

    const lower = transcript.toLowerCase();

    for (const inc of recentIncidents) {
      // Match by address keywords
      if (inc.address) {
        const addrParts = inc.address.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
        const addrMatch = addrParts.filter(part => lower.includes(part));
        if (addrMatch.length >= 2) {
          return { incidentId: inc.id, incidentNumber: inc.incidentNumber, matchType: 'address', confidence: 'high' };
        }
      }

      // Match by incident number mentioned in radio
      if (inc.incidentNumber && lower.includes(inc.incidentNumber.toLowerCase())) {
        return { incidentId: inc.id, incidentNumber: inc.incidentNumber, matchType: 'incident_number', confidence: 'high' };
      }

      // Match by unit names mentioned in radio
      let units = inc.units;
      if (typeof units === 'string') {
        try { units = JSON.parse(units); } catch { units = []; }
      }
      if (Array.isArray(units)) {
        for (const unit of units) {
          if (unit && lower.includes(unit.toLowerCase())) {
            return { incidentId: inc.id, incidentNumber: inc.incidentNumber, matchType: 'unit', confidence: 'medium' };
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Process a radio log entry through the intelligence pipeline.
 * Called from the radio ingest route after storing the entry.
 */
async function processRadioIntelligence(entry, stationId) {
  const analysis = analyzeRadioTranscript(entry.transcript);

  if (!analysis.isActionable) {
    return { processed: true, actionable: false };
  }

  // Try to match to an incident
  const incidentMatch = await matchRadioToIncident(entry.transcript, stationId);

  // Store the intelligence signal
  try {
    await ensureIntelligenceTable();
    await pool.query(
      `INSERT INTO intelligence_signals
       (station_id, source, source_id, priority, tags, matched_incident_id, matched_incident_number, raw_content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        stationId,
        'radio',
        entry.id,
        analysis.priority,
        JSON.stringify(analysis.tags),
        incidentMatch?.incidentId || null,
        incidentMatch?.incidentNumber || null,
        entry.transcript.substring(0, 500),
      ]
    );
  } catch (err) {
    console.warn('[Intelligence] Failed to store radio signal:', err.message);
  }

  return {
    processed: true,
    actionable: true,
    priority: analysis.priority,
    tags: analysis.tags,
    incidentMatch,
    isCritical: analysis.isCritical,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enhanced email classification that tries to match to a specific incident.
 * Goes beyond module-level classification to find the exact record.
 */
async function matchEmailToIncident(subject, body, stationId) {
  try {
    const text = `${subject || ''} ${body || ''}`.toLowerCase();

    // Look for incident numbers in the text (YY-NNNN pattern)
    const incidentPattern = /\b(\d{2}-\d{4})\b/g;
    const matches = [...text.matchAll(incidentPattern)].map(m => m[1]);

    for (const num of matches) {
      const { rows } = await pool.query(
        `SELECT id, "incidentNumber", type, address FROM incidents
         WHERE department_id = $1 AND "incidentNumber" = $2 AND deleted_at IS NULL`,
        [stationId, num]
      );
      if (rows.length > 0) {
        return { incidentId: rows[0].id, incidentNumber: rows[0].incidentNumber, matchType: 'incident_number', confidence: 'high' };
      }
    }

    // Look for address matches against recent incidents
    const { rows: recentIncidents } = await pool.query(
      `SELECT id, "incidentNumber", address FROM incidents
       WHERE department_id = $1 AND deleted_at IS NULL AND "createdAt" > NOW() - INTERVAL '30 days'
       ORDER BY "createdAt" DESC LIMIT 20`,
      [stationId]
    );

    for (const inc of recentIncidents) {
      if (inc.address) {
        const addrParts = inc.address.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
        const addrMatch = addrParts.filter(part => text.includes(part));
        if (addrMatch.length >= 2) {
          return { incidentId: inc.id, incidentNumber: inc.incidentNumber, matchType: 'address', confidence: 'medium' };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Process a filed email through the intelligence pipeline.
 * Auto-links to incidents and generates intelligence signals.
 */
async function processEmailIntelligence(email, stationId) {
  try {
    // Try to match to a specific incident
    const incidentMatch = await matchEmailToIncident(email.subject, email.content || email.body, stationId);

    // Determine priority from content
    const priority = classifyEmailPriority(email.subject, email.content || email.body);

    // If we found an incident match, create correspondence link
    if (incidentMatch) {
      try {
        await pool.query(
          `INSERT INTO correspondence
           (station_id, module, record_id, entry_type, from_name, subject, body, entered_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT DO NOTHING`,
          [
            stationId,
            'incidents',
            incidentMatch.incidentId,
            'email',
            email.from || email.from_address || '',
            email.subject || '',
            (email.content || email.body || '').substring(0, 2000),
            'Intelligence Pipeline',
          ]
        );
      } catch { /* correspondence table may not exist */ }
    }

    // Store intelligence signal
    try {
      await ensureIntelligenceTable();
      await pool.query(
        `INSERT INTO intelligence_signals
         (station_id, source, source_id, priority, tags, matched_incident_id, matched_incident_number, raw_content, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          stationId,
          'email',
          email.id || null,
          priority,
          JSON.stringify(email.module ? [email.module] : []),
          incidentMatch?.incidentId || null,
          incidentMatch?.incidentNumber || null,
          `${email.subject || ''}: ${(email.content || email.body || '').substring(0, 300)}`,
        ]
      );
    } catch (err) {
      console.warn('[Intelligence] Failed to store email signal:', err.message);
    }

    return {
      processed: true,
      incidentMatch,
      priority,
      autoLinked: !!incidentMatch,
    };
  } catch (err) {
    return { processed: false, error: err.message };
  }
}

/**
 * Classify email urgency from content.
 */
function classifyEmailPriority(subject, body) {
  const text = `${subject || ''} ${body || ''}`.toLowerCase();

  if (/urgent|emergency|immediate|critical|fatality|death|osha/i.test(text)) return 'critical';
  if (/important|action\s*required|deadline|overdue|violation|injury/i.test(text)) return 'high';
  if (/update|follow.?up|reminder|fyi|notice/i.test(text)) return 'medium';
  return 'normal';
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED INTELLIGENCE FEED
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the intelligence feed — unified stream of actionable signals
 * from all inbound sources (radio, email).
 */
async function getIntelligenceFeed(stationId, options = {}) {
  const { limit = 50, priority = null, source = null, incidentId = null } = options;

  try {
    await ensureIntelligenceTable();

    let query = `SELECT * FROM intelligence_signals WHERE department_id = $1`;
    const params = [stationId];
    let idx = 2;

    if (priority) {
      query += ` AND priority = $${idx}`;
      params.push(priority);
      idx++;
    }
    if (source) {
      query += ` AND source = $${idx}`;
      params.push(source);
      idx++;
    }
    if (incidentId) {
      query += ` AND matched_incident_id = $${idx}`;
      params.push(incidentId);
      idx++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(Math.min(limit, 200));

    const { rows } = await pool.query(query, params);

    // Parse JSON tags
    for (const row of rows) {
      if (typeof row.tags === 'string') {
        try { row.tags = JSON.parse(row.tags); } catch { row.tags = []; }
      }
    }

    // Summary stats
    const { rows: stats } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE priority = 'critical') as critical,
         COUNT(*) FILTER (WHERE priority = 'high') as high,
         COUNT(*) FILTER (WHERE priority = 'medium') as medium,
         COUNT(*) FILTER (WHERE matched_incident_id IS NOT NULL) as incident_linked,
         COUNT(*) FILTER (WHERE source = 'radio') as from_radio,
         COUNT(*) FILTER (WHERE source = 'email') as from_email
       FROM intelligence_signals
       WHERE department_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [stationId]
    ).catch(() => ({ rows: [{}] }));

    return {
      signals: rows,
      count: rows.length,
      stats: {
        last24h: stats[0] || {},
      },
    };
  } catch (err) {
    return { signals: [], count: 0, error: err.message };
  }
}

// ── Schema Migration ────────────────────────────────────────────────────────
let tableCreated = false;
async function ensureIntelligenceTable() {
  if (tableCreated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS intelligence_signals (
        id SERIAL PRIMARY KEY,
        station_id INTEGER DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'unknown',
        source_id INTEGER,
        priority TEXT DEFAULT 'normal',
        tags JSONB DEFAULT '[]',
        matched_incident_id INTEGER,
        matched_incident_number TEXT,
        raw_content TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_station_created
      ON intelligence_signals (station_id, created_at DESC)
    `);
    tableCreated = true;
  } catch (err) {
    console.warn('[Intelligence] Table creation note:', err.message);
  }
}

module.exports = {
  // Radio
  analyzeRadioTranscript,
  processRadioIntelligence,
  matchRadioToIncident,
  CRITICAL_PATTERNS,
  // Email
  processEmailIntelligence,
  matchEmailToIncident,
  classifyEmailPriority,
  // Feed
  getIntelligenceFeed,
};
