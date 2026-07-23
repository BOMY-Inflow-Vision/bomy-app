-- Migration 0026: action_rate_limits table + RLS + grants (GAPS #3 — web
-- server-action throttling: checkout preview/initiate, address CRUD,
-- profile edit).
--
-- Fixed-window per-user counter. One row per (user, action, window); count
-- increments atomically via INSERT ... ON CONFLICT DO UPDATE in
-- checkActionRateLimit (packages/db/src/rate-limit.ts). Mirrors the
-- 0014/0015 pattern (table + RLS + grants in one file, idempotent).
--
-- A self_select policy IS required despite the app never issuing a plain
-- SELECT: empirically confirmed (not assumed) that Postgres's row-matching
-- for UPDATE — including the UPDATE arm of INSERT ... ON CONFLICT DO
-- UPDATE — needs a policy applicable to SELECT to see the existing row, even
-- when a FOR UPDATE policy's own USING clause covers the same condition. A
-- FOR UPDATE-only policy silently matched zero rows in testing. SELECT is
-- also needed at the plain GRANT level, separately, because the SET clause
-- reads the existing row's count to increment it.
--
-- self_delete + the DELETE grant exist for withAdmin-run cleanup (tests,
-- and a future row-pruning job) — app code (checkActionRateLimit) itself
-- never deletes. RLS bypass (app.bypass_rls) skips POLICY checks but NOT
-- table-level GRANTs, since bomy_app is a real role, not a superuser — so
-- withAdmin-run DELETEs need both the grant and a policy admitting them.

-- ─── 1. action_rate_limits table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "action_rate_limits" (
  "user_id"      uuid        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "action"       text        NOT NULL,
  "window_start" timestamptz NOT NULL,
  "count"        integer     NOT NULL DEFAULT 1,
  CONSTRAINT "action_rate_limits_pkey" PRIMARY KEY ("user_id", "action", "window_start")
);
--> statement-breakpoint

-- ─── 2. ENABLE + FORCE RLS ──────────────────────────────────────────
ALTER TABLE "action_rate_limits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "action_rate_limits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ─── 3. RLS policies (operation-specific, owner-scoped) ─────────────
DO $$ BEGIN
  CREATE POLICY action_rate_limits_default_deny ON action_rate_limits
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY action_rate_limits_self_select ON action_rate_limits
    FOR SELECT
    USING (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY action_rate_limits_self_insert ON action_rate_limits
    FOR INSERT
    WITH CHECK (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY action_rate_limits_self_update ON action_rate_limits
    FOR UPDATE
    USING (user_id = app.current_user_id() OR app.is_admin_bypass())
    WITH CHECK (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY action_rate_limits_self_delete ON action_rate_limits
    FOR DELETE
    USING (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ─── 4. bomy_app role grants ────────────────────────────────────────
-- SELECT + INSERT + UPDATE + DELETE: ON CONFLICT DO UPDATE's SET clause
-- reads the existing row (see note above), so SELECT is required despite no
-- plain SELECT ever being issued; DELETE is for withAdmin-run cleanup only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "action_rate_limits" TO bomy_app';
  END IF;
END
$$;
