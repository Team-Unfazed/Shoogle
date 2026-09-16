# Shoogle: complete project handover

**For: Yash. Written: 2026-09-16.**

You are now the only engineer on Shoogle. The five-person split (Sunny on auth,
Pranay on SEO/GBP, Aryan on Home/UX, Devashish on Website, you on Posts) is
over. Everything in this document is now yours to build.

**Do not treat the entire product as unbuilt.** The current working branch contains
the shared foundation plus a substantial, tested Social domain/application layer.
Use the current repository as the source of truth. Sections below distinguish what
is already implemented from what still needs persistence, integrations and
production infrastructure.

This file is the context document. Keep it at the repo root and point Claude at
it at the start of every session (see section 12).

---

## 0. How to use this file

1. Read sections 1 to 5 once, properly. They describe the architecture and the
   decisions already enforced by the code and tests.
2. Section 6 is setup. The repository is already checked out on the current
   working branch and the existing Supabase project is now linked.
3. Section 7 is the build plan in dependency order. Work top to bottom. Status
   has been reconciled to the current repository; the roadmap itself has NOT
   changed.
4. Sections 8 to 11 are reference: server-side work, external approvals,
   decisions already made, and traps already found.
5. Section 12 is how to drive Claude Code through the work.

### Current source of truth

The clean working repository is:

```text
~/Shoogle
```

Current branch:

```text
feature/yash-social
```

Current HEAD:

```text
be0703e
```

The branch is pushed to and synchronized with:

```text
origin/feature/yash-social
```

The completed Social work is real and must NOT be rebuilt. The older scratch clone
at `~/.gemini/antigravity-ide/scratch/Shoogle` is not the preferred working copy.

### Ownership change

Yash is now the sole engineer for the entire Shoogle application. This is an
organizational change only. It does **not** change the product decisions or the
implementation roadmap.

### If you see other branches on GitHub

Do not depend on unrelated feature branches as implementation prerequisites.
The current working branch `feature/yash-social` is the source of truth for the
completed Social work. Other branches may be mined for ideas deliberately, but
must not silently replace or rewrite the current plan.

## 1. What Shoogle is

An **AI marketing operator** for Indian local businesses: salons, gyms, clinics,
restaurants, bakeries, boutiques, repair shops.

Not a dashboard. Not a CRM. The product proposes work and then does it. The
owner of a two-chair salon in Nerul does not want analytics; they want posts
going out, their Google listing correct, and their phone ringing.

**Platform:** native Android-first React Native app on Expo SDK 57. Runs in Expo
Go during development, ships to Google Play as an AAB via EAS Build. iOS is
configured but is not a product target.

**UI language is English.** Generated *business content* (captions, posts) may
be Hindi, Marathi or Hinglish. That distinction is deliberate.

### The twelve product rules the code enforces

1. Shoogle is an operator, not a CRM. Propose and do work; do not build
   record-keeping surfaces.
2. Minimise owner input. Every field you add is a cost.
3. Never ask for what can be retrieved. Hydrate from a connected provider first.
4. Posts are scheduled by default. "Post now" is the secondary action.
5. Skip and pause must always be easy, one tap from the list.
6. Never show fake metrics.
7. **Unknown is not zero.** Enforced by types: `Metric` and `Score` take
   `number | null`, and everything crossing the network returns `DataState<T>`.
   There is deliberately no `unwrapOr(state, 0)`.
8. Never claim an integration exists when it does not. The provider registry
   answers `not_connected` until a feature registers a real implementation.
9. Never present fixture data as customer data. Fixtures are dev-gated and force
   a visible banner.
10. No progress theatre. Indeterminate spinners are fine; fake percentages and
    self-ticking checklists are not.
11. No unnecessary onboarding.
12. English UI, multilingual generated content.
13. **Social targets are independent.** The supported Social targets are Instagram,
    Facebook and Google Business Profile. Facebook being unavailable must never
    block Instagram or GBP. LinkedIn is not a product target.

---

## 2. Ground truth: what exists today

The current working branch is `feature/yash-social` at `be0703e`, pushed and
verified on GitHub. It contains the shared foundation plus the completed Social
domain/application work described below.

The branch is currently **24 commits ahead of the baseline `main` commit
`e3d118e`**. The important Social checkpoints are listed below rather than
pretending every intermediate commit is a separate product phase.

### Stack

| Concern | Choice |
|---|---|
| Framework | Expo SDK 57 (`expo ~57.0.18`), React Native 0.86.3, React 19.2.3 |
| Routing | Expo Router 57, file-based, typed routes on |
| Language | TypeScript ~6.0.3, `strict` plus `noUncheckedIndexedAccess` |
| Compiler | React Compiler enabled (`experiments.reactCompiler: true`) |
| Styling | Typed design tokens plus `StyleSheet`. **No NativeWind, no Tailwind** |
| Backend SDK | `@supabase/supabase-js ^2.112.4`, AsyncStorage session persistence |
| Auth helpers | `expo-auth-session`, `expo-web-browser`, `expo-crypto`, `expo-secure-store` |
| Testing | Jest (`jest-expo ~57.0.5`) plus React Native Testing Library 14 |
| Release | EAS Build/Submit, `com.shoogle.app`, targetSdk 36, minSdk 24 |
| Fonts | `@expo-google-fonts/sora` (display), `@expo-google-fonts/manrope` (UI) |
| Social media picker | `expo-image-picker ~57.0.18` |
| Social image preparation | `expo-image-manipulator ~57.0.18` |

`expo-image-loader 57.0.1` is currently transitive. `expo-file-system` is not
directly installed yet.

**Why no NativeWind:** the typed token system is the established design-system
source of truth. Do not reintroduce NativeWind or Tailwind.

### Directory layout

The shared foundation remains as described by the baseline. The important
addition is the real Social implementation under `features/social/` and the
Social compose/media routes and modules already committed on this branch.

