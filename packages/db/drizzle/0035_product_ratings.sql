-- Migration 0035: product star ratings.
--
-- product_ratings holds one row per buyer + product (whole stars 1-5). products gets two cached
-- columns, rating_avg / rating_count, that the storefront cards read without a join.
--
-- Rules this migration encodes, and the ones it deliberately leaves to the server action:
--   * Writes (INSERT/UPDATE) are admin-bypass only. The single writer is the withAdmin rating
--     action, which still connects as bomy_app, so bomy_app keeps SELECT, INSERT, UPDATE.
--     Buyers may SELECT their own rows.
--   * No DELETE grant and no DELETE policy. Removal is a soft delete
--     (removed_at / removed_by / removal_reason) done by bomy_ops / bomy_admin.
--   * The 24-hour change window is enforced in the server action, using the database clock
--     (time-based, not expressible per role in RLS).
--   * The aggregate is recomputed in the same transaction as every rating write
--     (recomputeProductRating in @bomy/db), over rows with removed_at IS NULL.
--   * Only the bypass path may write products.rating_avg / rating_count: a BEFORE UPDATE
--     trigger rejects any other writer (sellers can UPDATE their own product row under
--     products_seller_update).
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS product_ratings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stars           SMALLINT    NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at      TIMESTAMPTZ NULL,
  removed_by      UUID        NULL REFERENCES users(id) ON DELETE RESTRICT,
  removal_reason  TEXT        NULL,
  CONSTRAINT product_ratings_stars_chk CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT product_ratings_removed_pair_chk CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
  CONSTRAINT product_ratings_product_user_unique UNIQUE (product_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS product_ratings_product_idx ON product_ratings (product_id);
--> statement-breakpoint
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS rating_avg   numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer      NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE product_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ratings FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON product_ratings TO bomy_app';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY product_ratings_default_deny ON product_ratings
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SELECT: a buyer reads their own row. Storefront reads use the cached columns on products,
-- not this table.
DO $$ BEGIN
  CREATE POLICY product_ratings_self_select ON product_ratings
    FOR SELECT
    USING (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- INSERT / UPDATE: admin-bypass only. Eligibility, the 24-hour window and the aggregate
-- recompute all live in the withAdmin rating action.
DO $$ BEGIN
  CREATE POLICY product_ratings_admin_insert ON product_ratings
    FOR INSERT
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY product_ratings_admin_update ON product_ratings
    FOR UPDATE
    USING (app.is_admin_bypass())
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.products_guard_rating_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
      OR NEW.rating_count IS DISTINCT FROM OLD.rating_count)
     AND NOT app.is_admin_bypass() THEN
    RAISE EXCEPTION 'products.rating_avg / rating_count may only be written by the rating action (admin bypass)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS products_guard_rating_columns ON products;
--> statement-breakpoint
CREATE TRIGGER products_guard_rating_columns
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION app.products_guard_rating_columns();
