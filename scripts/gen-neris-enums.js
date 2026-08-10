#!/usr/bin/env node
'use strict';
/**
 * scripts/gen-neris-enums.js
 *
 * Generates the server-owned NERIS control-value enums
 * (server/src/constants/neris/enums.json) from the LIVE production NERIS OpenAPI
 * spec — https://api.neris.fsri.org/v1/openapi.json.
 *
 * WHY THIS EXISTS (decision D1, docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md)
 * The GitHub framework repo (ulfsri/neris-framework) is NOT the source of truth —
 * it is unmaintained and has drifted from the live API (the BACKCOUNTRY_RESCUE
 * spelling, the 2-level MEDICAL||ILLNESS / MEDICAL||INJURY incident types, extra
 * incident statuses). These are CONTROL VALUES on a legal record: a hand-copied
 * enum that goes stale is the same class of bug as the /^pass\b/i regex guard.
 * So the enum layer is GENERATED, pinned to a spec version, and drift-checkable
 * on demand. When NERIS V2 lands, the swap is one regeneration.
 *
 * Values are extracted VERBATIM in spec order — never reordered, never
 * case-normalized, never edited by hand.
 *
 *   node scripts/gen-neris-enums.js                  # fetch live spec, rewrite
 *                                                    #   enums.json + the vendored
 *                                                    #   openapi-snapshot.json
 *   node scripts/gen-neris-enums.js --from <file>    # extract from a local spec file
 *   node scripts/gen-neris-enums.js --check          # fetch live, diff against the
 *                                                    #   committed enums.json;
 *                                                    #   exit 1 on drift
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SPEC_URL = 'https://api.neris.fsri.org/v1/openapi.json';
const NERIS_DIR = path.join(ROOT, 'server', 'src', 'constants', 'neris');
const ENUMS_PATH = path.join(NERIS_DIR, 'enums.json');
const SNAPSHOT_PATH = path.join(NERIS_DIR, 'openapi-snapshot.json');

/**
 * enums.json set key → the spec's components.schemas name.
 * Verified against v1.4.76 (2026-07-16). If a schema is renamed in a future spec
 * rev, this script FAILS LOUDLY — it never silently emits a partial file.
 */
const SETS = {
  type_incident:               'TypeIncidentValue',
  type_action_tactic:          'TypeActionTacticValue',
  type_noaction:               'TypeNoactionValue',
  type_medical_patient_care:   'TypeMedicalPatientCareValue',
  type_medical_transport:      'TypeMedicalTransportValue',
  type_medical_patient_status: 'TypeMedicalPatientStatusValue',
  type_hazard_disposition:     'TypeHazardDispositionValue',
  type_fire_condition_arrival: 'TypeFireConditionArrivalValue',
  type_aid:                    'TypeAidValue',
  type_aid_direction:          'TypeAidDirectionValue',
  type_aid_nonfd:              'TypeAidNonfdValue',
  type_special_modifier:       'TypeSpecialModifierValue',
  type_incident_status:        'TypeIncidentStatusValue',
  // ── Phase-2 Wave 2 (P2-D1/P2-D2, F26) — fire module + casualty + response sets ──
  type_water_supply:           'TypeWaterSupplyValue',
  type_fire_invest_need:       'TypeFireInvestNeedValue',
  // FirePayload.investigation_types items → $ref TypeFireInvestValue (NOT *InvestTypeValue)
  type_fire_invest_type:       'TypeFireInvestValue',
  type_suppress_appliance:     'TypeSuppressApplianceValue',
  type_fire_bldg_damage:       'TypeFireBldgDamageValue',
  type_room:                   'TypeRoomValue',
  type_fire_cause_in:          'TypeFireCauseInValue',
  type_fire_cause_out:         'TypeFireCauseOutValue',
  type_casualty_cause:         'TypeCasualtyCauseValue',
  type_response_mode:          'TypeResponseModeValue',
  type_displace_cause_incident: 'TypeDisplaceCauseValueRelIncident',
  // ── FP (Fire Protection modules, FP-W2) — alarm/suppression sets ──────────────
  type_alarm_smoke:            'TypeAlarmSmokeValue',
  type_alarm_fire:             'TypeAlarmFireValue',
  type_alarm_other:            'TypeAlarmOtherValue',
  type_alarm_operation:        'TypeAlarmOperationValue',
  type_alarm_failure:          'TypeAlarmFailureValue',
  type_occupant_response:      'TypeOccupantResponseValue',
  type_suppress_fire:          'TypeSuppressFireValue',
  type_full_partial:           'TypeFullPartialValue',
  type_suppress_no_operation:  'TypeSuppressNoOperationValue',
  type_suppress_operation:     'TypeSuppressOperationValue',
  type_suppress_cooking:       'TypeSuppressCookingValue',
};

