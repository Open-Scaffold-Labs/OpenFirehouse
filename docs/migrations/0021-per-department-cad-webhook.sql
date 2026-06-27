-- 0021-per-department-cad-webhook.sql  (full per-department CAD)
--
-- Until now CAD ingest was single-deployment: ONE global CAD_WEBHOOK_SECRET +
-- an env CAD_STATION_MAP. For a multi-tenant SaaS, each department connects its
-- OWN CAD feed. This gives every cad_connection its own webhook secret so an
-- inbound dispatch is attributed to the right department (and house) from the
-- secret it presents — no shared env config.
--
-- Only the sha256 HASH of the secret is stored (the raw secret is shown to the
-- chief once, at create). of_cad_connection_by_webhook_secret resolves the secret
-- hash -> { connection, department, station }, BYPASSING RLS (the webhook is
-- unauthenticated, no dept GUC), authorized by possession of the high-entropy
-- secret itself — same trust model as the member-invite redeem fn.
-- The global CAD_WEBHOOK_SECRET stays valid as a fallback (existing setup).
--
-- Idempotent. Apply to prod via Supabase MCP + mirror in db.js + stamp the ledger.

ALTER TABLE public.cad_connections ADD COLUMN IF NOT EXISTS webhook_secret_hash text;
CREATE INDEX IF NOT EXISTS idx_cad_connections_webhook_secret ON public.cad_connections(webhook_secret_hash);

CREATE OR REPLACE FUNCTION public.of_cad_connection_by_webhook_secret(p_secret_hash text)
RETURNS TABLE (connection_id integer, department_id integer, station_id integer, vendor_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, department_id, station_id, "vendorId"
  FROM public.cad_connections
  WHERE webhook_secret_hash = p_secret_hash
    AND COALESCE(status, '') NOT IN ('Inactive', 'disabled', 'revoked')
  ORDER BY id DESC
  LIMIT 1
$$;

DO $$
DECLARE r text; f text := 'public.of_cad_connection_by_webhook_secret(text)';
BEGIN
  IF to_regprocedure(f) IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r); END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f); END IF;
  END IF;
END $$;
