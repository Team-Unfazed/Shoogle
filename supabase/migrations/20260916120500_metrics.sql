-- ============================================================================
-- Shoogle Phase 1 — metric definitions and snapshots
-- ============================================================================
--
-- METRICS ARE SERVER-WRITTEN ONLY (Decision 6)
-- --------------------------------------------
-- The client may SELECT through business membership and has no INSERT, UPDATE
-- or DELETE privilege. The REVOKE is not belt-and-braces: config.toml leaves
-- `auto_expose_new_tables` at its default `true`, so a new public table receives
-- implicit grants. An absent policy is not an absent privilege.
--
-- Collection requires provider tokens from private.provider_credentials, which
-- is unreachable from a client by design — so a client-writable metrics table
-- would be a fake-metrics API and nothing else.
--
-- THREE DISTINCTIONS THAT MUST NOT COLLAPSE
--   exact            a measured number; 0 is a real answer
--   below_threshold  a BOUND, not a count. Rendering it as a number fabricates
--                    data; rendering it as 0 breaks "unknown is not zero" twice
--   not_reported     the provider said nothing
-- `value_kind` plus the shape CHECK keep them apart at the database level.
--
-- NOT STORED, DELIBERATELY
--   changePct  derived by changePercent(); a stored copy is a second truth
--   label/unit/period text  derived from the registries in features/seo
--   post_target_id  post-level metrics are deferred: GBP removed post
--                   performance in 2023 with no replacement, Instagram's chosen
--                   auth path lists no insights scope, and Facebook has no
--                   provider contract. Pending api-researcher verification.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- metric_definitions
-- ----------------------------------------------------------------------------
--
-- The source of truth for these rows is LIVE_DAILY_METRICS and REMOVED_METRICS
-- in features/seo/metrics.ts. This table is deliberately created EMPTY:
-- populating it in a migration would create a second copy that can drift from
-- the TypeScript registries, and nothing writes metrics yet, so an empty table
-- blocks nothing. Seeding belongs with the collector that first needs it.

create table public.metric_definitions (
  metric_key text primary key,
  platform text not null,
  label text not null,
  is_live boolean not null,
  unit text,

  -- Set only for metrics a provider removed. Twelve GBP metrics were deleted in
  -- 2023 with no replacement; they must render unavailable('not_supported')
  -- forever, never "coming soon".
  discontinued_on date,
  explanation text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint metric_definitions_platform_valid
    check (platform in ('instagram', 'facebook', 'google_business')),
  constraint metric_definitions_key_not_blank check (btrim(metric_key) <> ''),
  constraint metric_definitions_removed_has_date
    check (is_live or discontinued_on is not null),
  constraint metric_definitions_live_has_no_date
    check (not is_live or discontinued_on is null),

  -- Target of the composite foreign key below.
  constraint metric_definitions_key_is_live_key unique (metric_key, is_live)
);

comment on table public.metric_definitions is
  'Reference data mirroring features/seo/metrics.ts. Server-controlled; readable, never client-writable.';

create trigger metric_definitions_set_updated_at
  before update on public.metric_definitions
  for each row execute function private.set_updated_at();

alter table public.metric_definitions enable row level security;

-- Reference data, not business data: no cross-business leak is possible.
create policy metric_definitions_select_authenticated
  on public.metric_definitions for select to authenticated
  using (true);

revoke all on table public.metric_definitions from anon, authenticated;
grant select on table public.metric_definitions to authenticated;
grant all on table public.metric_definitions to service_role;

-- ----------------------------------------------------------------------------
-- metric_snapshots
-- ----------------------------------------------------------------------------

