'use strict';
/**
 * seed-assistant.js — Personal Assistant preferences and alerts
 *
 * Seeds:
 * - Default preferences for all 12 members (based on their role)
 * - 18 realistic alerts across different members
 */

const { pool } = require('./db');

module.exports = async function seedAssistant() {
  // Check if already seeded
  const check = await pool.query('SELECT COUNT(*) FROM assistant_preferences WHERE station_id = 1');
  if (parseInt(check.rows[0].count) > 0) {
    console.log('Assistant seed: already seeded, skipping.');
    return;
  }

  // Fetch all members to map names to IDs
  const { rows: memberRows } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (memberRows.length === 0) {
    console.log('Assistant seed: no members found, skipping.');
    return;
  }

  const m = (name) => memberRows.find(r => r.name === name);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Member metadata: role-based defaults
  const members = [
    { id: m('Sarah Chen').id, name: 'Sarah Chen', role: 'chief' },
    { id: m('Maria Delgado').id, name: 'Maria Delgado', role: 'captain' },
    { id: m('Nathan McGee').id, name: 'Nathan McGee', role: 'captain' },
    { id: m('Sandra Kim').id, name: 'Sandra Kim', role: 'firefighter' },
    { id: m('James Ortega').id, name: 'James Ortega', role: 'firefighter' },
    { id: m('Tracy Benson').id, name: 'Tracy Benson', role: 'firefighter' },
    { id: m('Mike Harrington').id, name: 'Mike Harrington', role: 'firefighter' },
    { id: m('Lisa Fontaine').id, name: 'Lisa Fontaine', role: 'firefighter' },
    { id: m('Carlos Ruiz').id, name: 'Carlos Ruiz', role: 'firefighter' },
    { id: m('Amy Winters').id, name: 'Amy Winters', role: 'firefighter' },
    { id: m('Kevin Marsh').id, name: 'Kevin Marsh', role: 'firefighter' },
    { id: m('Diane Tolliver').id, name: 'Diane Tolliver', role: 'firefighter' },
  ];

  // ── Seed Preferences ─────────────────────────────────────────────────────
  let prefsInserted = 0;
  for (const member of members) {
    let focusMode = 'off_duty';
    let watchConfig = {};

    if (member.role === 'chief') {
      focusMode = 'officer_mode';
      watchConfig = {
        certifications: true,
        maintenance: true,
        grievances: true,
        meetings: true,
        agreements: true,
        budget: true,
      };
    } else if (member.role === 'captain') {
      focusMode = 'officer_mode';
      watchConfig = {
        certifications: true,
        shifts: true,
        meetings: true,
        grievances: true,
      };
    } else {
      // firefighter
      watchConfig = {
        own_schedule: true,
        own_certifications: true,
        equipment: true,
      };
    }

    await pool.query(
      `INSERT INTO assistant_preferences
       (station_id, member_id, focus_mode, focus_mode_auto, alert_channels, watch_config, daily_digest_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (station_id, member_id) DO NOTHING`,
      [
        1, // station_id
        member.id,
        focusMode,
        true, // focus_mode_auto
        JSON.stringify({ in_app: true, email_daily: member.role === 'chief', push: false }),
        JSON.stringify(watchConfig),
        '06:00', // daily_digest_time
      ]
    );
    prefsInserted++;
  }

  // ── Seed Alerts ──────────────────────────────────────────────────────────
  // Helper: date offset
  const dateAdd = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const alerts = [
    // ── Chief Chen (ID 1) ─────────────────────────────────────────────────
    {
      member_id: m('Sarah Chen').id,
      category: 'certification',
      severity: 'critical',
      title: 'Certification expiring: Fire Officer II',
      description: 'Expires in 8 months (2026-11-10)',
      target_module: 'training',
      target_record_id: 1,
      display_priority: 10,
    },
    {
      member_id: m('Sarah Chen').id,
      category: 'agreement',
      severity: 'warning',
      title: 'Mutual aid agreement expiring: Riverside FD Mutual Response',
      description: 'Expires in 45 days',
      target_module: 'mutual-aid-agreements',
      target_record_id: 1,
      display_priority: 40,
    },
    {
      member_id: m('Sarah Chen').id,
      category: 'budget',
      severity: 'warning',
      title: 'Budget line overspend: Station Supplies',
      description: 'Spent 115% of budget ($5,750.00 of $5,000.00)',
      target_module: 'budget-lines',
      target_record_id: 1,
      display_priority: 50,
    },

    // ── Captain Delgado (ID 2) ───────────────────────────────────────────
    {
      member_id: m('Maria Delgado').id,
      category: 'certification',
      severity: 'warning',
      title: 'Certification expiring: Fire Officer I',
      description: 'Expires in 51 days (2026-05-10)',
      target_module: 'training',
      target_record_id: 2,
      display_priority: 30,
    },
    {
      member_id: m('Maria Delgado').id,
      category: 'meeting',
      severity: 'info',
      title: 'Meeting minutes draft: March Training Session',
      description: 'From 2026-03-10',
      target_module: 'meeting-minutes',
      target_record_id: 1,
      display_priority: 60,
    },
    {
      member_id: m('Maria Delgado').id,
      category: 'schedule',
      severity: 'info',
      title: 'You have a shift today: Night Shift',
      description: 'Starts at 18:00',
      target_module: 'shifts',
      target_record_id: 1,
      display_priority: 80,
    },

    // ── Captain McGee (ID 3) ────────────────────────────────────────────
    {
      member_id: m('Nathan McGee').id,
      category: 'certification',
      severity: 'warning',
      title: 'Certification expiring: Driver/Operator - Pumper',
      description: 'Expires in 116 days (2026-07-08)',
      target_module: 'training',
      target_record_id: 3,
      display_priority: 30,
    },
    {
      member_id: m('Nathan McGee').id,
      category: 'equipment',
      severity: 'warning',
      title: 'Equipment overdue: Thermal Imaging Camera',
      description: 'Was due back 2026-03-10',
      target_module: 'equipment-checkout',
      target_record_id: 1,
      display_priority: 35,
    },

    // ── Firefighter Kim (ID 4) ──────────────────────────────────────────
    {
      member_id: m('Sandra Kim').id,
      category: 'certification',
      severity: 'warning',
      title: 'Certification expiring: EMT-Basic',
      description: 'Expires in 261 days (2026-12-01)',
      target_module: 'training',
      target_record_id: 4,
      display_priority: 30,
    },
    {
      member_id: m('Sandra Kim').id,
      category: 'schedule',
      severity: 'info',
      title: 'You have a shift today: Day Shift',
      description: 'Starts at 08:00',
      target_module: 'shifts',
      target_record_id: 2,
      display_priority: 80,
    },

    // ── Firefighter Ortega (ID 5) ────────────────────────────────────────
    {
      member_id: m('James Ortega').id,
      category: 'certification',
      severity: 'warning',
      title: 'Certification expiring: Driver/Operator - Pumper',
      description: 'Expires in 116 days (2026-07-08)',
      target_module: 'training',
      target_record_id: 5,
      display_priority: 30,
    },

    // ── Firefighter Benson (ID 6) ───────────────────────────────────────
    {
      member_id: m('Tracy Benson').id,
      category: 'equipment',
      severity: 'warning',
      title: 'Equipment overdue: Self-Rescue Breathing Apparatus',
      description: 'Was due back 2026-03-12',
      target_module: 'equipment-checkout',
      target_record_id: 2,
      display_priority: 35,
    },

    // ── Firefighter Harrington (ID 7) ───────────────────────────────────
    {
      member_id: m('Mike Harrington').id,
      category: 'schedule',
      severity: 'info',
      title: 'You have a shift today: Day Shift',
      description: 'Starts at 08:00',
      target_module: 'shifts',
      target_record_id: 3,
      display_priority: 80,
    },

    // ── Firefighter Fontaine (ID 8) ─────────────────────────────────────
    {
      member_id: m('Lisa Fontaine').id,
      category: 'certification',
      severity: 'warning',
      title: 'Certification expiring: Technical Rescue - Rope',
      description: 'Expires in 180 days (2026-09-20)',
      target_module: 'training',
      target_record_id: 6,
      display_priority: 30,
    },

    // ── Firefighter Ruiz (ID 9) ─────────────────────────────────────────
    {
      member_id: m('Carlos Ruiz').id,
      category: 'equipment',
      severity: 'warning',
      title: 'Equipment overdue: Portable Pump',
      description: 'Was due back 2026-03-08',
      target_module: 'equipment-checkout',
      target_record_id: 3,
      display_priority: 35,
    },

    // ── Firefighter Winters (ID 10) ─────────────────────────────────────
    {
      member_id: m('Amy Winters').id,
      category: 'certification',
      severity: 'warning',
      title: 'Pending: Firefighter I Certification',
      description: 'First certification in progress as probationary member',
      target_module: 'training',
      target_record_id: 10,
      display_priority: 50,
    },

    // ── Firefighter Marsh (ID 11) ────────────────────────────────────────
    {
      member_id: m('Kevin Marsh').id,
      category: 'certification',
      severity: 'warning',
      title: 'Certification expiring: Driver/Operator - Aerial',
      description: 'Expires in 200 days (2026-10-01)',
      target_module: 'training',
      target_record_id: 7,
      display_priority: 30,
    },

    // ── Firefighter Tolliver (ID 12) ────────────────────────────────────
    {
      member_id: m('Diane Tolliver').id,
      category: 'schedule',
      severity: 'info',
      title: 'You have a shift today: Night Shift',
      description: 'Starts at 18:00',
      target_module: 'shifts',
      target_record_id: 4,
      display_priority: 80,
    },

    // ── Shared (Chief sees all open grievances and maintenance) ──────────
    {
      member_id: m('Sarah Chen').id,
      category: 'grievance',
      severity: 'warning',
      title: 'Open grievance: Schedule Fairness Concern',
      description: 'Filed by member - pending review',
      target_module: 'grievances',
      target_record_id: 1,
      display_priority: 45,
    },

    {
      member_id: m('Sarah Chen').id,
      category: 'maintenance',
      severity: 'critical',
      title: 'Maintenance overdue: Engine 14 Annual Service',
      description: 'Apparatus needs annual compliance inspection',
      target_module: 'maintenance',
      target_record_id: 1,
      display_priority: 5,
    },
  ];

  let alertsInserted = 0;
  for (const alert of alerts) {
    await pool.query(
      `INSERT INTO assistant_alerts
       (station_id, member_id, category, severity, title, description,
        source_type, target_module, target_record_id, display_priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        1, // station_id
        alert.member_id,
        alert.category,
        alert.severity,
        alert.title,
        alert.description,
        'seed',
        alert.target_module,
        alert.target_record_id,
        alert.display_priority,
      ]
    );
    alertsInserted++;
  }

  console.log(`Assistant seed complete: ${prefsInserted} preferences, ${alertsInserted} alerts inserted.`);
};
