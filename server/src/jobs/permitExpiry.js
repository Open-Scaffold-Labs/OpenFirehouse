'use strict';
/**
 * jobs/permitExpiry.js — the scheduled writer of the permit expiry ladder (Phase 3, 3.1b).
 *
 * This is the ONLY thing in the product that moves a permit along
 *   Active → AboutToExpire → Delinquent → Expired
 * and it is the only status change in the module that no human authors. All the arithmetic
 * lives in utils/permitLadder.js (pure, unit-tested at every boundary); this file does the
 * reading, the writing, the audit trail and the run ledger, and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 THE DATE THIS EVALUATES AGAINST — read before changing the cron schedule
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 3.1a established the repo's date doctrine: expiry is judged on the DEPARTMENT'S calendar
 * day, and the client supplies `?today=` precisely because a server UTC clock rolls over
 * ahead of every US department. A cron has no client, and `departments` carries NO timezone
 * column (verified live, 2026-07-27) — so the honest answer is not to pretend otherwise.
 *
 * The mitigation is the SCHEDULE, and it is exact rather than hopeful: the job runs at
 * 14:30 UTC. At that instant every US timezone (UTC−4 through UTC−10) is on the SAME
 * calendar date as UTC — 10:30 EDT down to 04:30 HST. So for every US department the UTC
 * date IS the local date, and the ladder is evaluated on the right day. That makes the
 * schedule a CORRECTNESS CONSTRAINT, not a preference: moving it before ~10:00 UTC would
 * start flipping permits a day early in the western zones.
 *
 * ⚠ HONEST LIMIT: this holds for the United States. A non-US department would need a real
 * `departments.timezone` and a per-department evaluation day. Recorded as a known boundary,
 * not silently assumed away.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * · Never writes a terminal status. NO TIMER MAY EVER PRODUCE 'Revoked' — enumerated
 *   grounds, written notice and a hearing right make it statutorily impossible.
 * · Never guesses a missing term. A permit issued before the catalogue existed carries no
 *   notice/grace snapshot; the ladder cannot be computed, so the record is LEFT ALONE and
 *   COUNTED (skipped_no_terms) for a human to see. Prod holds four of these today.
 * · Never moves a permit backwards (permitLadder's forward-only rule).
 * · Never touches the R7 snapshot columns — 0094's write-once trigger would refuse anyway,
 *   which is the point of enforcing that in the database rather than here.
 */

const { pool, runWithDepartment } = require('../db');
const { audit } = require('../utils/auditLog');
const { nextStatusFor, NO_TERMS, computeLadderStatus } = require('../utils/permitLadder');
const {
  NOTICE_KIND_BY_STATUS, NOTICE_AUDIENCES, renderPermitNotice, permitteeEmail,
} = require('../utils/permitNotice');

const JOB_NAME = 'permit_expiry';

/**
 * The actor recorded on every transition. Named, not null: an audit row with a blank actor
 * reads as "nobody did this", and somebody did — a scheduled job we own.
 */
const SYSTEM_ACTOR = Object.freeze({ id: null, username: 'system', name: 'Permit expiry job' });

