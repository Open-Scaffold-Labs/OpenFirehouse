'use strict';
/**
 * utils/nerisValidate.js — closed-set validation for the NERIS incident-record
 * axis (Wave 3, docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md D2/D3/D5).
 *
 * These are CONTROL VALUES on a legal record headed for a federal API. Every
 * check is EXACT match against the generated enum layer (constants/neris) —
 * no coercion, no case-folding, no pattern-matching (the /^pass\b/i lesson).
 *
 * SAVE-NEVER-BLOCKED (F12): a body that OMITS a field is valid on that field —
 * drafts stay saveable with no NERIS data at all. null is treated as "clear the
 * field" and is valid. Only a PRESENT-but-invalid value produces an error.
 *
 * Errors name the field and the offending value (the value only — never echo
 * whole payloads).
 */

const {
  isValidIncidentType,
  isValidActionTactic,
  isValidNoaction,
  isValidMedicalPatientCare,
  isValidMedicalTransport,
  isValidMedicalPatientStatus,
  isValidHazardDisposition,
  isValidFireConditionArrival,
  isValidAid,
  isValidAidDirection,
  // Phase-2 Wave 3 (P2-D1/P2-D2) — fire-module + casualty enum sets
  isValidWaterSupply,
  isValidFireInvestNeed,
  isValidFireInvestType,
  isValidSuppressAppliance,
  isValidFireBldgDamage,
  isValidRoom,
  isValidFireCauseIn,
  isValidFireCauseOut,
  isValidCasualtyCause,
  // FP (Fire Protection modules, 0063) — alarm/suppression enum sets
  isValidAlarmSmoke,
  isValidAlarmFire,
  isValidAlarmOther,
  isValidAlarmOperation,
  isValidAlarmFailure,
  isValidOccupantResponse,
  isValidSuppressFire,
  isValidFullPartial,
  isValidSuppressNoOperation,
  isValidSuppressOperation,
  isValidSuppressCooking,
  isValidFireProtectionPresence,
} = require('../constants/neris');

// ── Casualty capture vocabulary (P2-D2) — OUR stored entry shape ─────────────
// {type, injury, cause?, rescue_type?}; the transformer maps these into the
// spec's CasualtyRescuePayload discriminated unions. Small + stable — frozen
// here, exact-matched like everything else.
const CASUALTY_PERSON_TYPES = Object.freeze(['FF', 'NONFF']);
const CASUALTY_INJURY_VALUES = Object.freeze(['INJURED_NONFATAL', 'INJURED_FATAL', 'NONE']);
// Rescue performer branches from the live spec's RescuePayload discriminator.
const FF_RESCUE_TYPES = Object.freeze([
  'RESCUED_BY_FIREFIGHTER', 'RESCUED_BY_FF_RIT', 'EVAC_ASSISTED_BY_FIREFIGHTER',
]);
// How an FF-performed rescue got the person out (FfRescuePayload
// removal_or_nonremoval discriminator values — REMOVAL_FROM_STRUCTURE maps to
// RemovalPayload, the rest to NonremovalPayload).
const REMOVAL_VALUES = Object.freeze([
  'REMOVAL_FROM_STRUCTURE', 'EXTRICATION', 'DISENTANGLEMENT', 'RECOVERY', 'OTHER',
]);
const NONFF_RESCUE_TYPES = Object.freeze([
  'RESCUED_BY_NONFIREFIGHTER', 'SELF_EVACUATION', 'NO_RESCUE_NEEDED',
]);

/** Render a value for an error string without echoing anything bulky. */
function show(v) {
  if (typeof v === 'string') return JSON.stringify(v.length > 120 ? v.slice(0, 120) + '…' : v);
  if (v === null) return 'null';
  if (Array.isArray(v)) return '(array)';
  if (typeof v === 'object') return '(object)';
  return JSON.stringify(v);
}

