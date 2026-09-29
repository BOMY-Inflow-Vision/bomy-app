CREATE TABLE IF NOT EXISTS service_provider_applications (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name                  TEXT        NOT NULL,
  contact_email         TEXT        NOT NULL,
  contact_number        TEXT        NOT NULL,
  company_name          TEXT        NOT NULL,
  service_category_id   UUID        REFERENCES service_categories(id) ON DELETE RESTRICT,
  business_description  TEXT,
  status                inquiry_status NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_provider_applications_category_or_description_chk CHECK (
    service_category_id IS NOT NULL
    OR (business_description IS NOT NULL AND length(trim(business_description)) > 0)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS service_provider_applications_one_open_per_user_idx
  ON service_provider_applications (applicant_user_id)
  WHERE status IN ('pending', 'approved');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_provider_applications_applicant_idx
  ON service_provider_applications (applicant_user_id);
--> statement-breakpoint
ALTER TABLE service_provider_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_provider_applications FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON service_provider_applications TO bomy_app';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY service_provider_applications_default_deny ON service_provider_applications
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- INSERT: an applicant may only insert a 'pending' row for themselves, naming
-- either NULL ("Other") or a CURRENTLY ACTIVE category. The EXISTS clause is a
-- correlated subquery inside the policy — a normal, supported RLS pattern
-- (unlike a plain CHECK constraint, which cannot reference another table) —
-- closing the gap where a deactivated category's id would otherwise still
-- pass the FK constraint (the row still exists, it's just retired).
DO $$ BEGIN
  CREATE POLICY service_provider_applications_self_insert ON service_provider_applications
    FOR INSERT
    WITH CHECK (
      (
        applicant_user_id = app.current_user_id()
        AND status = 'pending'
        AND (
          service_category_id IS NULL
          OR EXISTS (
            SELECT 1 FROM service_categories sc
            WHERE sc.id = service_category_id AND sc.is_active
          )
        )
      )
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SELECT: applicant sees their own row. Staff read is deliberately NARROWER
-- than the codebase's usual app.is_bomy_staff() helper (which also includes
-- bomy_finance) — finance doesn't need applicant contact details for this
-- table. Do not "fix" this back to is_bomy_staff() by habit.
DO $$ BEGIN
  CREATE POLICY service_provider_applications_read ON service_provider_applications
    FOR SELECT
    USING (
      applicant_user_id = app.current_user_id()
      OR app.current_user_role() IN ('bomy_ops', 'bomy_admin')
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- No UPDATE or DELETE policy at all this round — approving/rejecting is out of
-- scope (spec §1/§8). The future admin-review PR adds an UPDATE policy
-- (USING app.is_admin_bypass()) alongside the real approve/reject actions.