/** UTC calendar day as ISO YYYY-MM-DD. See the schedule note above for why UTC is safe here. */
function utcToday(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Run the ladder for ONE department. Assumes it is already inside that department's context
 * (runWithDepartment), so RLS scopes every read and write; the explicit department_id
 * predicate is defense-in-depth for the pre-P5 owner connection.
 */
/**
 * Write the expiry notices a single ladder transition owes — one per audience (§3.6 names
 * both the bureau and the permit contact).
 *
 * IDEMPOTENCY IS THE DATABASE'S JOB, NOT THIS FUNCTION'S. `ON CONFLICT DO NOTHING` against
 * 0116's UNIQUE (department_id, permit_id, notice_kind, audience) means a re-run inserts
 * nothing and reports 0 written. A read-then-write "have we already notified?" check would
 * race; this cannot. Spec §6 row 10.
 *
 * Returns the number of notice rows actually written (0 on a replay).
 */
async function emitNoticesForTransition(
  { departmentId, permit, property, fromStatus, toStatus, today, departmentName }
) {
  const kind = NOTICE_KIND_BY_STATUS[toStatus];
  // Unreachable: permitNotice.js asserts at require() time that every job-writable status is
  // classified. Kept as a fail-safe so an unclassified rung skips notices instead of throwing
  // and making a healthy transition look like a failed run.
  if (!kind) return 0;

  let written = 0;
  for (const audience of NOTICE_AUDIENCES) {
    const { subject, body } = renderPermitNotice({
      audience, kind, permit, property, departmentName, toStatus,
    });
    const email = audience === 'permittee' ? permitteeEmail(property) : '';
    // A permittee with no address on file is a REAL gap a clerk should close, so it is
    // recorded as 'no_recipient' and surfaced rather than silently dropped (0056 doctrine).
    // Bureau rows carry no address — no DESIGNATED bureau notification address exists
    // (`stations.email` is station-granular and unwired; picking it is a product decision).
    // In-app reading via the PermitJobMonitor IS bureau delivery; the delivery leg
    // (deliverQueuedNotices) deliberately skips them, so they stay 'queued'.
    const state = (audience === 'permittee' && !email) ? 'no_recipient' : 'queued';

    const { rowCount } = await pool.query(
      `INSERT INTO fi_permit_notices
         (department_id, permit_id, notice_kind, audience, from_status, to_status,
          evaluated_for, recipient_email, subject, body, delivery_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (department_id, permit_id, notice_kind, audience) DO NOTHING`,
      [departmentId, permit.id, kind, audience, fromStatus, toStatus, today,
       email, subject, body, state]
    );
    written += rowCount;
  }
  return written;
}

/**
 * The DELIVERY leg of §3.6 — drain this department's queued notices through Resend.
 *
 * DORMANT-SAFE: with RESEND_API_KEY unset nothing is attempted and every row stays
 * 'queued' — the only claimable outcome (0116's header). With the key set, this drains
 * the WHOLE queued backlog for the department, not just this run's rows — which is how
 * the notices generated while email was unconfigured go out the night the key lands.
 *
 * The call shape is routes/fiNotices.js's dormant-safe Resend call, deliberately — same
 * endpoint, same env vars, same from-default. NOT a second delivery mechanism. The one
 * addition is a timeout signal: this loop runs inside the nightly cron, and one dead
 * connection must not stall every department behind it.
 *
 * Only permittee rows with an address are sendable. Bureau rows are IN-APP BY RULING
 * (Matt, 2026-08-03, on a documented market pass): staff-side expiring-permit awareness is
 * dashboards/reports/queues on every platform with public evidence; NO platform ships a
 * department-configured "bureau notification email" for expiry notices — the only staff
 * EMAIL patterns found are per-user event subscriptions (1 platform) and a batch-job
 * completion summary address (1 platform). So in-app reading via the PermitJobMonitor IS
 * bureau delivery, matching the market, and bureau rows stay 'queued'. Do not add a bureau
 * email field without a new market finding — that would exceed the bar (the R1 rule cuts
 * both ways).
 *
 * REFUSED vs FAILED-TO-REACH — the syncCore doctrine, applied to outbound mail:
 *   · a 2xx is 'sent' (recorded with the guarded UPDATE below);
 *   · a definitive refusal (4xx, except 429) is 'failed' — terminal, error recorded,
 *     surfaced on the monitor for a human. A retry cannot help a refused request.
 *   · a transient failure (network error, timeout, 429, 5xx) resolves NOTHING: the row
 *     stays 'queued' and the next nightly run simply tries again. No retry machinery,
 *     no schedule, no counter — non-resolution IS the retry, and it is free.
 *
 * The outcome write is a guarded UPDATE re-asserting delivery_state='queued' — the same
 * optimistic pattern as the ladder's guarded status write. 0116's trigger permits exactly
 * one move out of 'queued', so nothing can rewrite a resolved delivery.
 */
async function deliverQueuedNotices(departmentId) {
  const counts = { attempted: 0, sent: 0, failed: 0, deferred: 0 };
  if (!process.env.RESEND_API_KEY) return counts; // dormant — 'queued' is the honest state

  const { rows } = await pool.query(
    `SELECT id, recipient_email, subject, body
       FROM fi_permit_notices
      WHERE department_id = $1
        AND delivery_state = 'queued'
        AND audience = 'permittee'
        AND recipient_email <> ''
      ORDER BY id`,
    [departmentId]
  );

  for (const n of rows) {
    counts.attempted += 1;
    let outcome; // 'sent' | 'failed' | 'deferred'
    let error = null;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'notices@openscaffoldlabs.com',
          to: n.recipient_email,
          subject: n.subject,
          text: n.body,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) {
        outcome = 'sent';
      } else if (r.status === 429 || r.status >= 500) {
        outcome = 'deferred'; // the provider FAILED to take it — tomorrow's run retries
      } else {
        outcome = 'failed';   // the provider REFUSED it — a retry cannot help
        error = `Resend refused the send (HTTP ${r.status})`;
      }
    } catch (e) {
      outcome = 'deferred';   // network/timeout — we could not TELL; stay queued
      error = String(e && e.message ? e.message : e).slice(0, 500);
    }

    if (outcome === 'deferred') {
      counts.deferred += 1;
      console.error(JSON.stringify({
        kind: 'of_permit_notice_send_deferred', departmentId, noticeId: n.id,
        error: error || 'provider unavailable',
      }));
      continue; // no write — 'queued' stays true, and true is retryable
    }

    const { rowCount } = outcome === 'sent'
      ? await pool.query(
          `UPDATE fi_permit_notices SET delivery_state = 'sent', sent_at = NOW()
            WHERE id = $1 AND delivery_state = 'queued'`, [n.id])
      : await pool.query(
          `UPDATE fi_permit_notices SET delivery_state = 'failed', delivery_error = $2
            WHERE id = $1 AND delivery_state = 'queued'`, [n.id, error]);

    if (rowCount) {
      counts[outcome] += 1;
    } else {
      // Someone resolved this row between our read and our write. With a single nightly
      // cron this should be unreachable; if it ever fires, the record won and we log it.
      console.error(JSON.stringify({
        kind: 'of_permit_notice_delivery_race', departmentId, noticeId: n.id, outcome,
      }));
    }
  }
  return counts;
}

