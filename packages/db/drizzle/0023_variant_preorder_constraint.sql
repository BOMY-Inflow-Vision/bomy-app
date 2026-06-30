-- Enforce that preorder_lead_days is set iff fulfillment_mode = 'preorder'.
-- Existing rows all have fulfillment_mode = 'normal' and preorder_lead_days = NULL,
-- so this constraint is immediately satisfiable.
DO $$ BEGIN
  ALTER TABLE product_variants
    ADD CONSTRAINT product_variants_preorder_days_chk
    CHECK (
      (fulfillment_mode = 'preorder' AND preorder_lead_days IS NOT NULL AND preorder_lead_days > 0)
      OR (fulfillment_mode IN ('normal', 'backorder') AND preorder_lead_days IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
