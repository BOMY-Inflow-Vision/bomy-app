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
GRANT SELECT, INSERT, UPDATE, DELETE ON "seller_inquiries" TO bomy_app;
--> statement-breakpoint
ALTER TABLE seller_inquiries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE seller_inquiries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY seller_inquiries_default_deny ON seller_inquiries
  AS RESTRICTIVE
  USING (app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY seller_inquiries_admin_all ON seller_inquiries
  FOR ALL
  USING (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());