```text
app/                     Expo Router routes ONLY
  _layout.tsx            provider stack
  index.tsx              splash / route decision
  +not-found.tsx
  notifications.tsx
  (auth)/_layout.tsx
  (auth)/sign-in.tsx
  (tabs)/_layout.tsx
  (tabs)/index.tsx       Home
  (tabs)/posts.tsx       Posts
  (tabs)/business.tsx    Business
  (tabs)/settings.tsx    Settings
  social/                Social compose flow
components/ui/           design-system primitives
components/shared/       Screen, TopBar, DataStateView, boundaries, banners
theme/                   tokens, ThemeProvider, fonts
lib/
  env/                   typed EXPO_PUBLIC_* access and feature flags
  providers/             contracts, types, registry
  state/DataState.ts     loading/ready/unavailable/error model
  supabase/client.ts     Supabase client factory
features/
  social/                implemented Social domain/application layer
  auth/                  auth seam/foundation; real auth still to be wired
  gbp/ seo/ website/     later-phase feature foundations
fixtures/                development-only fake data, dev-gated
types/domain.ts          cross-feature domain types
docs/
  agent-memory/          session/resume documentation
  research/              first-party API research
__tests__/               foundation, primitives, screens, data-state, Social tests
.github/workflows/ci.yml typecheck, lint, test, Android bundle, secret scan
```

### Existing Social implementation — do not rebuild

The Social branch has already completed the following major work:

1. **Platform foundation** — `0732ad4`, `001d01b`
   - Social targets are Instagram, Facebook and Google Business Profile.
   - LinkedIn is excluded.
   - Target-aware scheduling and platform capability rules exist.
2. **Platform independence** — `56c6258`
   - One platform never blocks another.
   - A Facebook connection problem must not prevent Instagram or GBP.
   - Platform availability is target-specific.
3. **Platform-specific content rules** — `5ec66a8`
   - Instagram requires media.
   - Facebook supports text/link content where supported.
   - GBP has its own topic/content fields.
   - Instagram alt text applies to image variants, not Reels/Stories.
   - GBP 250px guidance is represented as short-edge behavior.
   - Unverified Facebook image limits are not invented.
4. **Social AI generation** — `a340079`, `55d4b1b`, `68f59c2`
   - Reuses the existing `AiProvider` seam.
   - Adds `social_caption` and `social_slide_copy` tasks.
   - Uses a development Gemini proxy.
   - Platform prompts are genuinely platform-specific.
   - Fabrication, keyword stuffing, AI-tell phrases and truncated output are guarded.
   - Social does not directly read or hold `GEMINI_API_KEY`.
   - Live dev-proxy generation was verified with `gemini-3.6-flash` / `gemini_free_dev`.
5. **Compose flow** — `8fa3a07`
   - `app/social/` compose flow exists.
   - Per-platform draft/status/error/edit state exists.
   - Deselecting a target retains its draft.
   - Draft persistence is currently in-memory.
6. **Publication semantics** — `c8d6312`
   - `publishSummary()` is pure/derived.
   - Auth failure and publish failure are distinct.
   - Provider-issued remote IDs are required for successful publication.
   - Partial publication is represented per target.
7. **Media boundary** — `ad8b34f`
   - Device-local media cannot reach a publisher directly.
   - Only hosted HTTPS media can become publishable.
8. **Expo media adapters** — `be0703e`
   - System gallery picker and image preparation seams exist.
   - No automatic upload or fake byte measurements.
   - `measureBytes` remains an injected seam until `expo-file-system` is directly installed.

### Latest verified test checkpoint

At `be0703e`:

```text
2674 passed / 1 skipped / 60 suites
```

Typecheck and lint were clean.

### Current app-level status

The four tabs are still largely fixture/empty-state driven outside the completed
Social domain work. The Social implementation is also intentionally not yet
backed by real persistence/provider integrations.

The honest state is therefore:

- UI scaffolding exists across the app.
- Social domain/application behavior is substantially implemented and tested.
- Supabase persistence is not yet implemented.
- Real authentication is not yet wired end-to-end.
- Real provider OAuth/publishing integrations are not yet registered.
- Server-side publishing/token/metrics infrastructure does not yet exist.

### Dev preview mode

`EXPO_PUBLIC_DEV_PREVIEW=1` plus a development run lets the sign-in screen offer
preview without signing in. It relaxes the route guard, signs nobody in, shows
no real data, and displays a persistent preview banner. Keep it dev-only and
turn it off once real sign-in is working.

### CI

The required CI jobs remain:

1. `npm run typecheck`, `npm run lint`, `npm run test:ci`
2. Android export/bundle verification
3. Secret scanning

Do not weaken the secret scan or introduce secrets into app code.

## 3. What does not exist yet

Be precise: the app has substantial scaffolding and Social domain logic, but
several production layers are still missing.

| Area | Current status |
|---|---|
| Supabase schema/migrations/RLS | **Not implemented yet.** Existing Shoogle project is linked to the repo; database schema is the next gate. |
| Sign-in/sign-up/password reset/session persistence | UI and provider seam exist; real Supabase auth flow is not yet wired end-to-end. |
| Business identity persistence | Not implemented. |
| GBP OAuth/reads/writes/reviews/hours | Not implemented as a real provider. Research and seams exist. |
| SEO rankings/keyword tracking | Not implemented. |
| Audit engine | Not implemented. |
| Instagram real OAuth/publishing/insights | Not implemented. The Social API/integration seam and content rules exist. |
| Facebook real OAuth/publishing/insights | Not implemented. Facebook remains a real target and is independently optional. |
| Google Business Profile real publishing | Not implemented. |
| Post persistence/scheduling backend | Not implemented. Social compose/domain behavior exists, but drafts/posts are not yet persisted. |
| Carousel production export/publishing integration | Partial; domain/application foundations exist. |
| Gemini production server-side generation | Dev proxy path exists; production server-side deployment is not yet implemented. |
| Website generation/publishing | Not implemented. |
| Home suggestions engine | Not implemented. |
| Notifications/push delivery | Not implemented. |
| Billing/Razorpay | Not implemented. |
| Scheduled server publisher | Not implemented. |
| Metrics collection | Not implemented. |
| Play Store release | Not completed. |

### Provider status

Do not describe the Social providers as four providers. The current Social
platform set is exactly:

- Instagram
- Facebook
- Google Business Profile

There is **no LinkedIn integration in the product plan**.

No real Social provider should be registered until its implementation genuinely
works. Until then, the provider registry must continue to report honest
unavailability/not-connected states.

## 4. The rules that cannot be broken

These are enforced by types, tests and CI, not by review. If you find yourself
fighting one, you are usually about to make the app lie to a business owner.

1. **Unknown is not zero.** Anything crossing the network returns
   `DataState<T>`. `Metric`, `Score`, `StatTile` and `GridMetric` take
   `number | null`. A value you have not fetched, cannot fetch, or that a
   provider does not expose renders as a dash placeholder with a stated reason.
   Never `0`, never an empty chart, never a flat trend line.
