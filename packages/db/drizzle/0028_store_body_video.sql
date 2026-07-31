-- Migration 0028: store brand-story body content + YouTube video ID.
-- Additive only. No RLS policy or bomy_app grant changes needed — stores'
-- existing row-level policies and table-level grant already cover any
-- column, including new ones (GAPS #16).

ALTER TABLE stores ADD COLUMN IF NOT EXISTS body_html text;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS body_revision integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS video_id text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE stores ADD CONSTRAINT stores_video_id_chk
    CHECK (video_id IS NULL OR video_id ~ '^[A-Za-z0-9_-]{11}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
