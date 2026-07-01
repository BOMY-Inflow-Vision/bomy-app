CREATE TABLE IF NOT EXISTS store_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS store_categories_slug_unique_idx ON store_categories (slug);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS store_categories_active_idx ON store_categories (is_active);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS store_category_assignments (
  store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  store_category_id   UUID NOT NULL REFERENCES store_categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (store_id, store_category_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS store_category_assignments_category_idx ON store_category_assignments (store_category_id);
--> statement-breakpoint
-- RLS: enable on both tables
ALTER TABLE store_categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_categories            FORCE  ROW LEVEL SECURITY;
ALTER TABLE store_category_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_category_assignments  FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
-- Grants (no UPDATE on the junction table — insert + delete only)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON store_categories TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON store_category_assignments TO bomy_app';
  END IF;
END $$;
--> statement-breakpoint
-- store_categories policies
DO $$ BEGIN
  CREATE POLICY store_categories_default_deny ON store_categories
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY store_categories_active_read ON store_categories
    FOR SELECT
    USING (is_active = true OR app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY store_categories_admin_insert ON store_categories
    FOR INSERT
    WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY store_categories_admin_update ON store_categories
    FOR UPDATE
    USING  (app.is_bomy_staff() OR app.is_admin_bypass())
    WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY store_categories_admin_delete ON store_categories
    FOR DELETE
    USING (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- store_category_assignments policies
-- SELECT public arm: active store + active category (inactive cats hidden from public).
--         seller arm: all of their own store's assignments (including inactive cats,
--         so the settings page can display and clean them up).
-- INSERT:  seller must own an active store AND the category must be active (RLS
--         defence-in-depth — the action layer validates this too).
-- DELETE:  seller must own an active store.
DO $$ BEGIN
  CREATE POLICY store_category_assignments_default_deny ON store_category_assignments
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY store_category_assignments_read ON store_category_assignments
    FOR SELECT
    USING (
      (
        EXISTS (
          SELECT 1 FROM stores
          WHERE stores.id = store_id AND stores.status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM store_categories
          WHERE store_categories.id = store_category_id AND store_categories.is_active = true
        )
      )
      OR EXISTS (
        SELECT 1 FROM stores
        WHERE stores.id = store_id AND stores.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY store_category_assignments_seller_insert ON store_category_assignments
    FOR INSERT
    WITH CHECK (
      (
        EXISTS (
          SELECT 1 FROM stores
          WHERE stores.id = store_id
            AND stores.owner_id = app.current_user_id()
            AND stores.status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM store_categories
          WHERE store_categories.id = store_category_id
            AND store_categories.is_active = true
        )
      )
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY store_category_assignments_seller_delete ON store_category_assignments
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM stores
        WHERE stores.id = store_id
          AND stores.owner_id = app.current_user_id()
          AND stores.status = 'active'
      )
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
