-- 0026 — Rank-derived notifications (chief-configurable per department)
--
-- Notifications are NOT a per-member choice. They are determined by RANK TIER
-- (firefighter / officer / command) and relevance to rank, identical for everyone
-- of that tier. Defaults are fixed-by-relevance (server/src/config/
-- rankNotifications.js); this table stores a department's CHIEF OVERRIDES of those
-- defaults. A missing row = use the default. So the table is sparse: only cells the
-- chief has changed are persisted.
--
-- tier:       'firefighter' | 'officer' | 'command'
-- notif_type: 'dispatch' | 'training' | 'certs' | 'bulletins' | 'schedule'
--             | 'maintenance' | 'meetings'
-- enabled:    whether that tier receives that notification category.
--
-- (Cert-alert SCOPE — own / station / all — is fixed by tier doctrine in code,
-- not a toggle here.)

CREATE TABLE IF NOT EXISTS of_rank_notifications (
  department_id INTEGER NOT NULL,
  tier          TEXT    NOT NULL,
  notif_type    TEXT    NOT NULL,
  enabled       BOOLEAN NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (department_id, tier, notif_type)
);
