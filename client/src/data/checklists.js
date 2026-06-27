// Inspection Checklist data for OpenFirehouse

export const FREQUENCIES = ['Daily', 'Weekly', 'Monthly'];

export const ITEM_TYPES = ['pass_fail', 'text', 'number'];

export const COMPLETION_STATUSES = ['Pass', 'Pass with Deficiency', 'Fail'];

// ─── Checklist Templates ──────────────────────────────────────────────────────

export const checklistTemplates = [
  // ── Engine 14 — Daily ──────────────────────────────────────────────────────
  {
    id: 'tpl-001',
    name: 'Engine 14 — Daily Check',
    apparatus: 'Engine 14',
    frequency: 'Daily',
    estimatedMinutes: 20,
    categories: [
      {
        name: 'Cab & Driver Area',
        items: [
          { id: 'e-cab-01', description: 'Fuel level ≥ 3/4 tank', type: 'pass_fail' },
          { id: 'e-cab-02', description: 'Engine oil level — check dipstick', type: 'pass_fail' },
          { id: 'e-cab-03', description: 'Coolant level visible in overflow', type: 'pass_fail' },
          { id: 'e-cab-04', description: 'Warning lights — all extinguished at idle', type: 'pass_fail' },
          { id: 'e-cab-05', description: 'Windshield wipers and washer fluid', type: 'pass_fail' },
          { id: 'e-cab-06', description: 'All mirrors adjusted and clean', type: 'pass_fail' },
          { id: 'e-cab-07', description: 'Seat belts — all seats functional', type: 'pass_fail' },
          { id: 'e-cab-08', description: 'MDT / Mobile radio — powered and logged in', type: 'pass_fail' },
          { id: 'e-cab-09', description: 'Portable radios — charged and in holders', type: 'pass_fail' },
          { id: 'e-cab-10', description: 'Headsets / intercom — all positions working', type: 'pass_fail' },
          { id: 'e-cab-11', description: 'Air horn and siren — functional test', type: 'pass_fail' },
          { id: 'e-cab-12', description: 'Emergency lights — all sectors functional', type: 'pass_fail' },
          { id: 'e-cab-13', description: 'Odometer reading', type: 'number' },
        ],
      },
      {
        name: 'Engine & Mechanical',
        items: [
          { id: 'e-eng-01', description: 'Transmission fluid level', type: 'pass_fail' },
          { id: 'e-eng-02', description: 'Power steering fluid level', type: 'pass_fail' },
          { id: 'e-eng-03', description: 'Belt and hose visual — no cracks or fraying', type: 'pass_fail' },
          { id: 'e-eng-04', description: 'All tires — condition and pressure visual', type: 'pass_fail' },
          { id: 'e-eng-05', description: 'No leaks under apparatus after warm-up', type: 'pass_fail' },
          { id: 'e-eng-06', description: 'Brakes — test in apparatus bay', type: 'pass_fail' },
          { id: 'e-eng-07', description: 'Aerial / outriggers — stowed and locked (N/A if not equipped)', type: 'pass_fail' },
        ],
      },
      {
        name: 'Pump Panel',
        items: [
          { id: 'e-pump-01', description: 'Booster tank — full (500 gal)', type: 'pass_fail' },
          { id: 'e-pump-02', description: 'Primer — functional', type: 'pass_fail' },
          { id: 'e-pump-03', description: 'Pressure gauges — reading correctly at idle', type: 'pass_fail' },
          { id: 'e-pump-04', description: 'All discharge valves — closed and capped', type: 'pass_fail' },
          { id: 'e-pump-05', description: 'Intake strainers — clear and capped', type: 'pass_fail' },
          { id: 'e-pump-06', description: 'Tank-to-pump valve — opens and closes freely', type: 'pass_fail' },
          { id: 'e-pump-07', description: 'Foam system — level and operational (if equipped)', type: 'pass_fail' },
        ],
      },
      {
        name: 'Hose Complement',
        items: [
          { id: 'e-hose-01', description: 'Pre-connected 1-3/4" lines — loaded and nozzles attached', type: 'pass_fail' },
          { id: 'e-hose-02', description: '2-1/2" supply hose — load intact', type: 'pass_fail' },
          { id: 'e-hose-03', description: 'Hose bundles/rolls — secure and accounted for', type: 'pass_fail' },
          { id: 'e-hose-04', description: 'Hydrant bag / supply pack — complete', type: 'pass_fail' },
          { id: 'e-hose-05', description: 'All nozzles — present and condition OK', type: 'pass_fail' },
        ],
      },
      {
        name: 'Ground Ladders',
        items: [
          { id: 'e-lad-01', description: 'All ground ladders — secured in mounts', type: 'pass_fail' },
          { id: 'e-lad-02', description: 'Ladder condition — no visible damage', type: 'pass_fail' },
          { id: 'e-lad-03', description: 'Halyard (fly section) — unfrayed', type: 'pass_fail' },
        ],
      },
      {
        name: 'SCBA & Breathing Air',
        items: [
          { id: 'e-scba-01', description: 'All SCBA units present and mounted', type: 'pass_fail' },
          { id: 'e-scba-02', description: 'SCBA cylinder pressure ≥ 4500 psi each', type: 'pass_fail' },
          { id: 'e-scba-03', description: 'Mask and regulator — clean and no damage', type: 'pass_fail' },
          { id: 'e-scba-04', description: 'PASS devices — armed and alarm functional', type: 'pass_fail' },
          { id: 'e-scba-05', description: 'Harness straps — all present and not frayed', type: 'pass_fail' },
          { id: 'e-scba-06', description: 'Spare cylinders — quantity and pressure', type: 'text' },
        ],
      },
      {
        name: 'Hand Tools & Power Equipment',
        items: [
          { id: 'e-tool-01', description: 'Halligan and flathead axe — present and secured', type: 'pass_fail' },
          { id: 'e-tool-02', description: 'Pike poles / hooks — present and secured', type: 'pass_fail' },
          { id: 'e-tool-03', description: 'Chainsaw — fuel level, chain, blade guard', type: 'pass_fail' },
          { id: 'e-tool-04', description: 'Hydraulic rescue tools (jaws/spreader) — powered and fluid level', type: 'pass_fail' },
          { id: 'e-tool-05', description: 'Portable generator — fuel, oil, start test', type: 'pass_fail' },
        ],
      },
      {
        name: 'Medical & EMS',
        items: [
          { id: 'e-med-01', description: 'AED — charged, pads present and in-date', type: 'pass_fail' },
          { id: 'e-med-02', description: 'Portable O2 — pressure and regulator', type: 'pass_fail' },
          { id: 'e-med-03', description: 'First aid bag — restocked and complete', type: 'pass_fail' },
          { id: 'e-med-04', description: 'Burn kit present', type: 'pass_fail' },
        ],
      },
      {
        name: 'Lighting & Scene',
        items: [
          { id: 'e-light-01', description: 'Scene lights (mounted) — all functional', type: 'pass_fail' },
          { id: 'e-light-02', description: 'Portable LED lights — charged and working', type: 'pass_fail' },
          { id: 'e-light-03', description: 'Traffic advisor / arrow board — functional', type: 'pass_fail' },
        ],
      },
    ],
  },

  // ── Rescue 14 — Daily ─────────────────────────────────────────────────────
  {
    id: 'tpl-002',
    name: 'Rescue 14 — Daily Check',
    apparatus: 'Rescue 14',
    frequency: 'Daily',
    estimatedMinutes: 25,
    categories: [
      {
        name: 'Cab & Driver Area',
        items: [
          { id: 'r-cab-01', description: 'Fuel level ≥ 3/4 tank', type: 'pass_fail' },
          { id: 'r-cab-02', description: 'Engine oil and coolant levels', type: 'pass_fail' },
          { id: 'r-cab-03', description: 'Warning lights — all extinguished at idle', type: 'pass_fail' },
          { id: 'r-cab-04', description: 'MDT / radio — powered', type: 'pass_fail' },
          { id: 'r-cab-05', description: 'Portable radios — charged', type: 'pass_fail' },
          { id: 'r-cab-06', description: 'Emergency lights and siren — functional', type: 'pass_fail' },
          { id: 'r-cab-07', description: 'Odometer reading', type: 'number' },
        ],
      },
      {
        name: 'Hydraulic Rescue Tools',
        items: [
          { id: 'r-hrt-01', description: 'Spreader — fluid level and no damage', type: 'pass_fail' },
          { id: 'r-hrt-02', description: 'Cutter — fluid and blade condition', type: 'pass_fail' },
          { id: 'r-hrt-03', description: 'Ram(s) — fluid and no damage', type: 'pass_fail' },
          { id: 'r-hrt-04', description: 'Power unit — fuel, oil, operational test', type: 'pass_fail' },
          { id: 'r-hrt-05', description: 'Hydraulic hose lines — no leaks or abrasion', type: 'pass_fail' },
        ],
      },
      {
        name: 'Technical Rescue Equipment',
        items: [
          { id: 'r-tech-01', description: 'Rope rescue kit — bag complete, no damage', type: 'pass_fail' },
          { id: 'r-tech-02', description: 'Confined space kit — blower, gas monitor, harnesses', type: 'pass_fail' },
          { id: 'r-tech-03', description: 'Gas monitor — calibrated and charged', type: 'pass_fail' },
          { id: 'r-tech-04', description: 'Cribbing blocks — full complement', type: 'pass_fail' },
          { id: 'r-tech-05', description: 'Air bags (high pressure lifting) — pressure and hoses', type: 'pass_fail' },
        ],
      },
      {
        name: 'Medical & EMS',
        items: [
          { id: 'r-med-01', description: 'Stretcher — functional and locked', type: 'pass_fail' },
          { id: 'r-med-02', description: 'Cardiac monitor/defibrillator — charged and pads', type: 'pass_fail' },
          { id: 'r-med-03', description: 'Airway management kit — complete', type: 'pass_fail' },
          { id: 'r-med-04', description: 'O2 — full cylinder and functional regulator', type: 'pass_fail' },
          { id: 'r-med-05', description: 'Medication bag — restocked and in-date', type: 'pass_fail' },
          { id: 'r-med-06', description: 'Splint and backboard kit — complete', type: 'pass_fail' },
        ],
      },
      {
        name: 'SCBA',
        items: [
          { id: 'r-scba-01', description: 'All SCBA units present and mounted', type: 'pass_fail' },
          { id: 'r-scba-02', description: 'Cylinder pressures ≥ 4500 psi each', type: 'pass_fail' },
          { id: 'r-scba-03', description: 'PASS devices functional', type: 'pass_fail' },
        ],
      },
    ],
  },

  // ── EMS 14 — Daily ────────────────────────────────────────────────────────
  {
    id: 'tpl-003',
    name: 'EMS 14 — Daily Check',
    apparatus: 'EMS 14',
    frequency: 'Daily',
    estimatedMinutes: 15,
    categories: [
      {
        name: 'Vehicle',
        items: [
          { id: 'ems-v-01', description: 'Fuel level ≥ 3/4 tank', type: 'pass_fail' },
          { id: 'ems-v-02', description: 'Engine oil and coolant', type: 'pass_fail' },
          { id: 'ems-v-03', description: 'Emergency lights and siren', type: 'pass_fail' },
          { id: 'ems-v-04', description: 'Radio — powered and working', type: 'pass_fail' },
          { id: 'ems-v-05', description: 'Odometer reading', type: 'number' },
        ],
      },
      {
        name: 'Patient Care Equipment',
        items: [
          { id: 'ems-pc-01', description: 'Stretcher — operational and locking', type: 'pass_fail' },
          { id: 'ems-pc-02', description: 'Stair chair — present and functional', type: 'pass_fail' },
          { id: 'ems-pc-03', description: 'Cardiac monitor — charged, leads, pads', type: 'pass_fail' },
          { id: 'ems-pc-04', description: 'AED — charged, pads in-date', type: 'pass_fail' },
          { id: 'ems-pc-05', description: 'O2 — main and portable cylinders', type: 'pass_fail' },
          { id: 'ems-pc-06', description: 'Airway bag — complete', type: 'pass_fail' },
          { id: 'ems-pc-07', description: 'Medication bag — all meds present and in-date', type: 'pass_fail' },
          { id: 'ems-pc-08', description: 'IV supplies — restocked', type: 'pass_fail' },
          { id: 'ems-pc-09', description: 'Trauma bag — complete', type: 'pass_fail' },
          { id: 'ems-pc-10', description: 'Pediatric supplies — present', type: 'pass_fail' },
          { id: 'ems-pc-11', description: 'Obstetric / OB kit — present', type: 'pass_fail' },
        ],
      },
      {
        name: 'Documentation & Supplies',
        items: [
          { id: 'ems-doc-01', description: 'PCR / ePCR tablet — charged and logged in', type: 'pass_fail' },
          { id: 'ems-doc-02', description: 'Disposable gloves — stocked (sizes S/M/L)', type: 'pass_fail' },
          { id: 'ems-doc-03', description: 'PPE — masks, gowns, eye protection present', type: 'pass_fail' },
          { id: 'ems-doc-04', description: 'Sharps containers — not overfull', type: 'pass_fail' },
          { id: 'ems-doc-05', description: 'Biohazard bags present', type: 'pass_fail' },
        ],
      },
    ],
  },

  // ── Station — Weekly ──────────────────────────────────────────────────────
  {
    id: 'tpl-004',
    name: 'Station 14 — Weekly Inspection',
    apparatus: 'Station',
    frequency: 'Weekly',
    estimatedMinutes: 30,
    categories: [
      {
        name: 'Apparatus Bay',
        items: [
          { id: 'sta-bay-01', description: 'Apparatus bay floor — clean, no spills', type: 'pass_fail' },
          { id: 'sta-bay-02', description: 'Bay doors — operational, no damage', type: 'pass_fail' },
          { id: 'sta-bay-03', description: 'Exhaust extraction system — functional', type: 'pass_fail' },
          { id: 'sta-bay-04', description: 'Fire extinguishers (bay) — tagged and pressure OK', type: 'pass_fail' },
          { id: 'sta-bay-05', description: 'Eye wash station — full and labeled', type: 'pass_fail' },
          { id: 'sta-bay-06', description: 'Spill kit — complete', type: 'pass_fail' },
        ],
      },
      {
        name: 'Building & Life Safety',
        items: [
          { id: 'sta-ls-01', description: 'Smoke detectors — test all (use test button)', type: 'pass_fail' },
          { id: 'sta-ls-02', description: 'CO detectors — functional', type: 'pass_fail' },
          { id: 'sta-ls-03', description: 'Exit signs — all illuminated', type: 'pass_fail' },
          { id: 'sta-ls-04', description: 'Emergency lighting — functional (test button)', type: 'pass_fail' },
          { id: 'sta-ls-05', description: 'All exits — unobstructed', type: 'pass_fail' },
          { id: 'sta-ls-06', description: 'Fire extinguishers (interior) — all tagged and pressure OK', type: 'pass_fail' },
        ],
      },
      {
        name: 'SCBA Air Supply',
        items: [
          { id: 'sta-air-01', description: 'Cascade fill system pressure — note reading', type: 'number' },
          { id: 'sta-air-02', description: 'Fill station — no leaks or abnormal sounds', type: 'pass_fail' },
          { id: 'sta-air-03', description: 'All spare cylinders — pressure and tagged', type: 'pass_fail' },
        ],
      },
      {
        name: 'Facilities',
        items: [
          { id: 'sta-fac-01', description: 'Kitchen — clean, no fire hazards', type: 'pass_fail' },
          { id: 'sta-fac-02', description: 'Bathroom / shower facilities — clean and functional', type: 'pass_fail' },
          { id: 'sta-fac-03', description: 'Washer/dryer for turnout gear — operational', type: 'pass_fail' },
          { id: 'sta-fac-04', description: 'Exterior lights — all functional', type: 'pass_fail' },
          { id: 'sta-fac-05', description: 'Station grounds — clear of debris and obstructions', type: 'pass_fail' },
        ],
      },
      {
        name: 'Logistics',
        items: [
          { id: 'sta-log-01', description: 'First aid station (office) — stocked', type: 'pass_fail' },
          { id: 'sta-log-02', description: 'Office supplies for reports — paper, ink, forms', type: 'pass_fail' },
          { id: 'sta-log-03', description: 'Knox Box — locked and key present', type: 'pass_fail' },
        ],
      },
    ],
  },

  // ── Engine 14 — Monthly ───────────────────────────────────────────────────
  {
    id: 'tpl-005',
    name: 'Engine 14 — Monthly Pump Test',
    apparatus: 'Engine 14',
    frequency: 'Monthly',
    estimatedMinutes: 45,
    categories: [
      {
        name: 'Pre-Test Visual',
        items: [
          { id: 'mpt-pre-01', description: 'All discharge and intake caps removed and inspected', type: 'pass_fail' },
          { id: 'mpt-pre-02', description: 'Packing glands — no excessive leakage', type: 'pass_fail' },
          { id: 'mpt-pre-03', description: 'Relief valve — present and operational', type: 'pass_fail' },
          { id: 'mpt-pre-04', description: 'Tank-to-pump and pump-to-tank tested', type: 'pass_fail' },
        ],
      },
      {
        name: 'Pump Performance',
        items: [
          { id: 'mpt-perf-01', description: '100% capacity @ 150 psi — achieved', type: 'pass_fail' },
          { id: 'mpt-perf-02', description: 'Discharge pressure at 100% — record PSI', type: 'number' },
          { id: 'mpt-perf-03', description: '70% capacity @ 200 psi — achieved', type: 'pass_fail' },
          { id: 'mpt-perf-04', description: '50% capacity @ 250 psi — achieved', type: 'pass_fail' },
          { id: 'mpt-perf-05', description: 'Primer — evacuates 10 ft of dry hose in ≤ 30 sec', type: 'pass_fail' },
          { id: 'mpt-perf-06', description: 'Pressure governor / relief — operates correctly', type: 'pass_fail' },
        ],
      },
      {
        name: 'Post-Test',
        items: [
          { id: 'mpt-post-01', description: 'All discharges — closed and capped', type: 'pass_fail' },
          { id: 'mpt-post-02', description: 'No new leaks observed', type: 'pass_fail' },
          { id: 'mpt-post-03', description: 'Booster tank — refilled to full', type: 'pass_fail' },
          { id: 'mpt-post-04', description: 'Mileage and engine hours recorded', type: 'text' },
          { id: 'mpt-post-05', description: 'Deficiencies noted (or "None")', type: 'text' },
        ],
      },
    ],
  },
];