/**
 * FP-W2: the five Fire Protection modules' official on-screen wording ships INSIDE
 * the spec as x-ui-label / x-ui-hint on the payload schemas. Extracted verbatim so
 * client wording can be drift-tested against the standard's own words (D1 — nothing
 * hand-typed). Shape: [module][field] → [schemaName, propertyName].
 */
const FIRE_PROTECTION_LABEL_SOURCES = {
  smoke_alarm: {
    presence:        ['SmokeAlarmPresentPayload', 'type'],
    working:         ['SmokeAlarmPresentPayload', 'working'],
    alarm_types:     ['SmokeAlarmPresentPayload', 'alarm_types'],
    operation:       ['SmokeAlarmAlertedPayload', 'type'],
    occupant_action: ['SmokeAlarmAlertedPayload', 'occupant_action'],
    failure_reason:  ['SmokeAlarmFailedPayload', 'failure_reason'],
  },
  fire_alarm: {
    presence:       ['FireAlarmPresentPayload', 'type'],
    alarm_types:    ['FireAlarmPresentPayload', 'alarm_types'],
    operation_type: ['FireAlarmPresentPayload', 'operation_type'],
  },
  other_alarm: {
    presence:    ['OtherAlarmPresentPayload', 'type'],
    alarm_types: ['OtherAlarmPresentPayload', 'alarm_types'],
  },
  fire_suppression: {
    presence:             ['FireSuppressionPresentPayload', 'type'],
    suppression_type:     ['FireSuppressionTypePayload', 'type'],
    full_partial:         ['FireSuppressionTypePayload', 'full_partial'],
    operation_type:       ['FireSuppressionEffectivePayload', 'type'],
    sprinklers_activated: ['FireSuppressionEffectivePayload', 'sprinklers_activated'],
    failure_reason:       ['FireSuppressionFailedPayload', 'failure_reason'],
  },
  cooking_fire_suppression: {
    presence:          ['CookingFireSuppressionPresentPayload', 'type'],
    suppression_types: ['CookingFireSuppressionPresentPayload', 'suppression_types'],
    operation_type:    ['CookingFireSuppressionPresentPayload', 'operation_type'],
  },
};

/** All five FP modules share one presence tri-state; extracted from the discriminator. */
const PRESENCE_SOURCE_SCHEMA = 'SmokeAlarmPayload';

async function loadSpec(fromPath) {
  if (fromPath) {
    return { spec: JSON.parse(fs.readFileSync(path.resolve(fromPath), 'utf8')), live: false };
  }
  const res = await fetch(SPEC_URL);
  if (!res.ok) throw new Error(`GET ${SPEC_URL} → HTTP ${res.status}`);
  return { spec: await res.json(), live: true };
}

function extractSets(spec) {
  const schemas = spec && spec.components && spec.components.schemas;
  if (!schemas) throw new Error('spec has no components.schemas — not an OpenAPI document?');
  const version = spec.info && spec.info.version;
  if (!version) throw new Error('spec has no info.version — refusing to emit an unpinned enum file');

  const sets = {};
  const missing = [];
  for (const [key, schemaName] of Object.entries(SETS)) {
    const schema = schemas[schemaName];
    if (!schema || !Array.isArray(schema.enum) || schema.enum.length === 0) {
      missing.push(`${key} (${schemaName})`);
      continue;
    }
    sets[key] = schema.enum.slice();   // verbatim, spec order
  }
  if (missing.length) {
    throw new Error(`spec is missing enum schema(s): ${missing.join(', ')} — the spec may have renamed them; update SETS in this script`);
  }

  // FP-W2: presence tri-state from the discriminator mapping (verbatim key order)
  const presenceSchema = schemas[PRESENCE_SOURCE_SCHEMA];
  const mapping = presenceSchema && presenceSchema.properties && presenceSchema.properties.presence
    && presenceSchema.properties.presence.discriminator
    && presenceSchema.properties.presence.discriminator.mapping;
  if (!mapping || !Object.keys(mapping).length) {
    throw new Error(`spec has no presence discriminator on ${PRESENCE_SOURCE_SCHEMA} — update PRESENCE_SOURCE_SCHEMA`);
  }
  sets.fire_protection_presence = Object.keys(mapping);

  // FP-W2: official x-ui wording, verbatim — never emit a partial label map
  const labels = {};
  const missingLabels = [];
  for (const [module, fields] of Object.entries(FIRE_PROTECTION_LABEL_SOURCES)) {
    labels[module] = {};
    for (const [field, [schemaName, propName]] of Object.entries(fields)) {
      const prop = schemas[schemaName] && schemas[schemaName].properties
        && schemas[schemaName].properties[propName];
      if (!prop || !prop['x-ui-label']) {
        missingLabels.push(`${module}.${field} (${schemaName}.${propName})`);
        continue;
      }
      labels[module][field] = { label: prop['x-ui-label'], hint: prop['x-ui-hint'] || null };
    }
  }
  if (missingLabels.length) {
    throw new Error(`spec is missing x-ui-label(s): ${missingLabels.join(', ')} — update FIRE_PROTECTION_LABEL_SOURCES`);
  }

  return { version, sets, labels };
}

