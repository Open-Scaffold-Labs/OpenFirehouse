'use strict';
/**
 * routes/members.js — CRUD REST API for members
 *
 * Mounted at /api/members in index.js
 *
 * GET    /api/members          — list all members
 * GET    /api/members/:id      — get one member
 * POST   /api/members          — create a member
 * PATCH  /api/members/:id      — update member fields
 * DELETE /api/members/:id      — delete a member
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const router  = express.Router();
const db      = require('../db');
const { requireOfficer, requireChief } = require('../middleware/requireRole');
const { audit } = require('../utils/auditLog');
const { generateInviteToken, hashInviteToken } = require('../utils/inviteToken');

// ── P4.4 member-onboarding helpers ───────────────────────────────────────────

// Canonical OF rank ladder → permission-bearing users.role (see requireRole
// ROLE_LEVELS). Unknown rank ⇒ lowest. Permissions ride ONLY on users.role;
// members.rank is the display label (never a permission gate).
const RANK_TO_ROLE = {
  'chief': 'chief', 'deputy chief': 'deputy_chief', 'battalion chief': 'battalion_chief',
  'captain': 'officer', 'lieutenant': 'lieutenant',
  'firefighter': 'member', 'ff': 'member',
  'probationary firefighter': 'member', 'probationary ff': 'member', 'probie': 'member',
};
function roleForRank(rank) {
  return RANK_TO_ROLE[String(rank || '').trim().toLowerCase()] || 'member';
}

async function uniqueUsername(name) {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'member';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    if (!(await db.users.findByUsername(candidate))) return candidate;
  }
  return `${base}${Date.now().toString().slice(-5)}`;
}

async function mirrorStationId(departmentId) {
  const r = await db.pool.query('SELECT id FROM stations WHERE department_id = $1 ORDER BY id ASC LIMIT 1', [departmentId]);
  return r.rows[0]?.id || null;
}

// of_link_member authorizes on the MAPPING role (of_user_departments), not
// users.role. Confirm the caller is a chief/admin of THIS department before any
// onboarding write — this both enforces authz and prevents a mid-statement RAISE
// from of_link_member aborting the per-request transaction.
async function callerIsDeptChief(callerUserId, departmentId) {
  const r = await db.pool.query(
    "SELECT 1 FROM of_user_departments WHERE user_id = $1 AND department_id = $2 AND role IN ('chief','admin')",
    [callerUserId, departmentId]
  );
  return r.rows.length > 0;
}

// ── Validation ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['name', 'rank', 'role', 'memberNumber', 'joined'];

function validateMember(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    for (const field of REQUIRED_FIELDS) {
      if (!body[field] || String(body[field]).trim() === '') {
        errors.push(`${field} is required`);
      }
    }
  }
  if (body.station_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.station_email)) {
    errors.push('station_email is invalid');
  }
  if (body.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.personal_email)) {
    errors.push('personal_email is invalid');
  }
  if (body.certifications !== undefined && !Array.isArray(body.certifications)) {
    errors.push('certifications must be an array');
  }
  return errors;
}

// ── GET /api/members ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const members = await db.members.all(req.user.department_id);
    res.json({ data: members, count: members.length });
  } catch (err) {
    console.error('GET /members error:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// ── GET /api/members/me — the caller's own member record (any authed user) ───
// Drives the Personal Setup Wizard's "awaiting chief verification" state. Literal
// route — declared before GET /:id so "me" isn't captured as the :id param.
router.get('/me', async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      `SELECT id, "memberNumber", name, rank, role, status, rank_verified, user_id
         FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1`,
      [req.user.id, req.user.department_id]
    );
    res.json({ data: rows[0] || null });
  } catch (err) {
    console.error('GET /members/me error:', err);
    res.status(500).json({ error: 'Failed to fetch your member record' });
  }
});

// ── GET /api/members/pending — verification queue (chief) ────────────────────
// Members with a linked login that the chief hasn't yet rank-verified. MUST be
// declared before GET /:id or "pending" would match the :id param.
router.get('/pending', requireChief, async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      `SELECT id, "memberNumber", name, rank, status, user_id, rank_verified
         FROM members
        WHERE department_id = $1 AND user_id IS NOT NULL AND rank_verified = false
        ORDER BY name ASC`,
      [req.user.department_id]
    );
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    console.error('GET /members/pending error:', err);
    res.status(500).json({ error: 'Failed to fetch pending members' });
  }
});

// ── GET /api/members/unlinked ─────────────────────────────────────────────────
// P5.1: legacy/migrated roster rows with NO login (user_id IS NULL), each with
// ranked CANDIDATE logins by STABLE-key proximity (external_id, then email) —
// NEVER auto-applied. Name similarity is surfaced only as weak, clearly-labeled
// evidence so the chief confirms a *reason*, not a guess (Principle #3/#4). The
// chief then POSTs /:id/link to bind, or creates an invite if no login exists.
// Registered BEFORE GET /:id so "unlinked" isn't captured as an :id param.
// ── GET /api/members/fleet-maintenance-grants — current grant state (chief) ──
// MOUNTED BEFORE '/:id'. The Technicians panel must show WHO IS GRANTED, not
// neutral buttons — never imply a status the app isn't reading (design-critique
// 2026-07-26, 🔴).
router.get('/fleet-maintenance-grants', requireChief, async (req, res) => {
  try {
    const r = await db.pool.query(
      `SELECT m.id AS member_id, m.name, m.rank, u.id AS user_id,
              COALESCE(u.fleet_maintenance, FALSE) AS granted
         FROM members m JOIN users u ON u.id = m.user_id
        WHERE m.department_id = $1 AND m.status = 'Active'
        ORDER BY m.name`,
      [req.user.department_id]);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('GET /members/fleet-maintenance-grants error:', err);
    res.status(500).json({ error: 'Failed to load grants' });
  }
});

router.get('/unlinked', requireChief, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const norm = (s) => String(s || '').trim().toLowerCase();
    const emailsOf = (m) => [m.email, m.station_email, m.personal_email]
      .map(norm).filter((e) => e && e.includes('@'));

    const mRes = await db.pool.query(
      `SELECT id, "memberNumber", name, rank, status, email, station_email, personal_email,
              external_id, personnel_id
         FROM members
        WHERE department_id = $1 AND user_id IS NULL
        ORDER BY name ASC`, [deptId]);

    // Dept logins NOT already bound to a member in this dept — the candidate pool.
    const uRes = await db.pool.query(
      `SELECT u.id, u.username, u.name, u.email, u.external_id
         FROM users u
         JOIN of_user_departments oud ON oud.user_id = u.id
        WHERE oud.department_id = $1
          AND NOT EXISTS (SELECT 1 FROM members mm WHERE mm.user_id = u.id AND mm.department_id = $1)`,
      [deptId]);
    const candidateUsers = uRes.rows;

    const data = mRes.rows.map((m) => {
      const memEmails = emailsOf(m);
      const memName = norm(m.name);
      const candidates = candidateUsers.map((u) => {
        const matchedOn = [];
        if (m.external_id && u.external_id && m.external_id === u.external_id) matchedOn.push('external_id');
        if (norm(u.email) && memEmails.includes(norm(u.email))) matchedOn.push('email');
        if (memName && norm(u.name) === memName) matchedOn.push('name');
        const score = (matchedOn.includes('external_id') ? 100 : 0)
                    + (matchedOn.includes('email') ? 10 : 0)
                    + (matchedOn.includes('name') ? 1 : 0);
        return { userId: u.id, username: u.username, name: u.name, email: u.email || null, matchedOn, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
      return {
        id: m.id, memberNumber: m.memberNumber, name: m.name, rank: m.rank, status: m.status,
        personnelId: m.personnel_id || null,
        candidates,
        // A stable match = email or external_id evidence (name alone is NOT one).
        hasStableMatch: candidates.some((c) => c.matchedOn.includes('email') || c.matchedOn.includes('external_id')),
      };
    });

    res.json({ data, count: data.length });
  } catch (err) {
    console.error('GET /members/unlinked error:', err);
    res.status(500).json({ error: 'Failed to fetch unlinked members' });
  }
});

// ── GET /api/members/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const member = await db.members.findById(Number(req.params.id), req.user.department_id);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json({ data: member });
  } catch (err) {
    console.error('GET /members/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

// Next sequential member number (M-###) — used when the form doesn't supply one
// so "Add Member" works without anyone hand-assigning a number.
async function nextMemberNumber(departmentId) {
  // Landmine fix (gameplan §6): scope the MAX() to the department — member
  // numbers are unique PER department (idx_members_dept_number), not globally.
  const { rows } = await db.pool.query(
    `SELECT "memberNumber" AS n FROM members WHERE department_id = $1 AND "memberNumber" ~ '^M-[0-9]+$'`,
    [departmentId]
  );
  let max = 0;
  for (const row of rows) {
    const m = /^M-(\d+)$/.exec(row.n);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `M-${String(max + 1).padStart(3, '0')}`;
}

// ── POST /api/members ────────────────────────────────────────────────────────
router.post('/', requireOfficer, async (req, res) => {
  try {
    if (!req.body.memberNumber || !String(req.body.memberNumber).trim()) {
      req.body.memberNumber = await nextMemberNumber(req.user.department_id);
    }
    const errors = validateMember(req.body, true);
    if (errors.length) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    // Check for duplicate memberNumber
    const existing = await db.members.findByMemberNumber(req.body.memberNumber, req.user.department_id);
    if (existing) {
      return res.status(409).json({ error: `Member number ${req.body.memberNumber} already exists` });
    }

    // Tenancy (migration 0027): standing unit assignment must be a rig in this dept.
    if (req.body.assigned_unit_id != null && req.body.assigned_unit_id !== '') {
      const appt = await db.apparatus.findById(Number(req.body.assigned_unit_id), req.user.department_id);
      if (!appt) return res.status(400).json({ error: 'assigned_unit_id must be an apparatus in your department' });
    }

    const member = await db.members.create({
      memberNumber:             req.body.memberNumber,
      name:                     req.body.name,
      rank:                     req.body.rank,
      role:                     req.body.role,
      status:                   req.body.status                   || 'Active',
      joined:                   req.body.joined,
      dob:                      req.body.dob                      || '',
      phone:                    req.body.phone                    || '',

      email:                    req.body.email                    || '',
      station_email:            req.body.station_email            || '',
      station_email:            req.body.station_email            || '',
      personal_email:           req.body.personal_email           || '',

      address:                  req.body.address                  || '',
      emergencyContactName:     req.body.emergencyContactName     || '',
      emergencyContactPhone:    req.body.emergencyContactPhone    || '',
      emergencyContactRelation: req.body.emergencyContactRelation || '',
      certifications:           req.body.certifications           || [],
      employment_type:          req.body.employment_type          || 'volunteer',
      assigned_unit_id:         req.body.assigned_unit_id ?? null,
      assigned_group:           req.body.assigned_group ?? null,
    }, req.user.department_id);

    res.status(201).json({ data: member });
  } catch (err) {
    console.error('POST /members error:', err);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

// ── PATCH /api/members/:id/availability — toggle available flag
router.patch('/:id/availability', async (req, res) => {
  try {
    const { available } = req.body;
    const { rows } = await db.pool.query(
      'UPDATE members SET available=$1, "updatedAt"=NOW() WHERE id=$2 AND department_id=$3 RETURNING *',
      [available, req.params.id, req.user.department_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Member not found' });
    res.json({ data: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/members/:id ───────────────────────────────────────────────────
router.patch('/:id', requireOfficer, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.members.findById(id, req.user.department_id);
    if (!existing) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const errors = validateMember(req.body, false);
    if (errors.length) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    // If memberNumber is being changed, check it doesn't collide
    if (req.body.memberNumber && req.body.memberNumber !== existing.memberNumber) {
      const collision = await db.members.findByMemberNumber(req.body.memberNumber, req.user.department_id);
      if (collision) {
        return res.status(409).json({ error: `Member number ${req.body.memberNumber} already in use` });
      }
    }

    // Tenancy (migration 0027): a standing unit assignment must reference an
    // apparatus in THIS department. The apparatus FK is global, so the tenant
    // boundary is enforced here — a chief can't tag a member to another dept's rig.
    if (req.body.assigned_unit_id != null && req.body.assigned_unit_id !== '') {
      const appt = await db.apparatus.findById(Number(req.body.assigned_unit_id), req.user.department_id);
      if (!appt) return res.status(400).json({ error: 'assigned_unit_id must be an apparatus in your department' });
    }

    const updated = await db.members.update(id, req.body, req.user.department_id);
    res.json({ data: updated });
  } catch (err) {
    console.error('PATCH /members/:id error:', err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// ── PATCH /api/members/:id/home-station — set a member's HOME station (chief).
// 2.2 (0073): home is the baseline; a rider whose seat station differs from home is
// shown as a DETAIL on the roster. Tenant-safe: the station must be in the caller's dept.
// A null/empty body clears home (unknown home → never treated as a detail).
router.patch('/:id/home-station', requireChief, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const deptId = req.user.department_id;
    const member = await db.members.findById(id, deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const raw = req.body.home_station_id;
    let homeStationId = null;
    if (raw != null && raw !== '') {
      const st = await db.pool.query(
        'SELECT id FROM stations WHERE id = $1 AND department_id = $2', [Number(raw), deptId]);
      if (!st.rows.length) {
        return res.status(400).json({ error: 'home_station_id must be a station in your department', code: 'BAD_STATION' });
      }
      homeStationId = st.rows[0].id;
    }
    await db.pool.query(
      'UPDATE members SET home_station_id = $1 WHERE id = $2 AND department_id = $3',
      [homeStationId, id, deptId]);
    res.json({ data: { id, home_station_id: homeStationId } });
  } catch (err) {
    console.error('PATCH /members/:id/home-station error:', err);
    res.status(500).json({ error: 'Failed to set home station' });
  }
});

// ── POST /api/members/:id/invite — issue a single-use set-password invite (chief)
// Creates the member's login (pinned to the lowest role until verified) if one
// doesn't exist, maps it to the department via the audited of_link_member DEFINER
// fn, and returns a one-time secret the chief hands to the member (no email infra).
router.post('/:id/invite', requireChief, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const id = Number(req.params.id);
    const member = await db.members.findById(id, deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (!(await callerIsDeptChief(req.user.id, deptId))) {
      return res.status(403).json({ error: 'Only a department chief can add members.', code: 'NOT_DEPT_CHIEF' });
    }

    let userId = member.user_id;
    if (!userId) {
      const stationId = member.station_id || await mirrorStationId(deptId);
      if (!stationId) return res.status(400).json({ error: 'Department has no station yet — complete department setup first.', code: 'NO_STATION' });
      const username = await uniqueUsername(member.name);
      const initials = String(member.name || '').split(/\s+/).map(s => s[0] || '').join('').toUpperCase().slice(0, 4) || 'FF';
      const placeholderHash = bcrypt.hashSync(generateInviteToken(), 10); // unusable until accept-invite sets a real password
      const ins = await db.pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", email, station_id)
         VALUES ($1, $2, $3, 'member', $4, $5, $6) RETURNING id`,
        [username, member.name, initials, placeholderHash, member.email || '', stationId]
      );
      userId = ins.rows[0].id;
      await db.pool.query('UPDATE members SET user_id = $1, "updatedAt" = NOW() WHERE id = $2 AND department_id = $3', [userId, id, deptId]);
      await db.pool.query('SELECT public.of_link_member($1, $2, $3, $4)', [req.user.id, userId, deptId, 'member']);
    }

    const secret = generateInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const inv = await db.pool.query(
      `INSERT INTO of_member_invites (member_id, user_id, department_id, token_hash, expires_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, expires_at`,
      [id, userId, deptId, hashInviteToken(secret), expiresAt, req.user.id]
    );
    await audit(deptId, req.user, 'create', 'of_member_invites', inv.rows[0].id, { member_id: id, user_id: userId });
    res.status(201).json({ data: { inviteId: inv.rows[0].id, token: secret, acceptPath: `/accept-invite?token=${secret}`, expires_at: inv.rows[0].expires_at } });
  } catch (err) {
    console.error('POST /members/:id/invite error:', err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// ── POST /api/members/:id/verify — chief verifies rank, granting access (chief)
// Sets the display rank + rank_verified AND the permission-bearing users.role.
// Until this runs, an invited member stays pinned to the lowest role.
router.post('/:id/verify', requireChief, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const id = Number(req.params.id);
    const member = await db.members.findById(id, deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (!member.user_id) return res.status(400).json({ error: 'Member has no linked login yet — send an invite first.', code: 'NO_LOGIN' });
    const rank = String(req.body.rank || member.rank || '').trim();
    if (!rank) return res.status(400).json({ error: 'rank is required' });
    const role = roleForRank(rank);

    await db.pool.query('UPDATE members SET rank = $1, rank_verified = true, "updatedAt" = NOW() WHERE id = $2 AND department_id = $3', [rank, id, deptId]);
    await db.pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, member.user_id]);
    await audit(deptId, req.user, 'approve', 'members', id, { rank, role, user_id: member.user_id });
    res.json({ data: { id, rank, rank_verified: true, role } });
  } catch (err) {
    console.error('POST /members/:id/verify error:', err);
    res.status(500).json({ error: 'Failed to verify member' });
  }
});

// ── POST /api/members/:id/fleet-maintenance — the mechanic capability grant ───
// 2.2 (0083, phase spec §5 ruling 1): mechanic is a per-user CAPABILITY, never a
// role rung — the market pattern (checks platforms gate by per-user flags; fleet
// platforms decouple technician identity from access). Chief grants/revokes; takes
// effect on the member's next request (auth reads the user row fresh).
router.post('/:id/fleet-maintenance', requireChief, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const id = Number(req.params.id);
    const granted = req.body?.granted === true;
    if (req.body?.granted === undefined || typeof req.body.granted !== 'boolean') {
      return res.status(400).json({ error: 'granted (boolean) is required' });
    }
    const member = await db.members.findById(id, deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (!member.user_id) {
      return res.status(422).json({ error: 'Member has no linked login yet — send an invite first.', code: 'NO_LOGIN' });
    }
    await db.pool.query('UPDATE users SET fleet_maintenance = $1 WHERE id = $2', [granted, member.user_id]);
    await audit(deptId, req.user, 'update', 'members', id,
      { action: 'fleet_maintenance_grant', granted, user_id: member.user_id });
    res.json({ data: { id, user_id: member.user_id, fleet_maintenance: granted } });
  } catch (err) {
    console.error('POST /members/:id/fleet-maintenance error:', err);
    res.status(500).json({ error: 'Failed to update the fleet-maintenance grant' });
  }
});

// ── Deactivation (NEVER a hard delete) ───────────────────────────────────────
// exposure_records / personnel_actions / timesheets etc. FK to members ON DELETE
// CASCADE — a hard DELETE would destroy subpoenable legal history (the V7 landmine).
// Removal is a status flip; the linked login is stripped to the lowest role
// (retains login, zero elevated reach). Legal child records are preserved.
async function deactivateMember(req, res) {
  try {
    const deptId = req.user.department_id;
    const id = Number(req.params.id);
    const member = await db.members.findById(id, deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await db.pool.query("UPDATE members SET status = 'Inactive', \"updatedAt\" = NOW() WHERE id = $1 AND department_id = $2", [id, deptId]);
    if (member.user_id) {
      await db.pool.query("UPDATE users SET role = 'member' WHERE id = $1", [member.user_id]);
    }
    await audit(deptId, req.user, 'soft_delete', 'members', id, { reason: req.body?.reason || '', user_id: member.user_id || null });
    res.json({ data: { id, status: 'Inactive', deactivated: true } });
  } catch (err) {
    console.error('deactivate member error:', err);
    res.status(500).json({ error: 'Failed to deactivate member' });
  }
}

// ── POST /api/members/:id/deactivate ──────────────────────────────────────────
router.post('/:id/deactivate', requireOfficer, deactivateMember);

// ── DELETE /api/members/:id — DEACTIVATES (never hard-deletes; see above) ─────
// A member is a legal subject (exposure history, personnel actions). The old hard
// DELETE cascade-deleted those records; it now routes to deactivation.
router.delete('/:id', requireOfficer, deactivateMember);

// ── POST /api/members/:id/link — bind an UNLINKED member to an existing login ──
// P5.1: the permanent answer for legacy/ambiguous rows. Chief-confirmed, never
// auto-applied. Sets members.user_id atomically (single statement — guards the
// race) and routes the mapping-role grant through of_link_member (DEFINER) so
// of_app never writes of_user_departments directly (escalation hole, FMEA R6).
// The (user_id, department_id) partial unique (0028) blocks a double-link (R12).
// Audited (P7.1). Identity binding ONLY — elevation stays with /verify.
router.post('/:id/link', requireChief, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const id = Number(req.params.id);
    const userId = Number(req.body.userId);
    if (!userId || Number.isNaN(userId)) {
      return res.status(400).json({ error: 'userId is required', code: 'NO_USER_ID' });
    }
    const member = await db.members.findById(id, deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.user_id) {
      return res.status(409).json({ error: 'Member is already linked to a login.', code: 'ALREADY_LINKED' });
    }
    if (!(await callerIsDeptChief(req.user.id, deptId))) {
      return res.status(403).json({ error: 'Only a department chief can link members.', code: 'NOT_DEPT_CHIEF' });
    }
    // The target login MUST already belong to THIS department (it's a self-
    // registered pending member, a unit login, etc. — exactly what GET /unlinked
    // surfaces as a candidate). Scoping to of_user_departments here prevents a
    // chief from binding a member to an arbitrary login from another department.
    const target = await db.pool.query(
      `SELECT u.id, u.username, u.name
         FROM users u JOIN of_user_departments oud ON oud.user_id = u.id
        WHERE u.id = $1 AND oud.department_id = $2`,
      [userId, deptId]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'That login is not in your department.', code: 'USER_NOT_IN_DEPT' });
    }
    // Pre-check for a clean message (the partial unique is the race backstop).
    const taken = await db.pool.query(
      'SELECT 1 FROM members WHERE user_id = $1 AND department_id = $2', [userId, deptId]);
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: 'That login is already linked to another member.', code: 'LOGIN_TAKEN' });
    }

    let updated;
    try {
      updated = await db.pool.query(
        'UPDATE members SET user_id = $1, "updatedAt" = NOW() WHERE id = $2 AND department_id = $3 AND user_id IS NULL RETURNING id',
        [userId, id, deptId]);
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: 'That login is already linked to another member.', code: 'LOGIN_TAKEN' });
      }
      throw e;
    }
    if (updated.rows.length === 0) {
      return res.status(409).json({ error: 'Member was linked by someone else — refresh.', code: 'LINK_RACE' });
    }

    // Mapping role: preserve an already-verified member's role; otherwise lowest.
    // Identity binding never elevates an unverified member (doctrine).
    const mappingRole = member.rank_verified ? roleForRank(member.rank) : 'member';
    await db.pool.query('SELECT public.of_link_member($1, $2, $3, $4)', [req.user.id, userId, deptId, mappingRole]);
    await audit(deptId, req.user, 'update', 'members', id, {
      action: 'link_login', user_id: userId, username: target.rows[0].username, mapping_role: mappingRole,
    });
    res.json({ data: { id, user_id: userId, linked: true } });
  } catch (err) {
    console.error('POST /members/:id/link error:', err);
    res.status(500).json({ error: 'Failed to link member' });
  }
});

// ── GET /api/members/:id/history — read-only personnel record history (P7.2) ──
// The append-only audit chain for a member: who linked the login, who verified
// which rank, deactivations — with actor + timestamp. No edit/delete path exists
// on audit rows (audit_log is append-only by design). A differentiation surface.
router.get('/:id/history', requireChief, async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const id = Number(req.params.id);
    const member = await db.members.findById(id, deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const { rows } = await db.pool.query(
      `SELECT id, action, table_name, record_id, user_name, detail, at
         FROM audit_log
        WHERE department_id = $1 AND table_name = 'members' AND record_id = $2
        ORDER BY id DESC LIMIT 200`,
      [deptId, id]);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    console.error('GET /members/:id/history error:', err);
    res.status(500).json({ error: 'Failed to fetch member history' });
  }
});

module.exports = router;
