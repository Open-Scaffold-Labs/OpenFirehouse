// prevention/BillingFeeSchedules.jsx — the rate table, its adoption, and the commit gate.
//
// ── ADOPTED FEE TERMS ARE FROZEN ─────────────────────────────────────────────────────
// A change is a NEW VERSION, enforced by a database trigger. An adopted version shows NO
// edit affordance here at all — not disabled, absent — because the only path onward is
// clone → edit → adopt a successor. There is no un-adopt and no revert-to-draft.
//
// An adopted version cannot exist without naming its adopting INSTRUMENT, its reference,
// the BODY that adopted it and the DATE. That is the answer to a published audit that found
// a schedule in force tracing to a board action seven years earlier, and 5 of 15 sampled
// rate-table entries not matching what the board had approved.
//
// ── THE ENGINE PROPOSES, A PERSON COMMITS ────────────────────────────────────────────
// `calculate` is a DRY RUN that writes nothing and works against a draft — that is how a
// bureau checks a rate table before adopting it. An assessment is a proposal; committing it
// is a separate act by a separate role, and committing a DIFFERENT amount demands a written
// reason. The audit behind that gate found $11,127 of fee error across 34 permits, in both
// directions.
//
// 🟡 THE BREAKDOWN PANEL IS A DELIBERATE DEPARTURE, FLAGGED NOT SMUGGLED. The one
// documented fire product shows a clerk only a total; the adjacent civic-permitting market
// does surface the formula. It is built here because a commit gate is meaningless if the
// person cannot see what they are ratifying, and because the server already computes and
// stores `computed_breakdown` — withholding it hides the basis of a money decision from its
// approver. It is one component and is cheap to remove if that call goes the other way.
//
// ── A $0 IS NEVER A FALLBACK ─────────────────────────────────────────────────────────
// When the engine cannot compute, it returns errors and NO total. This screen shows those
// errors. It never renders an unknown as zero.
//
// ── TIERS AND MODIFIERS HAVE NO EDIT OR DELETE ───────────────────────────────────────
// The API is POST-only for both, even on a draft. Offering a button whose every press is
// refused is the pre-3.1a defect, so those affordances do not exist. Correcting a mistyped
// tier means deleting the parent item and re-adding it — the screen says so.
import React, { useState, useEffect, useCallback } from 'react';
import { Calculator, Plus, CheckCircle2, AlertTriangle, Landmark, Trash2 } from 'lucide-react';
import { fi, localToday } from './fiApi';
import { fmtMoney, fmtQty, fmtRate, toCents } from './money';
import { describeStep, modifierValueIsMoney } from './feeSteps';
import { itemReady, tierReady, modifierReady } from './feeForm';
import {
  Section, Field, Input, Select, TextArea, Btn, Badge, Modal, EmptyState, Spinner,
} from './ui';

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');

const KINDS = [
  ['flat', 'Flat amount'],
  ['tiered', 'Tiered lookup'],
  ['valuation', 'Construction valuation'],
  ['hourly', 'Hours × rate'],
  ['percent_of', 'Percentage of another line'],
  ['surcharge', 'Surcharge'],
];

// The closed set the engine accepts. A variable not on this list is a refusal, not a zero.
const VARIABLES = [
  'square_footage', 'occupant_load', 'stories', 'sprinkler_heads', 'alarm_devices',
  'smoke_heat_vents', 'gate_count', 'tank_count', 'chemical_count', 'licensed_beds',
  'students', 'apartment_units', 'hotel_rooms', 'hazmat_quantity', 'construction_valuation',
  'job_material_cost', 'acres', 'outside_storage_area', 'hours', 'occupancy_group',
];

const INSTRUMENTS = [
  ['ordinance', 'Ordinance'],
  ['ordinance_exhibit', 'Ordinance + Exhibit A'],
  ['code_appendix', 'Code appendix'],
  ['board_resolution', 'Board resolution'],
  ['resolution_under_enabling_ordinance', 'Resolution under an enabling ordinance'],
];

const label = (v) => String(v || '').replace(/_/g, ' ');

function refusalMessage(e, fallback) {
  const byCode = {
    FEE_NOT_COMPUTABLE: 'The fee could not be computed — nothing was assumed to be zero. See below.',
    NO_EFFECTIVE_VERSION: 'No adopted version of that schedule was in force on the vesting date.',
    AMBIGUOUS_EFFECTIVE_VERSION: 'Two adopted versions overlap that date. A person has to resolve that before a fee can be computed.',
    VERSION_UNRESOLVED: 'Choose a schedule or a version first.',
    DRAFT_NOT_CHARGEABLE: 'A draft can be calculated against, but it cannot charge anyone. Adopt it first.',
    EMPTY_VERSION: 'A version with no fee lines cannot be adopted.',
    NOT_A_DRAFT: 'That version is already adopted. Adopted terms are frozen — clone it to make a change.',
    VERSION_FROZEN: 'That version is adopted and cannot be edited. Clone it, edit the clone, adopt that.',
    CODE_IMMUTABLE: 'A fee line’s code cannot be changed. Delete it and add it under the new code.',
    REFERENCED: 'Another fee line is calculated from this one. Remove that line first.',
    DUPLICATE_CODE: 'This version already has a line with that code.',
    DUPLICATE_NAME: 'A schedule with that name already exists.',
    DUPLICATE_VERSION: 'A version already starts on that date.',
    DUPLICATE_SEQ: 'That step number is already used on this line.',
    PENALTY_OUT_OF_BAND: 'The work-without-a-permit multiplier has to be between 1.5 and 4.0.',
    EFFECTIVE_FROM_NOT_AFTER: 'A new version has to start after the one it supersedes.',
    ALREADY_OPEN: 'Another adopted version is already open-ended from that date.',
    ALREADY_COMMITTED: 'That charge is already committed. A committed charge is corrected by a new linked record, never in place.',
    ALREADY_WAIVED: 'That charge has already been waived.',
    OVERRIDE_REASON_REQUIRED: 'Committing a different amount from the computed one needs a written reason.',
    SECOND_APPROVER_REQUIRED: 'This waiver is at or above the department’s approval threshold and needs a second named approver.',
    REINSPECTION_REASON_REQUIRED: 'A re-inspection fee needs an inspector’s reason code — it cannot be read off the inspection result.',
    SUBJECT_REQUIRED: 'Attach this to exactly one permit or one inspection.',
    SUBJECT_NOT_FOUND: 'That permit or inspection is no longer on record.',
    INCONSISTENT_FEE_DEFINITION: 'That combination of fields is not a fee this engine can evaluate. See below.',
    BASE_ITEM_OFF_VERSION: 'A percentage line can only reference another line in the same version.',
    UNCLONEABLE_CHAIN: 'Part of this version chains in a way the cloner cannot reproduce.',
    NOT_FOUND: 'That record is no longer on file.',
    FORBIDDEN_FI: 'That action needs a prevention-admin designation (or chief authority).',
  };
  return byCode[e?.code] || e?.message || fallback;
}