async function runForDepartment(departmentId, today) {
  // The property is LEFT JOINed for the notice's recipient and premises name. The join is
  // scoped to the SAME department on purpose: fi_properties.department_id is nullable, and a
  // property that does not resolve inside this tenant must yield NO contact rather than risk
  // addressing one department's notice to another department's owner. Fails closed.
  const { rows: permits } = await pool.query(
    `SELECT p.id, p.status, p."expiresDate", p.notice_window_days, p.grace_days, p."permitNumber",
            pr.name        AS property_name,
            pr.address     AS property_address,
            pr."ownerEmail" AS owner_email
       FROM fi_permits p
       LEFT JOIN fi_properties pr
              ON pr.id = p."propertyId"
             AND pr.department_id = p.department_id
             AND pr.deleted_at IS NULL
      WHERE p.department_id = $1
        AND p.deleted_at IS NULL
        AND p.status IN ('Active','AboutToExpire','Delinquent')`,
    [departmentId]
  );

  const { rows: deptRows } = await pool.query(
    'SELECT name FROM departments WHERE id = $1', [departmentId]);
  const departmentName = deptRows[0]?.name || '';

  let transitioned = 0;
  let skippedNoTerms = 0;
  let notified = 0;

  for (const p of permits) {
    // Count the un-evaluable ones separately from the merely-unchanged. This is the number
    // that must not disappear: it is how a bureau learns that some permits cannot enter the
    // ladder at all until they are renewed under a catalogue type.
    if (computeLadderStatus(p, today) === NO_TERMS) { skippedNoTerms += 1; continue; }

    const target = nextStatusFor(p, today);
    if (!target) continue;

    // Guarded UPDATE: the WHERE re-asserts the status we decided from. If a human revoked or
    // terminated this permit between the read and the write, zero rows change and the human
    // wins — the correct outcome every time. Never a blind write to a legal record.
    const { rowCount } = await pool.query(
      `UPDATE fi_permits
          SET status = $1, "updatedAt" = NOW()
        WHERE id = $2 AND department_id = $3 AND status = $4 AND deleted_at IS NULL`,
      [target, p.id, departmentId, p.status]
    );
    if (!rowCount) continue; // lost the race to a human act — correct, and not an error

    transitioned += 1;
    await audit(departmentId, SYSTEM_ACTOR, 'update', 'fi_permits', p.id, {
      action: 'ladder_transition', from: p.status, to: target,
      evaluatedFor: today, permitNumber: p.permitNumber ?? null,
    });

    // Notices hang off the TRANSITION, which is why they live here and not in a second
    // scheduler. The status change is already committed at this point, so a notice failure
    // must NOT unwind it or mark the department's run failed — a bureau whose ladder is
    // working should never see "failed" because an email record could not be written.
    // The visible signal is the gap between `transitioned` and `notified` on the ledger row;
    // 0117's header is about exactly that counter.
    try {
      notified += await emitNoticesForTransition({
        departmentId, permit: p, fromStatus: p.status, toStatus: target, today, departmentName,
        property: {
          name: p.property_name, address: p.property_address, ownerEmail: p.owner_email,
        },
      });
    } catch (e) {
      console.error(JSON.stringify({
        kind: 'of_permit_notice_write_failed',
        departmentId, permitId: p.id, to: target,
        error: String(e && e.message ? e.message : e).slice(0, 500),
      }));
    }
  }

  return { examined: permits.length, transitioned, skippedNoTerms, notified };
}

