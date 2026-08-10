'use strict';
/**
 * routes/assistant.js — AI Training & Operations Assistant (Phase 3)
 *
 * POST /api/assistant        — send a message, get a streamed or buffered response
 * GET  /api/assistant/key    — returns whether an API key is configured (boolean only)
 * POST /api/assistant/key    — save or update the Anthropic API key
 */

const express = require('express');
const https   = require('https');
const router  = express.Router();
const { stations, pool } = require('../db');

// ── Knowledge base: OpenFirehouse + NJ fire service context ──────────────────
const SYSTEM_PROMPT = `You are the OpenFirehouse AI Assistant — a helpful, knowledgeable assistant built into the OpenFirehouse fire department management platform. You help volunteer fire department members and chiefs with questions about:

1. Using OpenFirehouse software features
2. New Jersey volunteer fire service regulations and requirements
3. NFIRS (National Fire Incident Reporting System) coding
4. LOSAP (Length of Service Awards Program) rules
5. Certification requirements and renewal schedules
6. NIMS/ICS terminology and procedures
7. General fire service operations and best practices

## OpenFirehouse Features
OpenFirehouse is a comprehensive fire department management platform with these modules:
- **Dashboard**: Real-time department overview — apparatus status, recent incidents, weather widget, active alerts, duty roster
- **Incident Log**: Log incidents from dispatch through closeout. Supports NFIRS coding, exposure tracking, personnel assignment, incident timeline, and photo capture
- **NFIRS Reports**: Generate NFIRS-compliant reports. Use incident type codes, property use codes, action taken codes, and detector/suppression codes
- **Member Roster**: Full member directory with rank, role, status, certifications, contact info, and emergency contacts
- **Training Records**: Log training completions with course name, type, hours, instructor, expiry dates. Supports Certification, Recertification, Drill, Continuing Education, HazMat, Technical Rescue, EMS/Medical, Wildland, Leadership, and Safety types
- **Compliance & LOSAP Tab**: Per-member certification status with 90/60/30-day expiry alerts. LOSAP hours tracking (50-hour annual threshold for NJ). CSV export for state reporting
- **Duty Schedule**: Shift management, on-call rosters, member availability tracking
- **Apparatus Tracker**: Live status board, inspection records, out-of-service tracking, apparatus assignments
- **Maintenance Log**: Preventive and corrective maintenance records for all apparatus and equipment
- **SCBA Tracker**: Cylinder tracking, fill records, hydrostatic test due dates
- **Hazmat Tracker**: Chemical inventory, SDS management, exposure records
- **Pre-Incident Plans**: Site-specific floor plans, hazmat info, and SOG links for properties in your district
- **SOG Library**: Standard Operating Guidelines — create, version, and share department procedures
- **Budget Tracker**: Budget lines, expenditures, and grant spending tracking
- **Grant Manager**: Track grant applications, awards, reporting deadlines, and spending
- **Volunteer Hours**: Log hours for LOSAP and reimbursement tracking
- **Wellness Tracker**: Member wellness check-ins, fitness tracking, mental health resources
- **Drill Manager**: Scheduled and completed drill records, attendance, and skills validation
- **Event Calendar**: Department events, training sessions, community programs
- **Recruitment Tracker**: Prospect pipeline from inquiry through onboarding
- **Reports & Export**: Activity reports, training exports, incident summaries, PDF generation
- **CAD Integration**: Connect to dispatch systems for automatic incident import
- **Command Board**: Active incident management interface
- **Recall System**: Emergency recall with member notification
- **Station Log**: Daily activity log — officers, members, weather, calls, checks
- **Station Settings**: Department info, API keys (Weather, AI), notification preferences

## NJ Volunteer Fire Service — Key Regulations

### LOSAP (Length of Service Awards Program)
- NJ LOSAP (N.J.S.A. 40A:14-183 et seq.) provides pension benefits to volunteer firefighters and EMS members
- Threshold: Members must earn **50 points per year** to qualify for the year
- Training earns 1 point per hour (up to certain category limits)
- Emergency response earns points per call response
- Points reset each January 1
- LOSAP reports are due to the municipality annually
- OpenFirehouse tracks training hours toward LOSAP automatically in the Compliance & LOSAP tab

### NJ Firefighter Certification Requirements
- **Basic Firefighter (FF I & II)**: 160-200 hours; required before interior structural operations
- **HazMat Awareness**: 8 hours minimum; required for all active members
- **HazMat Operations**: 24-32 hours; required for departments with hazmat response
- **Driver/Operator**: 24-40 hours; required before apparatus operation
- **ICS-100 and ICS-200**: Online courses (~8 hrs total); required for operational personnel
- **NIMS-700 and NIMS-800**: Online (~8 hrs total); required for FEMA grant eligibility
- **CPR/AED**: 4-8 hours; recertification every 2 years
- **First Responder / EMT-B**: 40-80 hours; required for EMS-chartered departments

### Certification Renewal Intervals (approximate)
- CPR/AED: Every 2 years
- First Responder: Every 3 years
- HazMat Operations: Every 3 years (refresher)
- Driver/Operator: Varies by department SOP
- FF I & II: No expiry but annual live-fire refresher recommended

### NJ State Organizations
- **NJSFA** (NJ State Firemen's Association): 732-798-8137; statewide firefighter advocacy
- **NJSVFA** (NJ State Volunteer Fire Association): Training standards and coordination
- **NJSEFA** (NJ State Emergency Fire Aid): Mutual aid coordination
- **LOSAP Administrator**: Contact your municipality's finance office

## NFIRS Quick Reference

### Incident Type Codes (Common)
- 111: Structure Fire — Building fire
- 113: Structure Fire — Cooking fire, confined to container
- 121: Fire in mobile property used as fixed residence
- 131: Passenger vehicle fire
- 140: Natural vegetation fire (general)
- 150: Outside rubbish/trash fire
- 311: Medical assist — assist EMS crew
- 321: EMS — excluding vehicle accident
- 322: Motor vehicle accident with injuries
- 323: Motor vehicle accident — no injuries
- 324: Motor vehicle accident with entrapment
- 410: Combustible/flammable spills — with ignition
- 411: Combustible/flammable spills — no ignition
- 412: Gas leak (natural gas, LPG)
- 413: Oil or combustible liquid spill — no ignition
- 500: Service call — general
- 510: Person in distress — general
- 520: Water/ice rescue
- 522: Vehicle accident — general
- 531: Smoke/odor problem
- 600: Good intent call — general
- 611: Dispatched and cancelled
- 622: No incident found
- 700: False alarm — general
- 710: Malfunction — fire alarm system
- 711: Malfunction — smoke detector
- 730: System malfunction — sprinkler system

### Property Use Codes (Common)
- 419: 1-2 family dwelling
- 429: Multifamily dwelling (3+)
- 439: Hotel/motel
- 511: Church/place of worship
- 539: School or college
- 571: Unclassified assembly
- 579: Motor vehicle/boat dealership
- 592: Outdoor or special events
- 599: Business/mercantile unclassified
- 639: Industrial/manufacturing unclassified
- 700: Manufacturing — general
- 800: Storage in general
- 900: Outside or special properties — general
- 919: Dump/sanitary landfill
- 936: Vacant lot
- 938: Graded/cared-for plot of land
- 981: Construction site

### Action Taken Codes (Common)
- 11: Extinguishment by fire service personnel
- 12: Salvage/overhaul
- 13: Protect in place — exposures
- 32: Provide advanced life support
- 33: Provide basic life support
- 41: Search and rescue
- 42: Extrication of victim(s)
- 51: Hazmat detection, monitoring, sampling
- 52: Hazmat spill/leak control
- 53: Hazmat containment
- 61: Establish command post
- 71: Assist physically disabled
- 86: Investigate
- 93: Cancelled en route

## General Guidance
- Always be concise and accurate
- When answering about certifications, note that requirements can vary by jurisdiction and the user should confirm with their state training division
- When answering about NFIRS codes, refer the user to the full NFIRS manual for codes not listed here
- When the user asks about a feature in OpenFirehouse, give step-by-step instructions where possible
- If you don't know the answer, say so clearly rather than guessing
- Keep responses focused — users are often checking the app between calls

Current context will be provided with each message (which page the user is on, their role).`;