create table public.metric_snapshots (
  -- Append-heavy and never addressed by a client-held id, which is the
  -- carve-out the schema plan allows for metric identity.
  id bigint generated always as identity primary key,

  -- Directly on every row, and the RLS boundary. Not reached through another
  -- table: a join is one more thing a policy can get subtly wrong, and RLS
  -- failures are silent.
  business_id uuid not null references public.businesses (id) on delete cascade,

  -- GBP metrics are per location and a business may have several. Keying only
  -- on the business would silently merge two shops' numbers. No locations table
  -- exists yet, so this is the provider's own identifier.
  location_id text,

  platform text not null,
  metric_key text not null,

  -- Fixed true, and half of the composite foreign key that makes a removed
  -- metric key unstorable rather than merely discouraged.
  metric_is_live boolean not null default true,

  -- Set for keyword-scoped metrics (GBP monthly search terms), null otherwise.
  keyword text,

  period_start date not null,
  period_end date not null,

  value_kind text not null,
  value bigint,
  threshold bigint,

  -- reportedDays < totalDays means the total is a FLOOR, not a fact, and the
  -- caller must be able to say so.
  reported_days integer,
  total_days integer,

  -- A truncated provider read must never present as a complete one.
  partial boolean not null default false,

  -- When Shoogle learned the value. Distinct from the period it covers.
  captured_at timestamptz not null default now(),
  source text not null,
  created_at timestamptz not null default now(),

  constraint metric_snapshots_platform_valid
    check (platform in ('instagram', 'facebook', 'google_business')),
  constraint metric_snapshots_source_not_blank check (btrim(source) <> ''),

  constraint metric_snapshots_value_kind_valid
    check (value_kind in ('exact', 'below_threshold', 'not_reported')),

  -- Exactly one representation per kind. A threshold can never sit in `value`.
  constraint metric_snapshots_value_shape check (
    (value_kind = 'exact' and value is not null and threshold is null)
    or (value_kind = 'below_threshold' and threshold is not null and value is null)
    or (value_kind = 'not_reported' and value is null and threshold is null)
  ),

  -- "Below 0" is not a statement (features/seo/keywords.ts).
  constraint metric_snapshots_threshold_is_positive
    check (threshold is null or threshold >= 1),
  constraint metric_snapshots_value_is_non_negative
    check (value is null or value >= 0),

  constraint metric_snapshots_period_ordered check (period_end >= period_start),
  constraint metric_snapshots_coverage_is_whole
    check ((reported_days is null) = (total_days is null)),
  constraint metric_snapshots_coverage_sane check (
    reported_days is null
      or (reported_days >= 0 and total_days >= reported_days)
  ),

  -- Only a LIVE definition can be referenced. A new row defaults metric_is_live
  -- to true, so it can only match a definition whose is_live is also true — an
  -- unknown key and a retired key are both rejected, with no CHECK needed.
  --
  -- ON UPDATE CASCADE is what lets a provider retire a metric we have already
  -- collected. Flipping metric_definitions.is_live to false carries the change
  -- into the historical rows rather than failing against them, so the history
  -- SURVIVES (Decision 6h) while new writes for that key stop (Decision 6i).
  -- Without the cascade a metric with any snapshot could never be retired at
  -- all, and the only way to record a removal would be to delete real history.
  constraint metric_snapshots_metric_fk
    foreign key (metric_key, metric_is_live)
    references public.metric_definitions (metric_key, is_live)
    on update cascade
);

comment on column public.metric_snapshots.captured_at is
  'When Shoogle learned the value. The metric''s own day is period_start/period_end.';
comment on column public.metric_snapshots.partial is
  'True when the provider read was truncated. A partial list is never complete.';

-- Idempotency for retries and concurrent collectors. NULLS NOT DISTINCT is
-- required: under the default, two rows with location_id IS NULL would both be
-- accepted and the constraint would silently fail to constrain.
create unique index metric_snapshots_natural_key
  on public.metric_snapshots (
    business_id, location_id, platform, metric_key,
    keyword, period_start, period_end
  )
  nulls not distinct;

create index metric_snapshots_business_metric_period_idx
  on public.metric_snapshots (business_id, metric_key, period_start desc);

alter table public.metric_snapshots enable row level security;

-- Decision 5e: read = owner + member. There is deliberately no INSERT, UPDATE
-- or DELETE policy, and the grants below remove the privilege as well.
create policy metric_snapshots_select_members
  on public.metric_snapshots for select to authenticated
  using (private.is_member(business_id));

revoke all on table public.metric_snapshots from anon, authenticated;
grant select on table public.metric_snapshots to authenticated;
-- Metrics are server-written only; this grant is the only write path.
grant all on table public.metric_snapshots to service_role;
grant usage on sequence public.metric_snapshots_id_seq to service_role;