2. **Never claim an integration exists before it does.** Ask the registry.
3. **Never present fixture data as real.** Fixtures live in `fixtures/`, are
   gated to `__DEV__` plus an explicit flag, and force a visible banner. ESLint
   blocks importing them into `lib/` or any data layer.
4. **Posts are scheduled by default.** Schedule is primary, "Post now" is
   secondary, skip and pause stay one tap from the list.
5. **Only report success a provider confirmed.** An optimistic "Published" toast
   is a false claim. A review reply in Google moderation is not published.
6. **No progress theatre.**
7. **No dead controls.** A button either works or says why it does not. Disable
   it, or toast "not built yet". It must never silently do nothing.
8. **Never hard-code a colour, radius, font size or spacing value.** Import from
   `@/theme`. If a token is missing, add it to `theme/tokens.ts` and note it in
   the agent-memory log.
9. **Every table has RLS, and the client never writes a metric.** New tables go
   through `supabase/migrations/` with policies in the same file.
10. **Only publishable identifiers may use `EXPO_PUBLIC_`.** Everything with
    that prefix ships inside the APK and is readable by anyone who downloads it.
    Service role keys, OAuth client secrets and the Gemini key must never be
    prefixed and must never be imported into the app.
11. **Research before you integrate.** Run the `api-researcher` agent
    (`.claude/agents/api-researcher.md`) and commit its report to
    `docs/research/`. Do not guess scopes, quotas, pricing or review
    requirements. Building against a guessed API shape is the most expensive
    rework available.
12. **Update `docs/agent-memory/foundation-changes.md` every session.** No
    secrets in it. It is how the next session starts with context.

### What changes now that you own everything

The ownership table in `CONTRIBUTING.md` is obsolete: you own all of it. Two
things that were process ceremony can be dropped, and two must be kept.

**Drop:** asking another owner before touching their folder; the route
namespacing rule that exists to stop filename collisions between people.

**Keep:** the *module boundaries themselves*. `features/social/` should not
import from `features/gbp/` internals; go through each feature's `index.ts`.
Shared code (`components/`, `theme/`, `lib/`) stays shared, which means a change
there needs a test, because five screens depend on it. That discipline is what
lets you work on one feature without breaking three others, and it matters more
when one person is holding the whole app in their head.

---

## 5. Architecture you must build on

### 5.1 `DataState<T>`: the single vocabulary for "what do we know?"

`lib/state/DataState.ts`. Four states:

```ts
type DataState<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T; fetchedAt: string; isFixture?: boolean }
  | { status: 'unavailable'; reason: UnavailableReason; message: string }
  | { status: 'error'; code: string; message: string; retryable: boolean }
```

`UnavailableReason` is a closed union: `not_connected`, `auth_expired`,
`not_supported`, `no_data_yet`, `insufficient_data`, `offline`, `rate_limited`,
`requires_upgrade`. Constructors are `loading()`, `ready(value)`,
`unavailable(reason, message)`, `failed(code, message, retryable)`.

Rules:
- Never unwrap with `as` or `!`.
- Render through `<DataStateView>` rather than hand-rolling status ladders.
- Add a new `UnavailableReason` only when a real state genuinely has no home in
  the existing union, and add it in `lib/`, not in a feature.

### 5.2 The provider registry

`lib/providers/registry.ts`. The shell can ask "is Instagram connected?" today,
before an Instagram integration exists, and get an honest answer.

```ts
// features/social/register.ts
import { registerProvider } from '@/lib/providers';
import { instagramProvider } from './providers/instagram';
registerProvider('instagram', instagramProvider);
```

Called once from the feature's `index.ts`. **Do not edit `registry.ts` to add a
provider.** Until you register one, `getProvider(id)` returns an honest
placeholder whose every method resolves to `unavailable('not_connected')`.

**Register a provider only in the commit that makes it genuinely work.**
Registering a stub deletes the honest "Integration not built yet" caption and
flips the Connect button from correctly-disabled to enabled: that is rule 7 and
rule 2 broken in one line.

### 5.3 The contracts you are implementing

`lib/providers/contracts.ts` declares the seams. Nothing there performs I/O.
Every method returns `Result<T>` which is `Promise<DataState<T>>`.

The provider contracts must reflect the current product set. In particular,
there is **no LinkedIn provider contract to build for the product**.

| Interface | Responsibility |
|---|---|
| `ConnectableProvider` | Connection lifecycle: `getConnection()`, `connect()`, `disconnect()`. |
| `GoogleBusinessProfileProvider` | Locations, performance, reviews/replies, local posts, business hours and other verified GBP capabilities. |
| `InstagramProvider` | Instagram account/capability reads and the Instagram publishing integration. |
| `FacebookProvider` / Facebook publishing seam | Facebook account/page capability and publishing where supported. Exact interface shape must follow the current repository contracts. |
| `SocialPublisher` | `availableTargets`, scheduling, cancellation, skipping and status. |
| `SeoProvider` | Rankings/keywords; ranking position remains nullable. |
| `AuditProvider` | Latest report and audit execution. |
| `WebsiteGenerator` | Website state, generation and publishing. |
| `BillingProvider` | Plans, subscription, checkout and cancellation. |
| `AuthProvider` | Session, email/password sign-in/sign-up, password reset/update, sign-out and auth state changes. |
| `BusinessProvider` | Business read/update. |

Two auth shapes remain important:

- `SignUpOutcome` distinguishes `{ status: 'signed_in', user }` from
  `{ status: 'confirmation_required', email }`.
- `AuthProvider` has `updatePassword(newPassword)` for the current recovery
  session and deliberately does not expose a client-side `resetPassword(email,
  newPassword)` operation.

Unresolved contract hardening from the earlier plan remains valid when the
relevant phase needs it:

- Add `pending_provider_approval` and `provider_verification_required` to
  `UnavailableReason` when provider review queues need explicit representation.
- `AuditReport.score` should be `number | null`.
- GBP review rating should allow null and replies need a moderation state.
- `Paginated<T>` should be able to represent provider-refused/partial counts.

### 5.4 Environment access

`lib/env/index.ts` is the only place that reads `process.env`. Nothing throws at
import time: a missing key degrades a feature to an honest unavailable state.

The current environment categories are:

```ts
env.supabaseUrl
env.supabaseAnonKey
env.googleOAuthClientIdAndroid
env.metaAppId
env.razorpayKeyId

isSupabaseConfigured()
isGoogleSignInEnabled()
isFixtureModeEnabled()
isDevPreviewEnabled()
missingRequiredEnvNames()
```

**There is no LinkedIn environment configuration in the current product plan.**
Remove stale LinkedIn env references from the handover/code plan if encountered;
do not add them back.

Social/Meta configuration:

- `EXPO_PUBLIC_META_APP_ID` is the public app identifier.
- `META_APP_SECRET` is server-side only.
- Instagram uses the planned **Instagram API / Instagram Login integration**;
  do not describe Instagram as a "Meta Graph API" integration in product
  documentation.
- Facebook is a separate real publishing target. Its availability/lifecycle
  must not block Instagram or GBP.

Expo inlines `EXPO_PUBLIC_*` literally at build time. Every public variable must
be explicitly mapped in the env module and listed by name only in
`.env.local.example`. Never expose secret values.

### 5.5 Design system

`theme/tokens.ts` is the single source of truth, transcribed from the Claude
Design project "Shoogle Mobile App" and pinned by `__tests__/foundation.test.tsx`
so drift is a test failure.

Colour roles (identical key set in light and dark): `bg`, `card`, `card2`,
`border`, `text`, `muted`, `muted2`, `blue`/`blueSoft` (Social, primary action),
`green`/`greenSoft` (SEO, success), `amber`/`amberSoft` (Website, warning),
`red`/`redSoft` (error), `navBg`, `scrim`, `onAccent`.

Type: Sora for `display` (29/36) and `screenTitle` (24/30), Manrope for
`cardTitle` (16/22, 700), `body` (14/20), `bodyStrong` (14/20, 600), `caption`
(12.5/18), `label` (11.5/15, 700, uppercase, 0.07em).

Geometry: `minTouchTarget` **44** (Android floor, nothing pressable is smaller),
`buttonPrimaryHeight` 54, `buttonSecondaryHeight` 50, `chipHeight` 38,
`inputHeight` 52, `tabBarHeight` 60, `appBarHeight` 56. Radii: 8 badges, 11
chips, 15 buttons, 16 inputs and inner cards, 20 cards and dialogs, 26
bottom-sheet, 999 pills. Spacing is a 4pt scale.

Primitives in `components/ui/`: Avatar, Badge (plus `PostStatusBadge`),
BottomSheet, Button, Card, Dialog, Divider, EmptyState, ErrorState, IconButton,
Input, Metric, Navigation, PageHeader, Score, Section, Select, Skeleton, Tabs,
Text, Textarea, Toast. Import from `@/components/ui`, never from an individual
file.

Shell in `components/shared/`: `Screen` (owns safe areas, keyboard avoidance,
scroll behaviour, horizontal padding, and the `showsFixtureData` banner),
`TopBar`, `DataStateView`, `ErrorBoundary`, `LoadingBoundary`/`FullScreenLoader`,
`FixtureBanner`, `DevPreviewBanner`.

Android specifics already handled: `Screen` owns safe areas and keyboard,
`BottomSheet` and `Dialog` handle the hardware back button, the tab bar owns the
bottom inset (screens inside `(tabs)` must not add it again). Target viewports
are **390x844** and **412x915**; there must be no horizontal overflow at either.

### 5.6 Provider stack order in `app/_layout.tsx`

```
GestureHandlerRootView   outermost, or gestures and sheets break
  SafeAreaProvider       insets must exist before anything measures them
    ThemeProvider        tokens before any component renders
      ErrorBoundary      catches crashes from everything below
        SessionProvider  needs the theme for its own error UI
          ToastProvider  inside Session so a sign-out can toast
```

Do not reorder. Do not add feature providers here; mount them inside your own
feature layout.

---

## 6. Setup and current repository state

The clean working copy is already prepared:

```bash
cd ~/Shoogle
git status
git log --oneline -3
```

Current expected state:

```text
On branch feature/yash-social
Your branch is up to date with 'origin/feature/yash-social'.
nothing to commit, working tree clean
```

Latest HEAD:

```text
be0703e
```

### Supabase status

The existing Shoogle Supabase project was found and linked successfully.

```text
Project: shoogle
Reference ID: dkzizcaapnpkvmcmobfr
Region: Northeast Asia (Seoul)
```

Supabase CLI authentication was completed with `npx supabase login`, and:

```bash
npx supabase link --project-ref dkzizcaapnpkvmcmobfr
```

returned:

```text
Finished supabase link.
```

**Do not create another Supabase project.** The existing Shoogle project is the
one to use.

### Phase 1 starting point

The next command is to verify the local Supabase scaffold/config before creating
any migration:

```bash
ls -la supabase
```

If the directory/scaffold is absent, initialize it with:

```bash
npx supabase init
```

Then inspect the resulting config and confirm the existing link before writing
migrations.

Do not run `supabase db push` until migrations have been reviewed and the Phase 1
schema/RLS plan has been approved.

### Baseline verification

Before a meaningful implementation checkpoint:

```bash
npm run typecheck && npm run lint && npm test
```

The latest Social checkpoint was 2674 passed / 1 skipped / 60 suites.

### Commands

| Command | Purpose |
|---|---|
| `npm start` | Expo dev server plus QR for Expo Go |
| `npm run android` | Launch on a connected device/emulator |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Expo lint |
| `npm test` / `npm run test:ci` | Jest |
| `npm run doctor` | Expo doctor |
| `npm run build:android:preview` | Internal-distribution APK via EAS |
| `npm run build:android:production` | Play Store AAB via EAS |

### Environment variables

Everything goes in `.env.local`, which is git-ignored. `.env.local.example` holds
names only.

Public values currently include Supabase URL/key and relevant public client IDs.
Secrets remain server-side only.

Do not paste `.env.local` contents into ChatGPT or Claude.

## 7. The build plan

The roadmap is unchanged. Status below is reconciled to the current branch.
Work in dependency order. Phase 1 is still the gate for persistence/auth, while
Social domain/application work has already been implemented ahead of persistence.

### Current phase/status table

