CREATE TABLE IF NOT EXISTS service_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS service_categories_slug_unique_idx ON service_categories (slug);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_categories_active_idx ON service_categories (is_active);
--> statement-breakpoint
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT ON service_categories TO bomy_app';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY service_categories_default_deny ON service_categories
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY service_categories_active_read ON service_categories
    FOR SELECT
    USING (is_active = true OR app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- Starter list. No admin CRUD UI yet (spec §3/§8) — edit via a new migration
-- until the admin-review PR adds a CRUD page. "Other" is a UI-only sentinel
-- (a NULL service_category_id on the application row) and must NEVER be a
-- row here — see service_provider_applications' CHECK constraint (0032),
-- which a real "Other" row would silently defeat.
INSERT INTO service_categories (id, name, slug, sort_order, is_active, created_at)
VALUES
  (gen_random_uuid(), 'Graphic Design',         'graphic-design',         10, true, now()),
  (gen_random_uuid(), 'Videography',            'videography',            20, true, now()),
  (gen_random_uuid(), 'Photography',             'photography',            30, true, now()),
  (gen_random_uuid(), 'Copywriting & Content',   'copywriting-content',    40, true, now()),
  (gen_random_uuid(), 'Web & App Development',   'web-app-development',   50, true, now())
ON CONFLICT (slug) DO NOTHING;