const present = (v) => v !== undefined && v !== null;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate the NERIS fields of an incident create/update body.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateNerisIncidentFields(body) {
  const errors = [];
  if (!isPlainObject(body)) return { ok: false, errors: ['body must be an object'] };

  // ── neris_incident_types: array of {value, primary}, 1–3, exactly one primary ──
  if (present(body.neris_incident_types)) {
    const t = body.neris_incident_types;
    if (!Array.isArray(t)) {
      errors.push(`neris_incident_types must be an array, got ${show(t)}`);
    } else if (t.length < 1 || t.length > 3) {
      errors.push(`neris_incident_types must have 1-3 entries, got ${t.length}`);
    } else {
      let primaries = 0;
      const seenTypes = new Set();
      t.forEach((entry, i) => {
        // NERIS cross-field rule 7: incident types must be unique.
        if (entry && typeof entry.value === 'string') {
          if (seenTypes.has(entry.value)) {
            errors.push(`neris_incident_types[${i}] is a duplicate type: ${show(entry.value)}`);
          }
          seenTypes.add(entry.value);
        }
        if (!isPlainObject(entry)) {
          errors.push(`neris_incident_types[${i}] must be an object {value, primary}, got ${show(entry)}`);
          return;
        }
        if (!isValidIncidentType(entry.value)) {
          errors.push(`neris_incident_types[${i}].value is not a NERIS incident type: ${show(entry.value)}`);
        }
        if (entry.primary !== undefined && typeof entry.primary !== 'boolean') {
          errors.push(`neris_incident_types[${i}].primary must be a boolean, got ${show(entry.primary)}`);
        }
        if (entry.primary === true) primaries += 1;
      });
      if (primaries !== 1) {
        errors.push(`neris_incident_types must have exactly one primary entry, got ${primaries}`);
      }
    }
  }

  // ── neris_actions: array of action paths, exact-valid, no duplicates ──────────
  if (present(body.neris_actions)) {
    const a = body.neris_actions;
    if (!Array.isArray(a)) {
      errors.push(`neris_actions must be an array, got ${show(a)}`);
    } else {
      const seen = new Set();
      a.forEach((v, i) => {
        if (!isValidActionTactic(v)) {
          errors.push(`neris_actions[${i}] is not a NERIS action/tactic: ${show(v)}`);
        } else if (seen.has(v)) {
          errors.push(`neris_actions[${i}] is a duplicate: ${show(v)}`);
        }
        seen.add(v);
      });
    }
  }

  // ── neris_noaction: the stable 3-value set ────────────────────────────────────
  if (present(body.neris_noaction) && !isValidNoaction(body.neris_noaction)) {
    errors.push(`neris_noaction is not a NERIS noaction value: ${show(body.neris_noaction)}`);
  }

  // ── XOR: acted and no-acted is a contradiction (F3; mirrors the DB CHECK) ────
  if (present(body.neris_noaction)
      && Array.isArray(body.neris_actions) && body.neris_actions.length > 0) {
    errors.push('neris_noaction and a non-empty neris_actions are mutually exclusive');
  }

  // ── neris_medical_details: array of per-patient objects ──────────────────────
  if (present(body.neris_medical_details)) {
    const m = body.neris_medical_details;
    if (!Array.isArray(m)) {
      errors.push(`neris_medical_details must be an array, got ${show(m)}`);
    } else {
      m.forEach((p, i) => {
        if (!isPlainObject(p)) {
          errors.push(`neris_medical_details[${i}] must be an object, got ${show(p)}`);
          return;
        }
        if (present(p.patient_care_evaluation) && !isValidMedicalPatientCare(p.patient_care_evaluation)) {
          errors.push(`neris_medical_details[${i}].patient_care_evaluation is not a NERIS patient-care value: ${show(p.patient_care_evaluation)}`);
        }
        if (present(p.transport_disposition) && !isValidMedicalTransport(p.transport_disposition)) {
          errors.push(`neris_medical_details[${i}].transport_disposition is not a NERIS transport value: ${show(p.transport_disposition)}`);
        }
        if (present(p.patient_status) && !isValidMedicalPatientStatus(p.patient_status)) {
          errors.push(`neris_medical_details[${i}].patient_status is not a NERIS patient-status value: ${show(p.patient_status)}`);
        }
      });
    }
  }

  // ── neris_hazsit_detail: object; disposition + evacuated checked ─────────────
  if (present(body.neris_hazsit_detail)) {
    const h = body.neris_hazsit_detail;
    if (!isPlainObject(h)) {
      errors.push(`neris_hazsit_detail must be an object, got ${show(h)}`);
    } else {
      if (present(h.disposition) && !isValidHazardDisposition(h.disposition)) {
        errors.push(`neris_hazsit_detail.disposition is not a NERIS hazard disposition: ${show(h.disposition)}`);
      }
      if (present(h.evacuated)
          && (!Number.isInteger(h.evacuated) || h.evacuated < 0)) {
        errors.push(`neris_hazsit_detail.evacuated must be a non-negative integer, got ${show(h.evacuated)}`);
      }
    }
  }

  // ── neris_fire_detail: the REAL FirePayload shape (P2-D1) ────────────────────
  // location_detail is the spec's discriminated union: type is EXACTLY 'STRUCTURE'
  // or 'OUTSIDE' (never pattern-matched, never case-folded). Once a branch object
  // is present, its spec-REQUIRED fields must be present AND valid — a half-built
  // branch is not a saveable value. Omitting location_detail (or the whole
  // fire detail) stays valid: drafts remain saveable (F12); the transformer
  // surfaces module completeness at export time.
  if (present(body.neris_fire_detail)) {
    const f = body.neris_fire_detail;
    if (!isPlainObject(f)) {
      errors.push(`neris_fire_detail must be an object, got ${show(f)}`);
    } else {
      // Legacy pre-P2 top-level capture — still exact-matched when present.
      if (present(f.condition_arrival) && !isValidFireConditionArrival(f.condition_arrival)) {
        errors.push(`neris_fire_detail.condition_arrival is not a NERIS fire-condition value: ${show(f.condition_arrival)}`);
      }
      if (present(f.location_detail)) {
        const ld = f.location_detail;
        if (!isPlainObject(ld)) {
          errors.push(`neris_fire_detail.location_detail must be an object, got ${show(ld)}`);
        } else if (ld.type !== 'STRUCTURE' && ld.type !== 'OUTSIDE') {
          errors.push(`neris_fire_detail.location_detail.type must be exactly 'STRUCTURE' or 'OUTSIDE', got ${show(ld.type)}`);
        } else if (ld.type === 'STRUCTURE') {
          if (!Number.isInteger(ld.floor_of_origin)) {
            errors.push(`neris_fire_detail.location_detail.floor_of_origin must be an integer (negative = below grade), got ${show(ld.floor_of_origin)}`);
          }
          if (!isValidFireConditionArrival(ld.arrival_condition)) {
            errors.push(`neris_fire_detail.location_detail.arrival_condition is not a NERIS fire-condition value: ${show(ld.arrival_condition)}`);
          }
          if (!isValidFireBldgDamage(ld.damage_type)) {
            errors.push(`neris_fire_detail.location_detail.damage_type is not a NERIS building-damage value: ${show(ld.damage_type)}`);
          }
          if (!isValidRoom(ld.room_of_origin_type)) {
            errors.push(`neris_fire_detail.location_detail.room_of_origin_type is not a NERIS room value: ${show(ld.room_of_origin_type)}`);
          }
          if (!isValidFireCauseIn(ld.cause)) {
            errors.push(`neris_fire_detail.location_detail.cause is not a NERIS structure-fire cause: ${show(ld.cause)}`);
          }
          if (present(ld.progression_evident) && typeof ld.progression_evident !== 'boolean') {
            errors.push(`neris_fire_detail.location_detail.progression_evident must be a boolean, got ${show(ld.progression_evident)}`);
          }
        } else { // OUTSIDE
          if (!isValidFireCauseOut(ld.cause)) {
            errors.push(`neris_fire_detail.location_detail.cause is not a NERIS outside-fire cause: ${show(ld.cause)}`);
          }
          if (present(ld.acres_burned)
              && (typeof ld.acres_burned !== 'number' || !Number.isFinite(ld.acres_burned) || ld.acres_burned < 0)) {
            errors.push(`neris_fire_detail.location_detail.acres_burned must be a non-negative number, got ${show(ld.acres_burned)}`);
          }
        }
      }
      if (present(f.water_supply) && !isValidWaterSupply(f.water_supply)) {
        errors.push(`neris_fire_detail.water_supply is not a NERIS water-supply value: ${show(f.water_supply)}`);
      }
      if (present(f.investigation_needed) && !isValidFireInvestNeed(f.investigation_needed)) {
        errors.push(`neris_fire_detail.investigation_needed is not a NERIS investigation-needed value: ${show(f.investigation_needed)}`);
      }
      if (present(f.investigation_types)) {
        if (!Array.isArray(f.investigation_types)) {
          errors.push(`neris_fire_detail.investigation_types must be an array, got ${show(f.investigation_types)}`);
        } else {
          f.investigation_types.forEach((v, i) => {
            if (!isValidFireInvestType(v)) {
              errors.push(`neris_fire_detail.investigation_types[${i}] is not a NERIS investigation type: ${show(v)}`);
            }
          });
          // NERIS cross-field rule 12: NONE must be the only item.
          if (f.investigation_types.includes('NONE') && f.investigation_types.length > 1) {
            errors.push('neris_fire_detail.investigation_types: NONE must be the only item when selected');
          }
        }
      }
      if (present(f.suppression_appliances)) {
        if (!Array.isArray(f.suppression_appliances)) {
          errors.push(`neris_fire_detail.suppression_appliances must be an array, got ${show(f.suppression_appliances)}`);
        } else {
          f.suppression_appliances.forEach((v, i) => {
            if (!isValidSuppressAppliance(v)) {
              errors.push(`neris_fire_detail.suppression_appliances[${i}] is not a NERIS suppression appliance: ${show(v)}`);
            }
          });
          // NERIS cross-field rule 13: NONE must be the only item.
          if (f.suppression_appliances.includes('NONE') && f.suppression_appliances.length > 1) {
            errors.push('neris_fire_detail.suppression_appliances: NONE must be the only item when selected');
          }
        }
      }
    }
  }

  // ── neris_casualty_rescues: array of per-person entries (P2-D2) ──────────────
  if (present(body.neris_casualty_rescues)) {
    const c = body.neris_casualty_rescues;
    if (!Array.isArray(c)) {
      errors.push(`neris_casualty_rescues must be an array, got ${show(c)}`);
    } else {
      c.forEach((entry, i) => {
        if (!isPlainObject(entry)) {
          errors.push(`neris_casualty_rescues[${i}] must be an object, got ${show(entry)}`);
          return;
        }
        if (!CASUALTY_PERSON_TYPES.includes(entry.type)) {
          errors.push(`neris_casualty_rescues[${i}].type must be exactly 'FF' or 'NONFF', got ${show(entry.type)}`);
        }
        if (!CASUALTY_INJURY_VALUES.includes(entry.injury)) {
          errors.push(`neris_casualty_rescues[${i}].injury must be INJURED_NONFATAL, INJURED_FATAL, or NONE, got ${show(entry.injury)}`);
        }
        if (present(entry.cause) && !isValidCasualtyCause(entry.cause)) {
          errors.push(`neris_casualty_rescues[${i}].cause is not a NERIS casualty cause: ${show(entry.cause)}`);
        }
        if (present(entry.rescue_type)) {
          // CORRECTED 2026-07-16 (same session it shipped): entry.type is WHO
          // THE PERSON IS; rescue_type is WHO PERFORMED the rescue. The spec
          // allows any combination — a civilian rescued by a firefighter
          // (NONFF person + FF-performed rescue) is the most common rescue in
          // the data. No cross-coupling.
          const isFfRescue = FF_RESCUE_TYPES.includes(entry.rescue_type);
          const isNonFfRescue = NONFF_RESCUE_TYPES.includes(entry.rescue_type);
          if (!isFfRescue && !isNonFfRescue) {
            errors.push(`neris_casualty_rescues[${i}].rescue_type is not a NERIS rescue value: ${show(entry.rescue_type)}`);
          }
          // removal: how a firefighter-performed rescue got the person out —
          // required by the spec's FfRescuePayload, so we capture it whenever
          // the rescue was firefighter-performed.
          if (present(entry.removal)) {
            if (!REMOVAL_VALUES.includes(entry.removal)) {
              errors.push(`neris_casualty_rescues[${i}].removal must be one of ${REMOVAL_VALUES.join(', ')}, got ${show(entry.removal)}`);
            } else if (!isFfRescue) {
              errors.push(`neris_casualty_rescues[${i}].removal only applies to firefighter-performed rescue types, got rescue_type ${show(entry.rescue_type)}`);
            }
          }
        } else if (present(entry.removal)) {
          errors.push(`neris_casualty_rescues[${i}].removal requires a rescue_type`);
        }
      });
    }
  }

  // ── neris_dispatch_times: officer-entered PSAP fallbacks (P2-D4) ─────────────
  if (present(body.neris_dispatch_times)) {
    const t = body.neris_dispatch_times;
    if (!isPlainObject(t)) {
      errors.push(`neris_dispatch_times must be an object, got ${show(t)}`);
    } else {
      for (const k of ['call_answered', 'call_arrival']) {
        if (present(t[k])
            && (typeof t[k] !== 'string' || !Number.isFinite(new Date(t[k]).getTime()))) {
          errors.push(`neris_dispatch_times.${k} must be a parseable date-time string, got ${show(t[k])}`);
        }
      }
    }
  }

  // NOTE: neris_status / neris_review are deliberately NOT validated here —
  // they are ROUTE-OWNED (P2-D6). The incidents routes 422
  // NERIS_STATUS_VIA_ROUTE on any client attempt to write them.

  // ── neris_aids: array of aid objects; direction + type checked ───────────────
  if (present(body.neris_aids)) {
    const aids = body.neris_aids;
    if (!Array.isArray(aids)) {
      errors.push(`neris_aids must be an array, got ${show(aids)}`);
    } else {
      const seenAidIds = new Set();
      aids.forEach((aid, i) => {
        if (!isPlainObject(aid)) {
          errors.push(`neris_aids[${i}] must be an object, got ${show(aid)}`);
          return;
        }
        // NERIS cross-field rule 18: aid entity NERIS IDs must be unique.
        if (typeof aid.department_neris_id === 'string' && aid.department_neris_id) {
          if (seenAidIds.has(aid.department_neris_id)) {
            errors.push(`neris_aids[${i}].department_neris_id is a duplicate: ${show(aid.department_neris_id)}`);
          }
          seenAidIds.add(aid.department_neris_id);
        }
        if (present(aid.aid_direction) && !isValidAidDirection(aid.aid_direction)) {
          errors.push(`neris_aids[${i}].aid_direction is not a NERIS aid direction: ${show(aid.aid_direction)}`);
        }
        if (present(aid.aid_type) && !isValidAid(aid.aid_type)) {
          errors.push(`neris_aids[${i}].aid_type is not a NERIS aid type: ${show(aid.aid_type)}`);
        }
      });
    }
  }

  // ── neris_fire_protection: the five FP module blocks (0063) ──────────────────
  // Stored VERBATIM in the spec's IncidentPayload shape (D2), so validation here
  // mirrors the spec exactly: closed key sets (the API is additionalProperties:
  // false), discriminated unions matched on their const/enum `type`, leaf values
  // exact-matched against the generated enum layer. Save-never-blocked holds —
  // an omitted module is always valid; only present-but-invalid content errors.
  if (present(body.neris_fire_protection)) {
    const fp = body.neris_fire_protection;
    if (!isPlainObject(fp)) {
      errors.push(`neris_fire_protection must be an object, got ${show(fp)}`);
    } else {
      const FP_KEYS = ['smoke_alarm', 'fire_alarm', 'other_alarm', 'fire_suppression', 'cooking_fire_suppression'];
      for (const key of Object.keys(fp)) {
        if (!FP_KEYS.includes(key)) {
          errors.push(`neris_fire_protection.${key} is not a fire-protection module (expected one of ${FP_KEYS.join(', ')})`);
        }
      }
      for (const key of FP_KEYS) {
        if (present(fp[key])) validateFireProtectionModule(key, fp[key], errors);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── FP module validation helpers (0063) ───────────────────────────────────────

/** Closed key-set gate: the spec payloads are additionalProperties:false. */
function checkKeys(path, obj, allowed, errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errors.push(`${path}.${k} is not a spec field (allowed: ${allowed.join(', ')})`);
  }
}

/** Validate one Fire Protection module block against its spec payload shape. */
function validateFireProtectionModule(moduleKey, mod, errors) {
  const p = `neris_fire_protection.${moduleKey}`;
  if (!isPlainObject(mod)) { errors.push(`${p} must be an object, got ${show(mod)}`); return; }
  checkKeys(p, mod, ['presence'], errors);
  const pres = mod.presence;
  if (!isPlainObject(pres)) { errors.push(`${p}.presence must be an object, got ${show(pres)}`); return; }
  if (!isValidFireProtectionPresence(pres.type)) {
    errors.push(`${p}.presence.type must be PRESENT, NOT_PRESENT, or NOT_APPLICABLE, got ${show(pres.type)}`);
    return;
  }
  if (pres.type !== 'PRESENT') {
    // NotPresent payloads carry ONLY the type const.
    checkKeys(`${p}.presence`, pres, ['type'], errors);
    return;
  }
  switch (moduleKey) {
    case 'smoke_alarm': {
      checkKeys(`${p}.presence`, pres, ['type', 'working', 'alarm_types', 'operation'], errors);
      if (present(pres.working) && typeof pres.working !== 'boolean') {
        errors.push(`${p}.presence.working must be a boolean, got ${show(pres.working)}`);
      }
      validateEnumArray(`${p}.presence.alarm_types`, pres.alarm_types, isValidAlarmSmoke, 'smoke-alarm type', errors);
      if (present(pres.operation)) {
        const op = pres.operation;
        if (!isPlainObject(op)) { errors.push(`${p}.presence.operation must be an object, got ${show(op)}`); break; }
        checkKeys(`${p}.presence.operation`, op, ['alerted_failed_other'], errors);
        const afo = op.alerted_failed_other;
        if (!isPlainObject(afo)) { errors.push(`${p}.presence.operation.alerted_failed_other must be an object, got ${show(afo)}`); break; }
        const afoPath = `${p}.presence.operation.alerted_failed_other`;
        if (!isValidAlarmOperation(afo.type)) {
          errors.push(`${afoPath}.type is not a NERIS alarm operation: ${show(afo.type)}`);
        } else if (afo.type === 'OPERATED_ALERTED_OCCUPANT') {
          checkKeys(afoPath, afo, ['type', 'occupant_action'], errors);
          if (present(afo.occupant_action) && !isValidOccupantResponse(afo.occupant_action)) {
            errors.push(`${afoPath}.occupant_action is not a NERIS occupant response: ${show(afo.occupant_action)}`);
          }
        } else if (afo.type === 'FAILED_TO_OPERATE') {
          checkKeys(afoPath, afo, ['type', 'failure_reason'], errors);
          if (present(afo.failure_reason) && !isValidAlarmFailure(afo.failure_reason)) {
            errors.push(`${afoPath}.failure_reason is not a NERIS alarm failure reason: ${show(afo.failure_reason)}`);
          }
        } else {
          // OPERATED_FAILED_TO_ALERT_OCCUPANT / NO_OCCUPANT_TO_NOTIFY / INSUFFICIENT_SOURCE — type only
          checkKeys(afoPath, afo, ['type'], errors);
        }
      }
      break;
    }
    case 'fire_alarm': {
      checkKeys(`${p}.presence`, pres, ['type', 'alarm_types', 'operation_type'], errors);
      validateEnumArray(`${p}.presence.alarm_types`, pres.alarm_types, isValidAlarmFire, 'fire-alarm type', errors);
      if (present(pres.operation_type) && !isValidAlarmOperation(pres.operation_type)) {
        errors.push(`${p}.presence.operation_type is not a NERIS alarm operation: ${show(pres.operation_type)}`);
      }
      break;
    }
    case 'other_alarm': {
      checkKeys(`${p}.presence`, pres, ['type', 'alarm_types'], errors);
      validateEnumArray(`${p}.presence.alarm_types`, pres.alarm_types, isValidAlarmOther, 'other-alarm type', errors);
      break;
    }
    case 'fire_suppression': {
      checkKeys(`${p}.presence`, pres, ['type', 'suppression_types', 'operation_type'], errors);
      if (present(pres.suppression_types)) {
        if (!Array.isArray(pres.suppression_types)) {
          errors.push(`${p}.presence.suppression_types must be an array, got ${show(pres.suppression_types)}`);
        } else {
          pres.suppression_types.forEach((st, i) => {
            const sp = `${p}.presence.suppression_types[${i}]`;
            if (!isPlainObject(st)) { errors.push(`${sp} must be an object {type, full_partial?}, got ${show(st)}`); return; }
            checkKeys(sp, st, ['type', 'full_partial'], errors);
            if (!isValidSuppressFire(st.type)) {
              errors.push(`${sp}.type is not a NERIS suppression system type: ${show(st.type)}`);
            }
            if (present(st.full_partial) && !isValidFullPartial(st.full_partial)) {
              errors.push(`${sp}.full_partial is not a NERIS coverage extent: ${show(st.full_partial)}`);
            }
          });
        }
      }
      if (present(pres.operation_type)) {
        const op = pres.operation_type;
        if (!isPlainObject(op)) { errors.push(`${p}.presence.operation_type must be an object, got ${show(op)}`); break; }
        checkKeys(`${p}.presence.operation_type`, op, ['effectiveness'], errors);
        const eff = op.effectiveness;
        if (!isPlainObject(eff)) { errors.push(`${p}.presence.operation_type.effectiveness must be an object, got ${show(eff)}`); break; }
        const effPath = `${p}.presence.operation_type.effectiveness`;
        if (!isValidSuppressOperation(eff.type)) {
          errors.push(`${effPath}.type is not a NERIS suppression operation: ${show(eff.type)}`);
        } else {
          if (eff.type === 'OPERATED_EFFECTIVE') checkKeys(effPath, eff, ['type', 'sprinklers_activated'], errors);
          else if (eff.type === 'OPERATED_NOT_EFFECTIVE') checkKeys(effPath, eff, ['type', 'sprinklers_activated', 'failure_reason'], errors);
          else checkKeys(effPath, eff, ['type', 'failure_reason'], errors); // NO_OPERATION
          if (present(eff.sprinklers_activated)
              && (!Number.isInteger(eff.sprinklers_activated) || eff.sprinklers_activated < 0)) {
            errors.push(`${effPath}.sprinklers_activated must be a non-negative integer, got ${show(eff.sprinklers_activated)}`);
          }
          if (present(eff.failure_reason) && !isValidSuppressNoOperation(eff.failure_reason)) {
            errors.push(`${effPath}.failure_reason is not a NERIS suppression failure reason: ${show(eff.failure_reason)}`);
          }
        }
      }
      break;
    }
    case 'cooking_fire_suppression': {
      checkKeys(`${p}.presence`, pres, ['type', 'suppression_types', 'operation_type'], errors);
      validateEnumArray(`${p}.presence.suppression_types`, pres.suppression_types, isValidSuppressCooking, 'cooking suppression type', errors);
      // Cooking operation_type is the FLAT enum (TypeSuppressOperationValue) —
      // unlike fire_suppression's nested effectiveness payload. Spec-verified.
      if (present(pres.operation_type) && !isValidSuppressOperation(pres.operation_type)) {
        errors.push(`${p}.presence.operation_type is not a NERIS suppression operation: ${show(pres.operation_type)}`);
      }
      break;
    }
    default: break;
  }
}

/** Validate an optional array of exact-match enum values. */
function validateEnumArray(path, arr, isValid, label, errors) {
  if (!present(arr)) return;
  if (!Array.isArray(arr)) { errors.push(`${path} must be an array, got ${show(arr)}`); return; }
  arr.forEach((v, i) => {
    if (!isValid(v)) errors.push(`${path}[${i}] is not a NERIS ${label}: ${show(v)}`);
  });
}

/** The 10 CLIENT-WRITABLE persisted NERIS fields (kept next to the validator so the
 *  route and the db whitelist can't drift apart silently). neris_status and
 *  neris_review are deliberately NOT here — they are route-owned (P2-D6) and change
 *  only through the status-transition route. */
const NERIS_INCIDENT_FIELDS = Object.freeze([
  'neris_incident_types', 'neris_actions', 'neris_noaction',
  'neris_fire_detail', 'neris_hazsit_detail', 'neris_medical_details', 'neris_aids',
  'neris_casualty_rescues', 'neris_dispatch_times', 'neris_fire_protection',
]);

// ─── Review chain (P2-D6) ─────────────────────────────────────────────────────
// draft → in_review → approved, revertible. The route is the only writer; these
// pure helpers exist so the transition table and the approved-lock are unit-
// testable without HTTP (the guard-on-one-route-only lesson).

const NERIS_STATUS_VALUES = Object.freeze(['draft', 'in_review', 'approved']);

/** The complete transition table. Returns the next status for (action, from),
 *  or null when the pair is not a legal transition (→ 409 INVALID_TRANSITION). */
function nerisStatusTransitionFor(action, from) {
  if (action === 'submit_review' && from === 'draft') return 'in_review';
  if (action === 'approve' && from === 'in_review') return 'approved';
  if (action === 'return_to_draft' && (from === 'in_review' || from === 'approved')) return 'draft';
  return null;
}

/**
 * Approved-lock (F22): while a record is 'approved', its NERIS fields are frozen.
 * Returns { blocked, fields } — blocked=true when the existing record is approved
 * AND the PATCH body touches any client-writable NERIS field. Non-NERIS fields
 * stay editable while approved (the lock is a review lock, not record finality).
 */
function nerisStatusGuard(existingRecord, body) {
  const fields = [];
  if (existingRecord && existingRecord.neris_status === 'approved'
      && body && typeof body === 'object') {
    for (const f of NERIS_INCIDENT_FIELDS) {
      if (body[f] !== undefined) fields.push(f);
    }
  }
  return { blocked: fields.length > 0, fields };
}

/**
 * Append a transition to the neris_review history object (route-owned).
 * Keeps top-level submitted_by/at + reviewed_by/at current alongside the full
 * history array. Pure — the caller persists the result via the CAS UPDATE.
 */
function mergeNerisReview(current, { action, by, by_name, at, notes }) {
  const cur = (current && typeof current === 'object' && !Array.isArray(current)) ? current : {};
  const entry = { action, by, by_name, at };
  if (notes) entry.notes = notes;
  const history = Array.isArray(cur.history) ? cur.history.slice() : [];
  history.push(entry);
  const next = { ...cur, history };
  if (action === 'submit_review') {
    next.submitted_by = by;
    next.submitted_by_name = by_name;
    next.submitted_at = at;
  } else if (action === 'approve') {
    next.reviewed_by = by;
    next.reviewed_by_name = by_name;
    next.reviewed_at = at;
  }
  if (notes) next.notes = notes;
  return next;
}

module.exports = {
  validateNerisIncidentFields,
  NERIS_INCIDENT_FIELDS,
  NERIS_STATUS_VALUES,
  nerisStatusTransitionFor,
  nerisStatusGuard,
  mergeNerisReview,
  // Casualty-capture vocabulary (P2-D2) — exported so the client↔server drift
  // test (nerisClientDataDrift) can assert the UI lists against these exact
  // sets (they have no enums.json entry; this validator is their truth).
  CASUALTY_PERSON_TYPES,
  CASUALTY_INJURY_VALUES,
  FF_RESCUE_TYPES,
  NONFF_RESCUE_TYPES,
  REMOVAL_VALUES,
};
