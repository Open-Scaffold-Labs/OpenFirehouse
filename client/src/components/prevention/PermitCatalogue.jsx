// PermitCatalogue.jsx — the department-authored permit catalogue (Phase 3, module 3.1b).
//
// `fi_permit_types` and the effective-dated rule groups went live on prod with 0093 and were
// reachable only by API. This is the surface a bureau clerk actually uses.
//
// THREE THINGS THIS SCREEN IS CAREFUL ABOUT, each learned the hard way in this module:
//
// 1. IT NEVER OFFERS A CONTROL THE SERVER WILL REFUSE. 3.1a shipped a permit form with a
//    Status dropdown, an Issued-date field and an Edit button on issued permits — every one
//    of which the server correctly refused. A control whose every use is rejected is worse
//    than no control, because the operator assumes they did something wrong. So: `code` is
//    shown read-only after creation (it is the control value issued permits were classified
//    by), retired types offer no Edit, and there is no Delete anywhere.
//
// 2. IT SAYS WHAT A CHANGE WILL AND WILL NOT DO. Editing a type does NOT touch permits
//    already issued under it — they froze their terms at issuance (R7) and the database
//    refuses to let those be rewritten. That is the single most surprising behaviour here,
//    so the screen states it rather than leaving the clerk to find out.
//
// 3. RETIRE AND CLONE ARE DIFFERENT ACTS AND LOOK DIFFERENT. Retire ends a type. Clone mints
//    the next version and retires the predecessor — the market's documented mechanic. Only
//    the destructive-sounding one wears the danger styling.
import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Pencil, Archive, Copy, CalendarClock, AlertTriangle } from 'lucide-react';
import { fi, localToday } from './fiApi';
import { Section, Field, Input, Select, Btn, Modal, EmptyState, Badge, Spinner, Toggle } from './ui';

const VISIBILITY = [
  { value: 'staff_only',   label: 'Staff only (default)' },
  { value: 'view_only',    label: 'Visible to applicants' },
  { value: 'apply_online', label: 'Applicants may apply online' },
];

const termLabel = (t) =>
  (t.term_value ? `${t.term_value} ${t.term_unit}${t.term_value === 1 ? '' : 's'}` : '—');