function Refusal({ error }) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-red-800 dark:text-red-300">{error.message}</p>
        {error.details?.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-sm text-red-800 dark:text-red-300">
            {error.details.map((d, i) => <li key={i}>• {d}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function BillingFeeSchedules({ fiCtx }) {
  const [schedules, setSchedules] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [openSchedule, setOpenSchedule] = useState(null);
  const [creating, setCreating] = useState(false);
  const [calc, setCalc] = useState(false);

  const admin = !!fiCtx?.isPreventionAdmin;
  const inspector = !!fiCtx?.isInspector;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fi.fees.schedules();
      setSchedules(r?.data || []);
      setError(null);
    } catch (e) { setError(e.message || 'Could not load the fee schedules.'); }
    finally { setLoading(false); setFirstLoad(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && firstLoad) return <Spinner label="Opening the fee schedules…" />;

  return (
    <div className="space-y-4">
      <Section
        title="Fee schedules"
        subtitle="What this bureau charges, and the instrument that adopted it. Adopted terms are frozen — a change is a new version."
        actions={
          <div className="flex gap-2">
            {inspector && <Btn onClick={() => setCalc(true)}><Calculator size={16} aria-hidden="true" /> Try a calculation</Btn>}
            {admin && <Btn variant="primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> New schedule</Btn>}
          </div>
        }
      >
        {typeof error === 'string' && <Refusal error={{ message: error }} />}

        {schedules.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No fee schedule yet"
            body="A schedule holds the rates this bureau charges. It starts as a draft you can calculate against, and becomes chargeable when it is formally adopted — naming the ordinance or resolution that adopted it."
            action={admin ? <Btn variant="primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> Create one</Btn> : null}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {schedules.map((s) => (
              <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <button type="button" onClick={() => setOpenSchedule(s)}
                    className="font-bold text-red-700 dark:text-red-400 hover:underline truncate max-w-full">
                    {s.name}
                  </button>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {s.version_count} version{s.version_count === 1 ? '' : 's'}
                    {s.current_version
                      ? ` · in force from ${fmtDate(s.current_version.effective_from)}${s.current_version.effective_to ? ` to ${fmtDate(s.current_version.effective_to)}` : ''}`
                      : ' · nothing adopted yet'}
                  </p>
                  {s.current_version?.adopting_instrument && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Adopted by {label(s.current_version.adopting_instrument)} {s.current_version.adopting_instrument_ref}
                      {s.current_version.adopted_on ? ` on ${fmtDate(s.current_version.adopted_on)}` : ''}
                      {s.current_version.adopted_by ? ` · ${s.current_version.adopted_by}` : ''}
                    </p>
                  )}
                </div>
                <Badge tone={s.current_version ? 'green' : 'amber'}>
                  {s.current_version ? `v${s.current_version.version} adopted` : 'draft only'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Assessments fiCtx={fiCtx} schedules={schedules} />

      {openSchedule && (
        <ScheduleVersions schedule={openSchedule} admin={admin}
          onClose={() => setOpenSchedule(null)} onChanged={load} />
      )}
      {creating && <NewSchedule onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
      {calc && <CalculatePreview schedules={schedules} onClose={() => setCalc(false)} />}
    </div>
  );
}

function NewSchedule({ onClose, onDone }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState(localToday());
  const [multiplier, setMultiplier] = useState('2.00');
  const [stacking, setStacking] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const b = { name: name.trim(), effective_from: from, penalty_stacking_allowed: stacking };
      // Omitted when blank rather than sent as '' — the server COALESCEs to 2.00, and ''
      // fails the decimal-string regex with a 400 that the form never warned about.
      if (multiplier.trim()) b.penalty_multiplier = multiplier.trim();
      await fi.fees.createSchedule(b);
      onDone();
    } catch (e) { setError({ message: refusalMessage(e, 'Could not create the schedule.'), details: e.details }); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="New fee schedule" onClose={onClose}>
      <Refusal error={error} />
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
            placeholder="Operational permit fees" />
        </Field>
        <Field label="First version starts" hint="It is created as a DRAFT. You can calculate against it, but it cannot charge anyone until it is adopted.">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Work-without-a-permit multiplier"
          hint="Between 1.5 and 4.0. Most adopted schedules use 2.0.">
          <Input value={multiplier} onChange={(e) => setMultiplier(e.target.value)} inputMode="decimal" className="w-32" />
        </Field>
        <label className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-300">
          <input type="checkbox" className="h-4 w-4" checked={stacking} onChange={(e) => setStacking(e.target.checked)} />
          The penalty stacks on top of other penalties
        </label>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!name.trim() || !from || busy} onClick={submit}>
            {busy ? 'Creating…' : 'Create schedule'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Versions of one schedule, and the detail of one version ──────────────────────────
function ScheduleVersions({ schedule, admin, onClose, onChanged }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [openVersion, setOpenVersion] = useState(null);
  const [cloning, setCloning] = useState(null);

  const load = useCallback(async () => {
    try { setVersions((await fi.fees.versions(schedule.id)).data || []); setError(null); }
    catch (e) { setError(refusalMessage(e, 'Could not load the versions.')); }
  }, [schedule.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Modal title={schedule.name} onClose={onClose} wide>
        {error && <Refusal error={{ message: error }} />}
        {!versions && !error && <Spinner label="Loading versions…" />}
        {versions && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Each version is the schedule as it stood for a period. Adopted versions are frozen —
              to change a rate, clone the version, edit the clone, and adopt that.
            </p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {versions.map((v) => (
                <li key={v.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => setOpenVersion(v)}
                      className="font-bold text-red-700 dark:text-red-400 hover:underline">
                      Version {v.version}
                    </button>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {fmtDate(v.effective_from)} → {v.effective_to ? fmtDate(v.effective_to) : 'open'}
                      {' · penalty ×'}{v.penalty_multiplier}{v.penalty_stacking_allowed ? ', stacking' : ''}
                    </p>
                    {v.status === 'Adopted' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {label(v.adopting_instrument)} {v.adopting_instrument_ref} · adopted {fmtDate(v.adopted_on)} by {v.adopted_by}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone={v.status === 'Adopted' ? 'green' : 'amber'}>{v.status}</Badge>
                    {admin && <Btn onClick={() => setCloning(v)}>Clone</Btn>}
                  </div>
                </li>
              ))}
            </ul>
            {admin && (
              <div className="flex justify-end">
                <Btn onClick={() => setCloning({ id: null })}><Plus size={16} aria-hidden="true" /> Empty new version</Btn>
              </div>
            )}
          </div>
        )}
      </Modal>

      {openVersion && (
        <VersionDetail versionId={openVersion.id} admin={admin}
          onClose={() => setOpenVersion(null)}
          onChanged={() => { load(); onChanged?.(); }} />
      )}
      {cloning && (
        <NewVersion scheduleId={schedule.id} cloneFrom={cloning.id}
          onClose={() => setCloning(null)}
          onDone={() => { setCloning(null); load(); onChanged?.(); }} />
      )}
    </>
  );
}

function NewVersion({ scheduleId, cloneFrom, onClose, onDone }) {
  const [from, setFrom] = useState(localToday());
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const body = { effective_from: from };
      if (cloneFrom) body.clone_from_version_id = cloneFrom;
      await fi.fees.createVersion(scheduleId, body);
      onDone();
    } catch (e) { setError({ message: refusalMessage(e, 'Could not create the version.'), details: e.details }); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={cloneFrom ? 'Clone this version' : 'New empty version'} onClose={onClose}>
      <Refusal error={error} />
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {cloneFrom
            ? 'Every fee line is copied into a new DRAFT you can edit. The version you cloned is untouched.'
            : 'A new DRAFT with no fee lines. It cannot be adopted until it has at least one.'}
        </p>
        <Field label="Starts on" hint="Has to be after the version it supersedes.">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!from || busy} onClick={submit}>{busy ? 'Creating…' : 'Create draft'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function VersionDetail({ versionId, admin, onClose, onChanged }) {
  const [v, setV] = useState(null);
  const [error, setError] = useState(null);
  const [adopting, setAdopting] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addingTo, setAddingTo] = useState(null); // { item, what: 'tier' | 'modifier' }

  const load = useCallback(async () => {
    try { setV((await fi.fees.version(versionId)).data); setError(null); }
    catch (e) { setError(refusalMessage(e, 'Could not open that version.')); }
  }, [versionId]);

  useEffect(() => { load(); }, [load]);

  const draft = v?.status === 'Draft';
  const canEdit = admin && draft;

  const removeItem = async (item) => {
    setError(null);
    try { await fi.fees.deleteItem(versionId, item.id); await load(); onChanged?.(); }
    catch (e) { setError(refusalMessage(e, 'Could not remove that line.')); }
  };

  return (
    <>
      <Modal title={v ? `Version ${v.version}` : 'Version'} onClose={onClose} wide>
        {error && <Refusal error={{ message: error }} />}
        {!v && !error && <Spinner label="Loading the version…" />}
        {v && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge tone={draft ? 'amber' : 'green'}>{v.status}</Badge>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {fmtDate(v.effective_from)} → {v.effective_to ? fmtDate(v.effective_to) : 'open'}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <Btn onClick={() => setAddingItem(true)}><Plus size={16} aria-hidden="true" /> Add a fee line</Btn>
                  <Btn variant="primary" disabled={!(v.items || []).length} onClick={() => setAdopting(true)}>
                    <CheckCircle2 size={16} aria-hidden="true" /> Adopt
                  </Btn>
                </div>
              )}
            </div>

            {!draft && (
              <p className="text-sm text-gray-600 dark:text-gray-400 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
                This version is <strong>adopted and frozen</strong>. Rates in force are not editable — clone
                it, edit the clone, and adopt that. Permits priced under this version keep pointing here.
              </p>
            )}

            {(v.items || []).length === 0 ? (
              <EmptyState icon={Landmark} title="No fee lines yet"
                body="A version needs at least one line before it can be adopted." />
            ) : (
              <ul className="space-y-3">
                {v.items.map((it) => (
                  <li key={it.id} className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-gray-100 truncate">
                          <span className="font-mono text-xs mr-2 text-gray-500 dark:text-gray-400">{it.code}</span>
                          {it.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {label(it.kind)}
                          {it.flat_amount ? ` · ${fmtMoney(it.flat_amount)}` : ''}
                          {it.hourly_rate ? ` · ${fmtMoney(it.hourly_rate)}/hr, minimum ${it.minimum_hours || '0'} hr` : ''}
                          {it.percent_rate ? ` · ${fmtQty(it.percent_rate)}%` : ''}
                          {it.input_variable ? ` · by ${label(it.input_variable)}` : ''}
                          {it.surchargeable === false ? ' · surcharges do not apply' : ''}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex gap-2 shrink-0">
                          <Btn onClick={() => setAddingTo({ item: it, what: 'tier' })}>Add tier</Btn>
                          <Btn onClick={() => setAddingTo({ item: it, what: 'modifier' })}>Add step</Btn>
                          <Btn variant="danger" onClick={() => removeItem(it)} aria-label={`Remove ${it.code}`}>
                            <Trash2 size={16} aria-hidden="true" />
                          </Btn>
                        </div>
                      )}
                    </div>

                    {(it.tiers || []).length > 0 && (
                      <ul className="mt-2 text-sm space-y-0.5">
                        {it.tiers.map((t) => (
                          <li key={t.id} className="flex justify-between gap-2 text-gray-700 dark:text-gray-300">
                            <span className="truncate">
                              {t.axis1_match ? t.axis1_match : `${t.axis1_min ?? '−∞'} – ${t.axis1_max ?? '∞'}`}
                              {/* per_unit is NUMERIC(12,4), NOT (12,2) — fmtMoney refuses a
                                  4dp string and rendered every one of these as a dash. */}
                              {t.per_unit ? ` · +${fmtRate(t.per_unit)} per ${fmtQty(t.unit_size)} (${label(t.per_unit_basis)})` : ''}
                            </span>
                            <span className="tabular-nums shrink-0">{fmtMoney(t.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(it.modifiers || []).length > 0 && (
                      <ul className="mt-2 text-sm space-y-0.5">
                        {it.modifiers.map((m) => (
                          <li key={m.id} className="text-gray-700 dark:text-gray-300">
                            {/* `value` is NUMERIC(16,4) and means dollars for four of the six
                                kinds and a percentage for the other two. Rendered raw, "50"
                                was indistinguishable between $50 and 50% on the one screen
                                whose purpose is checking a rate table against the ordinance. */}
                            step {m.seq}: {label(m.kind)}{' '}
                            {modifierValueIsMoney(m.kind)
                              ? fmtRate(m.value)
                              : `${fmtQty(m.value)}${String(m.kind).startsWith('percent') ? '%' : ''}`}
                            {m.note ? ` — ${m.note}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canEdit && ((it.tiers || []).length > 0 || (it.modifiers || []).length > 0) && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Tiers and steps can be added but not edited or removed. To correct one, remove
                        this whole fee line and add it again.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      {adopting && <AdoptVersion versionId={versionId} onClose={() => setAdopting(false)}
        onDone={() => { setAdopting(false); load(); onChanged?.(); }} />}
      {addingItem && <NewItem versionId={versionId} onClose={() => setAddingItem(false)}
        onDone={() => { setAddingItem(false); load(); onChanged?.(); }} />}
      {addingTo && <NewTierOrModifier versionId={versionId} item={addingTo.item} what={addingTo.what}
        onClose={() => setAddingTo(null)} onDone={() => { setAddingTo(null); load(); onChanged?.(); }} />}
    </>
  );
}

function AdoptVersion({ versionId, onClose, onDone }) {
  const [f, setF] = useState({
    adopting_instrument: 'ordinance', adopting_instrument_ref: '',
    adopted_by: '', adopted_on: localToday(),
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await fi.fees.adopt(versionId, {
        adopting_instrument: f.adopting_instrument,
        adopting_instrument_ref: f.adopting_instrument_ref.trim(),
        adopted_by: f.adopted_by.trim(),
        adopted_on: f.adopted_on,
      });
      onDone();
    } catch (e) { setError({ message: refusalMessage(e, 'Could not adopt the version.'), details: e.details }); }
    finally { setBusy(false); }
  };

  const ready = f.adopting_instrument_ref.trim() && f.adopted_by.trim() && f.adopted_on;

  return (
    <Modal title="Adopt this version" onClose={onClose}>
      <Refusal error={error} />
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Adoption makes these rates chargeable and <strong>freezes them permanently</strong>. All four
          fields are required: a rate table nobody can trace to a board action is the finding an audit
          writes up.
        </p>
        <Field label="Adopted by what instrument">
          <Select value={f.adopting_instrument} onChange={set('adopting_instrument')}>
            {INSTRUMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Its reference" hint="The ordinance or resolution number, exactly as adopted.">
          <Input value={f.adopting_instrument_ref} onChange={set('adopting_instrument_ref')} maxLength={200} />
        </Field>
        <Field label="Adopting body" hint="Who adopted it — the council, the board, the commission.">
          <Input value={f.adopted_by} onChange={set('adopted_by')} maxLength={200} />
        </Field>
        <Field label="Date adopted">
          <Input type="date" value={f.adopted_on} onChange={set('adopted_on')} />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!ready || busy} onClick={submit}>{busy ? 'Adopting…' : 'Adopt it'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// A fee line. The fields shown depend on the kind — the server's CHECK constraints reject
// an inconsistent combination outright, so offering every field for every kind would just be
// a longer road to a 422.
function NewItem({ versionId, onClose, onDone }) {
  const [f, setF] = useState({
    code: '', name: '', kind: 'flat', flat_amount: '', hourly_rate: '', minimum_hours: '0',
    rounding_increment_hours: '', rounding_mode: 'up_any_part', after_hours_multiplier: '',
    percent_rate: '', input_variable: '', input_item_id: '', surchargeable: true,
    min_amount: '', max_amount: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      // Key by key: the schema is STRICT, and an empty string is not the same as omitting.
      const b = { code: f.code.trim().toUpperCase(), name: f.name.trim(), kind: f.kind };
      // 🔴 A SURCHARGE MAY NEVER BE SURCHARGEABLE — CHECK (NOT (kind='surcharge' AND
      // surchargeable)). The server already defaults this correctly; sending the key
      // unconditionally DEFEATED that default, so choosing "Surcharge" was a guaranteed 422
      // with no way to succeed from the form. Omit it and let the server decide.
      if (f.kind !== 'surcharge') b.surchargeable = f.surchargeable;
      if (f.kind === 'flat' && f.flat_amount.trim()) b.flat_amount = f.flat_amount.trim();
      if (f.kind === 'hourly') {
        if (f.hourly_rate.trim()) b.hourly_rate = f.hourly_rate.trim();
        b.minimum_hours = (f.minimum_hours || '0').trim();
        b.rounding_mode = f.rounding_mode;
        if (f.rounding_increment_hours.trim()) b.rounding_increment_hours = f.rounding_increment_hours.trim();
        if (f.after_hours_multiplier.trim()) b.after_hours_multiplier = f.after_hours_multiplier.trim();
      }
      // A surcharge is also a percentage — CHECK (kind <> 'surcharge' OR percent_rate IS NOT
      // NULL). The form used to show the percentage field only for percent_of, so the second
      // constraint failed too.
      if (f.kind === 'percent_of' || f.kind === 'surcharge') {
        if (f.percent_rate.trim()) b.percent_rate = f.percent_rate.trim();
      }
      if (f.kind === 'percent_of' && f.input_item_id) b.input_item_id = Number(f.input_item_id);
      if ((f.kind === 'tiered' || f.kind === 'valuation') && f.input_variable) b.input_variable = f.input_variable;
      if (f.min_amount.trim()) b.min_amount = f.min_amount.trim();
      if (f.max_amount.trim()) b.max_amount = f.max_amount.trim();
      await fi.fees.addItem(versionId, b);
      onDone();
    } catch (e) { setError({ message: refusalMessage(e, 'Could not add the fee line.'), details: e.details }); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Add a fee line" onClose={onClose} wide>
      <Refusal error={error} />
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Short and stable — it cannot be changed later.">
            <Input value={f.code} onChange={(e) => setF((s) => ({ ...s, code: e.target.value.toUpperCase() }))} maxLength={60} />
          </Field>
          <Field label="Name" hint="What a payer will read on the invoice.">
            <Input value={f.name} onChange={set('name')} maxLength={200} />
          </Field>
        </div>
        <Field label="How it is calculated">
          <Select value={f.kind} onChange={set('kind')}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>

        {f.kind === 'flat' && (
          <Field label="Amount"><Input value={f.flat_amount} onChange={set('flat_amount')} inputMode="decimal" placeholder="250.00" className="w-40 text-right" /></Field>
        )}

        {(f.kind === 'tiered' || f.kind === 'valuation') && (
          <Field label="Measured by"
            hint="The quantity the tiers are looked up on. Add the tiers themselves after saving this line.">
            <Select value={f.input_variable} onChange={set('input_variable')}>
              <option value="">Choose…</option>
              {VARIABLES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
            </Select>
          </Field>
        )}

        {f.kind === 'hourly' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rate per hour"><Input value={f.hourly_rate} onChange={set('hourly_rate')} inputMode="decimal" placeholder="200.00" className="text-right" /></Field>
            <Field label="Minimum hours" hint="Some schedules monetise with a floor instead of a multiplier. Both are expressible.">
              <Input value={f.minimum_hours} onChange={set('minimum_hours')} inputMode="decimal" className="text-right" />
            </Field>
            <Field label="Billed in increments of" hint="e.g. 0.25 for “per quarter hour or part thereof”. Blank for none.">
              <Input value={f.rounding_increment_hours} onChange={set('rounding_increment_hours')} inputMode="decimal" className="text-right" />
            </Field>
            <Field label="Rounding">
              <Select value={f.rounding_mode} onChange={set('rounding_mode')}>
                <option value="up_any_part">Up, any part of an increment</option>
                <option value="nearest">To the nearest</option>
                <option value="down">Down</option>
                <option value="none">No rounding</option>
              </Select>
            </Field>
            <Field label="After-hours multiplier" hint="Blank if this schedule has none.">
              <Input value={f.after_hours_multiplier} onChange={set('after_hours_multiplier')} inputMode="decimal" className="text-right" />
            </Field>
          </div>
        )}

        {(f.kind === 'percent_of' || f.kind === 'surcharge') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Percentage" hint="e.g. 25 for 25%."><Input value={f.percent_rate} onChange={set('percent_rate')} inputMode="decimal" className="text-right" /></Field>
            {f.kind === 'percent_of' && (
              <Field label="Of which line" hint="The id of another line in THIS version. Chaining is the norm in adopted schedules.">
                <Input value={f.input_item_id} onChange={set('input_item_id')} inputMode="numeric" />
              </Field>
            )}
          </div>
        )}
        {f.kind === 'surcharge' && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            A surcharge applies to the lines that are marked surchargeable — and never to itself.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Never less than" hint="Optional floor."><Input value={f.min_amount} onChange={set('min_amount')} inputMode="decimal" className="text-right" /></Field>
          <Field label="Never more than" hint="Optional cap."><Input value={f.max_amount} onChange={set('max_amount')} inputMode="decimal" className="text-right" /></Field>
        </div>

        {f.kind !== 'surcharge' && (
          <>
            <label className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-300">
              <input type="checkbox" className="h-4 w-4" checked={f.surchargeable}
                onChange={(e) => setF((s) => ({ ...s, surchargeable: e.target.checked }))} />
              Surcharges apply to this line
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Surcharge applicability is per LINE, not per invoice — a flat percentage of the invoice
              total is wrong in at least two adopted schedules.
            </p>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!itemReady(f) || busy} onClick={submit}>
            {busy ? 'Adding…' : 'Add the line'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function NewTierOrModifier({ versionId, item, what, onClose, onDone }) {
  const isTier = what === 'tier';
  const [f, setF] = useState({
    axis1_min: '', axis1_max: '', axis1_match: '', amount: '',
    per_unit: '', unit_size: '', per_unit_basis: '',
    seq: '1', kind: 'percent_add', value: '', note: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (isTier) {
        const b = { amount: f.amount.trim() };
        if (f.axis1_match.trim()) b.axis1_match = f.axis1_match.trim();
        if (f.axis1_min.trim()) b.axis1_min = f.axis1_min.trim();
        if (f.axis1_max.trim()) b.axis1_max = f.axis1_max.trim();
        // per_unit and per_unit_basis travel together — the server refuses one without
        // the other, because "$15 per 1,000 sq ft" is two different fees depending on it.
        // per_unit, unit_size and the basis travel TOGETHER or not at all. Postgres enforces
        // the first pair — CHECK ((per_unit IS NULL) = (unit_size IS NULL)) — and the basis
        // is never defaulted, because an unchosen default here is worth $75 a permit.
        if (f.per_unit.trim()) {
          b.per_unit = f.per_unit.trim();
          b.unit_size = f.unit_size.trim();
          b.per_unit_basis = f.per_unit_basis;
        }
        await fi.fees.addTier(versionId, item.id, b);
      } else {
        const b = { seq: Number(f.seq), kind: f.kind, value: f.value.trim() };
        if (f.note.trim()) b.note = f.note.trim();
        await fi.fees.addModifier(versionId, item.id, b);
      }
      onDone();
    } catch (e) { setError({ message: refusalMessage(e, 'Could not add it.'), details: e.details }); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={isTier ? `Add a tier to ${item.code}` : `Add a step to ${item.code}`} onClose={onClose}>
      <Refusal error={error} />
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This cannot be edited or removed afterwards. To correct it, remove the whole fee line and
          add it again.
        </p>
        {isTier ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" hint="Lower bound of the band. Blank for open."><Input value={f.axis1_min} onChange={set('axis1_min')} inputMode="decimal" className="text-right" /></Field>
              <Field label="To" hint="Upper bound. Blank for open."><Input value={f.axis1_max} onChange={set('axis1_max')} inputMode="decimal" className="text-right" /></Field>
            </div>
            <Field label="Or an exact match" hint="For a categorical axis such as occupancy group. Leave the band blank if you use this.">
              <Input value={f.axis1_match} onChange={set('axis1_match')} maxLength={60} />
            </Field>
            <Field label="Amount"><Input value={f.amount} onChange={set('amount')} inputMode="decimal" placeholder="250.00" className="w-40 text-right" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Plus, per unit" hint="Optional."><Input value={f.per_unit} onChange={set('per_unit')} inputMode="decimal" className="text-right" /></Field>
              <Field label="Unit size"
                hint={f.per_unit.trim() && !f.unit_size.trim()
                  ? 'Required once a per-unit rate is set — “per what?” has no default.'
                  : 'e.g. 1000 for “per 1,000 sq ft”.'}>
                <Input value={f.unit_size} onChange={set('unit_size')} inputMode="decimal" className="text-right" />
              </Field>
            </div>
            {f.per_unit.trim() && (
              <Field label="Charged on"
                hint="“$250 plus $15 per 1,000 sq ft” is $370 or $295 on the same building depending on this. There is no default — choose.">
                <Select value={f.per_unit_basis} onChange={set('per_unit_basis')}>
                  <option value="">Choose…</option>
                  <option value="whole_quantity">The whole quantity</option>
                  <option value="excess_above_floor">Only the excess above the band’s floor</option>
                </Select>
              </Field>
            )}
          </>
        ) : (
          <>
            <Field label="Step number" hint="Steps run in order; chaining is the norm.">
              <Input value={f.seq} onChange={set('seq')} inputMode="numeric" className="w-24" />
            </Field>
            <Field label="What it does">
              <Select value={f.kind} onChange={set('kind')}>
                <option value="percent_add">Add a percentage</option>
                <option value="percent_multiply">Multiply by a percentage</option>
                <option value="amount_add">Add an amount</option>
                <option value="per_unit_add">Add per unit</option>
                <option value="floor">Never less than</option>
                <option value="cap">Never more than</option>
              </Select>
            </Field>
            <Field label="Value"><Input value={f.value} onChange={set('value')} inputMode="decimal" className="w-40 text-right" /></Field>
            <Field label="Note" hint="Optional — what the adopted schedule calls this step.">
              <Input value={f.note} onChange={set('note')} maxLength={500} />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={busy || !(isTier ? tierReady(f) : modifierReady(f))} onClick={submit}>
            {busy ? 'Adding…' : 'Add it'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── The breakdown. See §0.3(d) of the Slice D spec: this exceeds the documented fire bar
// and matches the adjacent one, deliberately, because a commit gate is meaningless if the
// person cannot see what they are ratifying.
function Breakdown({ result }) {
  if (!result) return null;
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <colgroup><col className="w-[18%]" /><col className="w-[54%]" /><col className="w-[28%]" /></colgroup>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            <th scope="col" className="px-3 py-2 font-semibold truncate">Code</th>
            <th scope="col" className="px-3 py-2 font-semibold truncate">How it was worked out</th>
            <th scope="col" className="px-3 py-2 font-semibold truncate text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {(result.lines || []).map((l) => (
            <tr key={l.itemId}>
              <td className="px-3 py-2 truncate font-mono text-xs" title={l.code}>{l.code}</td>
              <td className="px-3 py-2">
                <p className="truncate font-semibold text-gray-900 dark:text-gray-100" title={l.name}>{l.name}</p>
                {(l.steps || []).length > 0 && (
                  <ol className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                    {l.steps.map((s, i) => <li key={i}>{describeStep(s)}</li>)}
                  </ol>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums align-top">{fmtMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-gray-700 font-bold">
            <td className="px-3 py-2" colSpan={2}>Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(result.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// 🔴 THIS SCREEN'S OWN PROMISE WAS UNREACHABLE ON THE FIRST PASS.
// It sent only { schedule_id, vesting_date }, and that path resolves through
// `resolveVersionFor()` which filters `status IN ('Adopted','Superseded')` — a Draft is
// NEVER resolved that way. So on any department whose schedules are all drafts (i.e. every
// department pre-launch, and every bureau setting up a new rate table — the exact moment
// this screen is for) the button returned 422 NO_EFFECTIVE_VERSION, 100% of the time, while
// the copy underneath promised "it works against a draft". The route DOES permit a draft —
// via `schedule_version_id`, which nothing ever passed. The tell was a Draft advisory
// rendered below that could never execute.
// Now: pick a VERSION explicitly (drafts included), or price by date the way a real permit
// is priced.
function CalculatePreview({ schedules, onClose }) {
  const [scheduleId, setScheduleId] = useState(schedules[0]?.id ? String(schedules[0].id) : '');
  const [versions, setVersions] = useState([]);
  const [versionId, setVersionId] = useState('');   // '' = resolve by date instead
  const [vesting, setVesting] = useState(localToday());
  const [afterHours, setAfterHours] = useState(false);
  const [inputs, setInputs] = useState([{ k: '', v: '' }]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Load the chosen schedule's versions so a DRAFT can be selected directly.
  useEffect(() => {
    if (!scheduleId) { setVersions([]); return; }
    let live = true;
    setVersionId('');
    fi.fees.versions(scheduleId)
      .then((r) => {
        if (!live) return;
        const vs = r.data || [];
        setVersions(vs);
        // If nothing is adopted, resolving by date CANNOT work — so default to the newest
        // draft rather than to a path that is guaranteed to refuse.
        if (!vs.some((v) => v.status === 'Adopted')) {
          const draft = vs.find((v) => v.status === 'Draft');
          if (draft) setVersionId(String(draft.id));
        }
      })
      .catch(() => { if (live) setVersions([]); });
    return () => { live = false; };
  }, [scheduleId]);

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const map = {};
      for (const { k, v } of inputs) if (k && String(v).trim() !== '') map[k] = String(v).trim();
      const b = { inputs: map, after_hours: afterHours, vesting_date: vesting };
      if (versionId) b.schedule_version_id = Number(versionId);
      else b.schedule_id = Number(scheduleId);
      const r = await fi.fees.calculate(b);
      setResult(r.data);
    } catch (e) { setError({ message: refusalMessage(e, 'Could not calculate.'), details: e.details }); }
    finally { setBusy(false); }
  };

  const nothingAdopted = versions.length > 0 && !versions.some((v) => v.status === 'Adopted');

  return (
    <Modal title="Try a calculation" onClose={onClose} wide>
      <Refusal error={error} />
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          A dry run. It writes nothing and charges nobody, and it works against a draft — which is
          how you check a rate table before adopting it.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Schedule">
            <Select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
              {schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Which version"
            hint={nothingAdopted
              ? 'Nothing is adopted on this schedule yet, so pricing by date has nothing to find — pick the draft.'
              : 'Leave on “whichever was in force” to price the way a real permit is priced.'}>
            <Select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              <option value="">Whichever was in force on the date below</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version} — {v.status} (from {fmtDate(v.effective_from)})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!versionId && (
          <Field label="Priced as of" hint="The version in force on this date is the one used. This is the VESTING date, which is not always the renewal date.">
            <Input type="date" value={vesting} onChange={(e) => setVesting(e.target.value)} />
          </Field>
        )}

        <div>
          <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">The building&rsquo;s numbers</span>
          <div className="space-y-2">
            {inputs.map((row, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
                <Select value={row.k} aria-label={`Quantity ${i + 1}`}
                  onChange={(e) => setInputs(inputs.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)))}>
                  <option value="">Choose a quantity…</option>
                  {VARIABLES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
                </Select>
                <Input value={row.v} aria-label={`Value ${i + 1}`} className="text-right"
                  onChange={(e) => setInputs(inputs.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)))} />
                <Btn variant="ghost" type="button" disabled={inputs.length === 1}
                  onClick={() => setInputs(inputs.filter((_, j) => j !== i))}>Remove</Btn>
              </div>
            ))}
            <Btn type="button" onClick={() => setInputs([...inputs, { k: '', v: '' }])}>
              <Plus size={16} aria-hidden="true" /> Add a quantity
            </Btn>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            A missing quantity is refused with a message naming it. Nothing is assumed to be zero.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-300">
          <input type="checkbox" className="h-4 w-4" checked={afterHours} onChange={(e) => setAfterHours(e.target.checked)} />
          After hours
        </label>

        {result && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Version {result.version} · {result.status}
              {result.status === 'Draft' && ' — a draft can be calculated against, but it cannot charge anyone.'}
            </p>
            <Breakdown result={result} />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Close</Btn>
          <Btn variant="primary" disabled={!scheduleId || !vesting || busy} onClick={run}>
            <Calculator size={16} aria-hidden="true" /> {busy ? 'Calculating…' : 'Calculate'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Assessments: the proposal, and the two acts that close it ────────────────────────
// An assessment is what the engine PROPOSED. Committing it is a separate act by a separate
// role. A committed charge cannot be re-committed in place; a waived one cannot be re-waived.
function Assessments({ fiCtx, schedules }) {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ zero_fee: '', uncommitted: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null); // { row, verb: 'commit' | 'waive' }
  const [assessing, setAssessing] = useState(false);

  const admin = !!fiCtx?.isPreventionAdmin;
  // An inspector may COMPUTE and PROPOSE; only a prevention admin commits or waives. That
  // split is the 2018 fire-marshal audit's finding — "inspectors had access rights to change
  // fees in the system" — and it is enforced server-side on each verb.
  const inspector = !!fiCtx?.isInspector;

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await fi.fees.assessments(filters)).data || []); setError(null); }
    catch (e) { setError(e.message || 'Could not load the assessments.'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Section
        title="Charges"
        subtitle="What the engine computed, and whether a person has committed it. The engine proposes; a person commits."
        actions={inspector
          ? <Btn variant="primary" onClick={() => setAssessing(true)}><Plus size={16} aria-hidden="true" /> Assess a charge</Btn>
          : null}
      >
        {typeof error === 'string' && <Refusal error={{ message: error }} />}

        <div className="mb-4 flex flex-wrap gap-4">
          {/* Zero-fee is the auditor's first stop, alongside voids. It is a first-class,
              queryable state here because a system where it is not fails at the SAMPLING
              stage — before anyone looks at a single record. */}
          <label className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-300">
            <input type="checkbox" className="h-4 w-4" checked={filters.zero_fee === '1'}
              onChange={(e) => setFilters((f) => ({ ...f, zero_fee: e.target.checked ? '1' : '' }))} />
            Zero-fee only
          </label>
          <label className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-300">
            <input type="checkbox" className="h-4 w-4" checked={filters.uncommitted === '1'}
              onChange={(e) => setFilters((f) => ({ ...f, uncommitted: e.target.checked ? '1' : '' }))} />
            Awaiting a decision
          </label>
        </div>

        {loading ? <Spinner label="Loading charges…" /> : rows.length === 0 ? (
          <EmptyState icon={Calculator} title={Object.values(filters).some(Boolean) ? 'Nothing matches those filters' : 'No charges assessed yet'}
            body="A charge is created against a permit or an inspection, priced by the schedule in force on its vesting date." />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((a) => {
              const decided = a.committed_at || a.waived_at;
              return (
                <li key={a.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {label(a.assessment_kind)} ·{' '}
                      {a.permit_id ? `permit #${a.permit_id}` : a.inspection_id ? `inspection #${a.inspection_id}` : '—'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Computed {fmtMoney(a.computed_amount)}
                      {a.committed_at ? ` · committed ${fmtMoney(a.committed_amount)}` : ''}
                      {a.waived_at ? ` · waived ${fmtMoney(a.waiver_amount)}` : ''}
                      {a.vesting_date ? ` · priced as of ${fmtDate(a.vesting_date)}` : ''}
                    </p>
                    {a.override_reason && (
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                        Overridden: {a.override_reason}
                      </p>
                    )}
                    {a.waiver_reason && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        Waived: {a.waiver_reason}
                        {a.waiver_approving_authority ? ` · approved by ${a.waiver_approving_authority}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone={a.waived_at ? 'gray' : a.committed_at ? 'green' : 'amber'}>
                      {a.waived_at ? 'Waived' : a.committed_at ? 'Committed' : 'Proposed'}
                    </Badge>
                    {admin && !decided && (
                      <>
                        <Btn onClick={() => setActing({ row: a, verb: 'waive' })}>Waive</Btn>
                        <Btn variant="primary" onClick={() => setActing({ row: a, verb: 'commit' })}>Commit</Btn>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {acting && <DecideAssessment acting={acting} onClose={() => setActing(null)}
        onDone={() => { setActing(null); load(); }} />}
      {assessing && <AssessCharge schedules={schedules} onClose={() => setAssessing(false)}
        onDone={() => { setAssessing(false); load(); }} />}
    </>
  );
}

/**
 * Assess a charge against a permit. Without this the Charges section could only ever render
 * its empty state and the commit gate could never be exercised — the engine had a proposer
 * and no way to propose.
 *
 * Attached to EXACTLY ONE subject (SUBJECT_REQUIRED). The vesting date is a first-class
 * field and not today's date by default reasoning: a permit can renew on its anniversary
 * while being priced under the schedule in force at completeness-determination.
 */
function AssessCharge({ schedules, onClose, onDone }) {
  const [permits, setPermits] = useState([]);
  const [f, setF] = useState({
    permit_id: '', schedule_id: schedules[0]?.id ? String(schedules[0].id) : '',
    assessment_kind: 'base', vesting_date: localToday(), reason_code: '', reason_text: '',
  });
  const [inputs, setInputs] = useState([{ k: '', v: '' }]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    fi.permits.list().then((r) => setPermits(r.data || [])).catch(() => setPermits([]));
  }, []);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const map = {};
      for (const { k, v } of inputs) if (k && String(v).trim() !== '') map[k] = String(v).trim();
      const b = {
        permit_id: Number(f.permit_id), schedule_id: Number(f.schedule_id),
        assessment_kind: f.assessment_kind, vesting_date: f.vesting_date, inputs: map,
      };
      // §1.6: a re-inspection fee CANNOT be read off an inspection result — it needs an
      // inspector's attested reason, because the discriminator is a human fault judgment.
      if (f.assessment_kind === 'reinspection') {
        b.reason_code = f.reason_code.trim();
        b.reason_text = f.reason_text.trim();
      }
      await fi.fees.assess(b);
      onDone();
    } catch (e) { setError({ message: refusalMessage(e, 'Could not assess the charge.'), details: e.details }); }
    finally { setBusy(false); }
  };

  const needsReason = f.assessment_kind === 'reinspection';
  const ready = f.permit_id && f.schedule_id && f.vesting_date
    && (!needsReason || (f.reason_code.trim() && f.reason_text.trim()));

  return (
    <Modal title="Assess a charge" onClose={onClose} wide>
      <Refusal error={error} />
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This computes and records a PROPOSAL. Nobody is charged until a prevention admin
          commits it.
        </p>
        <Field label="Against which permit">
          <Select value={f.permit_id} onChange={set('permit_id')}>
            <option value="">Choose a permit…</option>
            {permits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.permitNumber || `#${p.id}`}{p.type ? ` — ${p.type}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Schedule">
            <Select value={f.schedule_id} onChange={set('schedule_id')}>
              {schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Priced as of"
            hint="The vesting date — the version in force then is the one that prices this. It is not always the renewal date.">
            <Input type="date" value={f.vesting_date} onChange={set('vesting_date')} />
          </Field>
        </div>
        <Field label="What kind of charge">
          <Select value={f.assessment_kind} onChange={set('assessment_kind')}>
            <option value="base">Base fee</option>
            <option value="reinspection">Re-inspection fee</option>
            <option value="penalty_work_without_permit">Work without a permit</option>
            <option value="surcharge">Surcharge</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        {needsReason && (
          <>
            <Field label="Reason code"
              hint="A re-inspection fee cannot be read off the inspection result — the discriminator is a human fault judgment, and it is attested to you.">
              <Input value={f.reason_code} onChange={set('reason_code')} maxLength={60}
                placeholder="e.g. NOT_READY_CONTRACTOR_FAULT" />
            </Field>
            <Field label="What happened">
              <TextArea rows={2} value={f.reason_text} onChange={set('reason_text')} maxLength={2000} />
            </Field>
          </>
        )}
        <div>
          <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">The building&rsquo;s numbers</span>
          <div className="space-y-2">
            {inputs.map((row, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
                <Select value={row.k} aria-label={`Quantity ${i + 1}`}
                  onChange={(e) => setInputs(inputs.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)))}>
                  <option value="">Choose a quantity…</option>
                  {VARIABLES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
                </Select>
                <Input value={row.v} aria-label={`Value ${i + 1}`} className="text-right"
                  onChange={(e) => setInputs(inputs.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)))} />
                <Btn variant="ghost" type="button" disabled={inputs.length === 1}
                  onClick={() => setInputs(inputs.filter((_, j) => j !== i))}>Remove</Btn>
              </div>
            ))}
            <Btn type="button" onClick={() => setInputs([...inputs, { k: '', v: '' }])}>
              <Plus size={16} aria-hidden="true" /> Add a quantity
            </Btn>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            A missing quantity is refused with a message naming it. Nothing is assumed to be zero,
            and a draft schedule cannot charge anyone.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!ready || busy} onClick={submit}>
            {busy ? 'Assessing…' : 'Assess it'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function DecideAssessment({ acting, onClose, onDone }) {
  const { row, verb } = acting;
  // Pre-filled with the server's EXACT string. The comparison is numeric now, so "350"
  // would be accepted as the same amount — but echoing what the engine said is still what
  // "ratify this" means, and it keeps the override path honest.
  const [amount, setAmount] = useState(String(row.computed_amount ?? ''));
  const [reason, setReason] = useState('');
  const [authority, setAuthority] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Compared as CENTS, not as strings — mirroring the server's parseDec gate. A string
  // comparison here re-creates the user-visible half of the bug the server fix removed:
  // typing 350 to ratify a computed 350.00 would demand a written reason for an override
  // that is not happening, and the server would then discard the reason it compelled.
  const a = toCents(amount);
  const c = toCents(row.computed_amount);
  const changed = a === null || c === null || a !== c;

  const run = async () => {
    setBusy(true); setError(null);
    try {
      if (verb === 'commit') {
        const b = { committed_amount: amount.trim() };
        if (reason.trim()) b.override_reason = reason.trim();
        await fi.fees.commit(row.id, b);
      } else {
        const b = { waiver_amount: amount.trim(), waiver_reason: reason.trim() };
        if (authority.trim()) b.approving_authority = authority.trim();
        await fi.fees.waive(row.id, b);
      }
      onDone();
    } catch (e) { setError({ message: refusalMessage(e, 'That did not go through.'), details: e.details }); }
    finally { setBusy(false); }
  };

  const ready = verb === 'commit'
    ? amount.trim() && (!changed || reason.trim())
    : amount.trim() && reason.trim();

  return (
    <Modal title={verb === 'commit' ? 'Commit this charge' : 'Waive this charge'} onClose={onClose} wide>
      <Refusal error={error} />
      <div className="space-y-4">
        {row.computed_breakdown && (
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">What the engine computed</h3>
            <Breakdown result={{ lines: row.computed_breakdown, total: row.computed_amount }} />
          </div>
        )}

        <Field label={verb === 'commit' ? 'Amount to commit' : 'Amount to waive'}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-40 text-right" />
        </Field>

        {verb === 'commit' && changed && (
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            That differs from what the engine computed, so it needs a written reason.
          </p>
        )}

        <Field
          label={verb === 'commit' ? 'Reason for the difference' : 'Ground and written basis'}
          hint={verb === 'commit'
            ? 'Required only when the amount differs from the computed one.'
            : 'Required at every amount, however small — a waiver without a stated basis is the finding an audit writes up.'}>
          <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        </Field>

        {verb === 'waive' && (
          <Field label="Approved by"
            hint="Required if this department has set an approval threshold and this is at or above it. A chief sets that threshold in Settings › Billing; it ships unset.">
            <Input value={authority} onChange={(e) => setAuthority(e.target.value)} maxLength={200} />
          </Field>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          This happens once. A committed charge is corrected by a new linked record, never in place.
        </p>

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!ready || busy} onClick={run}>
            {busy ? 'Working…' : verb === 'commit' ? 'Commit it' : 'Waive it'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