/** Diff two value arrays. Order changes with identical membership are reported as such. */
function diffSet(committed, live) {
  const c = new Set(committed);
  const l = new Set(live);
  const added = live.filter((v) => !c.has(v));
  const removed = committed.filter((v) => !l.has(v));
  if (added.length || removed.length) return { added, removed };
  if (JSON.stringify(committed) !== JSON.stringify(live)) return { added: [], removed: [], reordered: true };
  return null;
}

function check({ version, sets, labels }) {
  if (!fs.existsSync(ENUMS_PATH)) {
    console.error(`✗ no committed enums.json at ${ENUMS_PATH} — run: node scripts/gen-neris-enums.js`);
    process.exit(1);
  }
  const committed = JSON.parse(fs.readFileSync(ENUMS_PATH, 'utf8'));
  let drifted = 0;

  if (committed.spec_version !== version) {
    drifted++;
    console.error(`✗ spec_version drift: committed ${committed.spec_version}, live ${version}`);
  }
  for (const key of Object.keys(sets)) {
    const diff = diffSet(committed.sets[key] || [], sets[key]);
    if (!diff) { console.log(`  ✓ ${key} (${sets[key].length} values)`); continue; }
    drifted++;
    if (diff.reordered) {
      console.error(`  ✗ ${key}: same values, spec order changed`);
    } else {
      console.error(`  ✗ ${key}: +${diff.added.length} / -${diff.removed.length}`);
      for (const v of diff.added) console.error(`      + ${v}`);
      for (const v of diff.removed) console.error(`      - ${v}`);
    }
  }

  // FP-W2: the official wording is a control surface too — drift-check it
  if (JSON.stringify(committed.fire_protection_labels || null) !== JSON.stringify(labels)) {
    drifted++;
    console.error('  ✗ fire_protection_labels: committed wording differs from the spec x-ui-label/x-ui-hint strings');
  } else {
    console.log('  ✓ fire_protection_labels (official wording matches)');
  }

  if (drifted) {
    console.error(`\n${drifted} drift(s) between the committed enums and the live NERIS spec.`);
    console.error('Regenerate: node scripts/gen-neris-enums.js  (then review + rerun tests — a removed value may be in use)');
    process.exit(1);
  }
  console.log(`\n✓ committed enums match the live NERIS spec (v${version}).`);
}

function write({ version, sets, labels }, spec, live) {
  const out = {
    spec_version: version,
    generated_at: new Date().toISOString(),
    source: SPEC_URL,
    sets,
    fire_protection_labels: labels,
  };
  fs.mkdirSync(NERIS_DIR, { recursive: true });
  fs.writeFileSync(ENUMS_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`  ✎ wrote: ${ENUMS_PATH} (spec v${version}, ${Object.keys(sets).length} sets)`);
  if (live) {
    // Keep the vendored snapshot in lockstep with what enums.json was generated from,
    // so a future extraction change can be re-run offline against the same spec rev.
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(spec) + '\n');
    console.log(`  ✎ wrote: ${SNAPSHOT_PATH}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf('--from');
  const fromPath = fromIdx !== -1 ? args[fromIdx + 1] : null;
  if (fromIdx !== -1 && !fromPath) throw new Error('--from requires a file path');

  const { spec, live } = await loadSpec(fromPath);
  const extracted = extractSets(spec);

  if (args.includes('--check')) check(extracted);
  else write(extracted, spec, live);
}

main().catch((err) => {
  console.error(`gen-neris-enums: ${err.message}`);
  process.exit(2);
});
