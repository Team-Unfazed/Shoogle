-- ============================================================================
-- Shoogle Phase 1 — schemas and shared helpers
-- ============================================================================
--
-- Decisions 1-7 are recorded in docs/agent-memory/foundation-changes.md,
-- sessions 7-10. This migration creates nothing user-facing; it establishes the
-- private schema that provider credentials will live in and the helper that
-- every other policy is written against.
--
-- WHY A PRIVATE SCHEMA AT ALL
-- ---------------------------
-- `supabase/config.toml` exposes `["public", "graphql_public"]` through the
-- Data API. A table in `private` is therefore unreachable over HTTP no matter
-- what its policies say — and that matters because the anon key ships inside
-- the APK and is readable by anyone who downloads the app. Schema exposure, not
-- RLS, is the primary barrier for credentials. Do not add `private` to that
-- list.
--
-- `authenticated` is granted USAGE on the schema because RLS policies call the
-- membership helpers below, and a policy executes as the querying role. USAGE
-- on a schema conveys no access to the tables in it; the credentials table
-- additionally has every privilege revoked and RLS enabled with no policies.
-- PostgREST also only exposes functions in exposed schemas, so these helpers
-- are not callable over the API.
-- ============================================================================

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- updated_at
-- ----------------------------------------------------------------------------
-- Attached to every table that carries the column, so "when did this last
-- change" is a fact about the row rather than something a writer remembers.

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'Maintains updated_at. SECURITY INVOKER: it reads nothing and needs no elevation.';
