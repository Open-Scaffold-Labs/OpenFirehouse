'use strict';
const { assets: db } = require('./db');

module.exports = async function seedAssets() {
  const existing = await db.all(1);
  if (existing.length > 0) {
    console.log(`Assets seed: already seeded (${existing.length} records) — skipping.`);
  } else {
  // relative date helper — mirrors the one in client/src/data/assets.js
  function d(offsetDays) {
    const dt = new Date();
    dt.setDate(dt.getDate() + offsetDays);
    return dt.toISOString().slice(0, 10);
  }

  const records = [
    // ── PPE ──────────────────────────────────────────────────────────────────
    {
      name: 'Turnout Coat — Chen', category: 'PPE', condition: 'Serviceable',
      serialNumber: 'TC-2021-001', assignedTo: 'Sarah Chen',
      location: 'Station — Gear Room', purchaseDate: '2021-03-15',
      lastInspection: d(-180), nextInspectionDue: d(185),
      notes: 'Globe G-Xtreme. Annual inspection passed.',
    },
    {
      name: 'Turnout Pants — Chen', category: 'PPE', condition: 'Serviceable',
      serialNumber: 'TP-2021-001', assignedTo: 'Sarah Chen',
      location: 'Station — Gear Room', purchaseDate: '2021-03-15',
      lastInspection: d(-180), nextInspectionDue: d(185),
      notes: '',
    },
    {
      name: 'Turnout Coat — Benson', category: 'PPE', condition: 'Needs Maintenance',
      serialNumber: 'TC-2019-005', assignedTo: 'Tracy Benson',
      location: 'Station — Gear Room', purchaseDate: '2019-07-01',
      lastInspection: d(-400), nextInspectionDue: d(-35),
      notes: 'Outer shell showing wear on left shoulder. Needs NFPA 1851 advanced inspection.',
    },
    {
      name: 'Structural Helmet — McGee', category: 'PPE', condition: 'Serviceable',
      serialNumber: 'HLM-2022-003', assignedTo: 'Nathan McGee',
      location: 'Station — Gear Room', purchaseDate: '2022-11-10',
      lastInspection: d(-90), nextInspectionDue: d(275),
      notes: 'MSA Cairns 1010.',
    },
    {
      name: 'Structural Boots — McGee', category: 'PPE', condition: 'Serviceable',
      serialNumber: 'BT-2023-006', assignedTo: 'Mike Harrington',
      location: 'Station — Gear Room', purchaseDate: '2023-04-22',
      lastInspection: d(-60), nextInspectionDue: d(305),
      notes: '',
    },

    // ── SCBA ─────────────────────────────────────────────────────────────────
    {
      name: 'SCBA Unit #1', category: 'SCBA / Breathing Apparatus', condition: 'Serviceable',
      serialNumber: 'SCBA-MSA-2020-001', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2020-06-01',
      lastInspection: d(-30), nextInspectionDue: d(335),
      notes: 'MSA G1 SCBA. Cylinder hydro due 2027.',
    },
    {
      name: 'SCBA Unit #2', category: 'SCBA / Breathing Apparatus', condition: 'Serviceable',
      serialNumber: 'SCBA-MSA-2020-002', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2020-06-01',
      lastInspection: d(-30), nextInspectionDue: d(335),
      notes: 'MSA G1 SCBA.',
    },
    {
      name: 'SCBA Unit #3', category: 'SCBA / Breathing Apparatus', condition: 'Out of Service',
      serialNumber: 'SCBA-MSA-2020-003', assignedTo: null,
      location: 'Station — Storage', purchaseDate: '2020-06-01',
      lastInspection: d(-15), nextInspectionDue: d(350),
      notes: 'Regulator failure. Awaiting parts for repair.',
    },
    {
      name: 'Air Cylinder #1', category: 'SCBA / Breathing Apparatus', condition: 'Serviceable',
      serialNumber: 'CYL-2020-001', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2020-06-01',
      lastInspection: d(-45), nextInspectionDue: d(320),
      notes: '4500 PSI cylinder. Hydro date: 2027-06.',
    },
    {
      name: 'PASS Device #1', category: 'SCBA / Breathing Apparatus', condition: 'Serviceable',
      serialNumber: 'PASS-2021-001', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2021-02-14',
      lastInspection: d(-20), nextInspectionDue: d(25),
      notes: 'MSA ALTAIR 5X. Sensor calibration due.',
    },

    // ── Hose & Nozzles ────────────────────────────────────────────────────────
    {
      name: '1¾" Attack Hose — 200 ft', category: 'Hose & Nozzles', condition: 'Serviceable',
      serialNumber: 'HSE-175-001', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2022-01-10',
      lastInspection: d(-365), nextInspectionDue: d(0),
      notes: 'Annual service test due. 200 PSI test.',
    },
    {
      name: '2½" Supply Hose — 100 ft', category: 'Hose & Nozzles', condition: 'Serviceable',
      serialNumber: 'HSE-250-001', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2020-09-01',
      lastInspection: d(-200), nextInspectionDue: d(165),
      notes: '',
    },
    {
      name: 'TFT Automatic Nozzle', category: 'Hose & Nozzles', condition: 'Serviceable',
      serialNumber: 'NZL-TFT-001', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2021-05-20',
      lastInspection: d(-90), nextInspectionDue: d(275),
      notes: 'Task Force Tips 1¾" Automatic nozzle.',
    },

    // ── Medical / EMS ─────────────────────────────────────────────────────────
    {
      name: 'AED — Station', category: 'Medical / EMS', condition: 'Serviceable',
      serialNumber: 'AED-ZOLL-2022-001', assignedTo: null,
      location: 'Station — EMS Room', purchaseDate: '2022-08-15',
      lastInspection: d(-7), nextInspectionDue: d(358),
      notes: 'ZOLL AED Plus. Pads replaced 2025-08.',
    },
    {
      name: 'Stair Chair', category: 'Medical / EMS', condition: 'Serviceable',
      serialNumber: 'SC-FERNO-001', assignedTo: null,
      location: 'EMS 14', purchaseDate: '2020-03-01',
      lastInspection: d(-30), nextInspectionDue: d(335),
      notes: 'Ferno Model 40 stair chair.',
    },

    // ── Power Tools ───────────────────────────────────────────────────────────
    {
      name: 'Hydraulic Rescue Tool — Spreader', category: 'Power Tools', condition: 'Serviceable',
      serialNumber: 'HRT-HOL-2021-001', assignedTo: null,
      location: 'Rescue 14', purchaseDate: '2021-09-10',
      lastInspection: d(-45), nextInspectionDue: d(320),
      notes: 'Holmatro spreader. Annual service completed.',
    },
    {
      name: 'Hydraulic Rescue Tool — Cutter', category: 'Power Tools', condition: 'Serviceable',
      serialNumber: 'HRT-HOL-2021-002', assignedTo: null,
      location: 'Rescue 14', purchaseDate: '2021-09-10',
      lastInspection: d(-45), nextInspectionDue: d(320),
      notes: 'Holmatro cutter.',
    },
    {
      name: 'Circular Saw — Ventilation', category: 'Power Tools', condition: 'Needs Maintenance',
      serialNumber: 'SAW-STIHL-001', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2019-06-01',
      lastInspection: d(-200), nextInspectionDue: d(-10),
      notes: 'STIHL TS 420. Blade needs replacement, fuel line cracked.',
    },

    // ── Communication ─────────────────────────────────────────────────────────
    {
      name: 'Portable Radio #1', category: 'Communication', condition: 'Serviceable',
      serialNumber: 'RAD-MOT-2022-001', assignedTo: 'Sarah Chen',
      location: 'Station — Bay 1', purchaseDate: '2022-04-01',
      lastInspection: d(-60), nextInspectionDue: d(305),
      notes: 'Motorola APX 6000. Encrypted.',
    },
    {
      name: 'Portable Radio #2', category: 'Communication', condition: 'Serviceable',
      serialNumber: 'RAD-MOT-2022-002', assignedTo: 'Maria Delgado',
      location: 'Station — Bay 1', purchaseDate: '2022-04-01',
      lastInspection: d(-60), nextInspectionDue: d(305),
      notes: 'Motorola APX 6000.',
    },

    // ── Detection / Monitoring ────────────────────────────────────────────────
    {
      name: 'Multi-Gas Detector #1', category: 'Detection / Monitoring', condition: 'Serviceable',
      serialNumber: 'MGD-MSA-2023-001', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2023-01-15',
      lastInspection: d(-10), nextInspectionDue: d(355),
      notes: 'MSA ALTAIR 5X. O2, CO, H2S, LEL. Bump test weekly.',
    },
    {
      name: 'Thermal Imaging Camera', category: 'Detection / Monitoring', condition: 'Serviceable',
      serialNumber: 'TIC-BULLARD-2022-001', assignedTo: null,
      location: 'Engine 14', purchaseDate: '2022-07-20',
      lastInspection: d(-90), nextInspectionDue: d(275),
      notes: 'Bullard Eclipse TIC.',
    },
  ];

    for (const r of records) { await db.create(r, 1); }
    console.log(`Assets seed: inserted ${records.length} records.`);
  }
};
