ALTER TABLE products
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS body_revision INTEGER NOT NULL DEFAULT 0;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS body_image_upload_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS body_image_upload_log_user_window_idx
  ON body_image_upload_log (user_id, created_at);

--> statement-breakpoint

ALTER TABLE body_image_upload_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_image_upload_log FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

-- default-deny (RESTRICTIVE)
DO $$ BEGIN
  CREATE POLICY body_image_upload_log_default_deny ON body_image_upload_log
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--> statement-breakpoint

-- self SELECT (also allows bypass_rls so withAdmin DELETE WHERE evaluation works)
DO $$ BEGIN
  CREATE POLICY body_image_upload_log_self_select ON body_image_upload_log
    FOR SELECT TO bomy_app
    USING (
      user_id = app.current_user_id()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--> statement-breakpoint

-- self INSERT
DO $$ BEGIN
  CREATE POLICY body_image_upload_log_self_insert ON body_image_upload_log
    FOR INSERT TO bomy_app
    WITH CHECK (user_id = app.current_user_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--> statement-breakpoint

-- admin DELETE
DO $$ BEGIN
  CREATE POLICY body_image_upload_log_admin_delete ON body_image_upload_log
    FOR DELETE TO bomy_app
    USING (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON body_image_upload_log TO bomy_app';
  END IF;
END
$$;
