-- ============================================================================
-- Shoogle Phase 1 — posts and post targets
-- ============================================================================
--
-- CONTENT IS ONE JSONB COLUMN (Decision 4a)
-- -----------------------------------------
-- `{ instagram?, facebook?, google_business? }`, each holding that platform's
-- own discriminated union. Not normalised: the Posts list reads content for
-- every row (features/social/view.ts calls missingContentFor and primaryText),
-- so a child table would force a join on the most frequent query, and six
-- relational tables would mirror three volatile provider APIs to enforce
-- constraints the TypeScript unions already make unwriteable.
--
-- The CHECKs below are corruption guards, not validation. The application
-- remains the primary validator (features/social/content/review.ts).
--
-- CONTENT AND TARGETS ARE INDEPENDENT SETS
-- A post can target a platform it has no content for — that is exactly what
-- missingContentFor() reports — so content is never derived from post_targets.
--
-- `state` STORES THE FULL EIGHT-VALUE PostState, not the lossy six-value
-- PostStatus that the shared badge projects to.
--
-- MEDIA IS ABSENT ON PURPOSE. Decision 4c approved storing device-local media
-- together with an origin marker, and deferred the MediaAsset change that marker
-- needs. A bare media column would be the option that was NOT approved.
-- ============================================================================

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,

  -- Nulled rather than cascaded when a member leaves: for a published post the
  -- record of what went out must outlive the person who wrote it.
  created_by uuid references auth.users (id) on delete set null,

  -- Internal working name. Never sent to any platform.
  title text not null,

  state text not null,
  content jsonb not null default '{}'::jsonb,
  content_version integer not null default 1,

  -- Reserved. Always null until features/carousel is wired up; there are no
  -- carousel tables yet.
  carousel_id uuid,

  -- Schedule.dueAt and Schedule.timeZone stay separate: display uses the
  -- business's zone, never the device's, so collapsing them loses the zone.
  -- Schedule.owner is not stored — it is a literal with one possible value.
  scheduled_for timestamptz,
  schedule_time_zone text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- PostState, features/social/postState.ts
  constraint posts_state_valid check (
    state in ('draft', 'generating', 'ready', 'scheduled',
              'publishing', 'published', 'failed', 'skipped')
  ),
  constraint posts_content_version_positive check (content_version >= 1),
  constraint posts_content_is_object check (jsonb_typeof(content) = 'object'),

  -- Only the three supported platforms may appear as keys.
  constraint posts_content_keys_valid check (
    content - 'instagram' - 'facebook' - 'google_business' = '{}'::jsonb
  ),

  -- A key cannot hold another platform's content shape.
  constraint posts_content_discriminants_match check (
    (not content ? 'instagram'
      or content -> 'instagram' ->> 'platform' = 'instagram')
    and (not content ? 'facebook'
      or content -> 'facebook' ->> 'platform' = 'facebook')
    and (not content ? 'google_business'
      or content -> 'google_business' ->> 'platform' = 'google_business')
  ),

  -- publisher.ts: a scheduled post ALWAYS has a schedule. That invariant is
  -- what lets a runner find due work with one query.
  constraint posts_scheduled_requires_schedule check (
    state <> 'scheduled'
      or (scheduled_for is not null and schedule_time_zone is not null)
  ),
  constraint posts_schedule_is_whole check (
    (scheduled_for is null) = (schedule_time_zone is null)
  )
);

comment on column public.posts.title is
  'Internal working name, shown in lists. Never sent to a platform.';
comment on column public.posts.carousel_id is
  'Reserved. No carousel tables exist yet; always null today.';

-- PostQuery (features/social/store.ts) filters on businessId and states.
create index posts_business_state_idx on public.posts (business_id, state);
-- The scheduled runner's "what is due?" query.
create index posts_due_idx on public.posts (scheduled_for) where state = 'scheduled';

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function private.set_updated_at();

