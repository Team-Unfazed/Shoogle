-- ============================================================================
-- Shoogle Phase 1 — provider connections and their credentials
-- ============================================================================
--
-- THE LINE BETWEEN THESE TWO TABLES (Decision 7)
-- ----------------------------------------------
-- Anything that AUTHENTICATES a request is a credential and lives in `private`.
-- Anything that DESCRIBES the connection is metadata and lives in `public`,
-- where the client can read it. Account ids and Facebook Page ids are not
-- secrets — a Page id is public on Facebook — so they are metadata. The Page
-- TOKEN is a credential.
--
-- No secret ever enters public.provider_connections.
--
-- NAMING DEVIATION, RECORDED DELIBERATELY
-- Decision 7g named the field `authorization`. AUTHORIZATION is a reserved word
-- in PostgreSQL and would need quoting at every use site, so the column is
-- `authorization_state`. Same three values, same meaning.
-- ============================================================================

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null,

  -- ConnectionStatus (types/domain.ts) — the owner-facing lifecycle.
  status text not null default 'not_connected',
  -- PlatformConnection.authorization (features/social/availability.ts) — a
  -- separate axis: whether a live authorization exists at all.
  authorization_state text not null default 'missing',

  -- Scopes the provider actually granted. Checked, never assumed.
  granted_scopes text[] not null default '{}',

  account_label text,
  provider_account_id text,

  -- FACEBOOK ONLY, AND THE NULL IS LOAD BEARING.
  --   null  the connect flow has not enumerated Pages yet
  --   {}    a genuine known zero: this person administers no eligible Page
  --   ids   publishable
  -- Collapsing null into {} turns "we have not looked" into "they have none",
  -- which features/social/__tests__/independence.test.ts exists to prevent.
  eligible_page_ids text[],
  selected_page_id text,

  -- GBP sits at 0 QPM until Google approves access. That is not the owner's
  -- fault and must not read as "not connected".
  provider_approval text not null default 'not_required',

  last_synced_at timestamptz,
  -- Classified, never a raw provider payload: provider errors echo request
  -- URLs, which can carry the access token.
  last_error_code text,
  last_error_message text,

  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint provider_connections_provider_valid
    check (provider in ('instagram', 'facebook', 'google_business')),
  constraint provider_connections_status_valid
    check (status in ('not_connected', 'connecting', 'connected', 'expired', 'revoked', 'error')),
  constraint provider_connections_authorization_valid
    check (authorization_state in ('valid', 'expired', 'missing')),
  constraint provider_connections_approval_valid
    check (provider_approval in ('granted', 'pending', 'not_required')),

  -- Meta's Page requirement belongs to Facebook and nowhere else.
  constraint provider_connections_pages_are_facebook_only
    check (provider = 'facebook' or eligible_page_ids is null),
  constraint provider_connections_selected_page_is_facebook_only
    check (provider = 'facebook' or selected_page_id is null),

  -- Lets private.provider_credentials carry a composite foreign key, so a
  -- credential cannot claim a business its connection does not belong to.
  constraint provider_connections_id_business_key unique (id, business_id)
);

comment on table public.provider_connections is
  'Connection metadata only. Never a token. Client-readable.';
comment on column public.provider_connections.eligible_page_ids is
  'Facebook only. null = not enumerated yet; {} = administers no eligible Page.';

-- Decision 7e: one ACTIVE connection per (business, provider). A disconnected
-- row is retained as history and does not occupy the slot.
create unique index provider_connections_one_active_per_provider
  on public.provider_connections (business_id, provider)
  where disconnected_at is null;

create index provider_connections_business_id_idx
  on public.provider_connections (business_id);

create trigger provider_connections_set_updated_at
  before update on public.provider_connections
  for each row execute function private.set_updated_at();

alter table public.provider_connections enable row level security;

-- Decision 5e: members read connection metadata (availabilityFor needs it to
-- say whether a target is reachable). Connect and disconnect are owner-only and
-- run server-side, so the client gets no write privilege at all (Decision 7i).
create policy provider_connections_select_members
  on public.provider_connections for select to authenticated
  using (private.is_member(business_id));

revoke all on table public.provider_connections from anon, authenticated;
grant select on table public.provider_connections to authenticated;
-- Connect and disconnect are server-side flows (Decision 7i).
grant all on table public.provider_connections to service_role;

-- ============================================================================
-- private.provider_credentials
-- ============================================================================
--
-- THREE INDEPENDENT BARRIERS (Decision 7h). Each is one line; the failure they
-- prevent is plaintext provider tokens served over HTTP to anyone holding the
-- anon key, which ships inside the APK.
--
--   1. `private` is absent from config.toml's [api] schemas, so PostgREST
--      cannot reach this table at all.
--   2. Every privilege is revoked from anon and authenticated.
--   3. RLS is enabled with NO policies, so even an accidental exposure yields
--      nothing.
--
-- Ciphertext is `bytea` and there is no plaintext column to put a token in.
-- The encryption itself is deferred to the server credential layer — this
-- migration deliberately invents no crypto function and performs no encryption.
-- ============================================================================

create table private.provider_credentials (
  connection_id uuid primary key,
  business_id uuid not null,

  -- Which encryption key produced the ciphertext below. Rotation is then a
  -- re-encryption rather than a redesign.
  key_id text not null,

  access_token_ciphertext bytea not null,
  access_token_expires_at timestamptz,

  refresh_token_ciphertext bytea,
  refresh_token_expires_at timestamptz,

  -- Facebook: derived from the user token server-side, never on the device.
  page_token_ciphertext bytea,
  page_token_expires_at timestamptz,

  token_type text,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A credential belongs to exactly one connection AND one business, and the
  -- composite key makes disagreement impossible rather than merely wrong.
  constraint provider_credentials_connection_fk
    foreign key (connection_id, business_id)
    references public.provider_connections (id, business_id)
    on delete cascade,

  constraint provider_credentials_refresh_pair
    check (refresh_token_ciphertext is not null or refresh_token_expires_at is null),
  constraint provider_credentials_page_pair
    check (page_token_ciphertext is not null or page_token_expires_at is null),
  constraint provider_credentials_key_id_not_blank
    check (btrim(key_id) <> '')
);

comment on table private.provider_credentials is
  'Server-only. Encrypted provider tokens. No client access under any circumstance.';

create index provider_credentials_business_id_idx
  on private.provider_credentials (business_id);

create trigger provider_credentials_set_updated_at
  before update on private.provider_credentials
  for each row execute function private.set_updated_at();

alter table private.provider_credentials enable row level security;
-- Deliberately no policies. There is no client path to this table.

revoke all on table private.provider_credentials from anon, authenticated;
-- The server is the only thing that may ever touch a credential.
grant all on table private.provider_credentials to service_role;
