-- ============================================================================
-- Shoogle Phase 1 — businesses, membership, and create_business()
-- ============================================================================
--
-- UNKNOWN IS NOT A PLACEHOLDER (Decision 2, 3)
-- -------------------------------------------
-- `name`, `category`, `locality` and `city` are all nullable, and null means
-- nobody has told Shoogle yet. Sign-up creates a bare row so the owner is never
-- held at a form. There is deliberately no placeholder name and no
-- `category = 'other'` default: a stand-in is indistinguishable from a real
-- answer, which would both break provider hydration and feed an invented
-- business name to the anti-fabrication guard in features/social/generation.
--
-- `timezone` is the exception. It is infrastructure rather than a claim about
-- the business — scheduling needs a zone from the first moment — so it defaults
-- to Asia/Kolkata and asserts nothing false.
--
-- MEMBERSHIP (Decision 5)
-- -----------------------
-- Two roles. Many owners allowed, at least one always required. A user may
-- belong to many businesses. Identity is the (business_id, user_id) pair.
-- Removal is removal: there is no status column, because a second truth about
-- "is this person a member" is one every policy would have to remember to check.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- businesses
-- ----------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text,
  category text,
  locality text,
  city text,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- BusinessCategory, types/domain.ts
  constraint businesses_category_valid check (
    category is null or category in (
      'salon', 'gym', 'clinic', 'restaurant',
      'bakery', 'boutique', 'repair_shop', 'other'
    )
  ),
  constraint businesses_timezone_not_blank check (btrim(timezone) <> '')
);

comment on column public.businesses.name is
  'Null until the owner names it or a provider supplies it. Never a placeholder.';
comment on column public.businesses.category is
  'Null until known. Never defaulted to ''other'' — that is a real answer.';
comment on column public.businesses.locality is
  'Neighbourhood, e.g. "Nerul". Never inferred from city.';
comment on column public.businesses.city is
  'City, e.g. "Navi Mumbai". Never inferred from locality.';

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- business_members
-- ----------------------------------------------------------------------------

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (business_id, user_id),
  constraint business_members_role_valid check (role in ('owner', 'member'))
);

comment on table public.business_members is
  'Real memberships only. No invitation state, no soft delete.';

-- "Which businesses am I in?" runs at every session start.
create index business_members_user_id_idx on public.business_members (user_id);

create trigger business_members_set_updated_at
  before update on public.business_members
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- Membership helpers
-- ----------------------------------------------------------------------------
--
-- SECURITY DEFINER is not a convenience here, it is the fix for a real problem:
-- a policy on business_members that reads business_members recurses. The
-- definer breaks that cycle.
--
-- `search_path = ''` is mandatory on every definer function. Without it, a
-- caller who can create objects in a schema earlier on the path can shadow a
-- referenced table and have it execute with the definer's rights. Every name
-- below is therefore schema-qualified.

