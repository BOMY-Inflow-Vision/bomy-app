-- Migration 0009: Catalog schema — categories, products, product_variants,
-- product_images. Stage 5 PR #28.
--
-- Adds product_status enum and four catalog tables with RLS from day one.
-- products.search_vector is a GENERATED ALWAYS AS tsvector column backed
-- by a GIN index for full-text search.
--
-- Self-contained: enum, tables, FKs, indexes, RLS, bomy_app grants all in
-- one file. Idempotent: guarded by IF NOT EXISTS / DO EXCEPTION blocks.

-- ─── 1. Enum ─────────────────────────────────────────────────────────────
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. categories ───────────────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"        text        NOT NULL,
  "slug"        text        NOT NULL,
  "parent_id"   uuid        REFERENCES "categories"("id") ON DELETE SET NULL,
  "sort_order"  integer     NOT NULL DEFAULT 0,
  "is_active"   boolean     NOT NULL DEFAULT true,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_unique_idx" ON "categories" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_active_idx" ON "categories" USING btree ("is_active");

-- ─── 3. products ─────────────────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
  "id"               uuid              PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "store_id"         uuid              NOT NULL,
  "category_id"      uuid              REFERENCES "categories"("id") ON DELETE SET NULL,
  "name"             text              NOT NULL,
  "slug"             text              NOT NULL,
  "description"      text,
  "search_vector"    tsvector          GENERATED ALWAYS AS (
                       to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
                     ) STORED,
  "status"           "product_status"  NOT NULL DEFAULT 'draft',
  "cover_image_url"  text,
  "created_at"       timestamptz       NOT NULL DEFAULT now(),
  "updated_at"       timestamptz       NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_store_slug_unique_idx"  ON "products" USING btree ("store_id", "slug");
--> statement-breakpoint
CREATE        INDEX IF NOT EXISTS "products_store_status_idx"       ON "products" USING btree ("store_id", "status");
--> statement-breakpoint
CREATE        INDEX IF NOT EXISTS "products_search_vector_gin_idx"  ON "products" USING gin   ("search_vector");

-- ─── 4. product_variants ────────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_variants" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id"     uuid        NOT NULL,
  "name"           text        NOT NULL,
  "sku"            text,
  "price_myr_sen"  bigint      NOT NULL,
  "stock_count"    integer     NOT NULL DEFAULT 0,
  "attributes"     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  "sort_order"     integer     NOT NULL DEFAULT 0,
  "is_active"      boolean     NOT NULL DEFAULT true,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "product_variants_price_chk"  CHECK (price_myr_sen > 0),
  CONSTRAINT "product_variants_stock_chk"  CHECK (stock_count >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE        INDEX IF NOT EXISTS "product_variants_product_idx"    ON "product_variants" USING btree ("product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_sku_unique_idx" ON "product_variants" USING btree ("sku") WHERE sku IS NOT NULL;

-- ─── 5. product_images ──────────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_images" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id"  uuid        NOT NULL,
  "url"         text        NOT NULL,
  "alt_text"    text,
  "sort_order"  integer     NOT NULL DEFAULT 0,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_images_product_idx" ON "product_images" USING btree ("product_id");

-- ─── 6. ENABLE + FORCE RLS on all 4 tables ──────────────────────────────
--> statement-breakpoint
ALTER TABLE "categories"        ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categories"        FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products"          ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products"          FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_variants"  ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_variants"  FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_images"    ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_images"    FORCE  ROW LEVEL SECURITY;

-- ─── 7. Default-deny RESTRICTIVE policies ────────────────────────────────
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY categories_default_deny ON categories
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY products_default_deny ON products
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_variants_default_deny ON product_variants
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_images_default_deny ON product_images
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 8. categories: active read + admin write ────────────────────────────
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY categories_active_read ON categories
    FOR SELECT
    USING (is_active = true OR app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY categories_admin_insert ON categories
    FOR INSERT
    WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY categories_admin_update ON categories
    FOR UPDATE
    USING  (app.is_bomy_staff() OR app.is_admin_bypass())
    WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY categories_admin_delete ON categories
    FOR DELETE
    USING (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 9. products: public active read + seller write + staff all ──────────
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY products_read ON products
    FOR SELECT
    USING (
      status = 'active'
      OR EXISTS (
        SELECT 1 FROM stores
        WHERE stores.id = products.store_id
          AND stores.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY products_seller_insert ON products
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM stores
        WHERE stores.id = products.store_id
          AND stores.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY products_seller_update ON products
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM stores
        WHERE stores.id = products.store_id
          AND stores.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM stores
        WHERE stores.id = products.store_id
          AND stores.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY products_admin_delete ON products
    FOR DELETE
    USING (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 10. product_variants: active variants of active products + seller ────
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_variants_read ON product_variants
    FOR SELECT
    USING (
      (
        is_active = true
        AND EXISTS (
          SELECT 1 FROM products
          WHERE products.id = product_variants.product_id
            AND products.status = 'active'
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
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_variants_seller_insert ON product_variants
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM products p
        JOIN stores s ON s.id = p.store_id
        WHERE p.id = product_variants.product_id
          AND s.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_variants_seller_update ON product_variants
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM products p
        JOIN stores s ON s.id = p.store_id
        WHERE p.id = product_variants.product_id
          AND s.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM products p
        JOIN stores s ON s.id = p.store_id
        WHERE p.id = product_variants.product_id
          AND s.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_variants_admin_delete ON product_variants
    FOR DELETE
    USING (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 11. product_images: mirrors products policies ───────────────────────
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_images_read ON product_images
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM products
        WHERE products.id = product_images.product_id
          AND products.status = 'active'
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
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_images_seller_insert ON product_images
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM products p
        JOIN stores s ON s.id = p.store_id
        WHERE p.id = product_images.product_id
          AND s.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_images_seller_update ON product_images
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM products p
        JOIN stores s ON s.id = p.store_id
        WHERE p.id = product_images.product_id
          AND s.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM products p
        JOIN stores s ON s.id = p.store_id
        WHERE p.id = product_images.product_id
          AND s.owner_id = app.current_user_id()
      )
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_images_admin_delete ON product_images
    FOR DELETE
    USING (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 12. bomy_app role grants on all 4 tables ────────────────────────────
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "categories"       TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "products"         TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "product_variants" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "product_images"   TO bomy_app';
  END IF;
END
$$;
