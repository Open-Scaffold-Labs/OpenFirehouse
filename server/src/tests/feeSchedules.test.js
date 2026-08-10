/**
 * feeSchedules.test.js — the 3.2 Slice A route surface against a live DB.
 *
 * THE CLAIMS THIS SUITE EXISTS TO PROVE, each because it is a way money or a legal record could
 * be quietly corrupted:
 *   · F14 SEPARATION OF DUTIES — an inspector can READ and COMPUTE but cannot touch the rate
 *     table. The 2018 fire-marshal audit's verbatim finding was "Inspectors had access rights to
 *     change fees in the system."
 *   · F13 cross-tenant refusal on every fee route.
 *   · ADOPTED TERMS ARE FROZEN, through the ROUTE and not only the trigger.
 *   · A DRAFT IS NOT CHARGEABLE — a charge must cite a schedule that was actually in force.
 *   · NO CLIENT-SUPPLIED TOTALS. The engine runs server-side; computed_amount is not an input.
 *   · A DIFFERENT committed amount is allowed; an UNEXPLAINED one is not; and a committed charge
 *     cannot be re-committed in place.
 *   · A re-inspection fee cannot exist without an attested human reason (§1.6).
 *   · CLONE REMAPS CHAINS. A cloned version whose lines still chain to the ORIGINAL version's
 *     items would compute off a frozen schedule and never announce itself.
 *
 * ⚠ TEARDOWN ORDER IS LOAD-BEARING and is itself the correction of a wrong prediction I made
 * earlier: fi_fee_assessments references fi_permits ON DELETE RESTRICT, so assessments must be
 * deleted BEFORE the permits they cite. Any future suite that creates assessments inherits this.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[feeSchedules] TENANCY_TEST_DB not set — skipping.');
  test('fee schedules (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('fee schedules: authoring, adoption, separation of duties, and assessment', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');

    const MARK = `FEE-${Date.now()}`;

    /**
     * 🔴 THIS TEARDOWN SHIPPED BROKEN AND THE FAILURE WAS INVISIBLE — it is worth reading before
     * writing another fixture against these tables.
     *
     * The first version wrapped everything in one try/`catch {}`, so the FIRST failure skipped
     * every later statement in silence. It failed on statement three, every run, and left 11
     * rows behind — which is what later blocked migration 0120 from adding a CHECK. Two causes,
     * both of them the product working as designed:
     *
     *  1. `fi_fee_item_draft_only` fires on DELETE and refuses when the parent version is
     *     Adopted. It does not check roles, so **not even the table owner can delete a fee line
     *     off an adopted version.** That is the whole point in production — adopted fee terms are
     *     frozen and the only path is to supersede — but it means a test that adopts anything
     *     cannot clean up without disabling the trigger. Doing that here, in teardown, against a
     *     local database, is legitimate; there is deliberately no such door in the app.
     *  2. `UPDATE fi_fee_items SET input_item_id = NULL` violates the `percent_of` CHECK (a
     *     chained line cannot exist unchained even for one statement — the same constraint that
     *     broke cloneLines). So the null-then-delete idiom is impossible: dependent lines must be
     *     deleted LEAF-FIRST, peeling until the set is empty.
     *
     * And it no longer swallows errors — a cleanup failure now prints, because residue that
     * nobody sees becomes a broken migration three commits later.
     */
    t.after(async () => {
      const like = [`${MARK}%`];
      const deptFilter = `(SELECT id FROM departments WHERE name LIKE $1)`;
      const step = async (label, sql, params = like) => {
        try { await pool.query(sql, params); } catch (e) {
          console.error(`[feeSchedules teardown] ${label} FAILED: ${e.message}`);
        }
      };
      const triggers = [
        ['fi_fee_items', 'trg_fi_fee_items_draft_only'],
        ['fi_fee_item_tiers', 'trg_fi_fee_item_tiers_draft_only'],
        ['fi_fee_item_modifiers', 'trg_fi_fee_item_modifiers_draft_only'],
      ];
      for (const [tbl, trg] of triggers) {
        await step(`disable ${trg}`, `ALTER TABLE ${tbl} DISABLE TRIGGER ${trg}`, []);
      }
      await step('assessments', `DELETE FROM fi_fee_assessments WHERE department_id IN ${deptFilter}`);
      await step('modifiers', `DELETE FROM fi_fee_item_modifiers WHERE department_id IN ${deptFilter}`);
      await step('tiers', `DELETE FROM fi_fee_item_tiers WHERE department_id IN ${deptFilter}`);
      // Leaf-first peel: a percent_of line must go before the line it chains from.
      await step('items (leaf-first)', `
        DO $peel$
        DECLARE n INT; guard INT := 0;
        BEGIN
          LOOP
            DELETE FROM fi_fee_items i
             WHERE i.department_id IN (SELECT id FROM departments WHERE name LIKE ${"'"}${MARK}%${"'"})
               AND NOT EXISTS (SELECT 1 FROM fi_fee_items c WHERE c.input_item_id = i.id);
            GET DIAGNOSTICS n = ROW_COUNT; guard := guard + 1;
            EXIT WHEN n = 0 OR guard > 50;
          END LOOP;
        END $peel$;`, []);
      await step('versions', `DELETE FROM fi_fee_schedule_versions WHERE department_id IN ${deptFilter}`);
      await step('type→schedule link', `UPDATE fi_permit_types SET fee_schedule_id = NULL WHERE department_id IN ${deptFilter}`);
      await step('schedules', `DELETE FROM fi_fee_schedules WHERE department_id IN ${deptFilter}`);
      await step('permit types', `DELETE FROM fi_permit_types WHERE department_id IN ${deptFilter}`);
      await step('audit', `DELETE FROM audit_log WHERE department_id IN ${deptFilter}`);
      await step('permits', `DELETE FROM fi_permits WHERE type LIKE $1`);
      await step('properties', `DELETE FROM fi_properties WHERE name LIKE $1`);
      await step('user↔dept', `DELETE FROM of_user_departments WHERE department_id IN ${deptFilter}`);
      await step('users', `DELETE FROM users WHERE username LIKE $1`);
      await step('stations', `DELETE FROM stations WHERE department_id IN ${deptFilter}`);
      await step('departments', `DELETE FROM departments WHERE name LIKE $1`);
      for (const [tbl, trg] of triggers) {
        await step(`enable ${trg}`, `ALTER TABLE ${tbl} ENABLE TRIGGER ${trg}`, []);
      }
      // A check that CAN fail: prove the fixtures are actually gone.
      try {
        const { rows } = await pool.query(
          `SELECT (SELECT count(*) FROM fi_fee_schedules WHERE department_id IN ${deptFilter}) AS s,
                  (SELECT count(*) FROM fi_fee_item_tiers WHERE department_id IN ${deptFilter}) AS t`, like);
        if (Number(rows[0].s) || Number(rows[0].t)) {
          console.error(`[feeSchedules teardown] RESIDUE LEFT BEHIND: ${JSON.stringify(rows[0])}`);
        }
      } catch { /* pool may already be closing */ }
      try { await pool.end(); } catch { /* already closed */ }
    });

    const A = await mkAlignedDeptStation(pool, `${MARK}-A`);
    const B = await mkAlignedDeptStation(pool, `${MARK}-B`);

    const mkUser = async (dept, role, tag) => {
      const uname = `${MARK}-${tag}`;
      const { rows } = await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`,
        [uname, `${tag} user`, role, dept]);
      await pool.query(
        'INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [rows[0].id, dept, role]);
      return jwt.sign({ sub: rows[0].id, username: uname, role }, ACCESS_SECRET, { expiresIn: '1h' });
    };
    const adminA  = await mkUser(A, 'chief',  'adminA');
    const memberA = await mkUser(A, 'member', 'memberA');
    const adminB  = await mkUser(B, 'chief',  'adminB');

    const server = app.listen(0);
    t.after(() => new Promise((r) => server.close(r)));

    const api = async (method, path, token, body) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let json = null; try { json = await res.json(); } catch { /* no body */ }
      return { status: res.status, json };
    };
    const BASE = '/api/fi-fee-schedules';

    // A permit to attach an assessment to.
    const { rows: [prop] } = await pool.query(
      `INSERT INTO fi_properties (name, address, department_id, station_id)
       VALUES ($1,'1 Test St',$2,$2) RETURNING id`, [`${MARK}-prop`, A]);
    const { rows: [permit] } = await pool.query(
      `INSERT INTO fi_permits ("propertyId", type, status, department_id, station_id)
       VALUES ($1,$2,'Active',$3,$3) RETURNING id`, [prop.id, `${MARK}-permit`, A]);

    /* ── F14: separation of duties, in BOTH directions ──────────────────────────────── */

    const memberCreate = await api('POST', BASE, memberA,
      { name: `${MARK} sched`, effective_from: '2026-01-01' });
    assert.equal(memberCreate.status, 403,
      'an inspector must NOT be able to author a fee schedule — the 2018 audit finding verbatim');

    const created = await api('POST', BASE, adminA,
      { name: `${MARK} sched`, effective_from: '2026-01-01' });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const scheduleId = created.json.data.id;
    const draftId = created.json.data.draft.id;
    assert.equal(created.json.data.draft.status, 'Draft');

    // Duplicate name is a 409, not a second schedule.
    assert.equal((await api('POST', BASE, adminA, { name: `${MARK} sched`, effective_from: '2026-01-01' })).status, 409);

    // ...but an inspector CAN read. Withholding the fee schedule from the person doing the
    // inspection would be a different kind of broken.
    const memberRead = await api('GET', BASE, memberA);
    assert.equal(memberRead.status, 200);
    assert.ok(memberRead.json.data.some((s) => s.id === scheduleId));

    /* ── F13: cross-tenant ──────────────────────────────────────────────────────────── */

    assert.equal((await api('GET', `${BASE}/versions/${draftId}`, adminB)).status, 404,
      "another department's fee schedule version must not be readable");
    assert.equal((await api('POST', `${BASE}/versions/${draftId}/items`, adminB,
      { code: 'X', name: 'x', kind: 'flat', flat_amount: '1.00' })).status, 404,
      "another department's draft must not be writable");
    const bList = await api('GET', BASE, adminB);
    assert.equal(bList.status, 200);
    assert.equal(bList.json.data.filter((s) => s.id === scheduleId).length, 0);

    /* ── Author the lines: a real chain, per §1.7 ───────────────────────────────────── */

    const valItem = await api('POST', `${BASE}/versions/${draftId}/items`, adminA,
      { code: 'VAL', name: 'Valuation', kind: 'valuation', input_variable: 'square_footage', sort_order: 1 });
    assert.equal(valItem.status, 200, JSON.stringify(valItem.json));
    const tierRes = await api('POST', `${BASE}/versions/${draftId}/items/${valItem.json.data.id}/tiers`, adminA,
      { axis1_min: '0', axis1_max: '100000', amount: '0', per_unit: '120.00', unit_size: '1',
        per_unit_basis: 'whole_quantity' });
    assert.equal(tierRes.status, 200, JSON.stringify(tierRes.json));

    // 0120: a per-unit rate with no stated basis is refused at the schema — $370 vs $295 on the
    // same building is not a default anyone gets to inherit.
    const noBasis = await api('POST', `${BASE}/versions/${draftId}/items/${valItem.json.data.id}/tiers`, adminA,
      { axis1_min: '0', axis1_max: '100000', amount: '0', per_unit: '120.00', unit_size: '1' });
    assert.equal(noBasis.status, 400, 'per_unit without per_unit_basis must be rejected');
    // ...and a basis with no rate is equally refused — a setting that changes nothing misleads.
    const basisNoRate = await api('POST', `${BASE}/versions/${draftId}/items/${valItem.json.data.id}/tiers`, adminA,
      { axis1_min: '0', axis1_max: '100000', amount: '5.00', per_unit_basis: 'whole_quantity' });
    assert.equal(basisNoRate.status, 400, 'per_unit_basis without per_unit must be rejected');

    const fireItem = await api('POST', `${BASE}/versions/${draftId}/items`, adminA,
      { code: 'FIRE', name: 'Fire review', kind: 'percent_of', percent_rate: '25.0000',
        input_item_id: valItem.json.data.id, sort_order: 2 });
    assert.equal(fireItem.status, 200, JSON.stringify(fireItem.json));

    // An incoherent line is a 422 naming the constraint, not a 500.
    const bad = await api('POST', `${BASE}/versions/${draftId}/items`, adminA,
      { code: 'BADFLAT', name: 'no amount', kind: 'flat' });
    assert.equal(bad.status, 422);
    assert.equal(bad.json.code, 'INCONSISTENT_FEE_DEFINITION');

    // A chain must stay on the same version.
    const offVersion = await api('POST', `${BASE}/versions/${draftId}/items`, adminA,
      { code: 'OFFVER', name: 'x', kind: 'percent_of', percent_rate: '10', input_item_id: 999999999 });
    assert.equal(offVersion.status, 422);
    assert.equal(offVersion.json.code, 'BASE_ITEM_OFF_VERSION');

    // `code` is a control value — not renameable even in a draft.
    const rename = await api('PATCH', `${BASE}/versions/${draftId}/items/${valItem.json.data.id}`, adminA, { code: 'NEWCODE' });
    assert.equal(rename.status, 409);
    assert.equal(rename.json.code, 'CODE_IMMUTABLE');

    /* ── A DRAFT IS NOT CHARGEABLE, but IS calculable (that is how an author checks it) ─ */

    const dryRun = await api('POST', `${BASE}/calculate`, memberA,
      { schedule_version_id: draftId, inputs: { square_footage: 5000 } });
    assert.equal(dryRun.status, 200, JSON.stringify(dryRun.json));
    assert.equal(dryRun.json.data.total, '750000.00');   // 5000x120 = 600000, +25% = 750000

    const draftCharge = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_version_id: draftId, vesting_date: '2026-03-01',
        inputs: { square_footage: 5000 } });
    assert.equal(draftCharge.status, 422);
    assert.equal(draftCharge.json.code, 'DRAFT_NOT_CHARGEABLE');

    /* ── Adoption ───────────────────────────────────────────────────────────────────── */

    // A member cannot adopt.
    assert.equal((await api('POST', `${BASE}/versions/${draftId}/adopt`, memberA,
      { adopting_instrument: 'ordinance', adopting_instrument_ref: 'O-1', adopted_by: 'Board', adopted_on: '2025-12-01' })).status, 403);

    // An unrecognised instrument form is rejected at the schema.
    assert.equal((await api('POST', `${BASE}/versions/${draftId}/adopt`, adminA,
      { adopting_instrument: 'verbal_agreement', adopting_instrument_ref: 'x', adopted_by: 'y', adopted_on: '2025-12-01' })).status, 400);

    const adopted = await api('POST', `${BASE}/versions/${draftId}/adopt`, adminA,
      { adopting_instrument: 'ordinance_exhibit', adopting_instrument_ref: 'Ord. 2026-04, Exhibit A',
        adopted_by: 'Board of Fire Commissioners', adopted_on: '2025-12-15' });
    assert.equal(adopted.status, 200, JSON.stringify(adopted.json));
    assert.equal(adopted.json.data.status, 'Adopted');
    assert.equal(adopted.json.data.effective_to, null);   // it is now the OPEN version

    // ADOPTED TERMS ARE FROZEN — through the route.
    const frozenAdd = await api('POST', `${BASE}/versions/${draftId}/items`, adminA,
      { code: 'LATE', name: 'x', kind: 'flat', flat_amount: '1.00' });
    assert.equal(frozenAdd.status, 409);
    assert.equal(frozenAdd.json.code, 'VERSION_FROZEN');
    assert.equal((await api('DELETE', `${BASE}/versions/${draftId}/items/${fireItem.json.data.id}`, adminA)).status, 409);
    assert.equal((await api('POST', `${BASE}/versions/${draftId}/adopt`, adminA,
      { adopting_instrument: 'ordinance', adopting_instrument_ref: 'O-2', adopted_by: 'Board', adopted_on: '2026-01-01' })).status, 409);

    /* ── CLONE REMAPS CHAINS — the bug that would never announce itself ─────────────── */

    const cloned = await api('POST', `${BASE}/${scheduleId}/versions`, adminA,
      { effective_from: '2027-01-01', clone_from_version_id: draftId });
    assert.equal(cloned.status, 200, JSON.stringify(cloned.json));
    assert.equal(cloned.json.data.cloned_items, 2);
    const cloneVersionId = cloned.json.data.id;

    const cloneDetail = await api('GET', `${BASE}/versions/${cloneVersionId}`, adminA);
    const cloneVal  = cloneDetail.json.data.items.find((i) => i.code === 'VAL');
    const cloneFire = cloneDetail.json.data.items.find((i) => i.code === 'FIRE');
    assert.ok(cloneVal && cloneFire);
    assert.notEqual(cloneVal.id, valItem.json.data.id, 'the clone must have its OWN item rows');
    assert.equal(cloneFire.input_item_id, cloneVal.id,
      "the clone's chain must point at the CLONE's line, never the frozen original's");
    assert.equal(cloneVal.tiers.length, 1, 'tiers must come across with the clone');
    assert.equal(cloneVal.tiers[0].per_unit_basis, 'whole_quantity',
      'the per-unit BASIS must survive a clone — losing it would silently change every fee');

    // And the clone is editable, because it is a Draft.
    assert.equal((await api('POST', `${BASE}/versions/${cloneVersionId}/items`, adminA,
      { code: 'EXTRA', name: 'x', kind: 'flat', flat_amount: '25.00' })).status, 200);

    /* ── Assess against the ADOPTED version ─────────────────────────────────────────── */

    // No client-supplied total: the schema is strict, so the attempt is a 400.
    const injected = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_id: scheduleId, vesting_date: '2026-03-01',
        inputs: { square_footage: 5000 }, computed_amount: '1.00' });
    assert.equal(injected.status, 400, 'a client must not be able to supply the total');

    // Vesting resolves the version in force on the DATE, not the newest one.
    const tooEarly = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_id: scheduleId, vesting_date: '2025-06-01',
        inputs: { square_footage: 5000 } });
    assert.equal(tooEarly.status, 422);
    assert.equal(tooEarly.json.code, 'NO_EFFECTIVE_VERSION');

    // A missing input is a refusal that NAMES the input — never a zero.
    const noInput = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_id: scheduleId, vesting_date: '2026-03-01', inputs: {} });
    assert.equal(noInput.status, 422);
    assert.equal(noInput.json.code, 'FEE_NOT_COMPUTABLE');
    // `details` is string[] app-wide — errorHandler drops any other shape, so a structured
    // object here would have vanished silently. It must NAME the missing input, because
    // "could not compute" without saying what is absent is not actionable.
    assert.ok(Array.isArray(noInput.json.details), 'details must be a string array');
    assert.ok(noInput.json.details.some((d) => d.includes('MISSING_INPUT') && d.includes('square_footage')),
      `details must name the missing input; got ${JSON.stringify(noInput.json.details)}`);

    const assessed = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_id: scheduleId, vesting_date: '2026-03-01',
        inputs: { square_footage: 5000 } });
    assert.equal(assessed.status, 200, JSON.stringify(assessed.json));
    const assessmentId = assessed.json.data.id;
    assert.equal(String(assessed.json.data.computed_amount), '750000.00');
    assert.equal(assessed.json.data.schedule_version_id, draftId, 'the vested version is recorded');
    assert.ok(Array.isArray(assessed.json.data.computed_breakdown)
      && assessed.json.data.computed_breakdown.length === 2, 'the breakdown is stored, line by line');

    // §1.6: a re-inspection fee needs an attested human reason.
    const reinspNoReason = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_id: scheduleId, vesting_date: '2026-03-01',
        assessment_kind: 'reinspection', inputs: { square_footage: 5000 } });
    assert.equal(reinspNoReason.status, 422);
    assert.equal(reinspNoReason.json.code, 'REINSPECTION_REASON_REQUIRED');

    const reinsp = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_id: scheduleId, vesting_date: '2026-03-01',
        assessment_kind: 'reinspection', reason_code: 'NOT_READY_CONTRACTOR_FAULT',
        reason_text: 'Contractor had not completed the corrections.', inputs: { square_footage: 5000 } });
    assert.equal(reinsp.status, 200, JSON.stringify(reinsp.json));
    assert.ok(reinsp.json.data.attested_by_user_id, 'the attestation records WHO asserted the reason');

    /* ── Commit: a different amount is allowed, an unexplained one is not ───────────── */

    // An inspector cannot commit a charge.
    assert.equal((await api('POST', `${BASE}/assessments/${assessmentId}/commit`, memberA,
      { committed_amount: '750000.00' })).status, 403);

    const noReason = await api('POST', `${BASE}/assessments/${assessmentId}/commit`, adminA,
      { committed_amount: '500000.00' });
    assert.equal(noReason.status, 422);
    assert.equal(noReason.json.code, 'OVERRIDE_REASON_REQUIRED');

    const committed = await api('POST', `${BASE}/assessments/${assessmentId}/commit`, adminA,
      { committed_amount: '500000.00', override_reason: 'Board-approved hardship reduction, Res. 2026-11' });
    assert.equal(committed.status, 200, JSON.stringify(committed.json));
    assert.equal(String(committed.json.data.committed_amount), '500000.00');
    assert.ok(committed.json.data.committed_by_user_id, 'the committer is recorded');
    // The COMPUTATION is untouched — the proposal and the commit are both on the record.
    assert.equal(String(committed.json.data.computed_amount), '750000.00');

    const recommit = await api('POST', `${BASE}/assessments/${assessmentId}/commit`, adminA,
      { committed_amount: '1.00', override_reason: 'changed my mind' });
    assert.equal(recommit.status, 409);
    assert.equal(recommit.json.code, 'ALREADY_COMMITTED');

    /* ── 🔴 RATIFYING THE COMPUTED AMOUNT IS NOT AN OVERRIDE ────────────────────────────
       The gate used to compare STRINGS. computed_amount comes back from formatMoney as
       "750000.00", and the schema accepts "750000" and "750000.0" — so a clerk committing
       EXACTLY what the engine said, typed without trailing zeros, was refused 422 for an
       override they had not made, and then, once they complied, had the row stamped with an
       override_reason and audited `overridden: true`. A FALSE claim that a human overrode the
       engine, written into the one module whose whole purpose is auditability.
       Fixed 2026-08-07 (Slice D) by comparing with parseDec — scaled BigInt, never a float,
       because (1.005).toFixed(2) === "1.00" is why this module is BigInt throughout. */
    const sameNumberDifferentString = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_id: scheduleId, vesting_date: '2026-03-01',
        inputs: { square_footage: 5000 } });
    assert.equal(sameNumberDifferentString.status, 200, JSON.stringify(sameNumberDifferentString.json));
    assert.equal(String(sameNumberDifferentString.json.data.computed_amount), '750000.00',
      'precondition: the engine still emits two decimal places');

    const ratified = await api('POST',
      `${BASE}/assessments/${sameNumberDifferentString.json.data.id}/commit`, adminA,
      { committed_amount: '750000' });   // no override_reason, deliberately
    assert.equal(ratified.status, 200,
      `committing the computed amount without trailing zeros is NOT an override: ${JSON.stringify(ratified.json)}`);
    assert.equal(ratified.json.data.override_reason, null,
      'ratifying the engine must not record an override reason');

    // And the audit row must not claim an override either — a 200 is not enough here,
    // because the damage the old code did was to the RECORD, not to the response.
    const { rows: [ratifiedAudit] } = await pool.query(
      `SELECT detail FROM audit_log
        WHERE department_id = $1 AND table_name = 'fi_fee_assessments' AND record_id = $2
          AND action = 'approve'
        ORDER BY id DESC LIMIT 1`,
      [A, sameNumberDifferentString.json.data.id]);
    assert.ok(ratifiedAudit, 'the commit is audited');
    assert.equal(ratifiedAudit.detail.overridden, false,
      'the audit trail must not record an override that did not happen');
    assert.equal(ratifiedAudit.detail.override_reason, null);

    // The gate still bites where it should: a genuinely different amount, unexplained.
    const stillGuarded = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_id: scheduleId, vesting_date: '2026-03-01',
        inputs: { square_footage: 5000 } });
    const guarded = await api('POST', `${BASE}/assessments/${stillGuarded.json.data.id}/commit`, adminA,
      { committed_amount: '749999.99' });
    assert.equal(guarded.status, 422, 'one cent less is still an override');
    assert.equal(guarded.json.code, 'OVERRIDE_REASON_REQUIRED');

    /* ── Waiver: never anonymous, never twice ───────────────────────────────────────── */

    assert.equal((await api('POST', `${BASE}/assessments/${assessmentId}/waive`, memberA,
      { waiver_amount: '1.00', waiver_reason: 'x' })).status, 403);
    const waived = await api('POST', `${BASE}/assessments/${assessmentId}/waive`, adminA,
      { waiver_amount: '500000.00', waiver_reason: 'Municipally owned occupancy' });
    assert.equal(waived.status, 200, JSON.stringify(waived.json));
    assert.ok(waived.json.data.waived_by_user_id && waived.json.data.waived_at);
    assert.equal((await api('POST', `${BASE}/assessments/${assessmentId}/waive`, adminA,
      { waiver_amount: '1.00', waiver_reason: 'again' })).status, 409);

    /* ── The audit trail exists for every money act ─────────────────────────────────── */

    const { rows: auditRows } = await pool.query(
      `SELECT action, table_name FROM audit_log WHERE department_id = $1 ORDER BY id`, [A]);
    const acts = auditRows.map((r) => `${r.action}:${r.table_name}`);
    for (const expected of ['create:fi_fee_schedules', 'approve:fi_fee_schedule_versions',
                            'create:fi_fee_assessments', 'approve:fi_fee_assessments']) {
      assert.ok(acts.includes(expected), `audit_log must carry ${expected}; got ${acts.join(', ')}`);
    }

    /* ── F18: zero-fee assessments are a first-class QUERY, not a scroll ────────────── */

    const zeroSched = await api('POST', BASE, adminA, { name: `${MARK} zero`, effective_from: '2026-01-01' });
    const zeroDraft = zeroSched.json.data.draft.id;
    await api('POST', `${BASE}/versions/${zeroDraft}/items`, adminA,
      { code: 'EXEMPT', name: 'Municipal exemption', kind: 'flat', flat_amount: '0.00' });
    await api('POST', `${BASE}/versions/${zeroDraft}/adopt`, adminA,
      { adopting_instrument: 'board_resolution', adopting_instrument_ref: 'Res. 2026-02',
        adopted_by: 'Board', adopted_on: '2025-12-20' });
    const zeroAssessed = await api('POST', `${BASE}/assessments`, adminA,
      { permit_id: permit.id, schedule_id: zeroSched.json.data.id, vesting_date: '2026-03-01', inputs: {} });
    assert.equal(zeroAssessed.status, 200, JSON.stringify(zeroAssessed.json));
    assert.equal(String(zeroAssessed.json.data.computed_amount), '0.00');

    const zeroQuery = await api('GET', `${BASE}/assessments?zero_fee=1`, adminA);
    assert.equal(zeroQuery.status, 200);
    assert.ok(zeroQuery.json.data.some((a) => a.id === zeroAssessed.json.data.id),
      'a zero-fee assessment must be findable as a first-class object — the auditor\'s first stop');

    // And cross-tenant on the assessment list too.
    const bAssessments = await api('GET', `${BASE}/assessments`, adminB);
    assert.equal(bAssessments.status, 200);
    assert.equal(bAssessments.json.data.filter((a) => a.id === assessmentId).length, 0);
  });
}
