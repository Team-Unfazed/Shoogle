-- ============================================================================
-- Shoogle Phase 1 — profiles
-- ============================================================================
--
-- One row per auth user, mirroring the fields `SessionUser`
-- (lib/providers/contracts.ts) is allowed to rely on.
--
-- SCOPE OF THE SELECT POLICY: own row only. The Team screen will eventually
-- need to read co-members' names, which requires widening this through shared
-- membership rather than opening it generally. That is additive and deliberately
-- not done here — no screen needs it yet.
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user profile. Deleted with the auth user.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No DELETE policy: a profile goes when the auth user goes, by cascade.
revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;
