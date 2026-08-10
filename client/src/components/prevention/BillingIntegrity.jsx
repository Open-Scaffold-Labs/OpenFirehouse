// prevention/BillingIntegrity.jsx — the two gap reports and the transaction export.
//
// ── WHY A GAP REPORT EXISTS AT ALL ───────────────────────────────────────────────────
// Gaplessness is NOT a US legal requirement, and overclaiming it is its own error — the
// controlling verb in the source material is *investigated*, not *prohibited*. What is
// required is that every number be accounted for, INCLUDING voids, and that a gap be
// investigable. So a voided invoice is PRESENT, not a gap, and this screen never calls a
// gap a defect. It reports; a human judges.
//
// The numbers come from a counter table allocated in the same statement as the insert —
// deliberately NOT a Postgres SEQUENCE, which gaps on every rolled-back transaction and
// would manufacture gaps this report then asks a person to investigate for nothing.
//
// ── WHO CAN SEE IT ───────────────────────────────────────────────────────────────────
// requireInspector — reading the integrity of the money record is not an admin privilege.
// Nothing on this screen writes.
import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Download, AlertTriangle } from 'lucide-react';
import { fi } from './fiApi';
import { Section, Field, Input, Btn, Badge, Spinner } from './ui';

function GapReport({ title, subtitle, load }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    load().then((r) => { if (live) { setData(r.data); setError(null); } })
      .catch((e) => { if (live) setError(e.message || 'Could not run the report.'); });
    return () => { live = false; };
  }, [load]);

  return (
    <Section title={title} subtitle={subtitle}>
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}
      {!data && !error && <Spinner label="Running the report…" />}
      {data && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge tone={data.clean ? 'green' : 'amber'}>
              {data.clean ? 'Every number accounted for' : `${data.total} to investigate`}
            </Badge>
            {!data.clean && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                A gap is a question, not a finding. Voided records are counted as present.
              </p>
            )}
          </div>

          {data.byFiscalYear?.length > 0 && (
            <div className="space-y-2">
              {data.byFiscalYear.map((y) => (
                <div key={y.fiscal_year} className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-3">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    FY{y.fiscal_year} — {y.count} unaccounted
                  </p>
                  <p className="mt-1 text-sm text-amber-900 dark:text-amber-200 break-words">
                    {(y.numbers || []).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          )}

          {data.allocated?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Numbers issued
              </h4>
              <ul className="text-sm space-y-0.5">
                {data.allocated.map((a) => (
                  <li key={`${a.fiscal_year}-${a.prefix}`} className="flex justify-between gap-2">
                    <span className="text-gray-700 dark:text-gray-300">FY{a.fiscal_year} · {a.prefix}</span>
                    <span className="tabular-nums">{a.last_sequence} issued</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.allocated?.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nothing has been numbered yet.</p>
          )}
        </div>
      )}
    </Section>
  );
}

export default function BillingIntegrity() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const invoiceGaps = useCallback(() => fi.invoices.gapReport(), []);
  const receiptGaps = useCallback(() => fi.payments.gapReport(), []);

  const download = async () => {
    setBusy(true); setError(null);
    try {
      // Throws on a non-2xx — a silently missing download is worse than an error, because
      // the operator assumes it worked.
      await fi.payments.exportCsv({ from, to });
    } catch (e) {
      setError(e.message || 'The export did not download.');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <GapReport
        title="Invoice numbers"
        subtitle="Every invoice number this bureau has allocated, and any that cannot be accounted for."
        load={invoiceGaps}
      />
      <GapReport
        title="Receipt numbers"
        subtitle="Receipts run their own sequence, separate from invoices, with its own report."
        load={receiptGaps}
      />

      <Section
        title="Transaction export"
        subtitle="Charges, payments and refunds as one journal — the file a finance system reads."
      >
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From" hint="Optional.">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" hint="Optional.">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Btn variant="primary" disabled={busy} onClick={download}>
            <Download size={16} aria-hidden="true" /> {busy ? 'Preparing…' : 'Download CSV'}
          </Btn>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          <ShieldCheck size={12} className="inline mr-1" aria-hidden="true" />
          We own the charge; the department&rsquo;s finance system owns the money. This file is the
          handover between the two.
        </p>
      </Section>
    </div>
  );
}
