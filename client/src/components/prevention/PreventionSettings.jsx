// prevention/PreventionSettings.jsx — bureau administration (Phase 3 §1):
// designations, the two incumbent toggles, the six notice text blocks,
// inspection types (incumbent 4-field dialog), the code library
// (retire-vs-deactivate semantics), and the checklist builder.
// UI gating mirrors fiAuth; the SERVER is the control on every write.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, SlidersHorizontal, FileText, ClipboardList, BookOpen, Plus, Pencil,
  Archive, ArchiveRestore, Trash2, ShieldCheck, ArrowUp, ArrowDown, Sparkles, Search,
  Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { fi } from './fiApi';
import { Section, Field, Input, TextArea, Select, Toggle, Btn, Modal, EmptyState, Badge, Spinner } from './ui';

const BLOCKS = [
  ['notice_header', 'Notice header', 'Top of every violation notice — department identity, bureau, contact.'],
  ['notice_body', 'Notice body', 'The standard wording that precedes the violation list on every notice.'],
  ['notice_legalese', 'Legal statements', 'Statutory authority, compliance obligations, appeal rights.'],
  ['notice_passed_body', 'Passed-inspection body', 'The wording used when an inspection has no open violations.'],
  ['notice_footer', 'Notice footer', 'Bottom of every notice — office hours, reinspection contact.'],
  ['signature_agreement_text', 'Signature agreement', 'Shown above the occupant signature line on screen and on the notice.'],
];

/** Trigger a client-side file download of CSV text. A leading BOM makes Excel open UTF-8
 *  correctly. The server already neutralized any formula-injection cells. */
