ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "description" text;

CREATE TABLE IF NOT EXISTS "seller_inquiries" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"           text        NOT NULL,
  "email"          text        NOT NULL,
  "contact_number" text        NOT NULL,
  "company_name"   text        NOT NULL,
  "store_name"     text        NOT NULL,
  "message"        text,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- No RLS on seller_inquiries: the public seller apply form inserts directly
-- via makeDb() without tenant context. bomy_app gets table-level access only.
GRANT SELECT, INSERT, UPDATE, DELETE ON "seller_inquiries" TO bomy_app;
