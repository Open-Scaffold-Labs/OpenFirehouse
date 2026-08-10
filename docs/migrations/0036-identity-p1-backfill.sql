-- 0036-identity-p1-backfill.sql — P1 of the identity-link gameplan (v2):
-- backfill members.user_id from STABLE KEYS ONLY. (Numbered 0036: 0031 is
-- absent from the repo, so it is not reused here.)
--
-- Doctrine (IDENTITY-LINK-GAMEPLAN-v2 §P1, FMEA R1):
--   • Stable keys only: users.external_id ↔ members.external_id first, then
--     exact lowercased email (users.email vs members.email / station_email /
--     personal_email). NEVER name. A mis-linked cert is a deposition exhibit.
--   • Dry-run first: Section A prints the 3-bucket report and writes NOTHING.
--   • Unambiguous-only writes: a pair is written only if the member has exactly
--     one candidate user AND that user has exactly one candidate member in the
--     department. Ambiguous rows are left for chief confirm (P5 UI).
--   • Reversible: every touched id is logged with a run tag (P1.3).
--
-- Prereqs: 0028 applied (idx_members_user_dept partial unique). Prod baseline
-- 2026-06-18 was 47 members / 1 linked / 46 null.
-- Apply order: local → dry-run on prod → write on prod → ledger.

-- ── 0. Rollback log (owner-only; 0007 default-privs stripped per 0035 lesson) ──
CREATE TABLE IF NOT EXISTS public.identity_backfill_log (
  id          bigserial PRIMARY KEY,
  run_tag     text NOT NULL,
  member_id   integer NOT NULL,
  user_id     integer NOT NULL,
  matched_key text NOT NULL,          -- 'external_id' | 'email'
  ran_at      timestamptz NOT NULL DEFAULT now()
);
DO $do$
  DECLARE r text;
  BEGIN
    EXECUTE 'REVOKE ALL ON TABLE public.identity_backfill_log FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON SEQUENCE public.identity_backfill_log_id_seq FROM PUBLIC';
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.identity_backfill_log FROM %I', r);
        EXECUTE format('REVOKE ALL ON SEQUENCE public.identity_backfill_log_id_seq FROM %I', r);
      END IF;
    END LOOP;
  END $do$;

-- ── Shared candidate set (used by both sections) ──────────────────────────────
-- One row per (member, user, key) stable-key hit, constrained to users actually
-- mapped to the member's department and not already linked to another member
-- there (respects idx_members_user_dept).
CREATE OR REPLACE TEMP VIEW p1_candidates AS
WITH member_emails AS (
  SELECT m.id AS member_id, m.department_id,
         lower(NULLIF(btrim(e.email), '')) AS email
    FROM public.members m
   CROSS JOIN LATERAL (VALUES (m.email), (m.station_email), (m.personal_email)) AS e(email)
   WHERE m.user_id IS NULL
), ext AS (                                             -- key 1: SCIM external_id
  SELECT m.id AS member_id, u.id AS user_id, m.department_id,
         'external_id'::text AS matched_key
    FROM public.members m
    JOIN public.users u
      ON u.external_id IS NOT NULL AND u.external_id = m.external_id
   WHERE m.user_id IS NULL
), em AS (                                              -- key 2: exact email
  SELECT me.member_id, u.id AS user_id, me.department_id,
         'email'::text AS matched_key
    FROM member_emails me
    JOIN public.users u ON lower(NULLIF(btrim(u.email), '')) = me.email
   WHERE me.email IS NOT NULL
), all_hits AS (
  SELECT * FROM ext UNION SELECT * FROM em
)
SELECT DISTINCT h.member_id, h.user_id, h.department_id,
       min(h.matched_key) OVER (PARTITION BY h.member_id, h.user_id) AS matched_key
  FROM all_hits h
  JOIN public.of_user_departments ud
    ON ud.user_id = h.user_id AND ud.department_id = h.department_id
 WHERE NOT EXISTS (                                      -- user not already linked
         SELECT 1 FROM public.members m2
          WHERE m2.user_id = h.user_id
            AND m2.department_id = h.department_id);