/**
 * Run the job across every department and write ONE ledger row per department per run.
 *
 * The ledger row is written at the END, on purpose: fi_job_runs is physically append-only,
 * and a row that could be updated after the fact cannot answer the only question it exists
 * to answer. A run that dies mid-flight therefore leaves NO row — that absence IS the
 * signal, and it is what the staleness check reads. See 0095's header.
 *
 * A failure in ONE department must not deprive the others of a run or a ledger row, so each
 * department is isolated: its failure is recorded as its own failed row and the sweep
 * continues.
 */
async function runPermitExpiry({ today = utcToday(), departmentIds = null } = {}) {
  const depts = departmentIds
    ? departmentIds.map((id) => ({ id }))
    : (await pool.query('SELECT id FROM departments ORDER BY id')).rows;

  const results = [];
  for (const d of depts) {
    const startedAt = new Date();
    try {
      const counts = await runWithDepartment(d.id, null, () => runForDepartment(d.id, today));

      // Delivery rides the same run, AFTER the ladder: transitions and their notice rows
      // are already committed, so a delivery problem can neither unwind a transition nor
      // mark the department's run failed — the ladder worked. Outcomes live on the notice
      // rows themselves (delivery_state), which is what the monitor reads; the counts here
      // are for the run's JSON result, not the ledger (no new ledger columns — the one
      // delivery seam is 0116's, and it is on the notice row).
      let delivery = { attempted: 0, sent: 0, failed: 0, deferred: 0 };
      try {
        delivery = await runWithDepartment(d.id, null, () => deliverQueuedNotices(d.id));
      } catch (e) {
        console.error(JSON.stringify({
          kind: 'of_permit_notice_delivery_sweep_failed', departmentId: d.id,
          error: String(e && e.message ? e.message : e).slice(0, 500),
        }));
      }

      await runWithDepartment(d.id, null, () => pool.query(
        `INSERT INTO fi_job_runs
           (department_id, job_name, started_at, finished_at, outcome, evaluated_for,
            examined, transitioned, skipped_no_terms, notified)
         VALUES ($1,$2,$3,NOW(),'success',$4,$5,$6,$7,$8)`,
        [d.id, JOB_NAME, startedAt, today,
         counts.examined, counts.transitioned, counts.skippedNoTerms, counts.notified]
      ));
      results.push({ departmentId: d.id, outcome: 'success', ...counts, delivery });
    } catch (e) {
      // Record the failure, then keep going. A department whose read blew up must not look
      // identical to a department the job never reached.
      const message = String(e && e.message ? e.message : e).slice(0, 500);
      try {
        await runWithDepartment(d.id, null, () => pool.query(
          `INSERT INTO fi_job_runs
             (department_id, job_name, started_at, finished_at, outcome, evaluated_for, error)
           VALUES ($1,$2,$3,NOW(),'failed',$4,$5)`,
          [d.id, JOB_NAME, startedAt, today, message]
        ));
      } catch (ledgerErr) {
        // If even the ledger write fails there is nothing left to record it WITH. Log loudly;
        // the staleness check will catch the missing success, which is exactly its purpose.
        console.error(JSON.stringify({
          kind: 'of_permit_expiry_ledger_write_failed',
          departmentId: d.id, error: String(ledgerErr && ledgerErr.message),
        }));
      }
      console.error(JSON.stringify({
        kind: 'of_permit_expiry_failed', departmentId: d.id, error: message,
      }));
      results.push({ departmentId: d.id, outcome: 'failed', error: message });
    }
  }
  return { job: JOB_NAME, evaluatedFor: today, departments: results };
}

module.exports = {
  runPermitExpiry, runForDepartment, emitNoticesForTransition, deliverQueuedNotices,
  utcToday, JOB_NAME, SYSTEM_ACTOR,
};
