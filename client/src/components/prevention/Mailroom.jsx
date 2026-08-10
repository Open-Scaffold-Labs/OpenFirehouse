// prevention/Mailroom.jsx — the end-of-day office view (2026-07-15).
// Every notice the department has generated, newest first, with its property and whether it
// has been mailed/served yet. The clerk works the list: view the PDF, mail it, mark it sent.
// "Mark mailed" records a real service event on the inspection (method + outcome=mailed) — it
// is not a cosmetic flag; it lands on the legal service ladder.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Download, Inbox } from 'lucide-react';
import { fi } from './fiApi';
import { getToken } from '../../utils/api';
import { Section, Btn, Badge, Spinner, EmptyState, Select } from './ui';

// The stored notice PDF is an auth'd stream, so we can't just point a link at it — fetch it
// with the token, then open the blob.
async function openNoticePdf(noticeId) {
  const res = await fetch(`/api/fi-notices/${noticeId}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Could not open the notice PDF.');
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const MAIL_CLASSES = [
  { value: 'certified_mail', label: 'Certified mail' },
  { value: 'first_class_mail', label: 'First-class mail' },
];

export default function Mailroom({ fiCtx }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [needsOnly, setNeedsOnly] = useState(true);
  const [mailClass, setMailClass] = useState('certified_mail');
  const [busy, setBusy] = useState(null); // notice id currently being marked

  const load = useCallback(async () => {
    try { const r = await fi.notices.list(); setRows(r.data ?? []); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  const shown = useMemo(() => (rows || []).filter((n) => !needsOnly || !n.served), [rows, needsOnly]);
  const needsCount = useMemo(() => (rows || []).filter((n) => !n.served).length, [rows]);

  const view = async (id) => { setErr(null); try { await openNoticePdf(id); } catch (e) { setErr(e.message); } };
  const markMailed = async (n) => {
    setBusy(n.id); setErr(null);
    try {
      // A real service event on the ladder — method + outcome=mailed. The server records who,
      // when (server-authoritative), and against which record.
      await fi.inspections.service.add(n.inspection_id, {
        method: mailClass, outcome: 'mailed', addressUsed: n.property_address || '',
      });
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  if (rows === null) return <Spinner label="Loading the mailroom…" />;
  return (
    <Section
      title="Mailroom"
      subtitle="Every notice you've generated, newest first. View the PDF, mail it, and mark it sent — marking records a service event on the record, not just a checkbox."
      actions={(
        <div className="flex items-center gap-2">
          <Select value={mailClass} onChange={(e) => setMailClass(e.target.value)} aria-label="Mail class used when marking a notice sent">
            {MAIL_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <Btn onClick={() => setNeedsOnly((x) => !x)}>{needsOnly ? 'Show all' : 'Needs mailing only'}</Btn>
        </div>
      )}
    >
      {err && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}
      {/* P2-3 (2026-07-16): the reassurance line belongs to the MAILING QUEUE. In "Show all"
          it sat above already-served notices reading oddly ("Everything is mailed. Nice."
          atop a list of served items). Show the queue status when there's work OR when the
          queue view is active; in Show-all with nothing pending, report a neutral total. */}
      <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {needsCount > 0
          ? `${needsCount} notice${needsCount === 1 ? '' : 's'} still to mail.`
          : needsOnly
            ? 'Everything is mailed. Nice.'
            : `${rows.length} notice${rows.length === 1 ? '' : 's'} — all mailed.`}
      </p>
      {shown.length === 0 ? (
        <EmptyState icon={Inbox}
          title={needsOnly ? 'Nothing waiting to mail' : 'No notices yet'}
          body={needsOnly
            ? 'Notices you generate will queue here until they are mailed.'
            : 'Generate a notice from an inspection and it will appear here.'} />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {shown.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {n.property_name || `Inspection #${n.inspection_id}`}
                  {n.served
                    ? <span className="ml-2"><Badge tone="green">Mailed / served</Badge></span>
                    : <span className="ml-2"><Badge tone="amber">Needs mailing</Badge></span>}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {[n.property_address, n.inspection_type, `generated ${String(n.created_at).slice(0, 10)}`].filter(Boolean).join(' · ')}
                  {n.sent_to ? ` · emailed to ${n.sent_to}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Btn onClick={() => view(n.id)} aria-label={`View notice for ${n.property_name || `inspection ${n.inspection_id}`}`}>
                  <Download size={15} aria-hidden="true" /> View
                </Btn>
                {!n.served && fiCtx.isPreventionAdmin && (
                  <Btn variant="primary" disabled={busy === n.id} onClick={() => markMailed(n)}>
                    <Mail size={15} aria-hidden="true" /> {busy === n.id ? 'Marking…' : 'Mark mailed'}
                  </Btn>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