// ─── Completed Checklist History ──────────────────────────────────────────────

const yr  = new Date().getFullYear();
const d   = (mo, day) => `${yr}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

let _hid = 1;
const hid = () => `cl-${String(_hid++).padStart(3,'0')}`;

// Helper to build a pass-all responses object from a template
function allPass(template) {
  const resp = {};
  template.categories.forEach((cat) => {
    cat.items.forEach((item) => {
      resp[item.id] = item.type === 'pass_fail' ? { value: 'pass', note: '' }
                    : item.type === 'number'    ? { value: item.id.includes('odo') || item.id.includes('cab-13') ? '38420' : item.id.includes('ems-v-05') ? '22180' : '0', note: '' }
                    : { value: 'OK', note: '' };
    });
  });
  return resp;
}

// A few with a deficiency
function withDeficiency(template, failItemId, failNote) {
  const resp = allPass(template);
  if (resp[failItemId]) resp[failItemId] = { value: 'fail', note: failNote };
  return resp;
}

export const completedChecklists = [
  // Engine 14 daily — recent week
  { id: hid(), templateId: 'tpl-001', templateName: 'Engine 14 — Daily Check', apparatus: 'Engine 14',
    frequency: 'Daily', completedDate: d(3,5), completedBy: 'Sandra Kim',
    status: 'Pass', notes: '', responses: allPass(checklistTemplates[0]) },
  { id: hid(), templateId: 'tpl-001', templateName: 'Engine 14 — Daily Check', apparatus: 'Engine 14',
    frequency: 'Daily', completedDate: d(3,4), completedBy: 'James Ortega',
    status: 'Pass', notes: '', responses: allPass(checklistTemplates[0]) },
  { id: hid(), templateId: 'tpl-001', templateName: 'Engine 14 — Daily Check', apparatus: 'Engine 14',
    frequency: 'Daily', completedDate: d(3,3), completedBy: 'Nathan McGee',
    status: 'Pass with Deficiency',
    notes: 'Scene light #2 (passenger rear) intermittent — reported to apparatus committee.',
    responses: withDeficiency(checklistTemplates[0], 'e-light-01', 'Scene light #2 intermittent, flickering at start.') },
  { id: hid(), templateId: 'tpl-001', templateName: 'Engine 14 — Daily Check', apparatus: 'Engine 14',
    frequency: 'Daily', completedDate: d(3,2), completedBy: 'Mike Harrington',
    status: 'Pass', notes: '', responses: allPass(checklistTemplates[0]) },
  { id: hid(), templateId: 'tpl-001', templateName: 'Engine 14 — Daily Check', apparatus: 'Engine 14',
    frequency: 'Daily', completedDate: d(3,1), completedBy: 'Sandra Kim',
    status: 'Pass', notes: '', responses: allPass(checklistTemplates[0]) },

  // Rescue 14 daily — recent
  { id: hid(), templateId: 'tpl-002', templateName: 'Rescue 14 — Daily Check', apparatus: 'Rescue 14',
    frequency: 'Daily', completedDate: d(3,5), completedBy: 'Nathan McGee',
    status: 'Pass', notes: '', responses: allPass(checklistTemplates[1]) },
  { id: hid(), templateId: 'tpl-002', templateName: 'Rescue 14 — Daily Check', apparatus: 'Rescue 14',
    frequency: 'Daily', completedDate: d(3,4), completedBy: 'Mike Harrington',
    status: 'Pass with Deficiency',
    notes: 'Gas monitor low battery — placed on charge. Spare unit in service.',
    responses: withDeficiency(checklistTemplates[1], 'r-tech-03', 'Battery low — 18% remaining. Placed on charge, spare unit in use.') },
  { id: hid(), templateId: 'tpl-002', templateName: 'Rescue 14 — Daily Check', apparatus: 'Rescue 14',
    frequency: 'Daily', completedDate: d(3,3), completedBy: 'Nathan McGee',
    status: 'Pass', notes: '', responses: allPass(checklistTemplates[1]) },

  // EMS 14 daily
  { id: hid(), templateId: 'tpl-003', templateName: 'EMS 14 — Daily Check', apparatus: 'EMS 14',
    frequency: 'Daily', completedDate: d(3,5), completedBy: 'Mike Harrington',
    status: 'Pass', notes: '', responses: allPass(checklistTemplates[2]) },
  { id: hid(), templateId: 'tpl-003', templateName: 'EMS 14 — Daily Check', apparatus: 'EMS 14',
    frequency: 'Daily', completedDate: d(3,4), completedBy: 'Nathan McGee',
    status: 'Fail',
    notes: 'Medication bag missing two doses of epinephrine — restocked from station supply before apparatus placed back in service.',
    responses: withDeficiency(checklistTemplates[2], 'ems-pc-07', 'Missing 2x epinephrine 1:1000 doses. Restocked from station stock.') },
  { id: hid(), templateId: 'tpl-003', templateName: 'EMS 14 — Daily Check', apparatus: 'EMS 14',
    frequency: 'Daily', completedDate: d(3,3), completedBy: 'Mike Harrington',
    status: 'Pass', notes: '', responses: allPass(checklistTemplates[2]) },

  // Station weekly
  { id: hid(), templateId: 'tpl-004', templateName: 'Station 14 — Weekly Inspection', apparatus: 'Station',
    frequency: 'Weekly', completedDate: d(3,1), completedBy: 'James Ortega',
    status: 'Pass', notes: 'Bay door #2 making noise when closing — lubricated track, appears resolved.', responses: allPass(checklistTemplates[3]) },
  { id: hid(), templateId: 'tpl-004', templateName: 'Station 14 — Weekly Inspection', apparatus: 'Station',
    frequency: 'Weekly', completedDate: d(2,22), completedBy: 'Tracy Benson',
    status: 'Pass with Deficiency',
    notes: 'Exit sign in rear hallway has failed bulb — reported, maintenance order placed.',
    responses: withDeficiency(checklistTemplates[3], 'sta-ls-03', 'Rear hallway exit sign — bulb failed. Maintenance order #MW-0214 submitted.') },

  // Monthly pump test
  { id: hid(), templateId: 'tpl-005', templateName: 'Engine 14 — Monthly Pump Test', apparatus: 'Engine 14',
    frequency: 'Monthly', completedDate: d(2,15), completedBy: 'Sandra Kim',
    status: 'Pass', notes: 'All pump tests within spec. New packing on 2-1/2" discharge installed last month holding well.', responses: allPass(checklistTemplates[4]) },
  { id: hid(), templateId: 'tpl-005', templateName: 'Engine 14 — Monthly Pump Test', apparatus: 'Engine 14',
    frequency: 'Monthly', completedDate: d(1,18), completedBy: 'Sandra Kim',
    status: 'Pass', notes: '', responses: allPass(checklistTemplates[4]) },
];
