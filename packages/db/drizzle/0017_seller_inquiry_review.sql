-- Migration 0017: seller-inquiry review lifecycle.
-- Adds the inquiry_status enum + status/store_id/reviewed_by/reviewed_at columns
-- so admins can approve (provision a pending store) or reject an inquiry.
-- seller_inquiries has NO RLS by design (public insert via getDb(), admin-bypass
-- reads/writes); bomy_app already holds SELECT/INSERT/UPDATE/DELETE, so no new
-- grants. Each statement is idempotent (IF NOT EXISTS / duplicate_object guard).
-- NOTE: the FK ADD COLUMN … REFERENCES statements are guarded only by the column's
-- IF NOT EXISTS — on a clean local/CI DB they run exactly once. Re-running after a
-- partial apply where the column exists without the FK is not handled; reset the DB
-- in that case.

DO $$ BEGIN
  CREATE TYPE "inquiry_status" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

ALTER TABLE "seller_inquiries"
  ADD COLUMN IF NOT EXISTS "status" "inquiry_status" NOT NULL DEFAULT 'pending';
--> statement-breakpoint

ALTER TABLE "seller_inquiries"
  ADD COLUMN IF NOT EXISTS "store_id" uuid REFERENCES "stores"("id") ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "seller_inquiries"
  ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "seller_inquiries"
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz;
