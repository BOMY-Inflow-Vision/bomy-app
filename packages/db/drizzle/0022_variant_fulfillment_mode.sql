ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS preorder_lead_days INTEGER;

--> statement-breakpoint

ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_fulfillment_mode_chk
  CHECK (fulfillment_mode IN ('normal', 'backorder', 'preorder'));
