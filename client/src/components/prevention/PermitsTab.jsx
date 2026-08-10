// prevention/PermitsTab.jsx — permits inside the Prevention Center (Phase 3, R6).
//
// WHY THIS LIVES HERE
// Permits were split across two legacy-generation screens: a read-only register
// ("Permits & Fees") and the ONLY create/edit path, buried in "Properties & Permits"
// — both sitting next to the real, shipped Prevention Center, in a repo whose App.jsx
// says "Do not resurrect; build inside Prevention Center instead."
//
// That split was not cosmetic. It is WHY routes/fiPermits.js never had an authorization
// gate: permits were never wired into the prevention module, so they never inherited its
// designation model, and any authenticated member could issue and delete them. The
// structural fix and the security fix are one change.
//
// The bureau register — department-wide, soonest-expiry-first, with the fee column — is
// preserved verbatim as this tab's DEFAULT VIEW. It stopped being a separate destination,
// not a separate capability.
//
// GATING: mirrors fiAuth. Recording/editing an APPLICATION needs isInspector. The three
// LIFECYCLE acts — issue, revoke, terminate — and retire need isPreventionAdmin, because
// each mints or withdraws a legal instrument. Every write is enforced server-side
// regardless; this only decides what we OFFER, so nobody is shown a button whose every
// use is refused. (That is not a nicety — the pre-3.1a form offered exactly such buttons.)
//
// WHAT CHANGED IN 3.1a-client, and why the form shrank
// ---------------------------------------------------
// The server half (`84d8e6f`) closed two doors this form was still standing in front of:
// `status` and `issuedDate` are ENGINE-OWNED and now answer 409 ISSUANCE_VIA_ENGINE on
// create AND patch, and an issued permit answers 409 RECORD_FINALIZED on every field. So
// the Status select and the Issued-date input are GONE — offering a control whose every
// use is refused is worse than offering nothing, because the operator blames themselves.
// Creating a permit records an APPLICATION (Pending). Issuing it is a separate, deliberate,
// attributable act with its own door.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Receipt, Search, Plus, Pencil, Trash2, AlertTriangle, BadgeCheck, Ban, ArrowRightLeft, ArrowRight } from 'lucide-react';
import { fi, localToday } from './fiApi';
import {
  PERMIT_TYPES, PERMIT_STATUS_LABELS, REVOCATION_GROUNDS, DEFAULT_PERMIT_STATUS,
  ISSUED_PERMIT_STATUSES, REVOCABLE_PERMIT_STATUSES, TERMINABLE_PERMIT_STATUSES,
  TERMINAL_PERMIT_STATUSES, IN_FORCE_PERMIT_STATUSES, RENEWABLE_PERMIT_STATUSES,
} from '../../data/fireInspections';
import { Section, Field, Input, Select, TextArea, Btn, Modal, EmptyState, Badge, Spinner, RowActions } from './ui';
import PermitCatalogue from './PermitCatalogue';
import PermitJobMonitor from './PermitJobMonitor';

