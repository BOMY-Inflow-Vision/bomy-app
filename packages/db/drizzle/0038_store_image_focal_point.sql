-- Migration 0038: brand (store) picture and its focal point.
--
-- A brand tile on /brands and the home page now shows a picture the seller uploads in store
-- settings, instead of only the brand's first letter. Like product pictures (0037) it is shown
-- square with object-fit: cover, and the seller chooses which part stays in view:
--
--   stores.image_url                    the uploaded picture's public URL (NULL = no picture, the
--                                       tile keeps the first-letter fallback)
--   stores.image_focal_x / image_focal_y   percentage across / down the picture, used as the CSS
--                                       object-position. 50 / 50 = centre.
--
-- Additive. Existing stores get NULL / 50 / 50, so nothing changes visually. Idempotent. No RLS or
-- grant change: stores_owner_update and the table-level grants already cover any column (same
-- precedent as 0030 / 0037).

ALTER TABLE stores ADD COLUMN IF NOT EXISTS image_url text;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS image_focal_x smallint NOT NULL DEFAULT 50;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS image_focal_y smallint NOT NULL DEFAULT 50;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_image_url_chk') THEN
    ALTER TABLE stores
      ADD CONSTRAINT stores_image_url_chk
      CHECK (image_url IS NULL OR (length(image_url) <= 2048 AND image_url ~ '^https?://'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_image_focal_chk') THEN
    ALTER TABLE stores
      ADD CONSTRAINT stores_image_focal_chk
      CHECK (image_focal_x BETWEEN 0 AND 100 AND image_focal_y BETWEEN 0 AND 100);
  END IF;
END
$$;
