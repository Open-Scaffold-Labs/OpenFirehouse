/**
 * WhatsNew — Modal showing release notes / changelog.
 * Triggered by clicking the version badge in the header or sidebar.
 */
import { useState } from 'react';
import { X, Sparkles, Bug, Zap, Database, Shield, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import CHANGELOG from '../data/changelog';

const TYPE_CONFIG = {
  feature:     { icon: Sparkles,      color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50',  label: 'New' },
  fix:         { icon: Bug,           color: 'text-red-500',     bg: 'bg-red-50 dark:bg-red-950/50',      label: 'Fix' },
  improvement: { icon: Zap,           color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-950/50',     label: 'Improved' },
  data:        { icon: Database,      color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/50',    label: 'Data' },
  security:    { icon: Shield,        color: 'text-purple-600 dark:text-purple-400',  bg: 'bg-purple-50 dark:bg-purple-950/50',   label: 'Security' },
  breaking:    { icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400',  bg: 'bg-orange-50 dark:bg-orange-950/50',   label: 'Breaking' },
};

function ChangeBadge({ type }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.improvement;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

export default function WhatsNew({ open, onClose }) {
  const [expandedIdx, setExpandedIdx] = useState(0); // latest expanded by default

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-700 to-red-900 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <Sparkles size={18} /> What's New
            </h2>
            <p className="text-red-200 text-xs mt-0.5">Release notes & changelog</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-red-200 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Release list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {CHANGELOG.map((release, idx) => {
            const isExpanded = expandedIdx === idx;
            return (
              <div key={release.version} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                {/* Release header */}
                <button
                  onClick={() => setExpandedIdx(isExpanded ? -1 : idx)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900 dark:text-gray-100">v{release.version}</span>
                      {idx === 0 && (
                        <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold rounded-full uppercase">Latest</span>
                      )}
                      <span className="text-[11px] text-gray-400">{release.date}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{release.title}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{release.changes.length} changes</span>
                </button>

                {/* Expanded changes */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 mb-3">{release.summary}</p>
                    <ul className="space-y-2">
                      {release.changes.map((ch, ci) => (
                        <li key={ci} className="flex items-start gap-2">
                          <ChangeBadge type={ch.type} />
                          <span className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{ch.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-3 text-center">
          <p className="text-[10px] text-gray-400">Open Firehouse — Station Management Platform</p>
        </div>
      </div>
    </div>
  );
}
