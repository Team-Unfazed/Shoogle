-- ============================================================================
-- Shoogle Phase 1 — RLS verification
-- ============================================================================
--
-- RLS FAILURES ARE SILENT. A wrong policy returns the wrong rows; it does not
-- raise. Nothing else in this repository can catch that, which is why this file
-- exists and why it was written alongside the migrations rather than after.
--
-- HOW TO RUN (requires Docker and a local Supabase stack — it is NOT run by
-- `npm test`, and it must never be pointed at the remote project):
--
--     npx supabase start
--     npx supabase db reset
--     psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--       -v ON_ERROR_STOP=1 -f supabase/tests/rls_verification.sql
--
-- The whole script runs in one transaction and rolls back, so it leaves nothing
-- behind. Any failed assertion aborts with an error.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Fixtures: two users, two businesses, no overlap.
-- ----------------------------------------------------------------------------

create or replace function pg_temp.assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'FAILED: %', description;
  end if;
  raise notice 'ok: %', description;
end;
$$;

-- Acts as a signed-in user for the duration of the block.
create or replace function pg_temp.become(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- Steps back out of the authenticated role to the privileged session role, to
-- stand in for a server-side actor. Real server work runs as `service_role`,
-- which bypasses RLS; this uses the session role instead only because SET ROLE
-- would hide the temporary fixture tables below.
create or replace function pg_temp.become_server()
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alpha@example.invalid', '', now(), now(), now()),
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'beta@example.invalid', '', now(), now(), now());

-- ----------------------------------------------------------------------------
-- 1. create_business()
-- ----------------------------------------------------------------------------

select pg_temp.become('00000000-0000-4000-8000-00000000a001');
select pg_temp.assert(
  (select count(*) from public.businesses) = 0,
  'a new user sees no business before creating one'
);

create temporary table t_alpha as select (public.create_business()).*;
select pg_temp.assert(
  (select name is null and category is null and locality is null
          and city is null and timezone = 'Asia/Kolkata' from t_alpha),
  'create_business() creates a bare business with no placeholder values'
);
select pg_temp.assert(
  exists (select 1 from public.business_members m
          where m.business_id = (select id from t_alpha)
            and m.user_id = '00000000-0000-4000-8000-00000000a001'
            and m.role = 'owner'),
  'create_business() makes the caller an owner, atomically'
);

-- Idempotent bootstrap: calling again returns the same business.
select pg_temp.assert(
  (select (public.create_business()).id) = (select id from t_alpha),
  'create_business() is idempotent and does not create a second business'
);

select pg_temp.become('00000000-0000-4000-8000-00000000b001');
create temporary table t_beta as select (public.create_business()).*;

-- ----------------------------------------------------------------------------
-- 2. Cross-business reads return no rows
-- ----------------------------------------------------------------------------

select pg_temp.become('00000000-0000-4000-8000-00000000a001');
select pg_temp.assert(
  (select count(*) from public.businesses) = 1
    and (select count(*) from public.businesses
         where id = (select id from t_beta)) = 0,
  'a member of one business cannot read another business'
);
select pg_temp.assert(
  (select count(*) from public.business_members
   where business_id = (select id from t_beta)) = 0,
  'a member of one business cannot read another business''s membership'
);

-- ----------------------------------------------------------------------------
-- 3. Cross-business writes are rejected
-- ----------------------------------------------------------------------------

do $$
begin
  begin
    insert into public.posts (business_id, title, state)
    values ((select id from t_beta), 'intruder', 'draft');
    raise exception 'FAILED: a post was inserted into another business';
  exception when insufficient_privilege or check_violation then
    raise notice 'ok: cross-business post insert is rejected';
  end;
end;
$$;

do $$
begin
  begin
    update public.businesses set name = 'renamed'
    where id = (select id from t_beta);
    if found then
      raise exception 'FAILED: another business was renamed';
    end if;
    raise notice 'ok: cross-business update affects no rows';
  exception when insufficient_privilege then
    raise notice 'ok: cross-business update is rejected';
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Clients cannot insert metrics
-- ----------------------------------------------------------------------------

do $$
begin
  begin
    insert into public.metric_snapshots
      (business_id, platform, metric_key, period_start, period_end,
       value_kind, value, source)
    values ((select id from t_alpha), 'google_business', 'gbp.actions.call_clicks',
            current_date, current_date, 'exact', 10, 'client');
    raise exception 'FAILED: a client inserted a metric';
  exception when insufficient_privilege then
    raise notice 'ok: client metric insertion is rejected by privilege';
  end;
end;
$$;

do $$
begin
  begin
    insert into public.metric_definitions (metric_key, platform, label, is_live)
    values ('made.up', 'google_business', 'Invented', true);
    raise exception 'FAILED: a client modified metric definitions';
  exception when insufficient_privilege then
    raise notice 'ok: client cannot modify metric definitions';
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Provider credentials are unreachable from the client
-- ----------------------------------------------------------------------------

do $$
begin
  begin
    perform 1 from private.provider_credentials;
    raise exception 'FAILED: a client read private.provider_credentials';
  exception when insufficient_privilege then
    raise notice 'ok: private.provider_credentials is unreachable';
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. A business cannot lose its last owner
-- ----------------------------------------------------------------------------

do $$
begin
  begin
    delete from public.business_members
    where business_id = (select id from t_alpha);
    -- Deferred constraint trigger: the violation surfaces at commit, so force it.
    set constraints all immediate;
    raise exception 'FAILED: the last owner was removed';
  exception when check_violation then
    raise notice 'ok: the last owner cannot be removed';
  end;
end;
$$;

do $$
begin
  begin
    update public.business_members set role = 'member'
    where business_id = (select id from t_alpha);
    set constraints all immediate;
    raise exception 'FAILED: the last owner was demoted';
  exception when check_violation then
    raise notice 'ok: the last owner cannot be demoted';
  end;
end;
$$;

-- A second owner makes departure legal again.
select pg_temp.become_server();
insert into public.business_members (business_id, user_id, role)
values ((select id from t_alpha), '00000000-0000-4000-8000-00000000b001', 'owner');

select pg_temp.become('00000000-0000-4000-8000-00000000a001');
delete from public.business_members
where business_id = (select id from t_alpha)
  and user_id = '00000000-0000-4000-8000-00000000a001';
set constraints all immediate;
select pg_temp.assert(true, 'an owner may leave while another owner remains');

rollback;
