-- Migration 0030: SEO fields (meta title/description/OG image) for stores and products.
-- Additive only. No RLS policy or bomy_app grant changes needed — existing row-level
-- policies (stores_owner_update, products_seller_update) and table-level grants already
-- cover any column, including new ones (same precedent as migration 0028).

ALTER TABLE stores ADD COLUMN IF NOT EXISTS meta_title text;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS meta_description text;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS og_image_url text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE stores ADD CONSTRAINT stores_meta_title_length_chk
    CHECK (meta_title IS NULL OR length(meta_title) <= 70);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE stores ADD CONSTRAINT stores_meta_description_length_chk
    CHECK (meta_description IS NULL OR length(meta_description) <= 160);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE stores ADD CONSTRAINT stores_og_image_url_chk
    CHECK (og_image_url IS NULL OR (length(og_image_url) <= 2048 AND og_image_url ~ '^https?://'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title text;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description text;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS og_image_url text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_meta_title_length_chk
    CHECK (meta_title IS NULL OR length(meta_title) <= 70);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_meta_description_length_chk
    CHECK (meta_description IS NULL OR length(meta_description) <= 160);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_og_image_url_chk
    CHECK (og_image_url IS NULL OR (length(og_image_url) <= 2048 AND og_image_url ~ '^https?://'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
