-- 0008-auth-resolve-fn.sql — SECURITY DEFINER bootstrap lookup for P5 RLS.
--
-- During authentication the app must resolve a user's department by reading
-- of_user_departments BEFORE app.user_id can be set — the membership read is what
-- DETERMINES the department/context. Under the non-owner of_app role,
-- of_user_departments is RLS-protected (policy: user_id = app.user_id), so a
-- pre-GUC read returns 0 rows and login fails closed. Proven on prod 2026-06-14:
-- of_app + no app.user_id -> 0 membership rows.
--
-- This SECURITY DEFINER function runs as ITS OWNER (the table owner, which
-- bypasses RLS) to perform exactly that ONE controlled lookup, while the table
-- stays RLS-protected for every other query path. The app only ever passes the
-- already-authenticated user's own id (JWT sub), so this leaks nothing.
--
-- SET search_path pins resolution (mandatory hardening for SECURITY DEFINER).
-- EXECUTE is granted ONLY to of_app (+ owner); revoked from PUBLIC.

CREATE OR REPLACE FUNCTION public.of_resolve_department(p_user_id int)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT department_id
  FROM public.of_user_departments
  WHERE user_id = p_user_id
  ORDER BY department_id ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.of_resolve_department(int) FROM PUBLIC;

-- Grant to of_app if it exists (0007 normally precedes this; guarded for safety).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.of_resolve_department(int) TO of_app';
  END IF;
END $$;