| Phase | Area | Current status |
|---|---|---|
| Phase 0 | Foundation | Done |
| Phase 1 | Auth + database | **Current gate; 1a project/link setup completed, schema/auth not yet implemented** |
| Phase 2 | Business identity | Not started |
| 3a | Post model/list | Partial; domain/application foundations exist, persistence missing |
| 3b | Composer | Done at domain/application level |
| 3c | Skip/pause/cancel | Done at domain/application level |
| 3d | Publishing | Partial; provider/server integration missing |
| 3e | Provider connections | Not started as real integrations |
| 3f | Carousel | Partial |
| Phase 4 | AI generation | Partial; Social generation/dev proxy exists, production server-side path remains |
| 5a | GBP research | Done/partially established; keep first-party research current |
| 5b | GBP connect | Partial/seam only; real OAuth not implemented |
| 5c | GBP reads/writes | Partial/model/research only |
| 5d | Audit/SEO | Partial/foundation only |
| Phase 6 | Website | Not started |
| Phase 7 | Home / notifications / settings / billing | Not started |
| Phase 8 | Release | Not started |
| §8 | Server-side components | Not started except development Gemini proxy work |
| §9 | External approvals | Some research/applications exist; current status must be verified before relying on them |

### Phase 0: baseline and working rhythm

Completed. The repository foundation, design system, route shell, provider seams,
data-state model and CI checks exist.

The current working branch is the Social branch and is already pushed to GitHub.
Do not recreate Phase 0 work.

### Phase 1: authentication and the database

**This is the current gate.** Every later production phase needs a signed-in user
and a business id.

#### 1a. Supabase project and CLI — current status

The existing Shoogle project has already been selected and linked:

```text
project ref: dkzizcaapnpkvmcmobfr
```

CLI login is complete.

Do **not** create a new project.

Before migrations, confirm whether `supabase/` scaffolding exists locally. If it
does not, run:

```bash
npx supabase init
```

Then verify the link/config.

#### 1b. Schema — not implemented yet

The existing schema plan remains the agreed starting point. Write timestamped
migrations under `supabase/migrations/` with RLS in the same migration as each
table.

Planned tables:

- `profiles`
- `businesses`
- `business_members`
- `provider_connections`
- `private.provider_credentials`
- `posts`
- `post_targets`
- `metric_snapshots`

Planned RPC:

- `create_business()` — SECURITY DEFINER, validates `auth.uid()`, creates the
  business and owner membership atomically, and is the sanctioned business-create
  path.

Key constraints remain:

- lowercase snake_case
- `timestamptz`, not `timestamp`
- UUID primary keys except append-heavy metric identity if justified
- membership-based access rather than `businesses.owner_id`
- scheduled posts require `scheduled_for`
- published posts require `published_at`
- published target URLs must be HTTPS
- metrics are provider/server written only

#### 1c. RLS — not implemented yet

Every table gets RLS and force-RLS where appropriate, with explicit per-operation
policies.

Use private SECURITY DEFINER membership helpers to avoid recursive RLS checks on
`business_members`.

`metric_snapshots` must be read-only to the authenticated client. No client INSERT
policy/grant.

Keep the last-owner-removal guard.

Create `supabase/tests/rls_verification.sql` to verify:

- cross-business reads return no rows
- cross-business writes are rejected
- client metric insertion is rejected
- provider credentials are unreachable from the client
- a business cannot lose its last owner

Do not push migrations to the remote project until the migration/RLS plan has been
reviewed and approved.

#### 1d. Auth in the app — not implemented end-to-end yet

The existing auth contracts and sign-in screen are the foundation.

Create/wire the planned `features/auth/` modules without bypassing the existing
provider seam.

Requirements remain:

- email/password first
- email confirmation off during development, with a TODO to enable before real
  customer sign-up
- route decision remains in `app/index.tsx`
- recovery state is distinct from authenticated state
- parse both query and fragment redirect parameters
- persist sessions with AsyncStorage
- refresh tokens with AppState foreground handling
- Google sign-in is optional and separate from GBP authorization

**Google sign-in must not request the GBP `business.manage` scope.** GBP OAuth is
a separate authorization flow later.

Done means a user can sign up/sign in, survive app restart, sign out, and pass the
RLS isolation test with a second account.

### Phase 2: business identity

**Nobody ever agreed who captures this, which is why no screen exists. It is now
your call, and everything downstream needs a `business_id`.**

Sign-up creates the user. Something has to create the business row. The design
already decided: **sign-up creates a bare business row with no profile fields**
(name, category, locality all null) so the owner is never held at a form.

Build the minimum that unblocks the rest:

1. On first successful sign-in with no membership, call `create_business()` with
   a placeholder name, or prompt for **one** field (the business name) and
   nothing else. Product rule 2: every field is a cost. Product rule 11: no
   unnecessary onboarding.
2. A `useBusiness()` hook in a shared feature module that resolves the current
   `business_id` as a `DataState`, because every later screen needs it.
3. Implement `BusinessProvider.getBusiness` / `updateBusiness` against the
   `businesses` table.
4. Category and locality get **hydrated from Google Business Profile** once that
   connects (product rule 3), and are editable in Settings > Business
   information as a fallback.

**Done when:** a fresh sign-up lands in the app with a real `business_id`, and
the Settings account card shows the real business name instead of "Your
business".

---

### Phase 3: Posts, the core product

The Social domain/application layer is already substantially implemented on
`feature/yash-social`. **Do not rebuild it.** The remaining Phase 3 work is to wire
it to Phase 1 persistence and then to real provider/server integrations.

#### 3a. Post model and list

Existing Social domain types and publication semantics remain the source of truth.
Next work is persistence-backed `DataState` reads from `posts` and
`post_targets` once Phase 1 exists.

`lastReach` remains `null` until a provider genuinely reports it. Never use 0 as
an unknown value.

#### 3b. Composer — domain/application work done

The Social compose flow already exists under `app/social/` with per-platform
state, edits, drafts and target selection behavior.

When persistence is added:

- schedule remains primary; post-now remains secondary
- target selection is platform-specific
- save draft must not lose media
- platform-specific limits remain platform-specific

#### 3c. Skip, pause and cancel — domain/application work done

The branch already contains skip/cancel semantics and owner-facing state behavior.
Wire these to persisted rows without changing their semantics.

#### 3d. Publishing — partial

The publisher must run server-side for real scheduled publishing.

The client writes/reads state but never declares an external publication successful
on its own. A target becomes published only after the provider/server returns the
real remote identifier and permalink.

Independent target behavior is mandatory:

> Instagram, Facebook and GBP are separate targets. One unavailable/failed target
> never blocks the others.

#### 3e. Provider connections — real integrations still pending

The current product Social targets are exactly:

1. Instagram
2. Facebook
3. Google Business Profile