const d10 = (v) => (v ? String(v).slice(0, 10) : '');
const fmtDate = (d) => (d ? d10(d) : '—');
// Money renders to 2dp because the column IS money (NUMERIC(12,2) since migration
// 0090). "$350" and "$350.00" are the same number; only one of them looks like a fee.
const fmtFee = (f) => (f || f === 0 ? `$${Number(f).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');

// Display label for a status whose machine name isn't presentable. Display ONLY — never
// matched against, never an input to a decision.
const statusLabel = (s) => PERMIT_STATUS_LABELS[s] || s || 'Unknown';

// EXPIRY IS THE STORED STATUS, NOT A CALCULATION.
//
// The old read-time `is_expired` flag is DELETED — 3.1b's stored ladder landed, and the
// scheduled permit-expiry job is the only writer of every status flip (the market model:
// zero documented platforms derive expiry at read time; PHASE3-31B-MARKET-AUDIT §3 row 1).
// "Lapsed" is now a fact the record itself states: issued, past its term (not in force),
// and not in a terminal state that ended it for a legally distinct reason (Revoked /
// TerminatedByTransfer are NOT "lapsed"). Facet sets, never status literals.
const isLapsed = (p) => ISSUED_PERMIT_STATUSES.includes(p.status)
  && !IN_FORCE_PERMIT_STATUSES.includes(p.status)
  && !TERMINAL_PERMIT_STATUSES.includes(p.status);

// Ground code → label. The CODE is the record; the label is presentation and is never
// matched against. An unrecognized code renders as itself rather than as a guess — a
// revocation ground we cannot name is a thing a human needs to see, not smooth over.
const groundLabel = (code) => REVOCATION_GROUNDS.find((g) => g.code === code)?.label || code;
const LOCAL_GROUND = 'LOCAL_GROUND';

// IFC §105.3.1 names the four changes that terminate a permit. Coded so the bureau can
// answer "how many permits terminated on a change of ownership last year".
const TRANSFER_REASONS = [
  { code: 'OWNERSHIP', label: 'Change of ownership' },
  { code: 'TENANCY',   label: 'Change of tenancy' },
  { code: 'OCCUPANCY', label: 'Change of occupancy' },
  { code: 'OPERATION', label: 'Change of operation' },
];

// The three lifecycle acts, and exactly when each is lawful. Mirrors the engine's
// preconditions so we never offer an act the server will refuse — but the SERVER is the
// control, and these are read-only opinions about what to render.
// ⚠ SET MEMBERSHIP, NEVER A LITERAL. 3.1b's AboutToExpire/Delinquent (0094) are issued,
// in-force permits — a `=== 'Active'` test would silently stop offering Revoke and
// Terminate on a live permit, and the operator would have no idea why.
const canIssue     = (p) => p.status === DEFAULT_PERMIT_STATUS; // 'Pending' is the sole issuable state
const canRevoke    = (p) => REVOCABLE_PERMIT_STATUSES.includes(p.status);
const canTerminate = (p) => TERMINABLE_PERMIT_STATUSES.includes(p.status);
// 3.1b renewal. Withdrawn at Expired ON PURPOSE — that is the documented market behaviour,
// and an expired permit is a new application, not a renewal. We deliberately do NOT try to
// mirror the type's `allow_renewal` switch here: the row does not carry the type, and the
// engine refuses with a named 409 (RENEWAL_NOT_ALLOWED) that we render verbatim. Guessing at
// it client-side would mean two answers to one question, and the wrong one would hide a
// lawful act. `superseded_by_permit_id` already set = a renewal is in flight, so the act is
// spent — the server enforces that too (ALREADY_RENEWED).
const canRenew     = (p) => RENEWABLE_PERMIT_STATUSES.includes(p.status)
  && !p.superseded_by_permit_id;
// A permit is editable only while it is still an application. Once issued or terminal it
// is a finalized legal record: 409 RECORD_FINALIZED, unconditional, every field.
const canEdit      = (p) => !ISSUED_PERMIT_STATUSES.includes(p.status) && !p.issuedDate
  && !TERMINAL_PERMIT_STATUSES.includes(p.status);

function statusTone(p) {
  const s = p.status || '';
  if (TERMINAL_PERMIT_STATUSES.includes(s)) return 'red';
  // Issued but past its term — Delinquent and Expired. Written as the FACET rather than
  // the value so the colour cannot drift away from the meaning.
  if (ISSUED_PERMIT_STATUSES.includes(s) && !IN_FORCE_PERMIT_STATUSES.includes(s)) return 'red';
  if (IN_FORCE_PERMIT_STATUSES.includes(s)) return 'green';
  if (s === DEFAULT_PERMIT_STATUS) return 'amber';
  return 'gray';
}

// The badge renders the STORED status — the ladder is authoritative, and the job is the
// only writer. The old "record says Active" chip (a derived lapse shown against a stale
// stored value) is deleted with the derivation: there is no second calendar to disagree
// with the record anymore. Job liveness worries belong to PermitJobMonitor, not this cell.
function StatusCell({ p }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge tone={statusTone(p)}>{statusLabel(p.status)}</Badge>
      {/* 3.1b — the two job-written statuses are the ones an operator cannot interpret from
          a colour alone, so they carry their DATES. This is also where the module refuses to
          render a verdict: "term ended" is a fact the record knows; whether the business may
          lawfully operate during grace is the AHJ's call, not ours, so the chip says what
          happened and by when, and stops there. */}
      {p.status === 'AboutToExpire' && p.expiresDate && (
        <span className="text-xs whitespace-nowrap text-gray-600 dark:text-gray-400">
          renew by {d10(p.expiresDate)}
        </span>
      )}
      {p.status === 'Delinquent' && p.expiresDate && (
        <span className="text-xs whitespace-nowrap text-gray-600 dark:text-gray-400">
          term ended {d10(p.expiresDate)}
          {Number.isInteger(p.grace_days) && p.grace_days > 0 && (
            <> · renewable {p.grace_days} more day{p.grace_days === 1 ? '' : 's'}</>
          )}
        </span>
      )}
    </span>
  );
}

export default function PermitsTab({ fiCtx }) {
  // 3.1b — the register, the catalogue and the expiry job's health are three different
  // questions a bureau asks, so they are three views rather than one long page. The register
  // stays the default: it is what someone opens the tab to see.
  const [view, setView] = useState('register');
  const [permits, setPermits] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // permit object | 'new' | null
  const [retiring, setRetiring] = useState(null);
  const [acting, setActing] = useState(null);   // { permit, verb: 'issue'|'revoke'|'terminate' }
  const [transferred, setTransferred] = useState(null); // { terminated, successor }
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  /**
   * Column priority is decided by the PANE's width, not the window's.
   *
   * The window is the wrong signal: the same 1386px window gives this table a 986px pane with
   * the sidebar expanded and ~1210px with it collapsed, which is either side of the threshold.
   * A media query would drop Fee and Issued on a wide monitor whose sidebar happens to be open,
   * and keep them on a narrow one whose sidebar is shut — exactly backwards. So it measures the
   * element that actually holds the columns.
   *
   * 1180 = the measured 8-column content need (1160px) plus a little headroom, so the wide tier
   * is only chosen when all eight can actually be read.
   */
  const [paneW, setPaneW] = useState(null);
  const roRef = useRef(null);
  /**
   * A CALLBACK ref, not `useRef` + `useEffect([])`, and that is the whole point.
   *
   * The first version was `useEffect(() => { observe(ref.current) }, [])`, which is wrong here and
   * failed SILENTLY on production: the table only renders once permits have loaded, so at mount the
   * component is in its loading branch, `ref.current` is null, the effect returns early — and with
   * `[]` deps it never runs again. The observer was never attached, `paneW` stayed null forever, and
   * the register sat permanently in the wide tier. Caught by measuring prod: a 986px pane was
   * showing all eight columns.
   *
   * A callback ref fires whenever the node attaches or detaches, so it cannot miss a late mount.
   * It also seeds the width synchronously from the node instead of waiting for the observer's first
   * callback, so the correct tier is chosen on the first paint that has a table.
   */
  const attachTable = useCallback((node) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!node) return;
    setPaneW(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;   // jsdom / very old Safari: keep the seeded width
    const ro = new ResizeObserver(([e]) => setPaneW(e.contentRect.width));
    ro.observe(node);
    roRef.current = ro;
  }, []);
  // null only before a table has ever attached. Defaulting to the WIDE tier there means a wide pane
  // never flashes the reduced set; a narrow one corrects on the same paint, from the seed above.
  const showAllCols = paneW === null || paneW >= 1180;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [permRes, propRes] = await Promise.all([
        fi.permits.list(),
        fi.properties.list().catch(() => ({ data: [] })),
      ]);
      setPermits(permRes?.data || []);
      setProperties(propRes?.data || []);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load the permit register.');
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const propsById = useMemo(() => {
    const m = {};
    for (const p of properties) m[p.id] = p;
    return m;
  }, [properties]);

  // Resolve a successor's permit NUMBER from the id the server stored. The whole register
  // is already loaded, so this needs no extra request. Returns null when the successor was
  // retired (soft-deleted rows don't come back) — the caller falls back to the id, because
  // "replaced by #41" is still true and more useful than showing nothing.
  const permitsById = useMemo(() => {
    const m = {};
    for (const p of permits) m[String(p.id)] = p;
    return m;
  }, [permits]);
  const successorNumber = useCallback(
    (id) => permitsById[String(id)]?.permitNumber || null,
    [permitsById],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const enriched = permits.map((p) => {
      const prop = propsById[p.propertyId];
      return {
        ...p,
        _propName: prop ? (prop.name || `Property #${p.propertyId}`) : `Property #${p.propertyId}`,
        _propAddr: prop?.address || '',
      };
    });
    const filtered = q
      ? enriched.filter((p) => [p.permitNumber, p.type, p.status, statusLabel(p.status), p.issuedBy, p._propName, p._propAddr]
        .some((v) => (v || '').toString().toLowerCase().includes(q)))
      : enriched;
    // Soonest expiry first; permits with no expiry sort to the bottom. This is the
    // bureau's actual reading order — what lapses next is what needs work.
    return filtered.slice().sort((a, b) => {
      const av = a.expiresDate ? d10(a.expiresDate) : '9999-99-99';
      const bv = b.expiresDate ? d10(b.expiresDate) : '9999-99-99';
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
  }, [permits, propsById, search]);

  const expiringSoon = useMemo(() => {
    const today = localToday();
    const in90 = new Date(Date.now() + 90 * 86400000).toLocaleDateString('en-CA');
    return permits.filter((p) => p.expiresDate && d10(p.expiresDate) >= today && d10(p.expiresDate) <= in90).length;
  }, [permits]);

  // Applications the bureau still owes a decision on. Surfaced in the subtitle because a
  // Pending permit has no expiry date, so it sorts to the BOTTOM of a register ordered by
  // soonest expiry — the one place nobody looks.
  const awaitingIssue = useMemo(() => permits.filter(canIssue).length, [permits]);

  async function handleSave(form) {
    setBusy(true);
    setFormError(null);
    try {
      // Only send what the server accepts — its schemas are STRICT and refuse unknown
      // keys (silently dropping them is how a field "saves" in the UI and vanishes in
      // the database). So the enriched _propName/_propAddr must not ride along.
      // `status` and `issuedDate` are DELIBERATELY ABSENT. They are engine-owned: sending
      // either answers 409 ISSUANCE_VIA_ENGINE on create and on patch alike. A permit is
      // recorded as an application (Pending) and issued through its own door.
      const body = {
        propertyId: Number(form.propertyId),
        type: form.type,
        permitNumber: form.permitNumber,
        expiresDate: form.expiresDate || '',
        issuedBy: form.issuedBy || '',
        fee: form.fee === '' || form.fee === null || form.fee === undefined ? '' : Number(form.fee),
        conditions: form.conditions || '',
        notes: form.notes || '',
      };
      if (form.id) await fi.permits.patch(form.id, body);
      else await fi.permits.create(body);
      setEditing(null);
      await load();
    } catch (e) {
      // Speak the server's refusal back in its own terms. `code` is the machine token
      // (utils/api carries it through) — never match on the message text.
      if (e.code === 'DUPLICATE_PERMIT_NUMBER') {
        setFormError({ field: 'permitNumber', message: 'That permit number is already used in this department. Permit numbers are never reused — even by a retired permit.' });
      } else if (e.code === 'INVALID_PERMIT_STATUS') {
        setFormError({ field: 'status', message: `${e.message}${e.details?.length ? ` Allowed: ${e.details.join(', ')}.` : ''}` });
      } else if (e.code === 'PROPERTY_NOT_FOUND') {
        setFormError({ field: 'propertyId', message: 'That property is no longer on record. Pick another.' });
      } else if (e.code === 'RECORD_FINALIZED') {
        // Reachable if the permit was issued in another tab between opening this form and
        // saving it. Say what actually happened rather than "could not save".
        setFormError({ field: null, message: `${e.message} Close this and reload — the register will show its current state.` });
      } else if (e.code === 'ISSUANCE_VIA_ENGINE') {
        // Should be unreachable: this form no longer sends status or issuedDate. If it
        // fires, the form has regrown a control it must not have.
        setFormError({ field: null, message: `${e.message} (This form should not be sending that field — please report it.)` });
      } else if (e.code === 'FORBIDDEN_FI') {
        setFormError({ field: null, message: e.message });
      } else {
        setFormError({ field: null, message: e.message || 'Could not save the permit.' });
      }
    } finally {
      setBusy(false);
    }
  }

  // ── the three lifecycle acts ───────────────────────────────────────────────
  // One handler, because they share a shape: check-then-write on the server, a refusal
  // carries a `code`, and success means reload. What differs is the body and what we do
  // with the answer. NOTHING here re-derives the server's preconditions — a 409 is the
  // server telling us the world moved, and it is reported, never retried.
  async function runLifecycle(verb, permit, body) {
    setBusy(true);
    setFormError(null);
    try {
      if (verb === 'issue') {
        await fi.permits.issue(permit.id, body);
      } else if (verb === 'revoke') {
        await fi.permits.revoke(permit.id, body);
      } else if (verb === 'renew') {
        const res = await fi.permits.renew(permit.id, body);
        // Same reasoning as a transfer's successor: the renewal is born Pending and the
        // bureau now owes it an issuance decision. Surfacing it beats letting it appear
        // unannounced in a list sorted by expiry. `transferred` holds { terminated,
        // successor }; renewal reuses the panel with the parent in the first slot, since
        // the shape is the same — one record acted on, one record minted.
        if (res?.data) setTransferred({ terminated: res.data.parent, successor: res.data.renewal, renewed: true });
      } else {
        const res = await fi.permits.terminate(permit.id, body);
        // A transfer mints a successor. Show it — a permit the bureau now owes an issuance
        // decision on should not appear silently in a list sorted by expiry date.
        if (res?.data) setTransferred(res.data);
      }
      setActing(null);
      await load();
    } catch (e) {
      // Switch on `code` ONLY — utils/api carries it through, and matching on message text
      // is how a refusal starts being misread the first time someone rewords a string.
      const known = {
        NOT_ISSUABLE:   e.message,
        NOT_REVOCABLE:  e.message,
        NOT_TERMINABLE: e.message,  // may name an ORPHANED successor — render it verbatim
        // 3.1b renewal refusals. Every one is rendered VERBATIM: each names the specific
        // lawful reason (expired, type disallows it, one already in flight) and the server
        // is the only thing that knows which applies.
        NOT_RENEWABLE:       e.message,  // may also name an ORPHANED renewal — verbatim
        ALREADY_RENEWED:     e.message,  // names the child already in flight
        RENEWAL_NOT_ALLOWED: e.message,  // the permit type's allow_renewal switch is off
        TYPE_REQUIRED:       e.message,  // pre-catalogue permit — nothing to resolve a term from
        TYPE_NOT_FOUND:      e.message,
        RECORD_FINALIZED: e.message,
        LOCAL_GROUND_CITATION_REQUIRED: e.message,
        REVOCATION_BASIS_REQUIRED: e.message,
        REVOCATION_GROUND_REQUIRED: e.message,
        INVALID_REVOCATION_GROUND: e.message,
        // Wording follows the VERB, because the same server code arrives from two acts and
        // "successor" is wrong for a renewal. Caught by the audit pass, not by a test: the
        // suite proves the server refuses a duplicate, and says nothing about which field the
        // client then highlights.
        DUPLICATE_PERMIT_NUMBER: verb === 'renew'
          ? 'That renewal permit number is already used in this department. Permit numbers are never reused — even by a retired permit.'
          : 'That successor permit number is already used in this department. Permit numbers are never reused — even by a retired permit.',
        FORBIDDEN_FI: e.message,
        ISSUANCE_BLOCKED: e.message,
      };
      setFormError({
        // The field name must match the INPUT in the modal that is open, or the inline error
        // silently renders nowhere and the operator sees only the banner. Renewal's input is
        // `renewalPermitNumber`; the transfer's is `successorPermitNumber`.
        field: e.code === 'DUPLICATE_PERMIT_NUMBER'
          ? (verb === 'renew' ? 'renewalPermitNumber' : 'successorPermitNumber')
          : null,
        message: known[e.code] || e.message || 'The server refused that action.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRetire() {
    setBusy(true);
    try {
      await fi.permits.remove(retiring.id);
      setRetiring(null);
      await load();
    } catch (e) {
      setError(e.message || 'Could not retire the permit.');
      setRetiring(null);
    } finally {
      setBusy(false);
    }
  }

  // Only the FIRST load takes over the tab. A refresh after saving keeps the table
  // on screen — blanking it made a successful save look like something had gone wrong.
  if (loading && firstLoad) return <Spinner label="Opening the permit register…" />;

  const VIEWS = [
    { key: 'register',  label: 'Register' },
    { key: 'catalogue', label: 'Permit types' },
    { key: 'job',       label: 'Expiry job' },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Permits views" className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-fit">
        {VIEWS.map((v) => (
          <button
            key={v.key} type="button" role="tab" aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className={`px-4 py-2 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
              view === v.key
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-900/40'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'catalogue' && <PermitCatalogue fiCtx={fiCtx} />}
      {view === 'job' && <PermitJobMonitor />}

      {view === 'register' && (
    <div className="space-y-4">
      <Section
        title="Permits"
        subtitle={`${permits.length} on record · ${awaitingIssue} awaiting issuance · ${expiringSoon} expiring within 90 days · soonest expiry first`}
        actions={fiCtx?.isInspector
          // "Record an application", NOT "Issue permit" — creating this record does not
          // issue anything. It lands Pending, and issuing it is a separate bureau act.
          ? <Btn variant="primary" onClick={() => { setFormError(null); setEditing('new'); }}><Plus size={16} aria-hidden="true" /> Record an application</Btn>
          : null}
      >
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10"
            placeholder="Search by permit #, type, property, or status…" aria-label="Search permits" />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={search ? 'Nothing matches that search' : 'No permits on record yet'}
            body={search
              ? 'Try a different permit number, type, or property name.'
              : 'Every permit this bureau issues lands here, soonest expiry first — so what lapses next is the first thing you see.'}
            action={!search && fiCtx?.isInspector
              ? <Btn variant="primary" onClick={() => { setFormError(null); setEditing('new'); }}><Plus size={16} aria-hidden="true" /> Record the first one</Btn>
              : null}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-700 pb-24">
            {/* pb-24 above is FAB CLEARANCE, not decoration. The three floating buttons are
                position:fixed at the bottom-right, and with Actions pinned to the right edge they
                land on top of it — measured on prod: 2 of 6 Retire buttons covered at the default
                scroll position. Bottom padding lets any row be scrolled clear, the same remedy
                already applied elsewhere in the app ("every page leaves enough room at the bottom
                that you can always scroll the last item clear of the buttons").
                NOTE: the comment lives INSIDE the div deliberately — as a sibling before it, inside
                this ternary branch, it is two expressions in one branch and the build fails. */}
            {/* table-fixed IS THE FIX for the 219px of hidden columns. With auto layout the
                browser sizes columns to their content, the eight of them wanted 1225px in a
                1006px container, and Status/Issued/Expires/Fee fell behind a horizontal scroll.
                A register whose own caption says "soonest expiry first" cannot hide Expires.
                Fixed layout distributes the container width by the percentages below and truncates
                inside cells instead, so the hidden overflow is 0 by construction at any width —
                that guarantee holds in BOTH tiers below, because percentages summing to 100 can
                never exceed the container.
 
                THE TIERS ARE THE SECOND HALF OF THE FIX. Fitting the table was not enough: at a
                986px pane the eight columns' own content wants 1160px, so fixed layout bought the
                overflow guarantee by ellipsising SOMEBODY — and measured on prod that somebody was
                Type, cut on 6 of 6 rows ("Occupa…", "Special …", "Hazard…"), which cannot
                distinguish an Occupancy Permit from an Annual Occupancy Permit. Shaving percentages
                cannot resolve it; three attempts proved that. What resolves it is COLUMN PRIORITY:
                below 1180px the two lowest-value columns (Issued — historical, and Fee — which
                lives on the permit record and its invoice) step aside so Type and Property get
                readable width. Expires never steps aside: it is the sort key and the thing that
                drives action. */}
            <table ref={attachTable} className="w-full text-sm table-fixed">
              <caption className="sr-only">Department permit register, soonest expiry first</caption>
              {/* Widths are per tier and are budgeted against MEASURED need, not chosen for
                  evenness. Need at a 986px pane: Permit# 121 · Type 211 · Property 255 ·
                  Status 138 · Issued 91 · Expires 101 · Fee 80 · Actions 163. */}
              {showAllCols ? (
                <colgroup>
                  <col className="w-[11%]" />{/* Permit # */}
                  <col className="w-[18%]" />{/* Type */}
                  <col className="w-[21%]" />{/* Property — name + address */}
                  <col className="w-[12%]" />{/* Status */}
                  <col className="w-[8%]"  />{/* Issued */}
                  <col className="w-[9%]"  />{/* Expires — the sort key; never dropped */}
                  <col className="w-[7%]"  />{/* Fee */}
                  {fiCtx?.isInspector && <col className="w-[14%]" />}{/* Actions */}
                </colgroup>
              ) : (
                <colgroup>
                  {/* 🔴 REBALANCED 2026-08-04 (late PM) after MEASURING this tier on prod, not
                      eyeballing it. The fold was right — issued date + fee ride in the Expires
                      cell rather than being dropped — but the cell was 18px too narrow to show
                      the result, so `$350.00` rendered `$3…`. On a money column that is worse
                      than truncation: `$350.00` and `$3.00` are indistinguishable until you
                      hover, so a register you scan for fees cannot be scanned.
                      The width was already in the budget: ACTIONS measured 168px to hold a
                      single 44px overflow button, and STATUS 138px for a short badge. Moving
                      4% (≈39px) from those two into Expires covers the 18px shortfall with room
                      spare. Actions keeps 13% (≈128px) — still ~3x the 44px control it holds. */}
                  <col className="w-[13%]" />{/* Permit # — 128px vs 121 needed */}
                  <col className="w-[20%]" />{/* Type — 197px: the whole point of this tier */}
                  <col className="w-[18%]" />{/* Property */}
                  <col className="w-[12%]" />{/* Status — badge only; 2% went to Expires */}
                  <col className="w-[22%]" />{/* Expires + the folded issued date and fee — was 18% and clipped the fee */}
                  {fiCtx?.isInspector && <col className="w-[13%]" />}{/* Actions — one 44px overflow button; was 17% */}
                </colgroup>
              )}
              <thead>
                {/* The header labels TRUNCATE for the same reason the cells do: a <th> whose label
                    plus px-3 padding exceeds its column pushes the whole table wider than the pane,
                    and a header cannot wrap below its longest word — "Permit #" needs 59px of
                    min-content in a 49px column on an iPad mini, which is the last 5px of the
                    narrow-pane overflow. An ellipsised label with a title attribute is the honest
                    trade: the alternative is a horizontal scroll that hides whole columns. */}
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <th scope="col" className="px-3 py-3 font-semibold truncate" title="Permit #">Permit #</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate" title="Type">Type</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate" title="Property">Property</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate" title="Status">Status</th>
                  {showAllCols && <th scope="col" className="px-3 py-3 font-semibold truncate" title="Issued">Issued</th>}
                  <th scope="col" className="px-3 py-3 font-semibold truncate" title="Expires">Expires</th>
                  {showAllCols && <th scope="col" className="px-3 py-3 font-semibold text-right truncate" title="Fee">Fee</th>}
                  {/* PINNED RIGHT. Measured on prod 2026-08-04: the table is 1045px inside a
                      1006px scroller, so 39px sat behind a horizontal scroll — and the hidden
                      column was this one, the one holding Retire and Terminate. Consequential
                      actions must not require a sideways scroll to reach. Sticky keeps them on
                      screen at any width; the bg + left border stop rows sliding under it. */}
                  {fiCtx?.isInspector && (
                    <th scope="col"
                        className="px-3 py-3 font-semibold text-right truncate sticky right-0 z-10
                                   bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-700"
                        title="Actions">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {rows.map((p) => (
                  <tr key={p.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-gray-100 truncate" title={p.permitNumber || undefined}>{p.permitNumber || '—'}</td>
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-300 truncate" title={p.type || undefined}>{p.type || '—'}</td>
                    {/* Measured on prod 2026-08-04: rows were 149–165px tall because this cell
                        stacked the property name over the FULL address in a narrow column —
                        "Maplewood Town Center Mall" wrapped to three lines and the address to
                        five, so six permits filled ~950px and the register scrolled for a tiny
                        dataset. Each line is now one line, truncated, with the full value on
                        hover via title — the register is a scanning surface, and the address in
                        full belongs on the permit itself. */}
                    {/* max-w only, NO min-w. The first version set min-w-[12rem] to keep names
                        legible; measured on prod it widened the table so the hidden overflow went
                        39px -> 219px, pushing Issued/Expires/Fee behind the scroll instead. The
                        names are not clipped without it (measured: clipped false), so the
                        min-width bought nothing and cost three readable columns. */}
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-300">
                      <div className="font-medium text-gray-800 dark:text-gray-200 truncate"
                           title={p._propName || undefined}>{p._propName}</div>
                      {p._propAddr && (
                        <div className="text-xs text-gray-400 truncate" title={p._propAddr}>{p._propAddr}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusCell p={p} />
                      {/* The supersession chain. A terminated permit is not a dead end — it
                          points at the permit that replaced it, which is the only way to
                          read a transfer as one continuous story. */}
                      {p.superseded_by_permit_id && (
                        <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <ArrowRight size={12} aria-hidden="true" />
                          <span>
                            Replaced by{' '}
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                              {successorNumber(p.superseded_by_permit_id) || `permit #${p.superseded_by_permit_id}`}
                            </span>
                          </span>
                        </div>
                      )}
                      {p.status === 'Revoked' && p.revocation_ground && (
                        <div className="mt-1 text-xs text-gray-600 dark:text-gray-400"
                          title={p.revocation_basis || undefined}>
                          {groundLabel(p.revocation_ground)}
                          {p.revocation_ground_citation ? ` — ${p.revocation_ground_citation}` : ''}
                        </div>
                      )}
                    </td>
                    {showAllCols && (
                      <td className="px-3 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(p.issuedDate)}</td>
                    )}
                    <td className="px-3 py-3">
                      <div className={`truncate ${isLapsed(p) ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                        {fmtDate(p.expiresDate)}
                      </div>
                      {/* 🔴 EVERY nowrap CELL IN THIS TABLE MUST ALSO CLIP. `whitespace-nowrap`
                          with `overflow: visible` lets a cell's text push the table wider than its
                          pane, and `table-fixed` does NOT prevent that — it fixes the COLUMN
                          widths, not a cell's ability to paint past them. That is what produced
                          19px of hidden overflow on an 11" iPad portrait and 50px on a mini while
                          the same table measured 0 at 1366px, and it took five ablations to find
                          because the overflowing text sits UNDERNEATH the Actions column, so a
                          probe for "any element right of the scroller" reports nothing. The line
                          below was the biggest single offender (45 of that 50px) — an unclipped
                          "issued 2024-03-01 · $350.00" is 171px of nowrap text in a 68px cell.
                          `truncate` (overflow-hidden + ellipsis + nowrap) is the safe form; plain
                          `whitespace-nowrap` is not. Permit # and the Expires date had the same
                          defect and were fixed with it.

                          THE NARROW TIER FOLDS, IT DOES NOT DROP. Hiding Issued and Fee outright
                          would make them unreachable: this register has no row-detail view, and
                          Edit is offered only while a permit is still an application, so for an
                          ISSUED permit there would be no surface left showing what it cost. Losing
                          a value is not an acceptable price for fitting a column. They ride here as
                          a second line instead — the row already has the vertical room (Property
                          stacks two lines in the same 69px), and each is self-labelling so the
                          missing headers cost nothing. */}
                      {!showAllCols && (
                        <div className="text-xs text-gray-400 truncate tabular-nums"
                             title={`issued ${fmtDate(p.issuedDate)}${p.fee != null && p.fee !== '' ? ` · ${fmtFee(p.fee)}` : ''}`}>
                          issued {fmtDate(p.issuedDate)}
                          {p.fee != null && p.fee !== '' ? ` · ${fmtFee(p.fee)}` : ''}
                        </div>
                      )}
                    </td>
                    {showAllCols && (
                      <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">{fmtFee(p.fee)}</td>
                    )}
                    {fiCtx?.isInspector && (
                      // Pinned to match the header — see the <th>. The bg is explicit (and
                      // repeated for hover via group-hover) because a sticky cell with a
                      // transparent background lets the scrolling row show through underneath it.
                      <td className="px-3 py-3 text-right sticky right-0 z-10
                                     bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/50
                                     border-l border-gray-100 dark:border-gray-700">
                        {/* WRAPS — deliberately. How many buttons this cell holds is a
                            function of the permit's STATE, not of the column: an
                            about-to-expire permit that is also revocable and transferable
                            offers Renew + Revoke + Transfer + Retire, which is ~300px, well
                            past the 21% (207px) this column gets. A fixed column plus a
                            nowrap row is a clipped CONTROL waiting for the right permit —
                            which is how the Issue button ended up 3px short on the one
                            pending row in the seed data. Wrapping bounds the cell by
                            construction: any number of verbs stacks vertically instead of
                            running off the edge. Rows already vary in height (69–102px), so
                            a second line on the busiest row costs nothing structural. */}
                        {/* WRAPS, for a small measured reason — NOT the one first written here.
                            The original comment claimed this fixed the 19px/50px of narrow-pane
                            overflow the iPad projects found. It did not: ablation showed the
                            Actions cells fit (65px box, 64px content) and removing them changed
                            nothing. That overflow came from nowrap cells with overflow:visible
                            (see the note on the Expires cell). The honest reason to wrap is
                            narrower: at the WIDE tier Actions gets 14% — 138px — and a labelled
                            primary button (91px) plus the 44px trigger plus the gap is 139px, so
                            nowrap clips it by 1px. A wrap costs a taller row only on the rows that
                            carry a primary verb, and a clipped control is a defect where a
                            two-line cell is just a layout. */}
                        <div className="flex flex-wrap justify-end items-center gap-1">
                          {/* THE PRIMARY VERB STAYS A LABELLED BUTTON. Issue and Renew are the
                              acts the operator opened this register to perform — Issue on a
                              pending application, Renew in the about-to-expire window. Burying
                              either behind a menu would trade the width defect for a
                              discoverability one. They are mutually exclusive by state (a
                              permit cannot be both awaiting issuance and renewable), so this
                              slot costs ONE button, never two. */}
                          {fiCtx?.isPreventionAdmin && canIssue(p) && (
                            <Btn variant="primary" className="px-3" onClick={() => { setFormError(null); setActing({ permit: p, verb: 'issue' }); }}>
                              <BadgeCheck size={15} aria-hidden="true" /> Issue
                            </Btn>
                          )}
                          {fiCtx?.isPreventionAdmin && canRenew(p) && (
                            <Btn variant="primary" className="px-3"
                              onClick={() => { setFormError(null); setActing({ permit: p, verb: 'renew' }); }}
                              title="Renew — create a new permit pre-populated from this one"
                              aria-label={`Renew permit ${p.permitNumber || p.id}`}>Renew</Btn>
                          )}
                          {/* EVERYTHING ELSE COLLAPSES. These were icon-only buttons with
                              tooltips, which inverted risk and labelling: the benign act
                              (Issue) carried the only visible word while the two irreversible
                              ones (⊘ Revoke, ⇄ Transfer) were glyphs a sighted operator could
                              not tell apart without clicking. In a menu they carry their real
                              names, which is strictly better labelling AND makes the column's
                              width constant. Edit appears only while the permit is still an
                              application — an issued or terminal permit answers 409
                              RECORD_FINALIZED on every field, so offering it there would be a
                              control whose every use is refused. */}
                          <RowActions
                            label={`Actions for permit ${p.permitNumber || p.id}`}
                            items={[
                              canEdit(p) && {
                                key: 'edit', label: 'Edit application', icon: Pencil,
                                hint: 'Only possible before the permit is issued',
                                onSelect: () => { setFormError(null); setEditing(p); },
                              },
                              fiCtx?.isPreventionAdmin && canTerminate(p) && {
                                key: 'transfer', label: 'Transfer to a new holder', icon: ArrowRightLeft,
                                hint: 'Terminates this permit and creates a successor',
                                onSelect: () => { setFormError(null); setActing({ permit: p, verb: 'terminate' }); },
                              },
                              fiCtx?.isPreventionAdmin && canRevoke(p) && {
                                key: 'revoke', label: 'Revoke permit', icon: Ban, danger: true,
                                hint: 'Withdraws this permit on an enumerated ground',
                                onSelect: () => { setFormError(null); setActing({ permit: p, verb: 'revoke' }); },
                              },
                              fiCtx?.isPreventionAdmin && {
                                key: 'retire', label: 'Retire from register', icon: Trash2, danger: true,
                                hint: 'Removes it from the register; the record and its number are kept',
                                onSelect: () => setRetiring(p),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
      )}

      {editing && (
        <PermitForm
          initial={editing === 'new' ? null : editing}
          properties={properties}
          busy={busy}
          formError={formError}
          onClose={() => { setEditing(null); setFormError(null); }}
          onSave={handleSave}
        />
      )}

      {acting?.verb === 'issue' && (
        <IssueModal permit={acting.permit} busy={busy} formError={formError}
          onClose={() => { setActing(null); setFormError(null); }}
          onSubmit={(body) => runLifecycle('issue', acting.permit, body)} />
      )}

      {acting?.verb === 'revoke' && (
        <RevokeModal permit={acting.permit} busy={busy} formError={formError}
          onClose={() => { setActing(null); setFormError(null); }}
          onSubmit={(body) => runLifecycle('revoke', acting.permit, body)} />
      )}

      {acting?.verb === 'terminate' && (
        <TerminateModal permit={acting.permit} busy={busy} formError={formError}
          onClose={() => { setActing(null); setFormError(null); }}
          onSubmit={(body) => runLifecycle('terminate', acting.permit, body)} />
      )}

      {acting?.verb === 'renew' && (
        <RenewModal permit={acting.permit} busy={busy} formError={formError}
          onClose={() => { setActing(null); setFormError(null); }}
          onSubmit={(body) => runLifecycle('renew', acting.permit, body)} />
      )}

      {transferred && (
        <TransferResult data={transferred} onClose={() => setTransferred(null)} />
      )}

      {retiring && (
        <Modal title="Retire this permit?" onClose={() => setRetiring(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-bold">{retiring.permitNumber}</span> — {retiring.type}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              The record is retained, not erased — it stays in the file and its permit number
              stays consumed, so it can never be reissued to something else.
            </p>
            <div className="flex gap-3 justify-end">
              <Btn onClick={() => setRetiring(null)} disabled={busy}>Cancel</Btn>
              <Btn variant="danger" onClick={handleRetire} disabled={busy}>{busy ? 'Retiring…' : 'Retire permit'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── the issue / edit form ────────────────────────────────────────────────────
function PermitForm({ initial, properties, busy, formError, onClose, onSave }) {
  const [form, setForm] = useState({
    id:           initial?.id ?? null,
    propertyId:   initial?.propertyId ?? '',
    type:         initial?.type ?? '',
    permitNumber: initial?.permitNumber ?? '',
    expiresDate:  d10(initial?.expiresDate),
    // `status` and `issuedDate` are NOT in this form and must not come back. They are
    // written only by the issuance engine; a form field for either is a control whose
    // every use is refused (409 ISSUANCE_VIA_ENGINE), on create as well as on edit.
    issuedBy:     initial?.issuedBy ?? '',
    fee:          initial?.fee ?? '',
    conditions:   initial?.conditions ?? '',
    notes:        initial?.notes ?? '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const err = (field) => (formError && formError.field === field ? formError.message : null);

  return (
    <Modal title={initial ? `Edit application ${initial.permitNumber || ''}`.trim() : 'Record a permit application'} onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4">
        {formError && !formError.field && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">{formError.message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Property" error={err('propertyId')}>
            <Select value={form.propertyId} onChange={set('propertyId')} required>
              <option value="">Select a property…</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Permit type">
            <Select value={form.type} onChange={set('type')} required>
              <option value="">Select a type…</option>
              {PERMIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Permit number" error={err('permitNumber')}>
            <Input value={form.permitNumber} onChange={set('permitNumber')} required placeholder="OCC-2026-001" />
          </Field>
          <Field label="Expires" hint="Optional. Set it here or when you issue.">
            <Input type="date" value={form.expiresDate} onChange={set('expiresDate')} />
          </Field>
          <Field label="Fee" hint="Recorded on the permit. Invoicing arrives with the billing phase.">
            <Input type="number" min="0" step="0.01" value={form.fee} onChange={set('fee')} placeholder="0.00" />
          </Field>
        </div>

        <Field label="Issued by" hint="Display name printed on the permit. The issuing official is recorded automatically when it is issued.">
          <Input value={form.issuedBy} onChange={set('issuedBy')} placeholder="Fire code official" />
        </Field>

        {/* C5 correction (2026-07-27): this used to read "Violating a condition voids it."
            The model IFC does not auto-void on a condition breach — breach is GROUNDS TO
            REVOKE (§105.4, the CONDITION_VIOLATED ground). "Voids" is a local overlay, and
            they are different transitions with different due process. */}
        <Field label="Conditions" hint="Written onto the permit. Violating a condition is grounds to revoke it.">
          <TextArea rows={3} value={form.conditions} onChange={set('conditions')}
            placeholder="e.g. combustibles kept a minimum of 10 ft from the device" />
        </Field>
        <Field label="Internal notes">
          <TextArea rows={2} value={form.notes} onChange={set('notes')} placeholder="Not printed on the permit." />
        </Field>

        <p className="text-xs text-gray-600 dark:text-gray-400">
          This records an application. It is <span className="font-semibold">not issued</span> until
          someone in the bureau issues it — that is a separate, recorded act.
        </p>

        <div className="flex gap-3 justify-end pt-1">
          <Btn type="button" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : (initial ? 'Save changes' : 'Record application')}</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── the lifecycle modals ─────────────────────────────────────────────────────
// Each of the three is a GOVERNED ACT on a legal instrument, not an edit, so each gets a
// deliberate confirmation surface rather than an inline control. The server is the
// control in every case; these collect what the engine requires and report what it says.

/** A refusal, rendered so it cannot be mistaken for a hint. (3.0j's 🔴 finding.) */
function Refusal({ formError }) {
  if (!formError || formError.field) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
      <p className="text-sm font-semibold text-red-800 dark:text-red-300">{formError.message}</p>
    </div>
  );
}

function PermitLine({ permit }) {
  return (
    <p className="text-sm text-gray-700 dark:text-gray-300">
      <span className="font-bold">{permit.permitNumber}</span> — {permit.type}
    </p>
  );
}

/**
 * ISSUE — the one door.
 *
 * The issued date is the DEPARTMENT's local day, supplied by the client and validated
 * server-side (the repo's standing date doctrine: the server must not guess a timezone).
 * It is pre-filled but editable, because a permit signed on Friday and entered on Monday
 * was issued on Friday, and backdating it honestly beats recording a date nobody chose.
 */
function IssueModal({ permit, busy, formError, onClose, onSubmit }) {
  const [issuedDate, setIssuedDate] = useState(localToday());
  const [expiresDate, setExpiresDate] = useState(d10(permit.expiresDate));

  return (
    <Modal title={`Issue permit ${permit.permitNumber || ''}`.trim()} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit({ issuedDate, expiresDate: expiresDate || '' }); }} className="space-y-4">
        <Refusal formError={formError} />
        <PermitLine permit={permit} />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Issuing records this as a live permit under your name. Once issued it is a finalized
          record — it cannot be edited, only revoked on an enumerated ground, or terminated and
          reissued if the occupancy, operation, tenancy or ownership changes.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Issued date" hint="Defaults to today. Change it if the permit was signed earlier.">
            <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} required />
          </Field>
          <Field label="Expires" hint="Optional. Last chance to set it — an issued permit is not editable.">
            <Input type="date" value={expiresDate} onChange={(e) => setExpiresDate(e.target.value)} />
          </Field>
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <Btn type="button" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy || !issuedDate}>
            {busy ? 'Issuing…' : 'Issue permit'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

/**
 * REVOKE — a coded ground, a citation contract, and a written basis.
 *
 * The GROUND says what KIND of failure this is (a closed, countable control value the
 * server owns — IFC §105.4's seven model grounds plus LOCAL_GROUND). The BASIS says what
 * actually HAPPENED. Neither substitutes for the other, and both are required.
 *
 * LOCAL_GROUND is not an escape hatch back to free text: the model code's list is prefaced
 * "including, but not limited to", so a hard-closed set would BLOCK A LAWFUL revocation —
 * but a local ground must cite the local provision it rests on. That contract is enforced
 * by the engine AND independently by a Postgres CHECK; this form collects it so the
 * operator gets a form they can complete rather than a refusal they have to decode.
 */
function RevokeModal({ permit, busy, formError, onClose, onSubmit }) {
  const [ground, setGround] = useState('');
  const [citation, setCitation] = useState('');
  const [basis, setBasis] = useState('');

  const needsCitation = ground === LOCAL_GROUND;
  const ready = !!ground && !!basis.trim() && (!needsCitation || !!citation.trim());

  return (
    <Modal title={`Revoke permit ${permit.permitNumber || ''}`.trim()} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ ground, basis: basis.trim(), ...(needsCitation ? { citation: citation.trim() } : {}) });
        }}
        className="space-y-4"
      >
        <Refusal formError={formError} />
        <PermitLine permit={permit} />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Revocation withdraws a live permit from a business. It is <span className="font-semibold">final</span> —
          there is no un-revoke — and it becomes part of the permit record.
        </p>

        <Field label="Ground for revocation" hint="IFC §105.4. The ground says what kind of failure this is; the basis below says what happened.">
          <Select value={ground} onChange={(e) => { setGround(e.target.value); setCitation(''); }} required>
            <option value="">Select a ground…</option>
            {REVOCATION_GROUNDS.map((g) => <option key={g.code} value={g.code}>{g.label}</option>)}
          </Select>
        </Field>

        {/* Revealed ONLY for a local ground, and required when shown. The model code's list
            is illustrative, not exhaustive — so a locally adopted ground is lawful, but it
            has to point at the provision it rests on or it is free text wearing a code. */}
        {needsCitation && (
          <Field
            label="Local provision cited"
            hint="Required. Name the local ordinance or code section this ground rests on."
          >
            <Input value={citation} onChange={(e) => setCitation(e.target.value)} required maxLength={240}
              placeholder="e.g. Municipal Code §14-207(b)" />
          </Field>
        )}

        <Field label="Written basis" hint="Required. What actually happened — this is the historical record and is retained verbatim.">
          <TextArea rows={4} value={basis} onChange={(e) => setBasis(e.target.value)} required
            placeholder="e.g. Re-inspection on 2026-07-14 found the aisle obstruction cited on 2026-06-02 unabated after two written notices." />
        </Field>

        <div className="flex gap-3 justify-end pt-1">
          <Btn type="button" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn type="submit" variant="danger" disabled={busy || !ready}>
            {busy ? 'Revoking…' : 'Revoke permit'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

/**
 * TERMINATE AND REISSUE — IFC §105.3.1.
 *
 * "Permits are not transferable and any change in occupancy, operation, tenancy or
 * ownership shall require that a new permit be issued." A permit is bound to a
 * (person × location × activity × period) tuple, so changing any leg is not an edit — it
 * is a terminating event that mints a successor. That is why the holder fields are
 * unreachable on an issued permit and this is the only path.
 *
 * The successor is born PENDING and goes through the issuance door like anything else.
 * A transfer must not launder an unissued permit into a live one.
 */
/**
 * 3.1b renewal. Deliberately the SIMPLEST lifecycle modal: renewal has no coded reason to
 * pick (unlike revoke and transfer, which record WHY the instrument ended) because nothing
 * ends here. The only required input is the new permit's number.
 *
 * The copy states the two things an operator will otherwise assume wrongly: the parent is NOT
 * cancelled, and the renewal is NOT already issued.
 */
function RenewModal({ permit, busy, formError, onClose, onSubmit }) {
  const [renewalPermitNumber, setRenewalPermitNumber] = useState('');
  const [note, setNote] = useState('');

  const ready = !!renewalPermitNumber.trim();
  const fieldErr = (name) => (formError && formError.field === name ? formError.message : null);

  return (
    <Modal title={`Renew ${permit.permitNumber || ''}`.trim()} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ renewalPermitNumber: renewalPermitNumber.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
        }}
        className="space-y-4"
      >
        <Refusal formError={formError} />
        <PermitLine permit={permit} />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This creates a <span className="font-semibold">new permit</span> carrying the same
          property, type and conditions — as a <span className="font-semibold">pending
          application</span>, which still has to be issued. This permit is{' '}
          <span className="font-semibold">not cancelled</span>: it keeps its status and runs its
          term out. The renewal&apos;s own expiry is worked out when it is issued, from the
          permit type&apos;s rule in force on that day — so it is not simply this permit&apos;s
          dates moved forward.
        </p>

        <Field
          label="Renewal permit number"
          error={fieldErr('renewalPermitNumber')}
          hint="The renewal gets its own number. This permit's number stays consumed and is never reused."
        >
          <Input value={renewalPermitNumber} onChange={(e) => setRenewalPermitNumber(e.target.value)}
            required maxLength={64} placeholder="OCC-2027-001" />
        </Field>

        <Field label="Note" hint="Optional. Recorded on the renewal alongside the link back to this permit.">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            maxLength={10000} placeholder="Annual renewal." />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy || !ready}>
            {busy ? 'Creating…' : 'Create renewal'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function TerminateModal({ permit, busy, formError, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [successorPermitNumber, setSuccessorPermitNumber] = useState('');
  const [note, setNote] = useState('');

  const ready = !!reason && !!successorPermitNumber.trim();
  const fieldErr = (name) => (formError && formError.field === name ? formError.message : null);

  return (
    <Modal title={`Transfer — terminate ${permit.permitNumber || ''} and reissue`.trim()} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ reason, successorPermitNumber: successorPermitNumber.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
        }}
        className="space-y-4"
      >
        <Refusal formError={formError} />
        <PermitLine permit={permit} />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          A permit is not transferable. This terminates the existing one and creates a successor
          carrying the same property, type and conditions — <span className="font-semibold">as a
          pending application</span>, which still has to be issued.
        </p>

        <Field label="What changed?" hint="IFC §105.3.1 names the four changes that terminate a permit.">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">Select the change…</option>
            {TRANSFER_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </Select>
        </Field>

        <Field
          label="Successor permit number"
          error={fieldErr('successorPermitNumber')}
          hint="The successor gets its own number. The old number stays consumed and is never reused."
        >
          <Input value={successorPermitNumber} onChange={(e) => setSuccessorPermitNumber(e.target.value)}
            required maxLength={64} placeholder="OCC-2026-014" />
        </Field>

        <Field label="Note" hint="Optional. Recorded on the successor alongside the link back to this permit.">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Sold to new owner effective 2026-08-01." />
        </Field>

        <div className="flex gap-3 justify-end pt-1">
          <Btn type="button" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn type="submit" variant="danger" disabled={busy || !ready}>
            {busy ? 'Transferring…' : 'Terminate and create successor'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The result of a transfer. Shown rather than acted on: in the market a change of
 * permittee is an application that goes through intake and review before issuance, and
 * §105.3.1 requires a NEW PERMIT BE ISSUED — so chaining straight into the issuance modal
 * would blur two governed acts into one click. The successor is surfaced here because a
 * Pending permit has no expiry date and sorts to the bottom of the register.
 */
function TransferResult({ data, onClose }) {
  const { terminated, successor, renewed } = data;
  // ONE panel, two acts — because the shape really is the same: one record acted on, one
  // record minted and awaiting issuance. What must NOT be shared is the wording. Labelling a
  // renewed permit "Terminated" would tell the operator their live permit had been cancelled,
  // which is the opposite of what happened.
  return (
    <Modal title={renewed ? 'Renewal created' : 'Transfer recorded'} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
            {renewed ? 'Renewed — still in force' : 'Terminated'}
          </p>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{terminated?.permitNumber}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{statusLabel(terminated?.status)}</p>
          {renewed && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              Unchanged by the renewal — it runs its own term out.
            </p>
          )}
        </div>
        <div className="flex justify-center text-gray-400" aria-hidden="true"><ArrowRight size={18} /></div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-300 font-semibold">
            {renewed ? 'Renewal — awaiting issuance' : 'Successor — awaiting issuance'}
          </p>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{successor?.permitNumber}</p>
          <p className="text-xs text-gray-700 dark:text-gray-300">
            It is <span className="font-semibold">not live yet</span>. Issue it from the register when the bureau is satisfied.
            {renewed && ' Its expiry is worked out then, from the type\'s rule in force on the day it is issued.'}
          </p>
        </div>
        <div className="flex justify-end">
          <Btn variant="primary" onClick={onClose}>Back to the register</Btn>
        </div>
      </div>
    </Modal>
  );
}