-- ============================================================================
-- post_targets
-- ============================================================================
--
-- One row per platform, each with its own status. Facebook failing, expiring or
-- being skipped changes nothing about the Instagram row — product rule 13 is
-- enforced by the shape, not by convention.
--
-- THE SKIP DISTINCTION IS THE FAILURE COLUMNS, AND IT MUST SURVIVE
--   status = 'skipped', failure_code IS NULL      the owner chose to skip
--   status = 'skipped', failure_code IS NOT NULL  Shoogle could not reach the
--                                                 platform
-- wasSkippedForUnavailability() is exactly that predicate. Nulling the failure
-- columns on a skip would either nag about a deliberate choice or bury a broken
-- connection, so there is deliberately NO constraint forbidding a failure on a
-- skipped row.
--
-- NO ORDINAL. The canonical platform order lives in the application
-- (platformsWithContent); a stored copy could disagree with it.
-- ============================================================================

create table public.post_targets (
  post_id uuid not null references public.posts (id) on delete cascade,
  platform text not null,
  status text not null default 'not_attempted',

  -- Proof the provider published it. There is no optimistic success path.
  remote_id text,
  permalink text,
  published_at timestamptz,

  failure_code text,
  failure_kind text,
  failure_message text,
  failure_retryable boolean,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (post_id, platform),

  constraint post_targets_platform_valid
    check (platform in ('instagram', 'facebook', 'google_business')),
  constraint post_targets_status_valid
    check (status in ('not_attempted', 'queued', 'in_flight',
                      'succeeded', 'failed', 'skipped')),

  -- isConfirmedPublished(): succeeded requires a remote id from the provider.
  -- published_at joins it, because a target that published has an instant.
  constraint post_targets_succeeded_requires_proof check (
    status <> 'succeeded'
      or (remote_id is not null and published_at is not null)
  ),

  -- Legitimately null even on success; when present it must be fetchable.
  constraint post_targets_permalink_is_https check (
    permalink is null or permalink like 'https://%'
  ),

  -- PublishFailure.kind decides which action the owner is offered:
  -- reconnect for authorization, retry for publish.
  constraint post_targets_failure_kind_valid check (
    failure_kind is null or failure_kind in ('authorization', 'publish')
  ),
  constraint post_targets_failure_is_whole check (
    failure_code is null
      or (failure_kind is not null
          and failure_message is not null
          and failure_retryable is not null)
  )
);

comment on table public.post_targets is
  'One row per platform. A skip with no failure is the owner''s; a skip with a failure is Shoogle''s.';

create trigger post_targets_set_updated_at
  before update on public.post_targets
  for each row execute function private.set_updated_at();

-- ============================================================================
-- RLS — Decision 5e: owner and member may both create, edit, schedule and skip
-- ============================================================================

alter table public.posts enable row level security;
alter table public.post_targets enable row level security;

create policy posts_select_members
  on public.posts for select to authenticated
  using (private.is_member(business_id));

create policy posts_insert_members
  on public.posts for insert to authenticated
  with check (private.is_member(business_id));

-- WITH CHECK as well as USING: a member must not be able to move a post into a
-- business they do not belong to.
create policy posts_update_members
  on public.posts for update to authenticated
  using (private.is_member(business_id))
  with check (private.is_member(business_id));

create policy posts_delete_members
  on public.posts for delete to authenticated
  using (private.is_member(business_id));

-- post_targets reaches its business through its parent, which is NOT NULL and
-- cascades. The parent lookup is on posts' primary key.
create policy post_targets_select_members
  on public.post_targets for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and private.is_member(p.business_id)
  ));

create policy post_targets_insert_members
  on public.post_targets for insert to authenticated
  with check (exists (
    select 1 from public.posts p
    where p.id = post_id and private.is_member(p.business_id)
  ));

create policy post_targets_update_members
  on public.post_targets for update to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and private.is_member(p.business_id)
  ))
  with check (exists (
    select 1 from public.posts p
    where p.id = post_id and private.is_member(p.business_id)
  ));

create policy post_targets_delete_members
  on public.post_targets for delete to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and private.is_member(p.business_id)
  ));

revoke all on table public.posts from anon, authenticated;
grant select, insert, update, delete on table public.posts to authenticated;

revoke all on table public.post_targets from anon, authenticated;
grant select, insert, update, delete on table public.post_targets to authenticated;

-- The scheduled publisher runs server-side while the phone is asleep.
grant all on table public.posts to service_role;
grant all on table public.post_targets to service_role;
