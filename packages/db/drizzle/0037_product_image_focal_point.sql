-- Migration 0037: product picture focal point.
--
-- The storefront tiles are square and crop a normal photo to fill (object-fit: cover). The seller
-- now chooses which part of the picture stays in view: a point, as a percentage across (focal_x)
-- and down (focal_y) the picture, used as the CSS object-position. 50 / 50 is the centre, which is
-- exactly what the tile did before, so every existing picture keeps its current look.
--
--   product_images.focal_x / focal_y   per picture (the seller edits these)
--   products.cover_focal_x / _y        cached copy for the cover picture, so the storefront queries
--                                      need no join (same pattern as cover_is_cutout, 0033/0034;
--                                      the seller actions keep the two in step)
--
-- Additive. Existing rows default to 50 / 50. Range-checked 0..100. Idempotent. No RLS or grant
-- change: product_images_seller_update, products_seller_update and the table-level grants already
-- cover any column (same precedent as 0033 / 0034).

ALTER TABLE product_images ADD COLUMN IF NOT EXISTS focal_x smallint NOT NULL DEFAULT 50;
--> statement-breakpoint
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS focal_y smallint NOT NULL DEFAULT 50;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_focal_x smallint NOT NULL DEFAULT 50;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_focal_y smallint NOT NULL DEFAULT 50;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_images_focal_chk') THEN
    ALTER TABLE product_images
      ADD CONSTRAINT product_images_focal_chk
      CHECK (focal_x BETWEEN 0 AND 100 AND focal_y BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cover_focal_chk') THEN
    ALTER TABLE products
      ADD CONSTRAINT products_cover_focal_chk
      CHECK (cover_focal_x BETWEEN 0 AND 100 AND cover_focal_y BETWEEN 0 AND 100);
  END IF;
END
$$;
--> statement-breakpoint
-- Carry the cover picture's focal point onto the product row (a no-op on a fresh column: all 50).
UPDATE products p
   SET cover_focal_x = pi.focal_x,
       cover_focal_y = pi.focal_y
  FROM product_images pi
 WHERE pi.product_id = p.id
   AND pi.url = p.cover_image_url;
