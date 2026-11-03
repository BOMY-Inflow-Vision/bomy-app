-- Migration 0036: extend the products rating-column guard to INSERT.
--
-- Supersedes the trigger definition from 0035 (app.products_guard_rating_columns +
-- products_guard_rating_columns). 0035 is already applied and is not edited.
--
-- Why: 0035's trigger was BEFORE UPDATE only, so a non-bypass INSERT into products could set
-- rating_avg / rating_count to any value (sellers may INSERT under products_seller_insert). The
-- app's only product insert sets explicit columns and never touches these two, so nothing
-- exploits it today; this closes the gap at the database.
--
-- Behaviour after this migration:
--   * INSERT without admin bypass: rejected (SQLSTATE 42501) unless rating_avg = 0 AND
--     rating_count = 0 (the column defaults).
--   * UPDATE without admin bypass: unchanged from 0035, rejected when either column
--     IS DISTINCT FROM its old value.
--   * The admin-bypass path (the withAdmin rating action) may write both on INSERT and UPDATE.
-- Idempotent.

CREATE OR REPLACE FUNCTION app.products_guard_rating_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin_bypass()
       AND (NEW.rating_avg <> 0 OR NEW.rating_count <> 0) THEN
      RAISE EXCEPTION 'products.rating_avg / rating_count may only be set by the rating action (admin bypass); insert them as 0'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
        OR NEW.rating_count IS DISTINCT FROM OLD.rating_count)
       AND NOT app.is_admin_bypass() THEN
      RAISE EXCEPTION 'products.rating_avg / rating_count may only be written by the rating action (admin bypass)'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS products_guard_rating_columns ON products;
--> statement-breakpoint
CREATE TRIGGER products_guard_rating_columns
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION app.products_guard_rating_columns();
