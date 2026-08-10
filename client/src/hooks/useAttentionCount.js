// useAttentionCount — the ONE definition of "how many things need my attention".
//
// WHY THIS EXISTS. On 2026-08-05 the app told a chief three different numbers for
// the same claim, on screens one click apart:
//
//   sidebar bell ................. 47   (App.jsx: alerts + workflow + bulletins + messages)
//   Member Portal alert card ..... 36   (MyPortal: department alerts ONLY)
//   Dashboard header button ....... 1   (Dashboard: its own summary-derived tally)
//
// None was wrong on its own terms; each counted a different set and none said so.
// A count a user cannot reconcile is worse than no count — they stop trusting all
// three, including the one that would have told them something real.
//
// An earlier fix (2026-08-05) aligned the Notifications PAGE headline to the bell
// by re-deriving the bell's arithmetic in a second place. That closed the symptom
// and kept the cause: two copies of a formula drift, and these did. So the formula
// now lives here, once, and every surface that makes the "needs attention" claim
// reads it from this hook.
//
// DELIBERATELY NOT dismissal-filtered. Dismissals on the Notifications page are
// session-local and the bell cannot see them; a headline that diverged from the
// badge the moment someone dismissed a row would recreate the original bug in a
// new costume.
//
// `severity !== 'info'` is the gate on both alert feeds: informational rows are
// real content but they are not something a chief must act on, and counting them
// would make the badge permanently non-zero — which trains people to ignore it.
import { useMemo } from 'react';
import { useAlerts } from './useAlerts';
import { useWorkflowAlerts } from './useWorkflowAlerts';
import { useBulletinAlerts } from './useBulletinAlerts';

/**
 * @param {object|null} user               the signed-in user (null → zeros)
 * @param {number} unreadMessageCount      lifted in App.jsx from the inbox poll
 * @returns {{ total:number, parts:{alerts:number,workflow:number,bulletins:number,messages:number}, alerts:Array, error:any }}
 */
export function useAttentionCount(user, unreadMessageCount = 0) {
  // No thresholds — this hits the same useAlerts cache entry every other caller
  // uses, so the surfaces cannot disagree and no extra request is made.
  const { alerts, error } = useAlerts(user);
  const { alerts: workflowAlerts } = useWorkflowAlerts();
  const { unreadCount: unreadBulletinCount } = useBulletinAlerts();

  return useMemo(() => {
    const actionable = (list) => (list || []).filter((a) => a.severity !== 'info');
    const parts = {
      alerts: actionable(alerts).length,
      workflow: actionable(workflowAlerts).length,
      bulletins: unreadBulletinCount || 0,
      messages: unreadMessageCount || 0,
    };
    return {
      total: parts.alerts + parts.workflow + parts.bulletins + parts.messages,
      parts,
      alerts: actionable(alerts),
      error,
    };
  }, [alerts, workflowAlerts, unreadBulletinCount, unreadMessageCount, error]);
}

export default useAttentionCount;