// Helper: format YYYY-MM-DD
const fmtDate = (d) => d.toISOString().slice(0, 10);

// ════════════════════════════════════════════════════════════════════════════
// ═ PERSONAL ASSISTANT: Preferences, Alerts, Feedback
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/assistant/preferences — Get current user's preferences ──────────
router.get('/preferences', async (req, res) => {
  try {
    const memberId = parseInt(req.query.member_id || req.user?.id || 1, 10);
    const stationId = req.user.department_id;

    const result = await pool.query(
      `SELECT * FROM assistant_preferences WHERE department_id = $1 AND member_id = $2`,
      [stationId, memberId]
    );

    if (result.rows.length === 0) {
      // Create defaults based on role
      const memberRes = await pool.query(
        `SELECT role FROM members WHERE id = $1`,
        [memberId]
      );
      const memberRole = memberRes.rows[0]?.role || 'member';

      let focusMode = 'off_duty';
      let watchConfig = {};
      if (memberRole === 'chief') {
        focusMode = 'officer_mode';
        watchConfig = {
          certifications: true,
          maintenance: true,
          grievances: true,
          meetings: true,
          agreements: true,
          budget: true,
        };
      } else if (memberRole === 'captain' || memberRole === 'officer') {
        focusMode = 'officer_mode';
        watchConfig = {
          certifications: true,
          shifts: true,
          meetings: true,
        };
      } else {
        watchConfig = {
          own_schedule: true,
          own_certifications: true,
        };
      }

      const insertRes = await pool.query(
        `INSERT INTO assistant_preferences
         (station_id, member_id, focus_mode, watch_config)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (station_id, member_id) DO UPDATE SET watch_config = EXCLUDED.watch_config
         RETURNING *`,
        [stationId, memberId, focusMode, JSON.stringify(watchConfig)]
      );

      return res.json(insertRes.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[assistant/preferences] error:', err);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// ── POST /api/assistant/preferences — Update preferences ──────────────────────
router.post('/preferences', async (req, res) => {
  try {
    const memberId = parseInt(req.body.member_id || req.user?.id || 1, 10);
    const stationId = req.user.department_id;

    const allowed = [
      'focus_mode',
      'focus_mode_auto',
      'alert_channels',
      'watch_config',
      'email_connected',
      'email_provider',
      'daily_digest_time',
    ];

    const keys = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const values = keys.map(k => {
      const v = req.body[k];
      return (typeof v === 'object') ? JSON.stringify(v) : v;
    });

    if (keys.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const result = await pool.query(
      `INSERT INTO assistant_preferences (station_id, member_id, ${keys.join(', ')})
       VALUES ($${keys.length + 1}, $${keys.length + 2}, ${keys.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (station_id, member_id) DO UPDATE SET
       ${sets}, updated_at = NOW()
       RETURNING *`,
      [...values, stationId, memberId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[assistant/preferences] POST error:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ── GET /api/assistant/alerts — List active alerts for a member ──────────────
router.get('/alerts', async (req, res) => {
  try {
    const memberId = parseInt(req.query.member_id || req.user?.id || 1, 10);
    const limit = parseInt(req.query.limit || 20, 10);

    const result = await pool.query(
      `SELECT *
       FROM assistant_alerts
       WHERE member_id = $1
         AND department_id = $3
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY display_priority ASC, created_at DESC
       LIMIT $2`,
      [memberId, limit, req.user.department_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[assistant/alerts] error:', err);
    res.status(500).json({ error: 'Failed to list alerts' });
  }
});

// ── POST /api/assistant/alerts/:id/view — Mark alert as viewed ───────────────
router.post('/alerts/:id/view', async (req, res) => {
  try {
    const alertId = parseInt(req.params.id, 10);

    const result = await pool.query(
      `UPDATE assistant_alerts
       SET viewed_at = NOW()
       WHERE id = $1 AND department_id = $2
       RETURNING *`,
      [alertId, req.user.department_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[assistant/alerts/:id/view] error:', err);
    res.status(500).json({ error: 'Failed to mark alert as viewed' });
  }
});

// ── POST /api/assistant/alerts/:id/act — Mark alert as acted on ──────────────
router.post('/alerts/:id/act', async (req, res) => {
  try {
    const alertId = parseInt(req.params.id, 10);
    const actionTaken = req.body.action_taken || '';

    const result = await pool.query(
      `UPDATE assistant_alerts
       SET acted_on = true, action_taken = $1, viewed_at = NOW()
       WHERE id = $2 AND department_id = $3
       RETURNING *`,
      [actionTaken, alertId, req.user.department_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[assistant/alerts/:id/act] error:', err);
    res.status(500).json({ error: 'Failed to mark alert as acted on' });
  }
});

// ── DELETE /api/assistant/alerts/:id — Dismiss (delete) alert ────────────────
router.delete('/alerts/:id', async (req, res) => {
  try {
    const alertId = parseInt(req.params.id, 10);

    const result = await pool.query(
      `DELETE FROM assistant_alerts WHERE id = $1 AND department_id = $2 RETURNING *`,
      [alertId, req.user.department_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[assistant/alerts/:id] DELETE error:', err);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

// ── GET /api/assistant/alerts/count — Get unread alert count for badge ───────
router.get('/alerts/count', async (req, res) => {
  try {
    const memberId = parseInt(req.query.member_id || req.user?.id || 1, 10);

    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM assistant_alerts
       WHERE member_id = $1 AND department_id = $2 AND viewed_at IS NULL`,
      [memberId, req.user.department_id]
    );

    const count = parseInt(result.rows[0]?.count || 0, 10);
    res.json({ count });
  } catch (err) {
    console.error('[assistant/alerts/count] error:', err);
    res.status(500).json({ error: 'Failed to get alert count' });
  }
});

// ── POST /api/assistant/focus-mode — Set focus mode ──────────────────────────
router.post('/focus-mode', async (req, res) => {
  try {
    const memberId = parseInt(req.body.member_id || req.user?.id || 1, 10);
    const stationId = req.user.department_id;
    const mode = req.body.mode || 'off_duty';

    const result = await pool.query(
      `INSERT INTO assistant_preferences (station_id, member_id, focus_mode)
       VALUES ($1, $2, $3)
       ON CONFLICT (station_id, member_id) DO UPDATE SET focus_mode = $3
       RETURNING *`,
      [stationId, memberId, mode]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[assistant/focus-mode] error:', err);
    res.status(500).json({ error: 'Failed to set focus mode' });
  }
});

// ── POST /api/assistant/generate — Generate proactive alerts for a member ────
router.post('/generate', async (req, res) => {
  try {
    const memberId = parseInt(req.query.member_id || req.body.member_id || 1, 10);
    const stationId = req.user.department_id;

    const memberRes = await pool.query(
      `SELECT role FROM members WHERE id = $1 AND department_id = $2`,
      [memberId, stationId]
    );
    if (memberRes.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const memberRole = memberRes.rows[0]?.role || 'member';

    const alerts = [];

    // ── 1. Cert expirations ──────────────────────────────────────────────────
    const daysOut = 90;
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + daysOut);

    let certQuery = `
      SELECT id, member_id, cert_name, expiry_date
      FROM member_qualifications
      WHERE department_id = $1 AND expiry_date IS NOT NULL
        AND expiry_date <= $2 AND expiry_date > to_char(NOW(), 'YYYY-MM-DD')
    `;
    let certParams = [stationId, fmtDate(thirtyDaysFromNow)];

    // Chiefs see all certs; firefighters see only their own
    if (memberRole !== 'chief') {
      certQuery += ` AND member_id = $3`;
      certParams.push(memberId);
    }

    const certsRes = await pool.query(certQuery, certParams);
    for (const cert of certsRes.rows) {
      const days = Math.ceil((new Date(cert.expiry_date) - new Date()) / 86400000);
      const severity = days <= 30 ? 'critical' : 'warning';

      const dupCheck = await pool.query(
        `SELECT id FROM assistant_alerts
         WHERE department_id = $1 AND member_id = $2
           AND category = 'certification' AND target_record_id = $3
           AND viewed_at IS NULL`,
        [stationId, cert.member_id, cert.id]
      );
      if (dupCheck.rows.length === 0) {
        alerts.push({
          station_id: stationId,
          member_id: cert.member_id,
          category: 'certification',
          severity,
          title: `Certification expiring: ${cert.cert_name}`,
          description: `Expires in ${days} days (${cert.expiry_date})`,
          target_module: 'training',
          target_record_id: cert.id,
          display_priority: severity === 'critical' ? 10 : 30,
        });
      }
    }

    // ── 2. Mutual aid agreement renewals ──────────────────────────────────────
    if (memberRole === 'chief' || memberRole === 'captain') {
      const agreementsRes = await pool.query(
        `SELECT id, partner_agency AS agreement_name, expiration_date
         FROM mutual_aid_agreements
         WHERE department_id = $1
           AND expiration_date IS NOT NULL
           AND expiration_date <= $2 AND expiration_date > NOW()`,
        [stationId, fmtDate(thirtyDaysFromNow)]
      );
      for (const agreement of agreementsRes.rows) {
        const days = Math.ceil((new Date(agreement.expiration_date) - new Date()) / 86400000);

        const dupCheck = await pool.query(
          `SELECT id FROM assistant_alerts
           WHERE department_id = $1 AND member_id = $2
             AND category = 'agreement' AND target_record_id = $3
             AND viewed_at IS NULL`,
          [stationId, memberId, agreement.id]
        );
        if (dupCheck.rows.length === 0) {
          alerts.push({
            station_id: stationId,
            member_id: memberId,
            category: 'agreement',
            severity: 'warning',
            title: `Mutual aid agreement expiring: ${agreement.agreement_name}`,
            description: `Expires in ${days} days`,
            target_module: 'mutual-aid-agreements',
            target_record_id: agreement.id,
            display_priority: 40,
          });
        }
      }
    }

    // ── 3. Maintenance overdue ───────────────────────────────────────────────
    if (memberRole === 'chief' || memberRole === 'captain') {
      // 2.2 (0083): read the work-order model (the old maintenance query selected
      // nonexistent snake_case columns and silently 42703'd for its whole life).
      const maintenanceRes = await pool.query(
        `SELECT id, apparatus_id, title AS description, created_at AS next_service_date
         FROM work_orders
         WHERE department_id = $1 AND deleted_at IS NULL
           AND status IN ('open','in_progress','awaiting_parts')
           AND priority IN ('urgent','emergency')`,
        [stationId]
      );
      for (const maint of maintenanceRes.rows) {
        const dupCheck = await pool.query(
          `SELECT id FROM assistant_alerts
           WHERE department_id = $1 AND member_id = $2
             AND category = 'maintenance' AND target_record_id = $3
             AND viewed_at IS NULL`,
          [stationId, memberId, maint.id]
        );
        if (dupCheck.rows.length === 0) {
          alerts.push({
            station_id: stationId,
            member_id: memberId,
            category: 'maintenance',
            severity: 'critical',
            title: `Maintenance overdue: ${maint.description}`,
            description: `Apparatus ${maint.apparatus_id} needs service`,
            target_module: 'maintenance',
            target_record_id: maint.id,
            display_priority: 5,
          });
        }
      }
    }

    // ── 4. Equipment overdue ─────────────────────────────────────────────────
    const equipmentRes = await pool.query(
      `SELECT id, checked_out_by AS member_id, item_name AS equipment_name, expected_return
       FROM equipment_checkout
       WHERE department_id = $1 AND status = 'Checked Out' AND expected_return < NOW()`,
      [stationId]
    );
    for (const eq of equipmentRes.rows) {
      const dupCheck = await pool.query(
        `SELECT id FROM assistant_alerts
         WHERE department_id = $1 AND member_id = $2
           AND category = 'equipment' AND target_record_id = $3
           AND viewed_at IS NULL`,
        [stationId, eq.member_id, eq.id]
      );
      if (dupCheck.rows.length === 0) {
        alerts.push({
          station_id: stationId,
          member_id: eq.member_id,
          category: 'equipment',
          severity: 'warning',
          title: `Equipment overdue: ${eq.equipment_name}`,
          description: `Was due back ${eq.expected_return}`,
          target_module: 'equipment-checkout',
          target_record_id: eq.id,
          display_priority: 35,
        });
      }
    }

    // ── 5. Open grievances ───────────────────────────────────────────────────
    if (memberRole === 'chief' || memberRole === 'captain') {
      const grievancesRes = await pool.query(
        `SELECT id, filed_by AS filer_id, subject
         FROM grievances
         WHERE department_id = $1 AND status = 'open' AND deleted_at IS NULL`,
        [stationId]
      );
      for (const gr of grievancesRes.rows) {
        const dupCheck = await pool.query(
          `SELECT id FROM assistant_alerts
           WHERE department_id = $1 AND member_id = $2
             AND category = 'grievance' AND target_record_id = $3
             AND viewed_at IS NULL`,
          [stationId, memberId, gr.id]
        );
        if (dupCheck.rows.length === 0) {
          alerts.push({
            station_id: stationId,
            member_id: memberId,
            category: 'grievance',
            severity: 'warning',
            title: `Open grievance: ${gr.subject}`,
            description: `Filed by member ${gr.filer_id}`,
            target_module: 'grievances',
            target_record_id: gr.id,
            display_priority: 45,
          });
        }
      }
    }

    // ── 6. Meeting drafts ────────────────────────────────────────────────────
    if (memberRole === 'chief' || memberRole === 'captain') {
      const meetingsRes = await pool.query(
        `SELECT id, meeting_date, title AS subject
         FROM meeting_minutes
         WHERE department_id = $1 AND status = 'draft'`,
        [stationId]
      );
      for (const mtg of meetingsRes.rows) {
        const dupCheck = await pool.query(
          `SELECT id FROM assistant_alerts
           WHERE department_id = $1 AND member_id = $2
             AND category = 'meeting' AND target_record_id = $3
             AND viewed_at IS NULL`,
          [stationId, memberId, mtg.id]
        );
        if (dupCheck.rows.length === 0) {
          alerts.push({
            station_id: stationId,
            member_id: memberId,
            category: 'meeting',
            severity: 'info',
            title: `Meeting minutes draft: ${mtg.subject}`,
            description: `From ${mtg.meeting_date}`,
            target_module: 'meeting-minutes',
            target_record_id: mtg.id,
            display_priority: 60,
          });
        }
      }
    }

    // ── 7. Shift today ───────────────────────────────────────────────────────
    const today = fmtDate(new Date());
    const shiftsRes = await pool.query(
      `SELECT id, shift_type, start_time
       FROM shifts
       WHERE department_id = $1 AND member_id = $2 AND date = $3`,
      [stationId, memberId, today]
    );
    for (const shift of shiftsRes.rows) {
      const dupCheck = await pool.query(
        `SELECT id FROM assistant_alerts
         WHERE department_id = $1 AND member_id = $2
           AND category = 'schedule' AND target_record_id = $3
           AND viewed_at IS NULL`,
        [stationId, memberId, shift.id]
      );
      if (dupCheck.rows.length === 0) {
        alerts.push({
          station_id: stationId,
          member_id: memberId,
          category: 'schedule',
          severity: 'info',
          title: `You have a shift today: ${shift.shift_type}`,
          description: `Starts at ${shift.start_time}`,
          target_module: 'shifts',
          target_record_id: shift.id,
          display_priority: 80,
        });
      }
    }

    // ── 8. Budget overspend ──────────────────────────────────────────────────
    if (memberRole === 'chief') {
      const budgetRes = await pool.query(
        `SELECT id, line_item, budgeted, spent
         FROM budget_lines
         WHERE department_id = $1 AND CAST(spent AS NUMERIC) > CAST(budgeted AS NUMERIC)`,
        [stationId]
      );
      for (const bud of budgetRes.rows) {
        const spent = parseFloat(bud.spent || 0);
        const budgeted = parseFloat(bud.budgeted || 0);
        const pct = Math.round((spent / budgeted) * 100);

        const dupCheck = await pool.query(
          `SELECT id FROM assistant_alerts
           WHERE department_id = $1 AND member_id = $2
             AND category = 'budget' AND target_record_id = $3
             AND viewed_at IS NULL`,
          [stationId, memberId, bud.id]
        );
        if (dupCheck.rows.length === 0) {
          alerts.push({
            station_id: stationId,
            member_id: memberId,
            category: 'budget',
            severity: 'warning',
            title: `Budget line overspend: ${bud.line_item}`,
            description: `Spent ${pct}% of budget ($${spent.toFixed(2)} of $${budgeted.toFixed(2)})`,
            target_module: 'budget-lines',
            target_record_id: bud.id,
            display_priority: 50,
          });
        }
      }
    }

    // Insert all alerts
    let inserted = 0;
    for (const alert of alerts) {
      await pool.query(
        `INSERT INTO assistant_alerts
         (station_id, member_id, category, severity, title, description,
          source_type, target_module, target_record_id, display_priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          alert.station_id,
          alert.member_id,
          alert.category,
          alert.severity,
          alert.title,
          alert.description,
          alert.source_type || 'internal_rule',
          alert.target_module,
          alert.target_record_id,
          alert.display_priority,
        ]
      );
      inserted++;
    }

    res.json({ ok: true, alerts_created: inserted });
  } catch (err) {
    console.error('[assistant/generate] error:', err);
    res.status(500).json({ error: 'Failed to generate alerts' });
  }
});

// ── POST /api/assistant/feedback/:alertId — Submit feedback on alert ────────
router.post('/feedback/:alertId', async (req, res) => {
  try {
    const alertId = parseInt(req.params.alertId, 10);
    const memberId = parseInt(req.body.member_id || req.user?.id || 1, 10);
    const stationId = req.user.department_id;
    const feedback = req.body.feedback || 'neutral';
    const reason = req.body.reason || '';

    await pool.query(
      `INSERT INTO assistant_feedback (station_id, member_id, alert_id, feedback, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [stationId, memberId, alertId, feedback, reason]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[assistant/feedback] error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ═ AI CHAT ASSISTANT (existing functionality)
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/assistant/key — is a key configured? ───────────────────────────
router.get('/key', async (req, res) => {
  try {
    const key = await stations.getApiKey(req.user.department_id, 'anthropicApiKey');
    res.json({ configured: !!(key && key.trim()) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check API key' });
  }
});

// ── POST /api/assistant/key — save API key ───────────────────────────────────
router.post('/key', async (req, res) => {
  try {
    const key = (req.body.key || '').trim();
    await stations.setApiKey(req.user.department_id, 'anthropicApiKey', key);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

// ── POST /api/assistant — chat completion ────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const apiKey = await stations.getApiKey(req.user.department_id, 'anthropicApiKey');
    if (!apiKey || !apiKey.trim()) {
      return res.status(402).json({ error: 'NO_API_KEY', message: 'No Anthropic API key configured. Add one in Station Settings → AI Assistant.' });
    }

    // M1: per-department daily token budget — block before hitting the provider.
    const deptId = req.user.department_id;
    const aiBudget = require('../utils/aiBudget');
    try {
      await aiBudget.assertWithinBudget(deptId);
    } catch (e) {
      if (e && e.code === 'BUDGET_EXCEEDED') return res.status(429).json({ error: e.message, code: 'BUDGET_EXCEEDED' });
      throw e;
    }

    const { messages, context } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Build context prefix for the latest user message
    const contextNote = context
      ? `\n\n[User context: page="${context.page || 'unknown'}", role="${context.role || 'member'}"]`
      : '';

    // Inject context into the last user message
    const augmentedMessages = messages.map((m, i) => {
      if (i === messages.length - 1 && m.role === 'user') {
        return { ...m, content: m.content + contextNote };
      }
      return m;
    });

    // Call Anthropic Messages API via raw HTTPS (no SDK dependency required)
    const body = JSON.stringify({
      model:      require('../config/aiModel').AI_MODEL,
      max_tokens: 1024,
      system:     require('../utils/promptGuard').guardedSystemPrompt(SYSTEM_PROMPT),
      messages:   augmentedMessages,
    });

    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'Content-Length':    Buffer.byteLength(body),
        'x-api-key':         apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
    };

    const anthropicReq = https.request(options, (anthropicRes) => {
      let data = '';
      anthropicRes.on('data', (chunk) => { data += chunk; });
      anthropicRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const { sanitizeAIError } = require('../config/aiModel');
            return res.status(400).json({ error: sanitizeAIError(parsed.error.message) || 'Anthropic API error' });
          }
          const text = parsed.content && parsed.content[0] && parsed.content[0].text
            ? parsed.content[0].text
            : 'Sorry, I could not generate a response.';
          // M1: record real token usage against the department budget.
          if (parsed.usage) {
            aiBudget.recordUsage(deptId, {
              action: 'assistant_chat', model: parsed.model || require('../config/aiModel').AI_MODEL,
              inputTokens: parsed.usage.input_tokens, outputTokens: parsed.usage.output_tokens,
            });
          }
          res.json({ reply: text, model: parsed.model, usage: parsed.usage });
        } catch (parseErr) {
          console.error('Failed to parse Anthropic response', parseErr);
          res.status(500).json({ error: 'Failed to parse AI response' });
        }
      });
    });

    anthropicReq.on('error', (err) => {
      console.error('Anthropic request error:', err);
      res.status(500).json({ error: 'Failed to reach AI service' });
    });

    anthropicReq.write(body);
    anthropicReq.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Assistant error' });
  }
});

module.exports = router;
