'use strict';
/**
 * seed-radioConfig.js — Station radio configuration.
 * Sets up talkgroups and dispatch keywords for the demo station.
 *
 * Idempotent: skips if radio_config already has a row for station 1.
 */

const { pool } = require('./db');

module.exports = async function seedRadioConfig() {
  const { rows: check } = await pool.query(
    'SELECT COUNT(*) as c FROM radio_config WHERE station_id = 1'
  );
  if (parseInt(check[0].c) > 0) {
    console.log('Radio config seed: already seeded, skipping.');
    return;
  }

  const talkgroups = [
    { id: 'TG-001', name: 'Fire Dispatch — Main',    frequency: '155.340', priority: 'high',   monitor: true  },
    { id: 'TG-002', name: 'Fire Ground — Ch 1',      frequency: '154.280', priority: 'high',   monitor: true  },
    { id: 'TG-003', name: 'Fire Ground — Ch 2',      frequency: '154.295', priority: 'normal', monitor: true  },
    { id: 'TG-004', name: 'EMS — Medical',            frequency: '155.175', priority: 'high',   monitor: true  },
    { id: 'TG-005', name: 'Command — Tactical',       frequency: '154.310', priority: 'high',   monitor: true  },
    { id: 'TG-006', name: 'Mutual Aid — County',      frequency: '154.265', priority: 'normal', monitor: false },
    { id: 'TG-007', name: 'Public Works',             frequency: '154.920', priority: 'low',    monitor: false },
    { id: 'TG-008', name: 'Law Enforcement Liaison',  frequency: '155.910', priority: 'normal', monitor: false },
  ];

  const dispatchKeywords = [
    // Emergency call types
    'structure fire', 'working fire', 'house fire', 'building fire',
    'MVA', 'motor vehicle accident', 'vehicle accident', 'car accident',
    'EMS', 'cardiac', 'chest pain', 'unconscious', 'unresponsive',
    'person down', 'fall', 'stroke', 'breathing difficulty',
    'brush fire', 'wildland fire', 'woods fire', 'grass fire',
    'gas leak', 'natural gas', 'carbon monoxide', 'CO alarm',
    'Mayday', 'MAYDAY', 'firefighter down',
    'hazmat', 'chemical spill', 'fuel spill',
    'water rescue', 'swift water', 'confined space',
    'mutual aid', 'all hands',
    // Unit identifiers
    'Engine 1', 'Engine 2', 'Ladder 1', 'Rescue 1', 'Medic 1', 'Tanker 1',
    'Station 14', 'Maplewood',
  ];

  await pool.query(
    `INSERT INTO radio_config (station_id, enabled, api_key, talkgroups, dispatch_keywords, whisper_mode, retention_days, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (station_id) DO NOTHING`,
    [
      1,
      false,                              // disabled until hardware is connected
      '',                                 // API key set via env/admin UI
      JSON.stringify(talkgroups),
      JSON.stringify(dispatchKeywords),
      'cloud',
      90,
    ]
  );

  console.log('Radio config seed complete: station radio configuration inserted.');
};