**No LinkedIn.**

For Instagram:

- use the planned **Instagram API / Instagram Login** integration
- do not describe this integration as "Meta Graph API"
- follow the current first-party research before implementing permissions
- OAuth/token exchange that requires secrets remains server-side

For Facebook:

- Facebook is a real publishing target
- its connection lifecycle is independent from Instagram
- lack of a Facebook Page/account capability must not block Instagram or GBP at
  the product level
- use the current first-party Meta/Facebook documentation before implementing
  exact permissions

For GBP:

- keep its OAuth and API work in `features/gbp/`
- it is a real Social publishing target as well as a separate Business/GBP domain
  integration where appropriate

Register a provider only in the same commit that makes the implementation real.
Do not register stubs.

#### 3f. Carousel — partial

`features/carousel/` remains part of the create-post flow. Existing slide-copy
and media foundations should be reused.

Render UI text as real `<Text>` nodes; only burn text into exported artwork when
the artwork itself requires it.

**Phase 3 is done when:** an owner can create a real post, choose any supported
targets independently, schedule it, see persisted state, skip it from the list,
and after real provider confirmation see a target-specific published state with a
real permalink.

### Phase 4: AI content generation

Social AI generation is already partially implemented. The existing Social
provider seam and development Gemini proxy are the source of truth; do not build
a second AI client.

Production generation must remain server-side because `GEMINI_API_KEY` must never
ship in the APK.

**The key is server-side only.** A generation key on-device can be extracted
from the APK and abused. Build an Edge Function that takes a generation request
and returns candidate captions; the app calls that function with the user's
Supabase JWT.

- Run the api-researcher agent against Gemini for pricing, free-tier limits and
  rate limits before you build the UI around it.
- Generated business content may be Hindi, Marathi or Hinglish (product rule
  12). The UI around it stays English.
- Generation is the one place where an indeterminate spinner is correct. No fake
  percentage (rule 10).
- Never auto-publish generated content. The owner approves, always.
- Editing a generated caption must be as easy as accepting it.

---

### Phase 5: Google Business Profile, SEO and audit

Highest value for an Indian local business, and the longest lead time. Start the
approval paperwork (section 9) before you write the code.

#### 5a. Research first, seriously

Run the api-researcher agent against the Google Business Profile APIs and commit
the report. Things already established and worth carrying in:

- **Never render a rank position.** Google publishes none through any API. Not
  "not yet", never. `KeywordRanking.position` is `number | null` and null must
  render as words.
- Metrics Google removed in 2023 (post views, photo views, query breakdowns,
  driving-direction geography) render `unavailable('not_supported')` **forever**.
  Never 0, never "coming soon".
- Business Information **edits** are capped at **10 per minute per profile** and
  that cap cannot be raised. Reads run at a much higher rate. A bulk hours or
  attributes fix will trip the write cap, so route every edit through a write
  queue with backoff.
- Most write operations require a **verified** location. Check
  `verificationState` before offering an action, and explain when it is blocked
  rather than failing silently.
- A review reply goes through Google **moderation**. "Submitted" is not
  "published", and the model must distinguish them.

#### 5b. The connect flow

`features/gbp/`. Same OAuth state machine as 3e, requesting exactly one scope:
`https://www.googleapis.com/auth/business.manage`. Separate from sign-in, for
the verification reason in Phase 1. Wire the button into the Connected accounts
block that already exists at the bottom of `app/(tabs)/business.tsx`.

Build the provider against an injectable transport and session so it is testable
with fakes before real credentials exist:

```ts
export interface GbpProviderDeps {
  getSession: () => Promise<GbpSession | null>;
  transport: GbpTransport | null;   // null -> provider reports not_connected
}
```

The day the server endpoint exists you pass a real transport and nothing else
changes.

#### 5c. Reads, then writes

Reads: locations, verification state, hours, service areas, attributes, reviews,
performance metrics. Map wire responses into the model; write the metrics into
`metric_snapshots` server-side (the client cannot insert them).

Writes: only where the API genuinely supports it **and** the provider declares a
method. Start with business hours and review replies. Route every edit through
the write queue. Never report success before the provider confirms.

#### 5d. Audit and SEO surfaces

`features/audit/` and `features/seo/`, with routes under `app/seo/`, reached
from the Business tab.

- The audit produces findings with severities and a `fixHref` that opens the
  screen that fixes it. That is the operator behaviour: not "your hours are
  missing" but "your hours are missing, fix them here".
- `Score` takes `number | null`. Pass `null` until an audit has genuinely run: a
  business that has never been audited does not score 0.
- Report `uncheckedAreas` honestly. A score derived from half the signals must
  say so; `<Score uncheckedCount={n} />` renders that caveat.
- If an audit check cannot run because a provider is not connected, the finding
  says that, rather than counting as a pass or a fail.

**Done when:** an owner connects Google, sees their real location and reviews,
can reply to a review and see it correctly reported as "submitted, awaiting
Google moderation", and the Business tab shows real metrics with unknown ones
rendered as unknown.

---

### Phase 6: Website

`features/website/`, routes under `app/website/`, reached from the Website row
in the Business tab.

- The status machine is `not_started -> generating -> ready_for_review ->
  published`, plus `failed`. Show the real state.
- **No progress theatre** (rule 10). If you cannot measure real progress, show
  an indeterminate indicator, never a fake percentage or a checklist that ticks
  itself off on a timer.
- `publishedUrl` stays `null` until the site is genuinely live.
- Generation runs server-side (it needs the Gemini key). Hosting target is an
  open decision: Supabase Storage with a custom domain, or an external static
  host. Decide before building the publish step.

---

### Phase 7: Home, notifications, settings, billing

Once real data exists, the shell surfaces become real.

**Home** (`features/dashboard/`): replace `homeFixture` with real values. The
suggestion engine is the operator promise: each suggestion must be actionable
and explain itself. Home is the most tempting place in the app to invent
numbers; every metric comes from a connected provider or renders unavailable.

**Notifications** (`app/notifications.tsx` is a stub): the unread count on the
Home header is currently fixture-driven. A badge count must reflect something
real; showing 0 when you do not know is rule 1 broken. Push delivery needs FCM
credentials and probably a development build (section 9).