function downloadCsv(csv, filename) {
  const blob = new Blob(['﻿' + String(csv ?? '')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'code-library.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SubNav({ tabs, active, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Settings sections">
      {tabs.map(([id, label, Icon]) => (
        <button
          key={id} role="tab" aria-selected={active === id} onClick={() => onSelect(id)}
          className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl font-semibold text-sm transition-colors ${
            active === id
              ? 'bg-red-600 text-white'
              : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
        >
          <Icon size={16} aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  );
}

// ── People: designations ─────────────────────────────────────────────────────
function Designations({ fiCtx }) {
  const [rows, setRows] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ userId: '', role: 'inspector' });
  const [err, setErr] = useState(null);
  const canGrant = fiCtx.isChief;

  const load = useCallback(async () => {
    const r = await fi.designations.list();
    setRows(r.data ?? []);
  }, []);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);
  useEffect(() => {
    if (canGrant) fi.designations.eligibleUsers().then((r) => setEligible(r.data ?? [])).catch(() => {});
  }, [canGrant]);

  const grant = async () => {
    setErr(null);
    try {
      await fi.designations.grant(Number(form.userId), form.role);
      setAdding(false); setForm({ userId: '', role: 'inspector' });
      await load(); fiCtx.reload();
    } catch (e) { setErr(e.message); }
  };
  const revoke = async (row) => {
    if (!window.confirm(`Revoke ${row.name || row.username}'s ${row.role === 'prevention_admin' ? 'Prevention Admin' : 'Inspector'} designation? The grant history is kept.`)) return;
    try { await fi.designations.revoke(row.id); await load(); fiCtx.reload(); } catch (e) { setErr(e.message); }
  };

  if (rows === null) return <Spinner label="Loading designations…" />;
  const admins = rows.filter((r) => r.role === 'prevention_admin');
  const inspectors = rows.filter((r) => r.role === 'inspector');
  const already = new Set(rows.map((r) => `${r.user_id}:${r.role}`));

  const List = ({ title, items, tone }) => (
    <div>
      <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{title}</h4>
      {items.length === 0
        ? <p className="text-sm text-gray-600 dark:text-gray-400 py-2">Nobody holds this designation yet.</p>
        : (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{r.name || r.username}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Granted {String(r.granted_at).slice(0, 10)}{r.granted_by ? ` by ${r.granted_by}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone={tone}>{title === 'Prevention Admins' ? 'Admin' : 'Inspector'}</Badge>
                  {canGrant && (
                    <Btn variant="danger" onClick={() => revoke(r)} aria-label={`Revoke ${r.name || r.username}`}>Revoke</Btn>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );

  return (
    <Section
      title="Bureau designations"
      subtitle="Prevention permissions are appointments, not ranks — any member of the department can be designated, including non-suppression personnel. Chiefs always hold admin authority."
      actions={canGrant && <Btn variant="primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Designate</Btn>}
    >
      {err && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
      {rows.length === 0 && !fiCtx.settings?.allow_crew_inspections && (
        <p className="mb-4 text-sm rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-4 py-3">
          Crew inspections are off and nobody is designated — only chiefs can work inspections right now. Designate your inspectors here.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <List title="Prevention Admins" items={admins} tone="red" />
        <List title="Inspectors" items={inspectors} tone="green" />
      </div>
      {adding && (
        <Modal title="Designate a member" onClose={() => setAdding(false)}>
          <div className="space-y-4">
            <Field label="Member">
              <Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">Choose a member…</option>
                {eligible
                  .filter((u) => !already.has(`${u.id}:${form.role}`))
                  .map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
              </Select>
            </Field>
            <Field label="Designation">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="inspector">Inspector — conducts inspections</option>
                <option value="prevention_admin">Prevention Admin — full bureau administration</option>
              </Select>
            </Field>
            {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setAdding(false)}>Cancel</Btn>
              <Btn variant="primary" disabled={!form.userId} onClick={grant}>Grant designation</Btn>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

// ── Department: toggles + notice text ────────────────────────────────────────
function Department({ fiCtx }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);
  // 🔴 THIS HOOK USED TO SIT BELOW THE `if (!form) return` GUARD, AND IT CRASHED THE WHOLE
  // TAB ON PRODUCTION. The first render has no settings yet and returns the spinner early,
  // so four hooks run; the render after the fetch resolves runs five. React counts them and
  // throws #310, "rendered more hooks than during the previous render" — so the Department
  // settings tab white-screened to the error boundary EVERY time, from the moment its data
  // arrived. It is only reachable at all once the fetch lands, which is why it looked like a
  // loading screen rather than a crash.
  // Introduced in cc7e2f8 and shipped undetected: the build is green (this is a runtime rule,
  // not a syntax one), lint:undef only looks for undefined identifiers, and the client test
  // runner cannot mount a component. Found 2026-08-07 by a browser pass on the real domain —
  // "build-green ≠ render-verified", written in this repo's own Phase 3 spec, in the section
  // that says a browser pass was still owed.
  // EVERY hook must run on EVERY render. Nothing may be declared past that guard.
  const [toggleState, setToggleState] = useState('idle'); // idle | saving | saved | error
  const canWrite = fiCtx.isChief;

  useEffect(() => {
    fi.settings.get().then((r) => setForm(r.data)).catch((e) => setErr(e.message));
  }, []);
  if (!form) return err ? <p className="text-red-700" role="alert">{err}</p> : <Spinner label="Loading department settings…" />;

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };
  const save = async () => {
    setErr(null);
    try { const r = await fi.settings.patch(form); setForm(r.data); setSaved(true); fiCtx.reload(); }
    catch (e) { setErr(e.message); }
  };

  // The two workflow toggles are PERMISSION GATES and they live in a Section with
  // no Save button — the only Save was in the section BELOW. A chief could flip
  // "Allow crew inspections", watch the switch animate, navigate away, and the
  // policy never changed: the UI told them it had. A switch that animates has
  // already promised it took effect, so these persist on change. (2026-07-13)
  // (`toggleState` is declared with the other hooks at the top — see the note there.)
  const setToggle = (k) => async (v) => {
    const prev = form[k];
    setForm((f) => ({ ...f, [k]: v }));   // optimistic
    setToggleState('saving'); setErr(null);
    try {
      const r = await fi.settings.patch({ ...form, [k]: v });
      setForm(r.data); setToggleState('saved'); fiCtx.reload();
    } catch (e) {
      setForm((f) => ({ ...f, [k]: prev })); // roll back — never show a policy we failed to save
      setToggleState('error'); setErr(`${e.message} — the setting was NOT changed.`);
    }
  };

  return (
    <div className="space-y-6">
      <Section
        title="Workflow toggles"
        subtitle="Both are live department policy — the server enforces them on every write. Changes save the moment you flip them."
        actions={toggleState !== 'idle' && (
          <span role="status" aria-live="polite" className={`text-sm font-semibold ${
            toggleState === 'error' ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
            {toggleState === 'saving' ? 'Saving…' : toggleState === 'saved' ? 'Policy saved ✓' : 'Not saved'}
          </span>
        )}
      >
        {err && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
        <div className="space-y-3">
          <Toggle
            checked={form.allow_crew_inspections} disabled={!canWrite || toggleState === 'saving'}
            onChange={setToggle('allow_crew_inspections')}
            label="Allow crew inspections"
            description="Engine companies (any member) may conduct inspections. Turn off for a bureau-only department — then only designated inspectors and chiefs may inspect."
          />
          <Toggle
            checked={form.admin_only_commit} disabled={!canWrite || toggleState === 'saving'}
            onChange={setToggle('admin_only_commit')}
            label="Only administrators commit inspections"
            description="Inspectors do the walkthrough; a Prevention Admin (or chief) performs the completion that finalizes the record."
          />
        </div>
      </Section>
      {/* ── Billing (module 3.2, Slice D) ──────────────────────────────────────────
          These three columns shipped with migrations 0125/0126 and had NO WRITE PATH
          ANYWHERE, which made the entire invoice and receipt surface unreachable: both
          mint routes refuse with INVOICE_PREFIX_NOT_CONFIGURED until a prefix is set.
          This section is that path. Note what is deliberately NOT here: a default
          waiver threshold. It ships unset, and an unchosen default is a decision nobody
          made — here, an unratified money-approval policy. */}
      <Section
        title="Billing"
        subtitle="Department money policy. Nothing can be invoiced or receipted until the prefix is set."
        actions={canWrite && (
          <Btn variant="primary" onClick={save}>{saved ? 'Saved ✓' : 'Save changes'}</Btn>
        )}
      >
        {err && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          <Field
            label="Invoice number prefix"
            hint={form.invoice_number_prefix
              ? `Numbers read FY2026-${form.invoice_number_prefix}-000001. It goes into a document retained forever, so change it only with care.`
              : 'Not set — nothing can be invoiced or receipted yet. Up to 12 characters, A–Z and 0–9 only: no spaces, no hyphens, no lowercase.'}>
            <Input
              value={form.invoice_number_prefix ?? ''} readOnly={!canWrite} maxLength={12}
              placeholder="e.g. FD1"
              // Mirrors the DB CHECK ^[A-Z0-9]{0,12}$ as you type, so the refusal never
              // has to arrive from Postgres for something a keystroke could prevent.
              onChange={(e) => set('invoice_number_prefix')(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </Field>

          <Field label="Fiscal year starts in"
            hint="Numbers reset at the start of each fiscal year. Calendar year unless your jurisdiction says otherwise.">
            <Select value={String(form.fiscal_year_start_month ?? 1)} disabled={!canWrite}
              onChange={(e) => set('fiscal_year_start_month')(Number(e.target.value))}>
              {['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']
                .map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>

          <Field label="Waiver approval threshold"
            hint="Leave BLANK for no threshold, which is how this ships. A ground, a written basis and an approver are required on every waiver whatever you put here; setting an amount additionally requires a second named approver at or above it.">
            <Input
              value={form.waiver_approval_threshold ?? ''} readOnly={!canWrite} inputMode="decimal"
              placeholder="No threshold" className="text-right"
              // '' round-trips as null, not as 0. NULL means "no band"; 0 would mean
              // "every waiver needs a second approver" — a different policy entirely.
              onChange={(e) => set('waiver_approval_threshold')(e.target.value.trim() === '' ? null : e.target.value.trim())}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Violation notice text"
        subtitle="Department-authored, one block at a time — exactly what prints on the served notice. Blank blocks fall back to clearly-marked SAMPLE text: review every block with your Authority Having Jurisdiction before serving notices."
        actions={canWrite && (
          <Btn variant="primary" onClick={save}>
            {saved ? 'Saved ✓' : 'Save changes'}
          </Btn>
        )}
      >
        {err && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {BLOCKS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={form[key] ? hint : `${hint} Currently blank — the notice will print SAMPLE text flagged “review with your AHJ”.`}>
              <TextArea
                rows={4} maxLength={8000} value={form[key] || ''} readOnly={!canWrite}
                onChange={(e) => set(key)(e.target.value)}
                placeholder="Blank — sample text will be used, clearly flagged."
              />
            </Field>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── Inspection types (the incumbent four-field dialog) ───────────────────────
function TypesAdmin({ fiCtx }) {
  const [rows, setRows] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [editing, setEditing] = useState(null); // null | {} | row
  const [err, setErr] = useState(null);
  const canWrite = fiCtx.isPreventionAdmin;

  const load = useCallback(async () => {
    const [t, c] = await Promise.all([fi.types.list(), fi.checklists.list()]);
    setRows(t.data ?? []); setChecklists(c.data ?? []);
  }, []);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  const save = async (form) => {
    setErr(null);
    const body = {
      name: form.name,
      default_frequency_days: form.default_frequency_days === '' ? null : Number(form.default_frequency_days),
      default_checklist_id: form.default_checklist_id === '' ? null : Number(form.default_checklist_id),
      active: form.active,
    };
    try {
      if (form.id) await fi.types.patch(form.id, body); else await fi.types.create(body);
      setEditing(null); await load();
    } catch (e) { setErr(e.message); }
  };

  if (rows === null) return <Spinner label="Loading inspection types…" />;
  return (
    <Section
      title="Inspection types"
      subtitle="The scheduler keys on these: completing an inspection with a recurrence schedules the next cycle automatically."
      actions={canWrite && (
        <>
          {rows.length === 0 && (
            <Btn onClick={async () => { await fi.types.seedStarter(); await load(); }}>
              <Sparkles size={16} aria-hidden="true" /> Load starter set
            </Btn>
          )}
          <Btn variant="primary" onClick={() => setEditing({ name: '', default_frequency_days: '', default_checklist_id: '', active: true })}>
            <Plus size={16} aria-hidden="true" /> New type
          </Btn>
        </>
      )}
    >
      {err && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No inspection types yet"
          body="Load the starter set — Annual, Reinspection, Complaint and friends — then tune the recurrence to how your bureau actually runs."
        />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {r.name} {!r.active && <Badge>Inactive</Badge>}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {r.default_frequency_days ? `Every ${r.default_frequency_days} days` : 'No recurrence'}
                  {r.default_checklist_id ? ` · Checklist: ${checklists.find((c) => c.id === r.default_checklist_id)?.name ?? `#${r.default_checklist_id}`}` : ''}
                </p>
              </div>
              {canWrite && (
                <div className="flex gap-2 shrink-0">
                  <Btn onClick={() => setEditing({ ...r, default_frequency_days: r.default_frequency_days ?? '', default_checklist_id: r.default_checklist_id ?? '' })} aria-label={`Edit ${r.name}`}>
                    <Pencil size={16} aria-hidden="true" />
                  </Btn>
                  <Btn onClick={() => fi.types.patch(r.id, { active: !r.active }).then(load)} aria-label={r.active ? `Deactivate ${r.name}` : `Reactivate ${r.name}`}>
                    {r.active ? <Archive size={16} aria-hidden="true" /> : <ArchiveRestore size={16} aria-hidden="true" />}
                  </Btn>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <Modal title={editing.id ? `Edit ${editing.name}` : 'New inspection type'} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <Field label="Name">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={200} />
            </Field>
            <Field label="Recurrence (days)" hint="Completing an inspection of this type schedules the next one this many days out. Leave blank for none.">
              <Input type="number" min="1" max="3650" value={editing.default_frequency_days}
                onChange={(e) => setEditing({ ...editing, default_frequency_days: e.target.value })} />
            </Field>
            <Field label="Default checklist">
              <Select value={editing.default_checklist_id} onChange={(e) => setEditing({ ...editing, default_checklist_id: e.target.value })}>
                <option value="">None</option>
                {checklists.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Default fee" hint="Fees and invoicing arrive with the billing phase — this field unlocks then.">
              <Input value="—" disabled aria-disabled="true" />
            </Field>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn variant="primary" disabled={!editing.name?.trim()} onClick={() => save(editing)}>Save</Btn>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

// ── Code library ─────────────────────────────────────────────────────────────
const CODE_FIELDS = [
  ['code', 'Code', 'the adopted code section, e.g. 906.1'],
  ['title', 'Short title', 'Paraphrased — never paste copyrighted code text'],
  ['category', 'Category', 'e.g. Egress'],
  ['code_body', 'Code body', 'e.g. IFC, NFPA 101, local ordinance'],
  ['edition', 'Edition', 'e.g. IFC 2021'],
  ['section', 'Section', 'e.g. 1032.2'],
  ['link_url', 'Deep link', 'Optional link to the adopted code text'],
];

function CodesAdmin({ fiCtx }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);
  const [imp, setImp] = useState(null); // import modal: {fileName, csv?, importing?, preview?, result?, error?}
  const [dragOver, setDragOver] = useState(false);
  const canWrite = fiCtx.isPreventionAdmin;

  const load = useCallback(async () => { const r = await fi.codes.list(); setRows(r.data ?? []); }, []);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => [r.code, r.title, r.category, r.section].some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [rows, q]);

  const save = async (form) => {
    setErr(null);
    const body = Object.fromEntries(CODE_FIELDS.map(([k]) => [k, form[k] || '']));
    body.remediation_text = form.remediation_text || '';
    body.active = form.active ?? true;
    try {
      if (form.id) await fi.codes.patch(form.id, body); else await fi.codes.create(body);
      setEditing(null); await load();
    } catch (e) { setErr(e.message); }
  };
  const retire = async (r) => {
    if (!window.confirm(`Retire code ${r.code}? It disappears from pickers everywhere but stays on every record that already cites it.`)) return;
    try { await fi.codes.retire(r.id); await load(); } catch (e) { setErr(e.message); }
  };

  // ── Bulk CSV (2026-07-15) ──────────────────────────────────────────────────
  const doExport = async () => {
    setErr(null);
    try { const r = await fi.codes.exportCsv(); downloadCsv(r.data.csv, r.data.filename); }
    catch (e) { setErr(e.message); }
  };
  const doTemplate = async () => {
    setErr(null);
    try { const r = await fi.codes.template(); downloadCsv(r.data.csv, r.data.filename); }
    catch (e) { setErr(e.message); }
  };
  // A picked OR dropped file → read it → DRY RUN (writes nothing) → preview to confirm.
  const processFile = async (file) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      setImp({ fileName: file.name, error: 'That file is over 2 MB — a code library should be far smaller. Check the file.' });
      return;
    }
    setImp({ fileName: file.name, importing: true });
    try {
      const csv = await file.text();
      const r = await fi.codes.import(csv, true); // dryRun — writes nothing; content is validated server-side
      setImp({ fileName: file.name, csv, preview: r.data });
    } catch (e2) {
      setImp((s) => ({ ...(s || {}), importing: false, error: e2.message }));
    }
  };
  const onPickFile = (e) => { const f = e.target.files?.[0]; e.target.value = ''; void processFile(f); };
  const onDropFile = (e) => { e.preventDefault(); setDragOver(false); void processFile(e.dataTransfer.files?.[0]); };
  const confirmImport = async () => {
    setImp((s) => ({ ...s, importing: true }));
    try {
      const r = await fi.codes.import(imp.csv, false);
      setImp((s) => ({ ...s, importing: false, result: r.data }));
      await load();
    } catch (e) {
      setImp((s) => ({ ...s, importing: false, error: e.message }));
    }
  };

  if (rows === null) return <Spinner label="Loading code library…" />;
  return (
    <Section
      title="Violation code library"
      subtitle="Citations only — code number, paraphrased title, deep link. Your adopted code text belongs to your jurisdiction; paste remediation wording your bureau authored."
      actions={canWrite && (
        <>
          {rows.length === 0 && (
            <Btn onClick={async () => { await fi.codes.seedStarter(); await load(); }}>
              <Sparkles size={16} aria-hidden="true" /> Load IFC 2021 library
            </Btn>
          )}
          <Btn onClick={() => setImp({})}><Upload size={16} aria-hidden="true" /> Import CSV</Btn>
          {rows.length > 0 && (
            <Btn onClick={doExport}><Download size={16} aria-hidden="true" /> Export</Btn>
          )}
          <Btn variant="primary" onClick={() => setEditing({ active: true })}><Plus size={16} aria-hidden="true" /> New code</Btn>
        </>
      )}
    >
      {err && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
      {rows.length === 0 ? (
        <EmptyState icon={BookOpen} title="The library is empty"
          body="Load the 79-section IFC 2021 library — real sections, verified against the official text — then deactivate what your bureau doesn't cite and add local amendments as you go." />
      ) : (
        <>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input aria-label="Search codes" placeholder="Search code, title, category…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[28rem] overflow-y-auto">
            {filtered.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    <span className="font-mono text-red-700 dark:text-red-400 mr-2">
                      {r.section ? `${r.edition ? `${r.edition} ` : ''}§${r.section}` : r.code}
                    </span>{r.title}
                    {!r.active && <span className="ml-2"><Badge>Inactive</Badge></span>}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{[r.category, !r.section && r.code_body].filter(Boolean).join(' · ')}</p>
                </div>
                {canWrite && (
                  <div className="flex gap-2 shrink-0">
                    <Btn onClick={() => setEditing(r)} aria-label={`Edit ${r.code}`}><Pencil size={16} aria-hidden="true" /></Btn>
                    <Btn onClick={() => fi.codes.patch(r.id, { active: !r.active }).then(load)} aria-label={r.active ? `Deactivate ${r.code}` : `Reactivate ${r.code}`}>
                      {r.active ? <Archive size={16} aria-hidden="true" /> : <ArchiveRestore size={16} aria-hidden="true" />}
                    </Btn>
                    <Btn variant="danger" onClick={() => retire(r)} aria-label={`Retire ${r.code}`}><Trash2 size={16} aria-hidden="true" /></Btn>
                  </div>
                )}
              </li>
            ))}
            {filtered.length === 0 && <li className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">Nothing matches “{q}”.</li>}
          </ul>
        </>
      )}
      {editing && (
        <Modal title={editing.id ? `Edit ${editing.code}` : 'New code'} onClose={() => setEditing(null)} wide>
          <div className="grid gap-4 sm:grid-cols-2">
            {CODE_FIELDS.map(([k, label, hint]) => (
              <Field key={k} label={label} hint={hint}>
                <Input value={editing[k] || ''} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} />
              </Field>
            ))}
            <div className="sm:col-span-2">
              <Field label="Remediation guidance" hint="Bureau-authored corrective wording shown to inspectors and printed on notices.">
                <TextArea rows={3} maxLength={5000} value={editing.remediation_text || ''}
                  onChange={(e) => setEditing({ ...editing, remediation_text: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn variant="primary" disabled={!editing.code?.trim()} onClick={() => save(editing)}>Save</Btn>
          </div>
        </Modal>
      )}
      {imp && (
        <Modal title="Import codes from CSV" onClose={() => setImp(null)} wide>
          {imp.result ? (
            <div>
              <div className="flex items-start gap-3 rounded-xl bg-green-50 dark:bg-green-900/20 p-4 border border-green-200 dark:border-green-800">
                <CheckCircle2 size={20} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-300">Import complete</p>
                  <p className="text-sm text-green-700 dark:text-green-400">
                    {imp.result.added} added · {imp.result.updated} updated
                    {imp.result.skipped ? ` · ${imp.result.skipped} skipped` : ''}
                    {imp.result.duplicatesInFile ? ` · ${imp.result.duplicatesInFile} duplicate row(s) in file` : ''}
                  </p>
                </div>
              </div>
              {imp.result.errors?.length > 0 && <ImportErrors errors={imp.result.errors} />}
              <div className="flex justify-end mt-4"><Btn variant="primary" onClick={() => setImp(null)}>Done</Btn></div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Upload a CSV of your department's adopted codes. Existing codes with the same number are
                updated; a blank cell never erases a value you already have. Need the format?{' '}
                <button type="button" onClick={doTemplate} className="font-semibold text-red-700 dark:text-red-400 underline">
                  Download a template
                </button>.
              </p>
              {/* sr-only (NOT hidden/display:none) keeps the file input in the a11y tree and
                  keyboard-focusable; focus-within paints a visible ring on the label so a
                  keyboard user can see and open it. Border is gray-400/600 for 1.4.11 non-text
                  contrast; the icon + text label also identify the control. */}
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropFile}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed cursor-pointer py-8 text-center transition-colors focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/40 ${
                  dragOver
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                    : 'border-gray-400 dark:border-gray-600 hover:border-red-400 dark:hover:border-red-500'}`}>
                <FileSpreadsheet size={28} className="text-gray-400" aria-hidden="true" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {imp.fileName ? `Selected: ${imp.fileName}` : 'Choose a CSV file, or drag it here'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">CSV · up to 2 MB</span>
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onPickFile} aria-label="Choose a CSV file to import" />
              </label>
              {imp.importing && !imp.preview && <div className="mt-3"><Spinner label="Checking the file…" /></div>}
              {imp.error && (
                <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> {imp.error}
                </p>
              )}
              {imp.preview && (
                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Preview — nothing is saved yet</p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge>{imp.preview.willAdd} new</Badge>
                    <Badge>{imp.preview.willUpdate} to update</Badge>
                    {imp.preview.duplicatesInFile > 0 && <Badge>{imp.preview.duplicatesInFile} duplicate row(s) — last wins</Badge>}
                    {imp.preview.errors.length > 0 && <Badge>{imp.preview.errors.length} row(s) with errors — skipped</Badge>}
                  </div>
                  {imp.preview.errors.length > 0 && <ImportErrors errors={imp.preview.errors} />}
                  {imp.preview.validRows === 0 && (
                    <p className="mt-3 text-sm text-red-700 dark:text-red-400">No valid rows to import. Fix the errors above and choose the file again.</p>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <Btn onClick={() => setImp(null)}>Cancel</Btn>
                <Btn variant="primary" disabled={!imp.preview || imp.preview.validRows === 0 || imp.importing} onClick={confirmImport}>
                  {imp.importing ? 'Importing…' : imp.preview ? `Import ${imp.preview.validRows} code${imp.preview.validRows === 1 ? '' : 's'}` : 'Import'}
                </Btn>
              </div>
            </div>
          )}
        </Modal>
      )}
    </Section>
  );
}

/** The skipped-rows list shown in the import preview + result (line · code · reason). */
function ImportErrors({ errors }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Rows with problems (skipped):</p>
      <ul className="max-h-40 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
        {errors.slice(0, 100).map((e, i) => (
          <li key={i} className="flex items-start gap-2 px-3 py-1.5">
            <span className="font-mono text-xs text-gray-500 shrink-0">line {e.line}</span>
            <span className="font-mono text-xs text-red-700 dark:text-red-400 shrink-0">{e.code || '—'}</span>
            <span className="text-gray-600 dark:text-gray-400">{e.reason}</span>
          </li>
        ))}
        {errors.length > 100 && <li className="px-3 py-1.5 text-xs text-gray-500">…and {errors.length - 100} more.</li>}
      </ul>
    </div>
  );
}

// ── Checklist builder ────────────────────────────────────────────────────────
function ChecklistsAdmin({ fiCtx }) {
  const [rows, setRows] = useState(null);
  const [codes, setCodes] = useState([]);
  const [editing, setEditing] = useState(null); // {id?, name, active, items: [...]}
  const [err, setErr] = useState(null);
  const canWrite = fiCtx.isPreventionAdmin;

  const load = useCallback(async () => {
    const [c, k] = await Promise.all([fi.checklists.list(), fi.codes.list()]);
    setRows(c.data ?? []); setCodes((k.data ?? []).filter((x) => x.active));
  }, []);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  const openEditor = async (row) => {
    if (!row) { setEditing({ name: '', active: true, items: [] }); return; }
    const r = await fi.checklists.get(row.id);
    setEditing({ ...r.data, items: (r.data.items ?? []).map((i) => ({ prompt: i.prompt, code_ref_id: i.code_ref_id, required: i.required })) });
  };

  const save = async () => {
    setErr(null);
    try {
      let id = editing.id;
      if (id) await fi.checklists.patch(id, { name: editing.name, active: editing.active });
      else { const r = await fi.checklists.create({ name: editing.name, active: editing.active }); id = r.data.id; }
      await fi.checklists.setItems(id, editing.items.map((i) => ({
        prompt: i.prompt, code_ref_id: i.code_ref_id || null, required: !!i.required,
      })));
      setEditing(null); await load();
    } catch (e) { setErr(e.message); }
  };

  const moveItem = (idx, dir) => {
    const items = [...editing.items];
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    [items[idx], items[j]] = [items[j], items[idx]];
    setEditing({ ...editing, items });
  };

  if (rows === null) return <Spinner label="Loading checklists…" />;
  return (
    <Section
      title="Inspection checklists"
      subtitle="Each item can be pre-bound to a library code — in the field the inspector taps No and the citation is already attached."
      actions={canWrite && <Btn variant="primary" onClick={() => openEditor(null)}><Plus size={16} aria-hidden="true" /> New checklist</Btn>}
    >
      {err && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No checklists yet"
          body="Build your first walkthrough — a dozen well-chosen questions beats a blank notes field every time." />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {r.name} {!r.active && <Badge>Inactive</Badge>}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{r.item_count} item{r.item_count === 1 ? '' : 's'}</p>
              </div>
              {canWrite && (
                <div className="flex gap-2 shrink-0">
                  <Btn onClick={() => openEditor(r)} aria-label={`Edit ${r.name}`}><Pencil size={16} aria-hidden="true" /></Btn>
                  <Btn onClick={() => fi.checklists.patch(r.id, { active: !r.active }).then(load)} aria-label={r.active ? `Deactivate ${r.name}` : `Reactivate ${r.name}`}>
                    {r.active ? <Archive size={16} aria-hidden="true" /> : <ArchiveRestore size={16} aria-hidden="true" />}
                  </Btn>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <Modal title={editing.id ? `Edit ${editing.name}` : 'New checklist'} onClose={() => setEditing(null)} wide>
          <div className="space-y-4">
            <Field label="Checklist name">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={200} />
            </Field>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Items (answered Yes / No / N-A in the field)</span>
                <Btn onClick={() => setEditing({ ...editing, items: [...editing.items, { prompt: '', code_ref_id: null, required: false }] })}>
                  <Plus size={16} aria-hidden="true" /> Add item
                </Btn>
              </div>
              {editing.items.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-3">No items yet — add the questions the crew answers walking the building.</p>
              )}
              <ul className="space-y-2">
                {editing.items.map((it, idx) => (
                  <li key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                    <div className="flex gap-2">
                      <Input aria-label={`Item ${idx + 1} prompt`} placeholder="e.g. Are all exits clear and unlocked?"
                        value={it.prompt}
                        onChange={(e) => setEditing({ ...editing, items: editing.items.map((x, i) => i === idx ? { ...x, prompt: e.target.value } : x) })} />
                      <div className="flex gap-1 shrink-0">
                        <Btn onClick={() => moveItem(idx, -1)} aria-label={`Move item ${idx + 1} up`} disabled={idx === 0}><ArrowUp size={16} aria-hidden="true" /></Btn>
                        <Btn onClick={() => moveItem(idx, 1)} aria-label={`Move item ${idx + 1} down`} disabled={idx === editing.items.length - 1}><ArrowDown size={16} aria-hidden="true" /></Btn>
                        <Btn variant="danger" aria-label={`Remove item ${idx + 1}`}
                          onClick={() => setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) })}>
                          <Trash2 size={16} aria-hidden="true" />
                        </Btn>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Select aria-label={`Item ${idx + 1} bound code`} className="max-w-xs" value={it.code_ref_id ?? ''}
                        onChange={(e) => setEditing({ ...editing, items: editing.items.map((x, i) => i === idx ? { ...x, code_ref_id: e.target.value ? Number(e.target.value) : null } : x) })}>
                        <option value="">No bound code</option>
                        {codes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
                      </Select>
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 min-h-[44px]">
                        <input type="checkbox" checked={!!it.required}
                          onChange={(e) => setEditing({ ...editing, items: editing.items.map((x, i) => i === idx ? { ...x, required: e.target.checked } : x) })}
                          className="h-5 w-5 rounded accent-red-600" />
                        Must be answered
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn variant="primary" disabled={!editing.name?.trim() || editing.items.some((i) => !i.prompt.trim())} onClick={save}>
                Save checklist
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

export default function PreventionSettings({ fiCtx }) {
  const [tab, setTab] = useState('people');
  const tabs = [
    ['people', 'People', Users],
    ['department', 'Department', SlidersHorizontal],
    ['types', 'Types', ClipboardList],
    ['codes', 'Codes', BookOpen],
    ['checklists', 'Checklists', FileText],
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <ShieldCheck size={16} aria-hidden="true" />
        UI visibility follows your designation; every change is enforced and audited on the server.
      </div>
      <SubNav tabs={tabs} active={tab} onSelect={setTab} />
      {tab === 'people' && <Designations fiCtx={fiCtx} />}
      {tab === 'department' && <Department fiCtx={fiCtx} />}
      {tab === 'types' && <TypesAdmin fiCtx={fiCtx} />}
      {tab === 'codes' && <CodesAdmin fiCtx={fiCtx} />}
      {tab === 'checklists' && <ChecklistsAdmin fiCtx={fiCtx} />}
    </div>
  );
}