export default function PermitCatalogue({ fiCtx }) {
  const isAdmin = !!fiCtx?.isPreventionAdmin;
  const [types, setTypes] = useState(null);
  const [groups, setGroups] = useState([]);
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState(null);      // 'new' | type | null
  const [cloning, setCloning] = useState(null);
  const [retiring, setRetiring] = useState(null);
  const [groupForm, setGroupForm] = useState(null);  // 'new' | { group } | null
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [t, g] = await Promise.all([
        fi.permitTypes.list(showRetired),
        fi.permitTypes.ruleGroups.list(),
      ]);
      setTypes(t.data || []);
      setGroups(g.data || []);
      setLoadError(null);
    } catch (e) {
      // An honest failure beats an empty list that looks like "you have no permit types".
      setLoadError(e?.message || 'Could not load the catalogue.');
      setTypes([]);
    }
  }, [showRetired]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true); setFormError(null);
    try { await fn(); await load(); return true; }
    // Keep the ERROR OBJECT, not just its message. utils/api.js already carries the server's
    // `details` (the per-field zod messages) and `code` through — throwing them away here is
    // what turned a precise refusal into a bare "Validation failed" on the browser pass, which
    // tells an operator nothing about what to change. Same family as 3.0j's finding that a
    // refusal rendered as muted helper text: a refusal that does not explain itself is barely
    // better than a silent one.
    catch (e) { setFormError({ message: e?.message || 'That did not save.', details: e?.details }); return false; }
    finally { setBusy(false); }
  };

  if (types === null) return <div className="py-12 flex justify-center"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <Section
        title="Permit types"
        subtitle="Your department's catalogue. Each type points at an expiration rule that sets its term, renewal window and grace period."
        actions={isAdmin && (
          <Btn variant="primary" onClick={() => { setFormError(null); setEditing('new'); }}>
            <Plus size={16} aria-hidden="true" /> Add a type
          </Btn>
        )}
      >
        {loadError && (
          <div role="alert" className="mx-5 mt-4 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
            {loadError}
          </div>
        )}

        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <Toggle
            checked={showRetired} onChange={setShowRetired}
            label="Show retired types"
            description="Retired types are kept, never deleted — permits issued under them still resolve."
          />
        </div>

        {!types.length ? (
          <EmptyState
            icon={BookOpen}
            title="No permit types yet"
            body="A permit type carries its own term, renewal window and grace period. Add the operations your department permits — assembly, hot work, hazardous materials storage — and issuance takes care of the dates."
            action={isAdmin && (
              <Btn variant="primary" onClick={() => { setFormError(null); setEditing('new'); }}>
                <Plus size={16} aria-hidden="true" /> Add the first one
              </Btn>
            )}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="px-5 py-2 font-semibold">Code</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Term</th>
                  <th className="px-3 py-2 font-semibold">Renewal opens</th>
                  <th className="px-3 py-2 font-semibold">Grace</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 dark:border-gray-800/60">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {t.code}
                      {t.version > 1 && <span className="ml-1 text-gray-400">v{t.version}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{t.name}</div>
                      {t.ifc_section && <div className="text-xs text-gray-500 dark:text-gray-400">IFC §{t.ifc_section}</div>}
                    </td>
                    <td className="px-3 py-3">{termLabel(t)}</td>
                    <td className="px-3 py-3">
                      {t.notice_window_days == null ? '—' : `${t.notice_window_days} days before`}
                    </td>
                    <td className="px-3 py-3">
                      {t.grace_days == null ? '—' : (t.grace_days === 0 ? 'None' : `${t.grace_days} days`)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={t.status === 'Active' ? 'green' : t.status === 'Draft' ? 'amber' : 'gray'}>
                        {t.status}
                      </Badge>
                      {!t.expiration_rule_group_id && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {/* Not decoration: issuance REFUSES a type with no rule, because a
                              permit's expiry date must never be invented. Say so here rather
                              than letting the clerk discover it at the issuance door. */}
                          <span>No expiration rule — permits of this type cannot be issued.</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && t.status !== 'Retired' && (
                          <>
                            <Btn variant="ghost" className="px-2 min-w-[44px]" title="Edit this type"
                              onClick={() => { setFormError(null); setEditing(t); }}>
                              <Pencil size={16} aria-hidden="true" /><span className="sr-only">Edit {t.code}</span>
                            </Btn>
                            <Btn variant="ghost" className="px-2 min-w-[44px]" title="Make a new version (retires this one)"
                              onClick={() => { setFormError(null); setCloning(t); }}>
                              <Copy size={16} aria-hidden="true" /><span className="sr-only">New version of {t.code}</span>
                            </Btn>
                            <Btn variant="ghost" className="px-2 min-w-[44px] text-red-700 dark:text-red-400" title="Retire this type"
                              onClick={() => setRetiring(t)}>
                              <Archive size={16} aria-hidden="true" /><span className="sr-only">Retire {t.code}</span>
                            </Btn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Expiration rules"
        subtitle="Term, renewal window and grace period — versioned by date, so you can always see what a permit was issued under."
        actions={isAdmin && (
          <Btn onClick={() => { setFormError(null); setGroupForm('new'); }}>
            <Plus size={16} aria-hidden="true" /> Add a rule
          </Btn>
        )}
      >
        {!groups.length ? (
          <EmptyState
            icon={CalendarClock}
            title="No expiration rules yet"
            body="A rule says how long a permit lasts, how early renewal opens, and how long the grace period runs after the term ends. Types point at a rule rather than carrying their own dates."
          />
        ) : (
          <ul className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {groups.map((g) => (
              <li key={g.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{g.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {g.term_value
                      ? <>Term {termLabel(g)} · renewal opens {g.notice_window_days} days before ·{' '}
                          {g.grace_days === 0 ? 'no grace period' : `${g.grace_days} days grace`}
                          {g.version > 1 && <span className="text-gray-400"> · version {g.version}</span>}
                        </>
                      : <span className="text-amber-700 dark:text-amber-400">No current version.</span>}
                  </div>
                </div>
                {isAdmin && (
                  <Btn onClick={() => { setFormError(null); setGroupForm({ group: g }); }}>
                    New version
                  </Btn>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editing && (
        <TypeForm
          initial={editing === 'new' ? null : editing}
          groups={groups} busy={busy} formError={formError}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const ok = await run(() => (editing === 'new'
              ? fi.permitTypes.create(body)
              : fi.permitTypes.patch(editing.id, body)));
            if (ok) setEditing(null);
          }}
        />
      )}

      {cloning && (
        <TypeForm
          initial={cloning} isClone groups={groups} busy={busy} formError={formError}
          onClose={() => setCloning(null)}
          onSave={async (body) => {
            const ok = await run(() => fi.permitTypes.clone(cloning.id, body));
            if (ok) setCloning(null);
          }}
        />
      )}

      {groupForm && (
        <RuleForm
          group={groupForm === 'new' ? null : groupForm.group}
          busy={busy} formError={formError}
          onClose={() => setGroupForm(null)}
          onSave={async (body) => {
            const ok = await run(() => (groupForm === 'new'
              ? fi.permitTypes.ruleGroups.create(body)
              : fi.permitTypes.ruleGroups.addVersion(groupForm.group.id, body)));
            if (ok) setGroupForm(null);
          }}
        />
      )}

      {retiring && (
        <Modal title={`Retire ${retiring.code}?`} onClose={() => (busy ? null : setRetiring(null))}>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong>{retiring.name}</strong> stops being available for new applications.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {/* The thing a clerk actually needs to know, and the thing they would otherwise
                have to guess: retiring is not deleting, and it does not disturb the record. */}
            Permits already issued under it are <strong>not</strong> affected — they keep the
            term they were issued under and stay in the register. The type itself is kept, not
            deleted, so those permits always resolve.
          </p>
          <Refusal error={formError} className="mt-3" />
          <div className="mt-5 flex justify-end gap-2">
            <Btn onClick={() => setRetiring(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="danger" disabled={busy}
              onClick={async () => { const ok = await run(() => fi.permitTypes.retire(retiring.id)); if (ok) setRetiring(null); }}>
              {busy ? 'Retiring…' : 'Retire type'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TypeForm({ initial, isClone, groups, busy, formError, onClose, onSave }) {
  const [f, setF] = useState(() => ({
    code: initial?.code || '',
    name: initial?.name || '',
    ifc_section: initial?.ifc_section || '',
    expiration_rule_group_id: initial?.expiration_rule_group_id || '',
    allow_renewal: initial ? initial.allow_renewal !== false : true,
    requires_inspection: !!initial?.requires_inspection,
    portal_visibility: initial?.portal_visibility || 'staff_only',
    autonumber_prefix: initial?.autonumber_prefix || '',
    status: initial?.status && initial.status !== 'Retired' ? initial.status : 'Draft',
  }));
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const isNew = !initial || isClone;

  return (
    <Modal
      title={isClone ? `New version of ${initial.code}` : initial ? `Edit ${initial.code}` : 'Add a permit type'}
      onClose={busy ? () => {} : onClose}
      wide
    >
      <form onSubmit={(e) => {
        e.preventDefault();
        const body = {
          name: f.name.trim(),
          ifc_section: f.ifc_section.trim() || undefined,
          expiration_rule_group_id: f.expiration_rule_group_id ? Number(f.expiration_rule_group_id) : undefined,
          allow_renewal: f.allow_renewal,
          requires_inspection: f.requires_inspection,
          portal_visibility: f.portal_visibility,
          autonumber_prefix: f.autonumber_prefix.trim() || undefined,
          status: f.status,
        };
        // `code` is only sent on CREATE. On edit and on clone the server owns it — changing
        // what a code MEANS is clone-and-retire, not an edit, and the PATCH schema rejects it.
        if (!initial) body.code = f.code.trim().toUpperCase();
        onSave(body);
      }}>
        {isClone && (
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            This creates <strong>{initial.code} v{(initial.version || 1) + 1}</strong> and retires
            the current version. Permits already issued keep the terms they were issued under.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Code" hint={isNew && !initial ? 'Short, stable identifier. Cannot be changed later.' : 'Set when the type was created and fixed thereafter.'}>
            <Input value={f.code} onChange={set('code')} required={!initial} disabled={!!initial}
              maxLength={40} placeholder="ASSEMBLY" />
          </Field>
          <Field label="Name">
            <Input value={f.name} onChange={set('name')} required maxLength={160} placeholder="Place of assembly" />
          </Field>
          <Field label="IFC section" hint="Optional. Informational only — it does not drive anything.">
            <Input value={f.ifc_section} onChange={set('ifc_section')} maxLength={20} placeholder="105.5.5" />
          </Field>
          <Field label="Expiration rule" hint="Sets the term, renewal window and grace period. Required before permits of this type can be issued.">
            <Select value={f.expiration_rule_group_id} onChange={set('expiration_rule_group_id')}>
              <option value="">— none —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label="Permit numbering prefix" hint="Optional.">
            <Input value={f.autonumber_prefix} onChange={set('autonumber_prefix')} maxLength={16} placeholder="ASM-" />
          </Field>
          <Field label="Who can see it">
            <Select value={f.portal_visibility} onChange={set('portal_visibility')}>
              {VISIBILITY.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={set('status')}>
              <option value="Draft">Draft — not yet in use</option>
              <option value="Active">Active — available for applications</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4 space-y-3">
          <Toggle checked={f.allow_renewal} onChange={(v) => setF((s) => ({ ...s, allow_renewal: v }))}
            label="This permit can be renewed"
            description="Turn off for one-off permits. Some temporary permits cannot be renewed at all — a new application is required." />
          <Toggle checked={f.requires_inspection} onChange={(v) => setF((s) => ({ ...s, requires_inspection: v }))}
            label="An inspection is expected before issuing"
            description="Recorded on the type. Not yet enforced at the issuance door — that arrives with fees and invoicing." />
        </div>

        <Refusal error={formError} className="mt-4" />

        <div className="mt-5 flex justify-end gap-2">
          <Btn type="button" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : isClone ? 'Create new version' : initial ? 'Save changes' : 'Add type'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function RuleForm({ group, busy, formError, onClose, onSave }) {
  const [f, setF] = useState({
    name: '', effective_from: localToday(),
    term_value: group?.term_value ?? 1, term_unit: group?.term_unit ?? 'year',
    notice_window_days: group?.notice_window_days ?? 30,
    grace_days: group?.grace_days ?? 0,
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Modal title={group ? `New version of “${group.name}”` : 'Add an expiration rule'} onClose={busy ? () => {} : onClose}>
      <form onSubmit={(e) => {
        e.preventDefault();
        const body = {
          effective_from: f.effective_from,
          term_value: Number(f.term_value),
          term_unit: f.term_unit,
          notice_window_days: Number(f.notice_window_days),
          grace_days: Number(f.grace_days),
        };
        if (!group) body.name = f.name.trim();
        onSave(body);
      }}>
        {group && (
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            {/* The two facts a clerk needs before changing a rule, and the second one is the
                surprising half: this is R7 in plain language. */}
            The current version closes the day before this one starts, and is kept on file.
            Permits <strong>already issued</strong> keep the terms they were issued under —
            this applies to permits issued from the new date onward.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!group && (
            <Field label="Rule name" hint="What a clerk will recognise, e.g. “Annual operational”.">
              <Input value={f.name} onChange={set('name')} required maxLength={120} placeholder="Annual operational" />
            </Field>
          )}
          <Field label="Takes effect" hint={group ? 'Must be after the current version started.' : 'Permits issued on or after this date use these terms.'}>
            <Input type="date" value={f.effective_from} onChange={set('effective_from')} required />
          </Field>
          <Field label="Term">
            <div className="flex gap-2">
              <Input type="number" min="1" value={f.term_value} onChange={set('term_value')} required className="w-24" />
              <Select value={f.term_unit} onChange={set('term_unit')}>
                <option value="day">day(s)</option>
                <option value="month">month(s)</option>
                <option value="year">year(s)</option>
              </Select>
            </div>
          </Field>
          <Field label="Renewal opens" hint="Days before the term ends. The permit stays valid throughout.">
            <Input type="number" min="0" value={f.notice_window_days} onChange={set('notice_window_days')} required />
          </Field>
          <Field label="Grace period" hint="Days after the term ends during which renewal is still possible. Zero means none.">
            <Input type="number" min="0" value={f.grace_days} onChange={set('grace_days')} required />
          </Field>
        </div>

        <Refusal error={formError} className="mt-4" />

        <div className="mt-5 flex justify-end gap-2">
          <Btn type="button" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : group ? 'Create version' : 'Add rule'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

/**
 * A refusal the operator can ACT ON.
 *
 * The server's unified error shape is { error, code?, details? } and utils/api.js already
 * carries all three through — but every screen that renders only `message` turns a precise,
 * per-field refusal into a bare "Validation failed". Found on the live browser pass for this
 * module, which is exactly what that pass is for.
 *
 * role="alert" so it is announced, red and bold so it does not read as an aside (3.0j found
 * field errors rendering as muted gray helper text — a refusal that whispers is the same
 * failure class as one that never fires).
 */
function Refusal({ error, className = '' }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : error.message;
  const details = typeof error === 'string' ? null : error.details;
  return (
    <div role="alert" className={`rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm ${className}`}>
      <div className="font-semibold text-red-700 dark:text-red-300">{message}</div>
      {Array.isArray(details) && details.length > 0 && (
        <ul className="mt-1.5 list-disc pl-5 space-y-0.5 text-red-700/90 dark:text-red-300/90">
          {details.map((d, i) => <li key={i}>{String(d).replace(/^body\./, '')}</li>)}
        </ul>
      )}
    </div>
  );
}