**Settings** (`features/dashboard/components/SettingsParts.tsx`): every row
currently toasts "not built yet". Make them real one at a time: business
information, logo and brand, connected accounts (link it to the Business tab
block), employees and roles (the `business_members` table already models this),
labels, subscription, help. The push and WhatsApp toggles currently change local
state and say delivery is not wired up: either wire them to a stored preference
or leave the honest toast.

**Billing** (`features/billing/`): Razorpay, reached from Settings.

- Card details must never touch Shoogle. Use the provider's hosted checkout.
- The key secret is server-side only; only the key id may be public.
- **Google Play policy governs what may be sold outside Play Billing, and the
  carve-outs change.** Confirm the current policy with the api-researcher agent
  before implementing a purchase flow in the Android app. Play Billing needs a
  native module and therefore a development build.

---

### Phase 8: release

`docs/android-release.md` has the full list. Summary of what is still required:

1. `eas login` and `eas init` if the project id is not already set.
2. Signing key: let EAS generate and manage the upload keystore. Never commit a
   keystore; `*.keystore` and `*.jks` are git-ignored.
3. **Replace the placeholder icons.** `assets/images/` still holds the
   `create-expo-app` defaults. Shoogle needs its own adaptive icon
   (foreground, background, monochrome) and splash mark.
4. Play Console: create the app, store listing, content rating, data safety,
   target audience.
5. **Privacy policy URL.** Required by Play for any app with accounts, and also
   required by Google's OAuth consent screen.
6. Data safety declaration: fill it in only after the integrations exist.
   Declaring data flows that do not exist yet is inaccurate.
7. `eas submit` to internal testing first (`eas.json` already defaults to
   `track: internal`, `releaseStatus: draft`).

**When you will need a development build instead of Expo Go:** native Google
Sign-In, in-app purchases / Play Billing, and production push notifications.
OAuth via the system browser, image picking and secure storage all work in Expo
Go. If you hit a native module, that is an architecture change: build with
`eas build --profile development --platform android`, install the APK, and run
`npx expo start --dev-client`.

---

## 8. Server-side components you will have to write

Most production server-side work does not exist yet. The Social Gemini development
proxy is an exception: it exists for local development and is not a production
secret-management solution.

Planned server-side components include:

| Component | Why it cannot be on-device | Blocks |
|---|---|---|
| OAuth code/token exchange | Client secrets must not ship in the APK | Instagram/Facebook/GBP provider connections |
| Token storage and refresh | Provider credentials must remain server-side and refresh while the app is closed | Provider reads/writes |
| Scheduled publisher | Phone may be asleep when a post is due | Phase 3 publishing |
| Metric collection | Client must not invent metrics | Home/Business metrics |
| Gemini production proxy/function | `GEMINI_API_KEY` must remain server-side | Phase 4 production AI |
| Website generation/publish | Requires server-side AI/long-running work | Phase 6 |
| Razorpay webhook | Payment confirmation must come from the provider | Phase 7 billing |

All server jobs must authorize by `auth.uid()`/business membership and be
idempotent. Never trust a client-supplied business id without checking membership.

### Current Gemini exception

The Social branch already has a development Gemini proxy and has successfully used
`gemini-3.6-flash` through `gemini_free_dev`. Keep the proxy dev-only. Production
must use the planned server-side deployment and secret handling.

## 9. External approvals and long-lead work

These are calendar-time items, not reasons to rewrite the engineering roadmap.
Verify their current status before relying on any old statement.

| Approval / dependency | Current product relevance |
|---|---|
| Google Business Profile API access | Needed for real GBP reads/writes/publishing. The application profile must satisfy Google's current eligibility requirements. |
| Google OAuth consent verification | Relevant when requesting the GBP `business.manage` scope; separate from basic Google sign-in scopes. |
| Meta review / permissions | Relevant to the real Instagram and Facebook integrations. Verify exact current permission requirements before implementation. |
| Google Play Console | Required for release. |
| Razorpay/KYC | Required before real billing. |

### GBP application timing

An important open operational item is confirming which managed Google Business
Profile satisfies the previously researched 60+ day verification and matching
domain/email conditions for the API access application. Verify the current
first-party requirement before submitting; do not treat old research as permanent
fact.

### Instagram/Facebook clarification

Do not collapse the two integrations into one vague "Meta Graph API" item.

- **Instagram:** planned Instagram API / Instagram Login integration.
- **Facebook:** separate real publishing target and lifecycle.
- The product rule is independence-first: Facebook availability never blocks
  Instagram or GBP.

The exact scopes and review requirements must be taken from current first-party
Meta/Instagram documentation at integration time.

## 10. Decisions already made, do not relitigate

1. **No NativeWind or Tailwind.** Typed design tokens remain the source of truth.
2. **Email plus password auth first.** Phone OTP is a later decision.
3. **Email confirmation OFF during development**, with a TODO to enable it before
   real customer sign-up.
4. **Model staff membership from day one.** Use `business_members` with roles;
   do not add a one-off `businesses.owner_id` shortcut.
5. **Minimize onboarding.** Business identity should require as little owner input
   as possible and hydrate retrievable data when a provider is connected.
6. **Provider registry is runtime registration.** Register only genuinely working
   providers.
7. **`create_business()` is the sanctioned business-create path.** No ordinary
   client INSERT grant on `businesses`.
8. **Metrics are server-written only.** Unknown is represented as absence/null,
   never as zero.
9. **The four tabs are final:** Home, Posts, Business, Settings. Do not add a fifth.
10. **Light palette is primary.** Do not silently introduce system-theme behavior.
11. **EAS project id is not a secret.** Keep the established configuration approach.
12. **Do not pre-create speculative tables** for later features. Add migrations with
    the feature that actually needs them.
13. **Social platforms are exactly Instagram + Facebook + Google Business Profile.**
    **LinkedIn is excluded.**
14. **Instagram uses the planned Instagram API / Instagram Login integration.** Do
    not describe Instagram integration as "Meta Graph API" in the product handover.
15. **Facebook is a real target but optional at product level.** Its absence or
    failure must never block Instagram or GBP.
16. **Instagram and Facebook OAuth lifecycles are independent**, even if the same
    Meta app is involved.
17. **Do not rebuild the completed Social domain layer.** Wire persistence and real
    integrations into the existing seams.
18. **No fake integrations, fake metrics, fake publishing, generic copied captions,
    keyword stuffing, or fixture data presented as customer data.**

## 11. Traps this codebase has already hit

Read this list before debugging something strange.

- **`null <= n` is `true` in JavaScript.** Check dates and numbers for null
  explicitly. Any helper that can return "unknown" should return
  `number | null` and force the caller to handle it.
