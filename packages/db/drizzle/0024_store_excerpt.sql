ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS excerpt TEXT;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE stores
    ADD CONSTRAINT stores_excerpt_length_chk
    CHECK (excerpt IS NULL OR length(excerpt) <= 160);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
