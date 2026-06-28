ALTER TABLE products
  ADD COLUMN body_html TEXT,
  ADD COLUMN body_revision INTEGER NOT NULL DEFAULT 0;

--> statement-breakpoint

CREATE TABLE body_image_upload_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX body_image_upload_log_user_window_idx
  ON body_image_upload_log (user_id, created_at);

--> statement-breakpoint

ALTER TABLE body_image_upload_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_image_upload_log FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

CREATE POLICY body_image_upload_log_self_select ON body_image_upload_log
  FOR SELECT TO bomy_app
  USING (
    user_id = current_setting('app.current_user_id')::uuid
    OR current_setting('app.bypass_rls', true) = 'true'
  );

--> statement-breakpoint

CREATE POLICY body_image_upload_log_self_insert ON body_image_upload_log
  FOR INSERT TO bomy_app
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

--> statement-breakpoint

CREATE POLICY body_image_upload_log_admin_delete ON body_image_upload_log
  FOR DELETE TO bomy_app
  USING (current_setting('app.bypass_rls', true) = 'true');

--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON body_image_upload_log TO bomy_app;
