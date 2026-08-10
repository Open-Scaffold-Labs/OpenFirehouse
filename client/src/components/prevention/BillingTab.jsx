// prevention/BillingTab.jsx — module 3.2's clerk surface (Slice D, 2026-08-07).
//
// Slices A, B and C shipped API-ONLY with zero client components. This is the clerk.
//
// ── PLACEMENT ────────────────────────────────────────────────────────────────────────
// A tab INSIDE Prevention Center, not a nav entry. R6: "a standalone 'Permits & Fees'
// destination is not the competitor shape" — prevention platforms present this inside the
// prevention module. The one current-generation fire product whose screens are public makes
// Inspections · Permitting · Invoicing · Occupancies siblings, which is what this mirrors.
//
// ── GATING ───────────────────────────────────────────────────────────────────────────
// Mirrors the routes exactly. Reads (every register, both gap reports, the export) are
// requireInspector. EVERY money write is requirePreventionAdmin. The server enforces
// regardless; this only decides what we OFFER, so nobody is shown a button whose every use
// is refused.
//
// ⚠️ isInspector is WIDE on a default department: fi_settings.allow_crew_inspections
// defaults ON, so a probationary firefighter satisfies it. That is deliberate (the crew
// workflow) and it is exactly why no write sits behind it here.
//
// ── THE BLOCKER THIS SURFACE SITS BEHIND ─────────────────────────────────────────────
// Both mint routes refuse with 409 INVOICE_PREFIX_NOT_CONFIGURED until a department sets
// fi_settings.invoice_number_prefix. Until Slice D there was no write path for it anywhere,
// so the whole ledger was unreachable. It is now on Prevention › Settings › Billing, and
// this shell says so plainly rather than letting a clerk discover it at the moment of a
// refusal.
import React, { useState } from 'react';
import BillingInvoices from './BillingInvoices';
import BillingReceipts from './BillingReceipts';
import BillingFeeSchedules from './BillingFeeSchedules';
import BillingIntegrity from './BillingIntegrity';

const VIEWS = [
  { key: 'invoices', label: 'Invoices' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'fees',     label: 'Fee schedules' },
  { key: 'integrity', label: 'Integrity' },
];

export default function BillingTab({ fiCtx }) {
  const [view, setView] = useState('invoices');

  // '' means NOT YET CONFIGURED — the allocator's CHECK is {1,12} precisely so an empty
  // prefix can never mint FY2026--000001 onto a document retained forever.
  const prefix = fiCtx?.settings?.invoice_number_prefix;
  const needsPrefix = !prefix;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Billing views" className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-fit">
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

      {/* Tell them BEFORE they try, not at the 409. An amber advisory, not an error: nothing
          is broken, a setting is simply unset — and only a chief can set it. */}
      {needsPrefix && (view === 'invoices' || view === 'receipts') && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            No invoice prefix is set for this department.{' '}
            <span className="font-normal">
              Invoices and receipts carry a number of the form <code>FY2026-DEPT-000001</code>, and
              that middle segment comes from a setting. Until a chief sets it in{' '}
              <strong>Settings › Billing</strong>, nothing can be issued — you can still read
              everything here.
            </span>
          </p>
        </div>
      )}

      {view === 'invoices'  && <BillingInvoices fiCtx={fiCtx} canIssue={!needsPrefix} />}
      {view === 'receipts'  && <BillingReceipts fiCtx={fiCtx} canIssue={!needsPrefix} />}
      {view === 'fees'      && <BillingFeeSchedules fiCtx={fiCtx} />}
      {view === 'integrity' && <BillingIntegrity fiCtx={fiCtx} />}
    </div>
  );
}
