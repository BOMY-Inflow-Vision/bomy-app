-- Migration 0019: Allow seller_owner to SELECT inactive categories referenced by their own products.
--
-- Without this policy, getProductForEdit's OR condition (is_active = true OR id = currentCategoryId)
-- is silently overridden by categories_active_read (USING is_active = true), so an inactive
-- category a seller's product still points at is hidden — and the edit form silently resets it to
-- null on next save.
--
-- This policy is intentionally narrow: only activates for seller_owner, only for categories that
-- at least one of that seller's products currently references.

CREATE POLICY categories_seller_owned_product_ref ON categories
  FOR SELECT
  USING (
    app.current_user_role() = 'seller_owner'
    AND EXISTS (
      SELECT 1
      FROM   products p
      JOIN   stores   s ON s.id = p.store_id
      WHERE  p.category_id = categories.id
        AND  s.owner_id    = app.current_user_id()
    )
  );
