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
  store_category_id   UUID NOT NULL REFERENCES store_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (store_id, store_category_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS store_category_assignments_category_idx ON store_category_assignments (store_category_id);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON store_categories TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON store_category_assignments TO bomy_app';
  END IF;
END $$;
