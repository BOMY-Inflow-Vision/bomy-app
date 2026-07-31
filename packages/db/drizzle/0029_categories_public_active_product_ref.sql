-- Migration 0029: Allow public (unauthenticated) reads of a category that's referenced by at
-- least one active product of an active store, even if the category itself was deactivated.
--
-- getStorePage (apps/web/src/app/brands/[slug]/queries.ts) fetches all categories via
-- withPublicRead (session role 'buyer', nil user id) so it can group a store's active products
-- into sections. Without this policy, categories_active_read (USING is_active = true) hides any
-- deactivated category from that read — so a product whose category an admin later deactivated
-- (toggleCategory has no cascade to products.category_id) would vanish from the storefront
-- entirely: no category section (the category itself isn't in the fetched list) and no
-- uncategorized bucket (its category_id isn't null).
--
-- This mirrors 0019's categories_seller_owned_product_ref (same shape, scoped to the owning
-- seller for the edit form) but for the public storefront read path, and mirrors products_read's
-- existing "active product of an active store is publicly visible" rule. categories carries no
-- sensitive columns (name/slug/sort_order only), so widening read visibility here carries no
-- exposure risk.

CREATE POLICY categories_public_active_product_ref ON categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   products p
      JOIN   stores   s ON s.id = p.store_id
      WHERE  p.category_id = categories.id
        AND  p.status      = 'active'
        AND  s.status      = 'active'
    )
  );