- **One implementation per shared concept.** Duplicated date helpers and
  duplicated formatters have each caused real defects here. If you need a helper
  in two features, it goes in one place and both import it.
- **A recovery session is a real session.** See Phase 1d.
- **RLS failures are silent.** A wrong policy returns the wrong rows, it does
  not raise. Only the verification script catches it.
- **Expo inlines `EXPO_PUBLIC_*` literally.** A dynamic `process.env[name]`
  lookup returns undefined in a real build. Add variables to the map in
  `lib/env/index.ts`.
- **Typecheck cannot catch a broken bundle.** The CI Android export job exists
  because a module can resolve in Jest and fail in Metro.
- **The tab bar owns the bottom inset.** Screens inside `(tabs)` must not add it
  again, or you get a band of dead space.
- **`IconButton` requires `accessibilityLabel` in its type.** An icon carries no
  text. Every control needs an accessible name and a 44pt target.
- **Do not restyle a primitive inline.** If you need a variant, add it to the
  primitive with a test. A hard-coded colour in a feature is a lint failure
  waiting to happen and a design drift for certain.
- **Fixture data is not "done".** A screen wired to fixtures is a layout with
  the data still missing. Track it as unfinished.

---

## 12. Working with Claude Code on this repo

### Start every session with this

> Read `CLAUDE.md`, `HANDOVER-YASH.md`, and the latest session resume. I am the
> sole engineer for the entire Shoogle application. The roadmap and product
> decisions are unchanged. Confirm what already exists before writing anything.
> Do not rebuild the completed Social domain layer.

### Before implementing a risky phase

For database work, inspect first and show the exact migration/schema/RLS plan
before applying it to the linked Supabase project.

For provider integrations, run the `api-researcher` agent using first-party
sources and commit the research report before relying on exact scopes, limits,
pricing or review requirements.

### Before every commit

```bash
npm run typecheck && npm run lint && npm test
```

### PR/checkpoint checklist

- [ ] New/changed behavior has tests
- [ ] No hard-coded colors, sizes or spacing
- [ ] External data uses `DataState<T>`
- [ ] Unknown values never render as `0`
- [ ] Fixture data cannot escape development
- [ ] No fake integrations or dead controls
- [ ] Touch targets are at least 44pt and controls have accessible labels
- [ ] No horizontal overflow at 390x844 or 412x915
- [ ] RLS verification rerun after policy/grant/SECURITY DEFINER changes
- [ ] Social platform independence remains intact
- [ ] No LinkedIn is added back

### Integration research wording

Current research still needed/should be kept current for:

- Google Business Profile
- Instagram API / Instagram Login
- Facebook publishing/Meta permissions
- Razorpay
- Gemini
- current Google Play billing policy

Do **not** label the Instagram research item "Instagram / Meta Graph".

### Every session, before stopping

Update `docs/agent-memory/foundation-changes.md` using the repository's existing
headings:

- Date
- What I changed
- Files changed
- Decisions made
- Current state
- Known issues
- Things future engineers must NOT change
- Next recommended step

No secrets in the session log.

## 13. Open questions that need a human decision

These are still open and should be answered before the phase that depends on
them. They are not permission to reopen settled Social platform decisions.

1. **Token encryption at rest.** Decide whether/how to use Supabase Vault before
   the first real provider token is stored.
2. **Website hosting target.** Supabase Storage/custom domain versus an external
   static host before Phase 6 publish work.
3. **Billing model versus current Google Play policy.** Research before Phase 7.
4. **Which managed GBP is used for the API access application**, and whether it
   meets the current eligibility requirements. This can be a calendar-time gate.
5. **Minimum business-name capture flow in Phase 2.** The product principle remains
   to ask for as little as possible; decide the exact UX when Phase 2 begins.

### Already settled — not open questions

Do not ask again whether:

- LinkedIn should be supported — **No**.
- Instagram should use the planned Instagram API / Instagram Login integration —
  **Yes**.
- Facebook is a real publishing target — **Yes**.
- Facebook being unavailable should block Instagram/GBP — **No**.
- Instagram and Facebook OAuth must be independent — **Yes**.
- The completed Social domain layer should be rebuilt — **No**.

## 14. Quick reference

```text
Repo            ~/Shoogle
Branch          feature/yash-social
HEAD            be0703e
Remote          origin/feature/yash-social
Baseline        main @ e3d118e
Supabase        shoogle @ dkzizcaapnpkvmcmobfr
Scheme          shoogle://
Package         com.shoogle.app   targetSdk 36   minSdk 24
Viewports       390x844 and 412x915
Fonts           Sora (display), Manrope (UI)
Primary colour  #2f7ad6   Background #f5f6f8
Social targets  Instagram + Facebook + Google Business Profile
LinkedIn        Excluded
Instagram       Instagram API / Instagram Login integration
Facebook        Real target; independent and never blocks other targets
Latest tests    2674 passed / 1 skipped / 60 suites
Next gate       Phase 1 schema + RLS + auth
Read first      CLAUDE.md, HANDOVER-YASH.md, latest resume, foundation-changes.md
Never edit      lib/providers/registry.ts just to add a stub provider
Never commit    .env.local, keystores, or real credentials
Never render    an unknown value as 0
```

### Immediate next session

1. Start Claude Code from `~/Shoogle`.
2. Read this handover and `CLAUDE.md`.
3. Confirm `git status` is clean.
4. Confirm the existing Supabase link/config.
5. If `supabase/` is missing, run `npx supabase init`.
6. **Do not write or push migrations until the Phase 1 schema/RLS plan has been
   shown and approved.**
7. After approval, implement migrations and RLS in small checkpoints, run tests,
   and update the session log.

This file intentionally overrides stale statements in older handovers where they
conflict with the current branch and the settled Social decisions above.



```
Repo            https://github.com/Team-Unfazed/Shoogle
Baseline        main @ e3d118e
Package         com.shoogle.app   targetSdk 36   minSdk 24
Scheme          shoogle://
Viewports       390x844 and 412x915
Fonts           Sora (display), Manrope (UI)
Primary colour  #2f7ad6   Background #f5f6f8
Read first      CLAUDE.md, this file, docs/agent-memory/foundation-changes.md
Never edit      lib/providers/registry.ts to add a provider
Never commit    .env.local, keystores, any real credential
Never render    a value you do not have as 0
```
