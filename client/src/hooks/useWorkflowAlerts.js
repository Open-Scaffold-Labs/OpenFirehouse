/**
 * useWorkflowAlerts — fetches proactive workflow notifications from the server
 *
 * Polls /api/workflows/alerts periodically and returns alerts in the same
 * shape as useAlerts so they can be merged into NotificationsCenter.
 *
 * Each alert: { id, severity, category, title, detail, module, taskId, score, date }
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

const POLL_INTERVAL = 60_000; // re-check every 60 seconds

export function useWorkflowAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ count: 0, activeTasks: 0 });

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/api/workflows/alerts');
      setAlerts(res.data || []);
      setMeta({ count: res.count || 0, activeTasks: res.activeTasks || 0 });
    } catch {
      // Silently fail — workflow alerts are supplementary
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  return { alerts, loading, meta, refresh };
}
