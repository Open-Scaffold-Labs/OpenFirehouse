import { useState, useEffect } from 'react';
import { Siren, X, ArrowRight, Building2, ShieldAlert } from 'lucide-react';

// ─── Dispatch Notification Toast ───────────────────────────────────────────────
// Shows a slide-in alert when a new CAD dispatch arrives.
// Props:
//   dispatch        — { id, type, address, units, priority, timestamp } or null
//   matchedPrePlan  — pre-plan matched via CAD address fuzzy lookup, or null
//   onDismiss       — called when the user closes the notification
//   onView          — called when the user clicks "View Command Board"
//   onViewPrePlan   — called when the user clicks "View Building Intel"

const PRIORITY_STYLES = {
  high:   'bg-red-700    border-red-500  ring-red-400/40',
  medium: 'bg-amber-600  border-amber-400 ring-amber-300/40',
  low:    'bg-blue-700   border-blue-500  ring-blue-400/40',
};

const RISK_BADGE = {
  High:     'bg-red-500/30 text-red-100 border border-red-400/40',
  Moderate: 'bg-amber-500/30 text-amber-100 border border-amber-400/40',
  Low:      'bg-green-500/30 text-green-100 border border-green-400/40',
};

export default function DispatchNotification({ dispatch, matchedPrePlan, onDismiss, onView, onViewPrePlan }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (dispatch) {
      // small delay so the CSS transition fires
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [dispatch]);

  if (!dispatch) return null;

  const priority = dispatch.priority || 'high';
  const style    = PRIORITY_STYLES[priority] || PRIORITY_STYLES.high;
  // `units` may arrive as an array (some sources) or a comma-separated string
  // (CAD alerts row). Normalize to an array so .join never throws — same guard
  // LiveDispatch and KioskDispatch use.
  const units = Array.isArray(dispatch.units)
    ? dispatch.units
    : (dispatch.units || '').split(',').map((u) => u.trim()).filter(Boolean);

  function handleDismiss() {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  function handleView() {
    setVisible(false);
    setTimeout(onView, 300);
  }

  function handleViewPrePlan() {
    setVisible(false);
    setTimeout(onViewPrePlan, 300);
  }

  return (
    <div
      className={`fixed top-4 right-4 z-[9999] max-w-sm w-full transition-all duration-300 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className={`rounded-xl border shadow-2xl ring-2 text-white p-4 ${style}`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Siren size={20} className="animate-pulse flex-shrink-0" />
            <span className="text-sm font-black uppercase tracking-wide">
              {priority === 'high' ? 'Priority Dispatch' : 'New Dispatch'}
            </span>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss dispatch notification"
            className="text-white/70 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Call details */}
        <div className="mt-2 space-y-1">
          {dispatch.type && (
            <p className="text-sm font-bold">{dispatch.type}</p>
          )}
          {dispatch.address && (
            <p className="text-xs text-white/80">{dispatch.address}</p>
          )}
          {units.length > 0 && (
            <p className="text-xs text-white/70">
              Units: {units.join(', ')}
            </p>
          )}
          {dispatch.timestamp && (
            <p className="text-[10px] text-white/50 mt-1">
              {new Date(dispatch.timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Building Intel — shown when a pre-plan matches the dispatch address */}
        {matchedPrePlan && (
          <div className="mt-3 rounded-lg bg-black/20 border border-white/10 p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 size={13} className="text-white/70 flex-shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                Building Intel
              </span>
              {matchedPrePlan.riskLevel && (
                <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${RISK_BADGE[matchedPrePlan.riskLevel] || RISK_BADGE.Moderate}`}>
                  {matchedPrePlan.riskLevel} Risk
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-white leading-tight">
              {matchedPrePlan.occupancyName}
            </p>
            {matchedPrePlan.occupancyType && (
              <p className="text-[10px] text-white/60 mt-0.5">{matchedPrePlan.occupancyType}</p>
            )}
            {Array.isArray(matchedPrePlan.hazards) && matchedPrePlan.hazards.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5">
                <ShieldAlert size={11} className="text-amber-300 flex-shrink-0" />
                <span className="text-[10px] text-amber-200 font-medium">
                  {matchedPrePlan.hazards.length} hazard{matchedPrePlan.hazards.length !== 1 ? 's' : ''} on file
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className={`mt-3 ${matchedPrePlan ? 'grid grid-cols-2 gap-2' : ''}`}>
          <button
            onClick={handleView}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
          >
            Command Board <ArrowRight size={13} />
          </button>
          {matchedPrePlan && (
            <button
              onClick={handleViewPrePlan}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition-colors"
            >
              <Building2 size={13} />
              Building Intel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