create or replace function private.is_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = target_business_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_owner(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = target_business_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function private.is_member(uuid) from public;
revoke all on function private.is_owner(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated, service_role;
grant execute on function private.is_owner(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Last-owner protection
-- ----------------------------------------------------------------------------
--
-- WHY THIS IS A TRIGGER AND NOT A POLICY
-- An RLS policy is evaluated per row against that row's own values. It cannot
-- count what would REMAIN after the statement, which is the whole question.
--
-- WHY IT IS DEFERRABLE
-- A statement that removes one owner and promotes another is legal; row-order
-- matters if the check runs mid-statement. Deferring it to commit judges the
-- final state.
--
-- WHY IT LOCKS
-- Two people leaving at the same instant would each observe the other still
-- present and both commit, leaving a business with zero owners. Such a business
-- is unreachable — every policy routes through membership — so nobody could
-- repair it without service-role access. Locking the business row serialises
-- the two checks.

create or replace function private.enforce_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_business uuid;
  remaining_owners integer;
begin
  affected_business := coalesce(old.business_id, new.business_id);

  -- Serialise concurrent departures. Also answers "is the business itself
  -- being deleted?" — when it is, its members are going with it by cascade and
  -- there is nothing left to protect.
  perform 1
  from public.businesses b
  where b.id = affected_business
  for update;

  if not found then
    return null;
  end if;

  -- Lock the surviving membership rows themselves, not just the business.
  --
  -- Locking the business row serialises two concurrent departures but does NOT
  -- refresh the snapshot the count below reads from. Under REPEATABLE READ both
  -- transactions would therefore still see the other's owner as present and
  -- both commit, leaving a business with zero owners — which is unrecoverable,
  -- because every policy routes through membership. Locking the member rows
  -- makes a row a concurrent transaction already deleted raise a serialization
  -- failure instead of being counted as still there. Under READ COMMITTED it
  -- forces the fresh read that gives the same answer.
  perform 1
  from public.business_members m
  where m.business_id = affected_business
  for update;

  select count(*)
  into remaining_owners
  from public.business_members m
  where m.business_id = affected_business
    and m.role = 'owner';

  if remaining_owners = 0 then
    raise exception
      'A business must always have at least one owner.'
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create constraint trigger business_members_last_owner
  after delete or update on public.business_members
  deferrable initially deferred
  for each row execute function private.enforce_last_owner();

-- ----------------------------------------------------------------------------
-- create_business()
-- ----------------------------------------------------------------------------
--
-- The ONLY sanctioned way to create a business. There is deliberately no client
-- INSERT privilege on `businesses`, which is why this must be SECURITY DEFINER.
--
-- IT TAKES NO ARGUMENTS. The owner is `auth.uid()` and nothing else, so there is
-- no user_id a caller could substitute — impersonation is not refused, it is
-- unexpressible.
--
-- IT IS IDEMPOTENT FOR BOOTSTRAP. A caller who already belongs to a business
-- gets that business back rather than a second one. That is the abuse control:
-- an authenticated write primitive with no ceiling is an unbounded row-creation
-- vector. It also makes a double-tap or a retry safe, which matters because RLS
-- filters silently — a client that reads "no memberships" cannot tell that from
-- a denied read.
--
-- The advisory lock closes the remaining race: two concurrent first calls from
-- the same user would otherwise both see no membership and both create one.

create or replace function public.create_business()
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  existing public.businesses;
  created public.businesses;
begin
  if caller is null then
    raise exception 'Sign in before creating a business.'
      using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller::text, 0)
  );

  select b.*
  into existing
  from public.businesses b
  join public.business_members m on m.business_id = b.id
  where m.user_id = caller
  order by m.created_at asc, b.id asc
  limit 1;

  if found then
    return existing;
  end if;

  insert into public.businesses default values
  returning * into created;

  insert into public.business_members (business_id, user_id, role)
  values (created.id, caller, 'owner');

  return created;
end;
$$;

revoke all on function public.create_business() from public, anon;
grant execute on function public.create_business() to authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

-- Decision 5e: read = owner + member; edit business identity = owner only.
create policy businesses_select_members
  on public.businesses for select to authenticated
  using (private.is_member(id));

create policy businesses_update_owners
  on public.businesses for update to authenticated
  using (private.is_owner(id))
  with check (private.is_owner(id));

-- No INSERT policy: create_business() is the only path.
-- No DELETE policy: deleting a business is not a client operation.

create policy business_members_select_members
  on public.business_members for select to authenticated
  using (private.is_member(business_id));

create policy business_members_insert_owners
  on public.business_members for insert to authenticated
  with check (private.is_owner(business_id));

create policy business_members_update_owners
  on public.business_members for update to authenticated
  using (private.is_owner(business_id))
  with check (private.is_owner(business_id));

create policy business_members_delete_owners
  on public.business_members for delete to authenticated
  using (private.is_owner(business_id));

revoke all on table public.businesses from anon, authenticated;
grant select, update on table public.businesses to authenticated;

revoke all on table public.business_members from anon, authenticated;
grant select, insert, update, delete on table public.business_members to authenticated;

-- Granted explicitly rather than relying on the project's default privileges.
-- service_role is the server identity and bypasses RLS, but it still needs the
-- table privilege; leaving that to a project setting would make this migration
-- behave differently on a fresh database.
grant all on table public.businesses to service_role;
grant all on table public.business_members to service_role;
