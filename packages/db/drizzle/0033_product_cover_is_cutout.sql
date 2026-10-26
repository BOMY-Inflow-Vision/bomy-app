-- Migration 0033: products.cover_is_cutout — the seller says the cover picture is a cut-out
-- (no background), so the storefront card floats it on the coloured tile instead of cropping it
-- to fill. Additive only; existing rows default to false (normal photo, covers the tile).
-- No RLS policy or bomy_app grant changes needed — products_seller_update and the table-level
-- grants already cover any column (same precedent as migrations 0028 and 0030).

ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_is_cutout boolean NOT NULL DEFAULT false;