-- ══ SECTION A — DRY RUN (read-only; run FIRST, on prod, review the buckets) ═══
WITH per_member AS (
  SELECT member_id, count(DISTINCT user_id) AS n_users FROM p1_candidates GROUP BY member_id
), per_user AS (
  SELECT user_id, department_id, count(DISTINCT member_id) AS n_members
    FROM p1_candidates GROUP BY user_id, department_id
), unambiguous AS (
  SELECT c.* FROM p1_candidates c
    JOIN per_member pm ON pm.member_id = c.member_id AND pm.n_users = 1
    JOIN per_user   pu ON pu.user_id = c.user_id
                       AND pu.department_id = c.department_id AND pu.n_members = 1
)
SELECT 'BUCKET 1 — will link (unambiguous)' AS bucket, count(*) AS n FROM unambiguous
UNION ALL
SELECT 'BUCKET 2 — ambiguous (chief confirm via P5 UI, NOT written)',
       count(DISTINCT member_id) FROM p1_candidates
 WHERE member_id NOT IN (SELECT member_id FROM unambiguous)
UNION ALL
SELECT 'BUCKET 3 — no stable-key match (stays unlinked)',
       (SELECT count(*) FROM public.members
         WHERE user_id IS NULL
           AND id NOT IN (SELECT member_id FROM p1_candidates));

-- Detail (eyeball before writing — names shown as evidence, never as the key):
SELECT c.member_id, m.name AS member_name, c.user_id, u.name AS user_name,
       u.email, c.matched_key, c.department_id
  FROM p1_candidates c
  JOIN public.members m ON m.id = c.member_id
  JOIN public.users   u ON u.id = c.user_id
 ORDER BY c.department_id, m.name;

-- ══ SECTION B — WRITE (run ONLY after the Section A report is approved) ═══════
-- Single transaction; unambiguous pairs only; every touched id logged.
-- NOTE: p1_candidates is a TEMP view (session-scoped). Run this file top-to-
-- Section-A in the SAME session/editor tab before uncommenting and running B.
/*
BEGIN;
WITH per_member AS (
  SELECT member_id, count(DISTINCT user_id) AS n_users FROM p1_candidates GROUP BY member_id
), per_user AS (
  SELECT user_id, department_id, count(DISTINCT member_id) AS n_members
    FROM p1_candidates GROUP BY user_id, department_id
), unambiguous AS (
  SELECT c.* FROM p1_candidates c
    JOIN per_member pm ON pm.member_id = c.member_id AND pm.n_users = 1
    JOIN per_user   pu ON pu.user_id = c.user_id
                       AND pu.department_id = c.department_id AND pu.n_members = 1
), logged AS (
  INSERT INTO public.identity_backfill_log (run_tag, member_id, user_id, matched_key)
  SELECT 'p1-2026-07-04', member_id, user_id, matched_key FROM unambiguous
  RETURNING member_id, user_id
)
UPDATE public.members m
   SET user_id = l.user_id, "updatedAt" = NOW()
  FROM logged l
 WHERE m.id = l.member_id AND m.user_id IS NULL;
-- sanity: row count here must equal BUCKET 1 from the dry run, else ROLLBACK.
COMMIT;
*/

-- ── ROLLBACK (P1.3 — exact set touched, nothing else) ─────────────────────────
-- UPDATE public.members m SET user_id = NULL, "updatedAt" = NOW()
--   FROM public.identity_backfill_log l
--  WHERE l.run_tag = 'p1-2026-07-04' AND m.id = l.member_id
--    AND m.user_id = l.user_id;   -- only if still pointing at the backfilled user

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0036-identity-p1-backfill.sql')
ON CONFLICT (filename) DO NOTHING;
