-- Creates the non-superuser application role used by the app and tests.
-- The POSTGRES_USER (bomy) is a superuser needed for migrations and RLS setup.
-- All runtime connections (app, tests) use bomy_app which is subject to RLS.
--
-- This script runs automatically on a fresh Docker volume.
-- For existing volumes, apply manually:
--   docker exec -i bomy_postgres psql -U bomy -d bomy < infra/docker/postgres-init/01_app_role.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    CREATE ROLE bomy_app
      LOGIN
      PASSWORD 'changeme_local'
      NOSUPERUSER
      NOINHERIT
      NOCREATEROLE
      NOCREATEDB
      NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE bomy TO bomy_app;
