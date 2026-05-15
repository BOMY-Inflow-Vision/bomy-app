-- Tighten catalog public-read policies to require active parent store.
-- A product/variant/image from a suspended store must not be visible
-- to anonymous (withPublicRead) callers.
--> statement-breakpoint
ALTER POLICY products_read ON products USING (
  (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = products.store_id
        AND stores.status = 'active'
    )
  )
  OR EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = products.store_id
      AND stores.owner_id = app.current_user_id()
  )
  OR app.is_bomy_staff()
  OR app.is_admin_bypass()
);
--> statement-breakpoint
ALTER POLICY product_variants_read ON product_variants USING (
  (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.id = product_variants.product_id
        AND products.status = 'active'
        AND stores.status = 'active'
    )
  )
  OR EXISTS (
    SELECT 1 FROM products p
    JOIN stores s ON s.id = p.store_id
    WHERE p.id = product_variants.product_id
      AND s.owner_id = app.current_user_id()
  )
  OR app.is_bomy_staff()
  OR app.is_admin_bypass()
);
--> statement-breakpoint
ALTER POLICY product_images_read ON product_images USING (
  EXISTS (
    SELECT 1 FROM products
    JOIN stores ON stores.id = products.store_id
    WHERE products.id = product_images.product_id
      AND products.status = 'active'
      AND stores.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM products p
    JOIN stores s ON s.id = p.store_id
    WHERE p.id = product_images.product_id
      AND s.owner_id = app.current_user_id()
  )
  OR app.is_bomy_staff()
  OR app.is_admin_bypass()
);
