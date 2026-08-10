import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import CronHealthPanel from './CronHealthPanel';

/**
 * DatabaseAdmin — Admin panel for database audit and reseeding.
 * Shows row counts for all tables and lets the chief force-reseed empty ones.
 */
export default function DatabaseAdmin() {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reseeding, setReseeding] = useState(false);
  const [reseedResult, setReseedResult] = useState(null);
  const [error, setError] = useState(null);

  async function fetchAudit() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/admin/db-audit');
      setAudit(res);
    } catch (e) {
      setError(e.message || 'Failed to fetch audit');
    }
    setLoading(false);
  }

  useEffect(() => { fetchAudit(); }, []);

  async function handleReseed() {
    if (!confirm('This will re-run all seed modules for empty tables. Continue?')) return;
    setReseeding(true);
    setReseedResult(null);
    try {
      const res = await api.post('/api/admin/db-audit/force-reseed');
      setReseedResult(res);
      // Refresh audit after reseed
      await fetchAudit();
    } catch (e) {
      setError(e.message || 'Reseed failed');
    }
    setReseeding(false);
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Database Admin</h1>
        <div className="animate-pulse text-gray-500 dark:text-gray-400">Loading table audit...</div>
      </div>
    );
  }

  if (error && !audit) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Database Admin</h1>
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-4 text-red-700 dark:text-red-300">{error}</div>
      </div>
    );
  }

  const emptyTables = audit?.tables?.filter(t => t.status === 'EMPTY') || [];
  const populatedTables = audit?.tables?.filter(t => t.status === 'populated') || [];
  const runtimeTables = audit?.tables?.filter(t => t.status === 'runtime (OK)') || [];
  const errorTables = audit?.tables?.filter(t => t.status?.startsWith('ERROR')) || [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Database Admin</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Audit table population and reseed empty tables</p>
        </div>
        <button
          onClick={handleReseed}
          disabled={reseeding}
          className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {reseeding ? 'Reseeding...' : 'Force Reseed All Empty Tables'}
        </button>
      </div>

      {/* X-PHASE cron liveness (0128). Placed ABOVE the table audit on purpose: "is the platform
          still doing its scheduled work" is a bigger question than "is a table empty", and a
          scheduled job that has stopped is the one thing on this page nothing else would tell
          you about. */}
      <div className="mb-6"><CronHealthPanel /></div>

      {/* Summary Cards */}
      {audit?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <SummaryCard label="Total Tables" value={audit.summary.totalTables} color="gray" />
          <SummaryCard label="Populated" value={audit.summary.populated} color="green" />
          <SummaryCard label="Empty" value={audit.summary.empty} color="red" />
          <SummaryCard label="Runtime" value={audit.summary.runtime} color="blue" />
          <SummaryCard label="Total Rows" value={audit.summary.totalRows?.toLocaleString()} color="gray" />
        </div>
      )}

      {/* Reseed Result */}
      {reseedResult && (
        <div className="mb-6 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">Reseed Complete</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
            {reseedResult.results?.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 ${r.status === 'OK' ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>
                <span>{r.status === 'OK' ? '✓' : '✗'}</span>
                <span className="font-mono text-xs">{r.module?.replace('../', '')}</span>
                {r.status !== 'OK' && <span className="text-xs">— {r.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">{error}</div>
      )}

      {/* Empty Tables — show first, these need attention */}
      {emptyTables.length > 0 && (
        <TableSection title="Empty Tables — Need Seed Data" tables={emptyTables} color="red" />
      )}

      {/* Error Tables */}
      {errorTables.length > 0 && (
        <TableSection title="Error Tables" tables={errorTables} color="orange" />
      )}

      {/* Populated Tables */}
      <TableSection title="Populated Tables" tables={populatedTables} color="green" defaultOpen={false} />

      {/* Runtime Tables */}
      <TableSection title="Runtime Tables (No Seed Needed)" tables={runtimeTables} color="blue" defaultOpen={false} />
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  const colors = {
    green: 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900 text-green-800 dark:text-green-300',
    red: 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300',
    blue: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300',
    gray: 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100',
  };
  return (
    <div className={`border rounded-lg p-3 text-center ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-1">{label}</div>
    </div>
  );
}

function TableSection({ title, tables, color, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = { green: 'text-green-700 dark:text-green-300', red: 'text-red-700 dark:text-red-300', blue: 'text-blue-700 dark:text-blue-300', orange: 'text-orange-700 dark:text-orange-300' };

  return (
    <div className="mb-4">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 w-full text-left mb-2">
        <span className="text-sm">{open ? '▼' : '▶'}</span>
        <h2 className={`text-lg font-semibold ${colors[color]}`}>{title} ({tables.length})</h2>
      </button>
      {open && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-950 border-b">
                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Table</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Rows</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Status</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t, i) => (
                <tr key={t.table} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950'}>
                  <td className="px-4 py-1.5 font-mono text-xs">{t.table}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{t.count >= 0 ? t.count : '—'}</td>
                  <td className="px-4 py-1.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      t.status === 'populated' ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' :
                      t.status === 'EMPTY' ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' :
                      t.status === 'runtime (OK)' ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' :
                      'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
