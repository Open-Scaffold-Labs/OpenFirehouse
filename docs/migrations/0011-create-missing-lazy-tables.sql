-- 0011-create-missing-lazy-tables.sql
-- Materialize the lazy/runtime-created tables that exist in the app's code (their
-- routes create them on first request via INIT_SQL) but were MISSING on prod
-- (their routes had never been hit there). Under of_app + the DDL-skip
-- (db.js, P5_TXN=on), the request path no longer creates tables, so they MUST
-- exist beforehand or those routes 500 (relation does not exist). Created here as
-- owner with the correct multi-tenant shape: department_id column, RLS enabled,
-- dept_isolation policy (NULLIF-guarded), of_app grants, and the
-- of_sync_department_id trigger (so inserts that set station_id also get
-- department_id, satisfying the policy's WITH CHECK).
--
-- Schema captured from the dev DB (post-0010) 2026-06-14. Applied to prod the
-- same day. Idempotent (CREATE ... IF NOT EXISTS; DROP POLICY/TRIGGER IF EXISTS).
-- The 5 tables: active_resources, fto_evaluations, fto_observations, ng911_calls,
-- vacancy_fill. (ai_narrative_drafts and oja_* are intentionally NOT recreated:
-- the former was dropped on purpose, the latter is a foreign app.)

CREATE TABLE IF NOT EXISTS public.active_resources (
    id integer NOT NULL, station_id integer DEFAULT 1, incident_id integer,
    resource_type text DEFAULT 'fire'::text, agency text DEFAULT ''::text,
    unit_designation text NOT NULL, unit_type text DEFAULT ''::text,
    status text DEFAULT 'dispatched'::text, latitude double precision, longitude double precision,
    speed_mph double precision, heading double precision, eta_minutes integer,
    crew_count integer DEFAULT 0, crew_names text DEFAULT ''::text, officer_name text DEFAULT ''::text,
    radio_channel text DEFAULT ''::text, contact_phone text DEFAULT ''::text, live_share_token text,
    mutual_aid_agreement_id integer, notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);
CREATE SEQUENCE IF NOT EXISTS public.active_resources_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.active_resources_id_seq OWNED BY public.active_resources.id;
ALTER TABLE ONLY public.active_resources ALTER COLUMN id SET DEFAULT nextval('public.active_resources_id_seq'::regclass);
ALTER TABLE ONLY public.active_resources ADD CONSTRAINT active_resources_pkey PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS public.fto_evaluations (
    id integer NOT NULL, station_id integer DEFAULT 1, member_id integer NOT NULL,
    skill_id text NOT NULL, skill_name text DEFAULT ''::text, category text DEFAULT ''::text,
    result text DEFAULT 'Not Evaluated'::text, evaluated_by text DEFAULT ''::text,
    evaluated_at timestamp with time zone DEFAULT now(), notes text DEFAULT ''::text, department_id integer
);
CREATE SEQUENCE IF NOT EXISTS public.fto_evaluations_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.fto_evaluations_id_seq OWNED BY public.fto_evaluations.id;
ALTER TABLE ONLY public.fto_evaluations ALTER COLUMN id SET DEFAULT nextval('public.fto_evaluations_id_seq'::regclass);
ALTER TABLE ONLY public.fto_evaluations ADD CONSTRAINT fto_evaluations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fto_evaluations ADD CONSTRAINT fto_evaluations_station_id_member_id_skill_id_key UNIQUE (station_id, member_id, skill_id);

CREATE TABLE IF NOT EXISTS public.fto_observations (
    id integer NOT NULL, station_id integer DEFAULT 1, member_id integer NOT NULL,
    category text DEFAULT 'General'::text, note text NOT NULL, observed_by text DEFAULT ''::text,
    observed_at timestamp with time zone DEFAULT now(), department_id integer
);
CREATE SEQUENCE IF NOT EXISTS public.fto_observations_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.fto_observations_id_seq OWNED BY public.fto_observations.id;
ALTER TABLE ONLY public.fto_observations ALTER COLUMN id SET DEFAULT nextval('public.fto_observations_id_seq'::regclass);
ALTER TABLE ONLY public.fto_observations ADD CONSTRAINT fto_observations_pkey PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS public.ng911_calls (
    id integer NOT NULL, station_id integer DEFAULT 1, call_id text DEFAULT ''::text,
    call_type text DEFAULT 'fire'::text, priority text DEFAULT 'emergency'::text,
    caller_name text DEFAULT ''::text, caller_phone text DEFAULT ''::text,
    caller_latitude double precision, caller_longitude double precision, caller_accuracy_meters double precision,
    location_method text DEFAULT 'gps'::text, verified_address text DEFAULT ''::text,
    verified_city text DEFAULT ''::text, verified_state text DEFAULT ''::text, verified_zip text DEFAULT ''::text,
    building_name text DEFAULT ''::text, floor text DEFAULT ''::text, room text DEFAULT ''::text,
    supplemental_data jsonb DEFAULT '{}'::jsonb, call_narrative text DEFAULT ''::text,
    caller_text_messages jsonb DEFAULT '[]'::jsonb, media_urls jsonb DEFAULT '[]'::jsonb,
    psap_name text DEFAULT ''::text, psap_id text DEFAULT ''::text, ani text DEFAULT ''::text,
    ali text DEFAULT ''::text, esn text DEFAULT ''::text, incident_created boolean DEFAULT false,
    incident_id integer, status text DEFAULT 'new'::text, received_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone, created_at timestamp with time zone DEFAULT now(), department_id integer
);
CREATE SEQUENCE IF NOT EXISTS public.ng911_calls_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.ng911_calls_id_seq OWNED BY public.ng911_calls.id;
ALTER TABLE ONLY public.ng911_calls ALTER COLUMN id SET DEFAULT nextval('public.ng911_calls_id_seq'::regclass);
ALTER TABLE ONLY public.ng911_calls ADD CONSTRAINT ng911_calls_pkey PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS public.vacancy_fill (
    id integer NOT NULL, station_id integer DEFAULT 1, shift_date text NOT NULL, shift_name text DEFAULT ''::text,
    "position" text DEFAULT ''::text, callout_member_id integer, callout_member_name text DEFAULT ''::text,
    callout_reason text DEFAULT ''::text, status text DEFAULT 'open'::text, priority text DEFAULT 'normal'::text,
    filled_by_id integer, filled_by_name text DEFAULT ''::text, filled_at timestamp with time zone,
    notifications_sent integer DEFAULT 0, candidates_contacted text DEFAULT '[]'::text,
    candidates_declined text DEFAULT '[]'::text, notes text DEFAULT ''::text, created_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone, department_id integer
);
CREATE SEQUENCE IF NOT EXISTS public.vacancy_fill_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.vacancy_fill_id_seq OWNED BY public.vacancy_fill.id;
ALTER TABLE ONLY public.vacancy_fill ALTER COLUMN id SET DEFAULT nextval('public.vacancy_fill_id_seq'::regclass);
ALTER TABLE ONLY public.vacancy_fill ADD CONSTRAINT vacancy_fill_pkey PRIMARY KEY (id);

-- RLS + policy + grant + sync trigger for each (same pattern as 0006/0010).
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['active_resources','fto_evaluations','fto_observations','ng911_calls','vacancy_fill'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_department_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format('CREATE POLICY dept_isolation ON public.%I USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int) WITH CHECK (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO of_app', t);
    EXECUTE format('GRANT SELECT, USAGE ON SEQUENCE public.%I_id_seq TO of_app', t);
  END LOOP;
END $$;
