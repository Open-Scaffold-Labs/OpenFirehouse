import { useState, useEffect, useRef } from 'react';
import {
  X, ChevronDown, AlertTriangle, AlertCircle, Info, Zap,
  GraduationCap, Handshake, Wrench, CalendarDays, DollarSign,
  Scale, Package, UserCog, RefreshCw, Settings, History, Bot,
  ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { api } from '../utils/api';

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-100 dark:bg-red-950/50', badge: 'bg-red-600', icon: AlertTriangle, label: 'CRITICAL' },
  warning:  { color: 'bg-amber-100 dark:bg-amber-950/50', badge: 'bg-amber-600', icon: AlertCircle, label: 'WARNING' },
  info:     { color: 'bg-blue-100 dark:bg-blue-950/50', badge: 'bg-blue-600', icon: Info, label: 'INFO' },
};

const CATEGORY_ICONS = {
  training: GraduationCap,
  mutual_aid: Handshake,
  maintenance: Wrench,
  schedule: CalendarDays,
  budget: DollarSign,
  grievance: Scale,
  equipment: Package,
  personnel: UserCog,
};

const FOCUS_MODES = [
  { id: 'on_duty', label: 'On Duty', badge: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' },
  { id: 'off_duty', label: 'Off Duty', badge: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
  { id: 'dnd', label: 'Do Not Disturb', badge: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' },
  { id: 'officer', label: 'Officer Mode', badge: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' },
];

function AlertCard({ alert, onView, onDismiss, onFeedback }) {
  const severityConfig = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
  const SeverityIcon = severityConfig.icon;
  const CategoryIcon = CATEGORY_ICONS[alert.category] || AlertCircle;
  const isUnread = !alert.viewed_at;

  return (
    <div className={`border-l-4 rounded-lg p-4 bg-white dark:bg-gray-900 ${
      isUnread ? 'border-l-blue-500' : 'border-l-gray-300'
    }`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`p-2 rounded-lg flex-shrink-0 ${severityConfig.color}`}>
          <CategoryIcon size={16} className={`${severityConfig.badge.split(' ')[0]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold ${severityConfig.badge}`}>
              {severityConfig.label}
            </span>
            {isUnread && (
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            )}
          </div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm mb-1">{alert.title}</h3>
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{alert.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {alert.action_label && (
          <button
            onClick={() => onView(alert.id)}
            className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-950/50 px-2.5 py-1.5 rounded transition-colors"
          >
            {alert.action_label}
          </button>
        )}
        <button
          onClick={() => onDismiss(alert.id)}
          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          title="Dismiss"
          aria-label="Dismiss alert"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function FeedbackPopup({ onFeedback, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-slide-up sm:animate-scale-up">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Was this alert helpful?</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Your feedback helps improve the Personal Assistant.</p>
        <div className="flex gap-3">
          <button
            onClick={() => { onFeedback(true); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 bg-green-100 dark:bg-green-950/50 hover:bg-green-200 text-green-700 dark:text-green-300 font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            <ThumbsUp size={16} />
            Helpful
          </button>
          <button
            onClick={() => { onFeedback(false); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            <ThumbsDown size={16} />
            Not helpful
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PersonalAssistant({
  open,
  onClose,
  user,
  onNavigate,
}) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focusMode, setFocusMode] = useState('on_duty');
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const pollRef = useRef(null);

  // Fetch alerts
  async function fetchAlerts() {
    if (!user?.id) return;
    try {
      const data = await api.get(`/api/assistant/alerts?member_id=${user.id}&limit=20`);
      // GET /api/assistant/alerts responds with a bare array (res.json(result.rows)),
      // not { alerts: [...] }. Reading data.alerts always yielded undefined, so the
      // panel rendered "All clear!" no matter how many alerts existed. Accept both
      // shapes so the fix holds if the endpoint is ever wrapped.
      setAlerts(Array.isArray(data) ? data : (data?.alerts ?? []));
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  }

  // Load initial data
  useEffect(() => {
    if (open && user?.id) {
      setLoading(true);
      fetchAlerts().finally(() => setLoading(false));
    }
  }, [open, user?.id]);

  // Auto-poll for new alerts every 60 seconds
  useEffect(() => {
    if (!open || !user?.id) return;

    const interval = setInterval(() => {
      fetchAlerts();
    }, 60000);

    return () => clearInterval(interval);
  }, [open, user?.id]);

  async function handleViewAlert(alertId) {
    try {
      await api.post(`/api/assistant/alerts/${alertId}/view`, {});
      const alert = alerts.find(a => a.id === alertId);
      if (alert) {
        alert.viewed_at = new Date().toISOString();
        setAlerts([...alerts]);
      }
    } catch (err) {
      console.error('Failed to mark alert as viewed:', err);
    }
  }

  async function handleDismissAlert(alertId) {
    try {
      await api.delete(`/api/assistant/alerts/${alertId}`);
      setAlerts(alerts.filter(a => a.id !== alertId));
      setFeedback(alertId);
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  }

  async function handleRefresh() {
    setLoading(true);
    try {
      await Promise.all([
        fetchAlerts(),
        api.post(`/api/assistant/generate?member_id=${user.id}`, {}),
      ]);
    } catch (err) {
      console.error('Failed to refresh:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFocusMode(mode) {
    try {
      await api.post('/api/assistant/focus-mode', { mode });
      setFocusMode(mode);
      setFocusModeOpen(false);
    } catch (err) {
      console.error('Failed to change focus mode:', err);
    }
  }

  const unreadCount = alerts.filter(a => !a.viewed_at).length;
  const focusModeLabel = FOCUS_MODES.find(m => m.id === focusMode)?.label || 'On Duty';

  return (
    <>
      {/* Backdrop on mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 sm:hidden z-30"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={`
        fixed inset-y-0 right-0 z-40 w-full sm:w-[380px] bg-white dark:bg-gray-900 shadow-2xl
        transform transition-transform duration-300 ease-in-out overflow-hidden flex flex-col
        ${open ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Header */}
        <div className="bg-gray-900 text-white px-6 py-4 flex-shrink-0 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bot size={20} />
              <h2 className="font-bold text-lg">Personal Assistant</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
              title="Close"
              aria-label="Close assistant panel"
            >
              <X size={20} />
            </button>
          </div>

          {/* Focus Mode Selector */}
          <div className="relative">
            <button
              onClick={() => setFocusModeOpen(!focusModeOpen)}
              className="w-full flex items-center justify-between bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors text-sm font-medium"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Focus:</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  focusMode === 'on_duty' ? 'bg-green-900 text-green-300' :
                  focusMode === 'off_duty' ? 'bg-gray-700 text-gray-300' :
                  focusMode === 'dnd' ? 'bg-red-900 text-red-300' :
                  'bg-blue-900 text-blue-300'
                }`}>
                  {focusModeLabel}
                </span>
              </div>
              <ChevronDown size={14} className={`transition-transform ${focusModeOpen ? 'rotate-180' : ''}`} />
            </button>

            {focusModeOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg py-2 z-50">
                {FOCUS_MODES.map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => handleFocusMode(mode.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                      focusMode === mode.id
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${
                      mode.id === 'on_duty' ? 'bg-green-400' :
                      mode.id === 'off_duty' ? 'bg-gray-400' :
                      mode.id === 'dnd' ? 'bg-red-400' :
                      'bg-blue-400'
                    }`}></span>
                    {mode.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Last update */}
          {lastUpdate && (
            <p className="text-xs text-gray-400 mt-2">
              Last update: {Math.round((Date.now() - lastUpdate) / 60000)}m ago
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={20} className="text-gray-400 animate-spin" />
            </div>
          )}

          {!loading && alerts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Zap size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">All clear!</p>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Your assistant is watching for important updates.
              </p>
            </div>
          )}

          {!loading && alerts.length > 0 && (
            <>
              <div className="mb-4">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  {unreadCount > 0 ? `${unreadCount} unread · ${alerts.length} total` : `${alerts.length} alerts`}
                </p>
                <div className="space-y-3">
                  {alerts.map(alert => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onView={handleViewAlert}
                      onDismiss={handleDismissAlert}
                      onFeedback={() => setFeedback(alert.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-2 flex-shrink-0">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Quick Actions
          </p>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-300 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Alerts
          </button>
          <button
            onClick={() => onNavigate?.('settings')}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <Settings size={14} />
            Preferences
          </button>
          <button
            onClick={() => onNavigate?.('alerts')}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <History size={14} />
            Alert History
          </button>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-950 text-center flex-shrink-0">
          <p className="text-[10px] text-gray-600 dark:text-gray-300">
            Powered by Open Firehouse<br />
            AI Intelligence Engine
          </p>
        </div>
      </div>

      {/* Feedback popup */}
      {feedback && (
        <FeedbackPopup
          onFeedback={() => {}}
          onClose={() => setFeedback(null)}
        />
      )}
    </>
  );
}
