import { useState } from 'react';
import { Receipt, Search, Plus, Filter } from 'lucide-react';

// ─── Permits & Fees ──────────────────────────────────────────────────────────────

export default function Permits() {
  const [search, setSearch] = useState('');

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Permits & Fees</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage fire permits, fee schedules, and payment tracking. Issue, renew, and search permits by property or type.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
          <Plus size={16} />
          New
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            aria-label="Search permits"
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 dark:text-gray-100"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <Filter size={14} />
          Filters
        </button>
      </div>

      {/* Empty state */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm p-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center mx-auto mb-4">
          <Receipt size={28} className="text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Permits & Fees</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
          Manage fire permits, fee schedules, and payment tracking. Issue, renew, and search permits by property or type.
        </p>
        <p className="text-xs text-gray-400">This module is coming soon. Data will be populated from your department's inspection records.</p>
      </div>
    </div>
  );
}
