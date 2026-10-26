-- Migration 0034: product_images.is_cutout — the seller marks each picture as a cut-out (no
-- background). products.cover_is_cutout (migration 0033) stays as the cached flag of the cover
-- picture, so the storefront queries need no join: the seller actions keep the two in step.
-- Additive. Existing images default to false (normal photo). The backfill copies any cover flag
-- already set on a product onto its cover image. Idempotent. No RLS or grant change needed
-- (product_images_seller_update and the table-level grants already cover any column).

ALTER TABLE product_images ADD COLUMN IF NOT EXISTS is_cutout boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE product_images pi
   SET is_cutout = true
  FROM products p
 WHERE p.id = pi.product_id
   AND p.cover_is_cutout
   AND pi.url = p.cover_image_url;
