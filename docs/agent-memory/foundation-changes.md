# Foundation Changes

Running log of foundation-level work. Append a new dated section every session.
**No secrets in this file — variable names only.**

---

## Date

2026-08-30

## What I changed

Built the Shoogle frontend foundation from scratch. `D:\shoogle` was an empty
directory — there was no existing repository, no `CLAUDE.md`, no `docs/`, no
`components/ui/`, and no tests, so there was no prior stack to preserve.

Imported the Claude Design project `777ab412-9581-4e29-8e50-e616b7464d19`
("Shoogle Mobile App") and transcribed its design-system reference card into
typed tokens.

Delivered:

- **Project setup** — Expo SDK 57 / React Native 0.86 / React 19.2, Expo Router
  57 with typed routes, TypeScript `strict` plus `noUncheckedIndexedAccess`,
  ESLint (flat config), Jest via `jest-expo` with React Native Testing Library
  14, EAS build/submit profiles.
- **Design tokens** — light and dark palettes, type scale (Sora display /
  Manrope UI), control geometry, radii, elevation, motion, layout guards.
  Transcribed verbatim from the design project.
- **21 design-system primitives** in `components/ui/` — Text, Button,
  IconButton, Card, Badge, Input, Textarea, Select, Dialog, BottomSheet, Tabs,
  Toast, Skeleton, EmptyState, ErrorState, Avatar, Score, Metric, Section,
  Divider, Navigation, PageHeader.
- **App shell** in `components/shared/` — Screen (safe areas, keyboard,
  scrolling, horizontal-overflow guard, fixture banner), TopBar, ErrorBoundary,
  LoadingBoundary, DataStateView, FixtureBanner.
- **Routing** — root layout with the provider stack, splash/route decision,
  `(auth)` group with a sign-in shell, `(tabs)` group with exactly four tabs,
  `+not-found`, `notifications`.
- **`DataState<T>`** — the loading/ready/unavailable/error model that makes
  "unknown is not zero" a type-level guarantee.
- **Provider contracts** (`lib/providers/contracts.ts`) — declarations only, for
  GBP, Instagram, LinkedIn, SocialPublisher, SEO, Audit, WebsiteGenerator,
  Billing, Auth, Business.
- **Provider registry** — runtime registration so features never edit a shared
  file; reports `not_connected` honestly until a real implementation registers.
- **Nine feature folders**, each with an owner and boundary rules.
- **Dev-gated fixtures** with a forced visible banner.
- **`api-researcher` agent**, `.env.local.example`, `CLAUDE.md`, `README.md`,
  `docs/android-release.md`.
- **72 tests** covering DataState, every primitive's honest states, the
  registry, DataStateView, fixture gating, token fidelity, and screen-level
  smoke tests that render the real routes through Expo Router.

## Files changed

Everything — this was a greenfield build. Key paths:

```
app.config.ts  eas.json  tsconfig.json  eslint.config.js
jest.config.js  jest.setup.ts  jest.resolver.js  .env.local.example
app/_layout.tsx  app/index.tsx  app/+not-found.tsx  app/notifications.tsx
app/(auth)/{_layout,sign-in}.tsx
app/(tabs)/{_layout,index,posts,business,settings}.tsx
theme/{tokens,ThemeProvider,fonts,index}.ts(x)
components/ui/*  (22 files + barrel)
components/shared/*  (6 files + barrel)
lib/env/index.ts  lib/state/DataState.ts  lib/supabase/client.ts
lib/providers/{contracts,types,registry,index}.ts  lib/providers/README.md
features/{auth,audit,gbp,seo,social,carousel,website,dashboard,billing}/
types/domain.ts  fixtures/{index.ts,README.md}
__tests__/{data-state,primitives,foundation,screens}.test.*
.claude/agents/api-researcher.md
docs/android-release.md  docs/agent-memory/foundation-changes.md
CLAUDE.md  README.md
```

## Decisions made

1. **Expo + Expo Router instead of Next.js.** The brief specified Next.js under
   "preserve the existing stack", but the directory was empty so there was
   nothing to preserve, and the stated goals — Expo Go on a physical Android
   phone, and a Play Store binary — cannot both be met by Next.js. Confirmed
   explicitly with the product owner before any code was written. **Decision is
   final; do not revisit.**

2. **Typed tokens + `StyleSheet` instead of NativeWind.** NativeWind v4 is not
   validated against RN 0.86 with the React Compiler (which this project
   enables), and v5 is preview-only. A preview dependency underneath five
   parallel engineers was not an acceptable risk. The token module also gives
   strict-TypeScript autocomplete that `className` strings do not. This is the
   documented technical reason the brief allowed for.

3. **Four tabs, not five.** The design project shows five (Home · Social · SEO ·
   Website · Settings); the product specification mandates four. Followed the
   specification: **Home · Posts · Business · Settings**. Social maps to Posts;
   SEO, GBP, Website and Audit live under Business.

4. **`DataState<T>` everywhere, and no `unwrapOr(state, 0)`.** The only unwrap
   helper is `unwrapOrNull`. `Metric` and `Score` take `number | null`. This
   makes "unknown is not zero" enforceable by the compiler rather than by
   reviewer memory.

5. **Runtime provider registry.** Features call `registerProvider(id, impl)`
   from their own folder. Nobody edits a shared registry file, so five engineers
   never contend on one line.

6. **Fixtures double-gated.** `isFixtureModeEnabled()` requires `__DEV__` *and*
   `EXPO_PUBLIC_ENABLE_FIXTURES=1`; both non-development EAS profiles set it to
   `0`. Any screen using them must pass `showsFixtureData`, which pins an
   undismissable banner.

7. **`app/` at the repository root**, with `@/*` mapped to `./*`. Matches the
   structure the brief asked for and keeps one clean path alias.

8. **Android is the default test platform** (`haste.defaultPlatform: 'android'`),
   with insets fixed at 412×915 in component tests.

## Current state

- `npm run typecheck` — **passes** (0 errors)
- `npm run lint` — **passes** (0 errors, 0 warnings)
- `npm test` — **passes** (72 tests, 4 suites)
- `npx expo export --platform android` — **succeeds** (4.9 MB Hermes bundle)
- `npx expo start` — **starts**; serves an Android manifest with HTTP 200, so
  Expo Go can connect
- **Not verified on hardware.** No Android device or emulator was connected to
  this machine (`adb devices` empty, no AVDs), so the app has not been launched
  on a real screen. The Android bundle compiles, every route renders in the
  Expo Router test harness, and the dev server serves — but someone must still
  scan the QR code with Expo Go and confirm layout at 390x844 and 412x915.

The app boots to the sign-in shell (no session), and all four tabs render with
honest empty states. Nothing is faked.

## Known issues

1. **Icons and splash are still `create-expo-app` placeholders.** `assets/images/`
   needs real Shoogle artwork before any store build.
2. **Sign-in does nothing.** `app/(auth)/sign-in.tsx` is layout only; its submit
   handler is intentionally empty and the button is disabled without Supabase
   configured. Auth is Sunny's work.
3. **No `EAS_PROJECT_ID` yet.** `eas init` has not been run, so EAS builds are
   not yet possible.
4. **Only the sign-in screen exists in `(auth)`.** Sign-up, password reset and
   OAuth linking are not built.
5. **`npm audit` reports moderate advisories** from transitive dev dependencies
   in the Expo toolchain. Not addressed — forcing fixes risks breaking the
   toolchain. Re-check when Expo updates.
6. **Only three of the design's 46 screens exist as routes.** That is intended:
   the remaining screens are feature work, not foundation.

## Things future engineers must NOT change

- **The stack.** Expo + Expo Router + React Native. Not Next.js, not Capacitor,
  not a WebView wrapper.
- **The four tabs.** Adding a fifth is a product decision, never a convenience.
- **`theme/tokens.ts` values** — they are transcribed from the design project
  and pinned by tests. Add tokens; do not redefine existing ones.
- **`DataState`** — do not add an unwrap helper that defaults to a number, and
  do not bypass it with `as` or `!`.
- **`Metric` / `Score` accepting `null`** — do not "simplify" these to `number`.
- **The provider registry mechanism** — do not hand-edit `registry.ts` to add a
  provider.
- **The fixture gate** — do not loosen `isFixtureModeEnabled()`, and do not make
  `FixtureBanner` dismissable.
- **Provider order in `app/_layout.tsx`** — it is deliberate and documented in
  the file.
- **`jest.resolver.js`** — it composes the worklets resolver with React
  Native's. Removing either half breaks the suite with an error that points
  somewhere unrelated.
- **Shared folders** (`components/ui`, `components/shared`, `theme`, `lib`) —
  extend with a test and tell the team; never fork or restyle inline.

## Next recommended step

1. **Sunny** — run `eas init`, provision a Supabase project, add
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to
   `.env.local`, then implement real sign-in behind the existing
   `SessionProvider` contract and design the RLS policies.
2. **Anyone integrating** — run the `api-researcher` agent first and commit its
   report to `docs/research/`. Google Business Profile in particular needs a
   quota request, and Instagram publishing needs app review; both should be
   confirmed against first-party documentation before UI is designed around them.
3. **Design** — replace the placeholder icon and splash assets.
4. **Aryan** — Home is the surface most likely to invite invented numbers.
   Build it against `DataStateView` from the start.

---

## Date

2026-08-30 (session 2 — post first device run)

## What I changed

Fixed a genuine honesty defect found once the app was running on a real device,
and wired local Supabase configuration.

1. **Sign-in button could become enabled but inert.** The button's enabled state
   was gated on `isSupabaseConfigured()` alone. The moment valid Supabase
   credentials were added, the label flipped to "Sign in", the button enabled
   once both fields had text, and pressing it did nothing — a silently inert
   control, which is exactly the pretend behaviour the brief forbids. It was
   only honest by accident, because the backend happened to be missing.

   Added `features/auth/handlers.ts`: a sign-in seam mirroring the provider
   registry. The screen now requires **both** facts — backend configured *and*
   a handler registered — and delegates the actual call to whatever the auth
   feature registers. It also renders handler failures inline and deliberately
   does not navigate on success (SessionProvider's auth-state subscription and
   the `(auth)` layout redirect do that, driven by a real session).

2. **Two latent test bugs.** RNTL 14 flushes React state updates asynchronously,
   so an unawaited `fireEvent` leaves the tree stale. The new "stays disabled"
   test would have passed for the wrong reason (empty fields rather than a
   missing handler). Every `fireEvent` call in the suite is now awaited.

3. **Local Supabase config.** Wrote `.env.local` (git-ignored) with the project
   URL and publishable key. Verified Expo loads and inlines both into the
   Android dev bundle.

## Files changed

```
features/auth/handlers.ts        (new — sign-in seam)
features/auth/index.ts           (exports the seam)
app/(auth)/sign-in.tsx           (gates on configured AND implemented)
__tests__/screens.test.tsx       (3 new sign-in tests, awaited fireEvent)
__tests__/primitives.test.tsx    (awaited fireEvent)
.env.local                       (NOT COMMITTED — git-ignored)
```

## Decisions made

1. **"Configured" and "implemented" are separate facts and both gate the
   button.** Conflating them is what produced the inert-button defect.
2. **The sign-in screen calls a registered handler rather than implementing
   auth.** Keeps the foundation/feature boundary intact while making the screen
   genuinely functional the moment Sunny registers a handler — no edit needed to
   the screen.
3. **No navigation on sign-in success.** Redirect follows the observed session,
   never an optimistic assumption that the call worked.

## Current state

- `npm run typecheck` — passes
- `npm run lint` — passes
- `npm test` — passes (75 tests, 4 suites)
- **Confirmed running on a physical Android device via Expo Go.** This closes
  the hardware-verification gap noted in session 1.
- Supabase is configured locally; the "Backend not configured" card no longer
  appears. The button still correctly reads "Sign in unavailable" because no
  sign-in handler is registered yet.

## Known issues

Carried over from session 1: placeholder icons/splash, no `EAS_PROJECT_ID`,
`(auth)` has only the sign-in screen, npm audit advisories in the Expo
toolchain. Plus:

1. **No Supabase schema, RLS policies or migrations exist.** The project is
   linked in name only. `supabase init` / `link` and the DB work are Sunny's
   track and were deliberately not run here — they are backend feature work,
   not foundation.

## Things future engineers must NOT change

Everything from session 1, plus:

- **The two-fact gate on the sign-in button.** Do not re-gate it on
  `isSupabaseConfigured()` alone; that reintroduces the inert-button defect.
  There is a regression test pinning this.
- **The no-navigation-on-success rule** in `sign-in.tsx`.
- **Awaiting `fireEvent`** in tests. Dropping the await can make an assertion
  pass for the wrong reason.

## Next recommended step

**Sunny:** implement `signInWithEmail` against Supabase and call
`registerSignInHandler(...)` from the auth feature's entry point. The screen,
the session subscription and the redirect are already wired — registering the
handler is the only step needed to make sign-in work end to end. Then run
`supabase init` / `link` and design the RLS policies.

---

## Date

2026-08-30 (session 3 — development preview mode)

## What I changed

The app was unreachable past sign-in, correctly: `(tabs)/_layout.tsx` requires a
confirmed session and no auth handler is registered. That blocks anyone from
seeing the shell before Sunny's auth work lands.

Added **development preview mode** — an explicit bypass of the route guard, not
a fake session.

- `isDevPreviewEnabled()` in `lib/env`: requires `__DEV__` **and**
  `EXPO_PUBLIC_DEV_PREVIEW=1`. Gated identically to fixture mode.
- `SessionProvider` gained `isPreview` / `enterPreview` / `exitPreview`.
  Preview is reported separately from `isAuthenticated` and a real session
  always takes precedence, so preview never masquerades as a session.
- `DevPreviewBanner`: undismissable, pinned above every tab, states plainly
  "not signed in, nothing here is real data".
- Sign-in shows "Preview the app without signing in", hidden entirely unless
  the flag is on.
- `eas.json` sets the flag to `0` in both `preview` and `production`.

## Files changed

```
lib/env/index.ts                      (isDevPreviewEnabled)
features/auth/SessionProvider.tsx     (preview state, kept separate from session)
components/shared/DevPreviewBanner.tsx (new)
components/shared/index.ts
app/(tabs)/_layout.tsx                (banner + inset handling)
app/(auth)/sign-in.tsx                (preview entry point)
eas.json  .env.local.example
__tests__/dev-preview.test.tsx        (new, 5 tests)
__tests__/screens.test.tsx            (SessionProvider in the shared harness)
```

## Decisions made

1. **Preview relaxes the guard; it does not create a session.** No user object
   is fabricated, nothing is fetched, and no screen gains data. Every tab still
   shows its honest empty state.
2. **`isPreview` is separate from `isAuthenticated`.** Collapsing them would let
   UI treat preview as a signed-in owner.
3. **The banner is undismissable and always visible.** Same reasoning as
   `FixtureBanner`: a bypass that can be hidden will eventually be mistaken for
   the real thing in a screenshot or demo.
4. **The tabs layout overrides the top safe-area inset for its subtree.** The
   banner consumes `insets.top`; without the override every Screen would apply
   it again and each tab would open with a band of dead space.
5. **Double-gated, and off in every non-development profile.** A test asserts
   `isDevPreviewEnabled()` is false whenever `__DEV__` is false, so no env file
   can enable it in a release build.

## Current state

- typecheck, lint pass. 80 tests, 5 suites, all passing.
- Android bundle exports cleanly.
- With `EXPO_PUBLIC_DEV_PREVIEW=1` in `.env.local`, sign-in offers the preview
  button and all four tabs are walkable behind a persistent banner.

## Known issues

Carried over: placeholder icons/splash, no `EAS_PROJECT_ID`, no Supabase schema
or RLS, `(auth)` has only the sign-in screen. Plus:

1. **Preview mode is not a substitute for auth.** It exists so the shell can be
   reviewed. Nothing user-specific can be built or tested against it.

## Things future engineers must NOT change

Everything from sessions 1 and 2, plus:

- **Do not widen `isDevPreviewEnabled()`.** It must keep requiring `__DEV__`
  plus the explicit flag. A regression test pins this.
- **Do not merge `isPreview` into `isAuthenticated`**, and do not make the
  preview banner dismissable or conditional.
- **Do not set `EXPO_PUBLIC_DEV_PREVIEW=1`** in the `preview` or `production`
  EAS profiles.
- **Do not build features against preview mode.** It provides no data.

## Next recommended step

Unchanged: **Sunny** registers a real `signInWithEmail` handler via
`registerSignInHandler(...)`. Once that exists, preview mode becomes a
convenience rather than the only way in, and can eventually be retired.

---

## Date

2026-08-30 (session 4 — light theme + Home built to the wireframe)

## What I changed

Two problems reported after the first device run, both legitimate.

**1. The app rendered black.** `userInterfaceStyle: 'automatic'` made it follow
the device theme, and the test phone was in dark mode. The design project's
primary palette is light; dark was only a secondary variant.

- `app.config.ts` -> `userInterfaceStyle: 'light'`.
- `ThemeProvider` now defaults to light and only follows the system when
  explicitly passed `followSystem`. Dark tokens remain complete and tested.
- Root layout no longer derives its background from `useColorScheme`, and the
  status bar is pinned to `dark` content.

**2. Home looked nothing like the wireframe.** Session 1 shipped empty
placeholder cards, reading "do not start feature implementation" as "ship empty
scaffolding". But "design matches imported wireframes" was an explicit
deliverable, and empty cards match nothing. That was a misjudgement.

Rebuilt Home against `Shoogle Home.dc.html`, transcribing its measurements:

- business switcher (42px tile, radius 13) with notification bell + unread dot
- the gradient-ringed "Shoogle suggests" card (2px ring, blue -> green)
- horizontal insight strip (186px chips)
- 3-up metric row (radius 16, Sora 20px values)
- connection alert row (redSoft, 34px badge)
- three module rows (radius 20, 46px tiles at radius 15)
- page gutters corrected from 16 to **18px** to match the design frames

## Files changed

```
app.config.ts                                  (light theme)
theme/ThemeProvider.tsx                        (followSystem, default light)
theme/tokens.ts                                (screenPaddingX 18)
app/_layout.tsx                                (light background, dark status bar)
app/(tabs)/index.tsx                           (rebuilt to the wireframe)
features/dashboard/components/HomeParts.tsx    (new — Home composition pieces)
fixtures/home.ts                               (new — the design's demo business)
eslint.config.js                               (fixtures allowed in app/, still
                                                blocked in data layers)
__tests__/screens.test.tsx                     (both Home paths covered)
```

## Decisions made

1. **Light is the app's palette; the system theme is not followed.** Shipping
   dark mode is a deliberate decision, not something a user's phone setting
   makes for us. `followSystem` exists for when we choose to.
2. **Home renders the design's own demo business as a labelled fixture.** The
   wireframe shows real-looking numbers (1,204 views, 2,412 reach). Those cannot
   be presented as the owner's data, so they come from `fixtures/home.ts`, are
   reachable only in development, and always carry a banner. The layout is
   therefore reviewable without anything being claimed as real.
3. **Layout components take props and never import fixtures.**
   `HomeParts.tsx` is pure presentation, so swapping fixtures for real
   `DataState` values changes only the screen, not the components.
4. **ESLint now permits fixtures in `app/**` but still blocks `lib/**` and
   feature data layers.** A screen is where fixture data becomes visible and is
   banner-marked; a data layer is where it would be laundered into something
   believed real. Verified both directions.
5. **`MetricTile` keeps `number | null`.** The design's "Calls — 0%" is a
   genuine zero change and renders as such, which is still distinct from
   unknown.

## Current state

- typecheck, lint pass. **83 tests, 5 suites**, all passing.
- Android bundle exports cleanly.
- Home matches the wireframe in light mode. Posts, Business and Settings are
  still foundation placeholders and do NOT match their designs yet.

## Known issues

Carried over: placeholder icons/splash, no `EAS_PROJECT_ID`, no Supabase schema
or RLS, no auth handler. Plus:

1. **Only Home matches the design.** Posts, Business and Settings still render
   generic empty states. The design has 46 screens; 1 is built.
2. **Home's actions are not wired.** "Review & schedule", "3 more" and the
   module rows either toast "not built yet" or navigate to a placeholder tab.
   They deliberately do not pretend to work.

## Things future engineers must NOT change

Everything from sessions 1-3, plus:

- **Do not re-enable `userInterfaceStyle: 'automatic'`** or default
  `ThemeProvider` to `followSystem` without an explicit product decision.
- **Do not let `HomeParts.tsx` import fixtures or fetch anything.** It takes
  props. That is what makes the swap to real data a one-file change.
- **Do not remove the fixture banner from Home** or widen the ESLint exception
  beyond `app/**`.

## Next recommended step

Decide the order: either **(a)** build Posts, Business and Settings to their
wireframes the same way — layout components plus labelled fixtures — so the
whole shell is reviewable, or **(b)** stop UI work and let Sunny wire real auth
and Supabase so Home can move from fixtures to real `DataState` values. (a) is
faster to review; (b) is closer to launch.

---

## Date

2026-08-30 (session 5 — Posts, Business and Settings built to the wireframes)

## What I changed

Built the remaining three tabs against the design project, so the whole shell is
now reviewable rather than just Home.

**Posts** — from the `social` screen in "Shoogle Social.dc.html": next-up card
(64px thumbnail at radius 12), three stat tiles at radius 15, and Scheduled /
Needs attention / Published sections at radius 16, with the 54px floating
Create post button.

**Business** — from the `seo` screen in "Shoogle SEO.dc.html": visibility hero
at radius 20 with five 6px strength segments, a 2x2 metric grid, the rating
summary with its divider, and 44px navigation tiles at radius 14. The Website
module is folded in here because the product spec has four tabs, not the
design's five. The real "Connected accounts" section is kept below it.

**Settings** — from the `settings` screen in "Shoogle Website.dc.html": account
card, then Business / Team / Preferences / Account groups at radius 18 with
hairline row separators, a 46x28 toggle drawn to the design, and the version
footer.

Also aligned the shared `Tabs` primitive to the design's segmented control
(13px container, 4px padding, 36px items at radius 10) — it had been built from
my own scale rather than measured.

## Files changed

```
components/ui/Tabs.tsx                             (design geometry)
app/(tabs)/posts.tsx                               (rebuilt)
app/(tabs)/business.tsx                            (rebuilt)
app/(tabs)/settings.tsx                            (rebuilt)
features/social/components/PostsParts.tsx          (new)
features/gbp/components/BusinessParts.tsx          (new)
features/dashboard/components/SettingsParts.tsx    (new)
fixtures/posts.ts  fixtures/business.ts  fixtures/settings.ts   (new)
__tests__/screens.test.tsx                         (both paths per tab)
```

## Decisions made

1. **Business mixes fixture and real data, visibly.** The SEO content is a
   labelled fixture under a banner; the Connected accounts rows below it come
   from the provider registry and still say "Not connected". A test asserts
   fixture content does not bleed into connection state — that was the most
   likely way this screen could start lying.
2. **Settings keeps two genuinely real things**: log out actually signs you out,
   and Diagnostics names missing environment VARIABLES (names only). Every
   other row toasts "not built yet" rather than opening an empty screen.
3. **No fake affordances anywhere.** Buttons that have no implementation say so
   when pressed. Nothing silently does nothing.
4. **`MediaPlaceholder` instead of hatched artwork.** The wireframe hatches
   image tiles to mean "photo goes here"; with no media pipeline, a labelled
   neutral tile reading "No image yet" says the same thing honestly.
5. **All the honesty types survived the redesign.** `MetricTile`, `GridMetric`,
   `StatTile`, `RatingRow` and `VisibilityHero` all take `| null` and render a
   dash with a reason rather than a zero.

## Current state

- typecheck, lint pass. **87 tests, 5 suites**, all passing.
- Android bundle exports cleanly.
- **All four tabs now match their wireframes** in light mode, at 390x844 and
  412x915.

## Known issues

Carried over: placeholder icons/splash, no `EAS_PROJECT_ID`, no Supabase schema
or RLS, no auth handler. Plus:

1. **Only the four tab roots are built.** The design has 46 screens; the
   detail/flow screens (create-post 1-5, calendar, rankings, keyword, reviews,
   review reply, GBP posts, website preview, employees, subscription) are not.
   They are feature work.
2. **Every action inside the tabs toasts "not built yet."** That is deliberate,
   but it means the tabs are reviewable rather than usable.

## Things future engineers must NOT change

Everything from sessions 1-4, plus:

- **Do not let the `*Parts.tsx` component files import fixtures or fetch.** They
  take props. That is what keeps the swap to real data a one-file change per tab.
- **Do not remove the fixture banner** from any tab, and do not let fixture
  content drive the Connected accounts rows on Business.
- **Do not replace a `| null` value prop with a plain `number`** in any of the
  metric components.

## Next recommended step

The shell is now reviewable end to end. The highest-value next move is **Sunny
wiring real auth and Supabase**, so Home and Business can move from fixtures to
real `DataState` values — each tab is a single file change. Feature engineers
can then build their detail screens behind the tab roots that already exist.

---

## Date

2026-08-30 (session 6 — repo published, CI and contribution rules)

## What I changed

Pushed the project to https://github.com/Team-Unfazed/Shoogle (`main`) and added
the scaffolding five engineers need to work in parallel without diverging.

- **`.github/workflows/ci.yml`** — three jobs on every PR and push to `main`:
  `verify` (typecheck, lint, tests), `bundle` (a real Android export, which is
  the only thing that catches a broken Metro config or an unresolvable module),
  and `secrets` (rejects tracked `.env` files, credential-shaped values across
  full history, and any reference to the service-role key from client code).
- **`CONTRIBUTING.md`** — ownership table, per-file owners for the four tab
  roots, route namespacing, shared-code review owners, the non-negotiable
  honesty rules, and a PR checklist.

## Files changed

```
.github/workflows/ci.yml   (new)
CONTRIBUTING.md            (new)
```

## Decisions made

1. **CI forces `EXPO_PUBLIC_ENABLE_FIXTURES=0` and `EXPO_PUBLIC_DEV_PREVIEW=0`
   on the bundle job.** CI must never build with fixture data reachable or the
   auth guard bypassable.
2. **The secret scan runs over full history** (`fetch-depth: 0`). A secret
   removed from HEAD is still a leaked secret.
3. **The `sk-` pattern requires 20+ alphanumerics.** A looser pattern matched
   `flask-outline`, an icon name — a false positive there would have blocked
   every PR.
4. **Shared code has named review owners rather than a "raise it with the team"
   convention**: `components/`, `theme/` → Aryan; `lib/` → Sunny. With five
   people, an unowned shared folder gets edited concurrently within a week.
5. **Routes are namespaced per engineer** (`app/social/`, `app/seo/`,
   `app/website/`, `app/account/`). Expo Router auto-registers files, so this
   costs nothing and removes filename collisions.

## Current state

- Published at `Team-Unfazed/Shoogle`, `main`, 118 files.
- No credentials in any commit — verified across full history before pushing.
  `.env.local` never entered history; `.env.local.example` holds names only.
- Every CI step verified locally before being made a gate: typecheck, lint,
  87 tests, Android bundle, and all three secret-scan steps.

## Known issues

Carried over: placeholder icons/splash, no `EAS_PROJECT_ID`, no Supabase schema
or RLS, no auth handler, only the four tab roots built. Plus:

1. **`main` is not branch-protected yet.** CI runs, but nothing stops a direct
   push. This must be enabled in GitHub Settings — it cannot be done from the
   repo.
2. **The default branch may still be `master` in GitHub's settings.** The branch
   was renamed to `main` locally before the first push.

## Things future engineers must NOT change

Everything from sessions 1-5, plus:

- **Do not weaken the CI secret scan**, and do not remove `fetch-depth: 0`.
- **Do not enable fixtures or preview mode in the CI bundle job.**
- **Do not push directly to `main`** once branch protection is on.

## Next recommended step

1. **Enable branch protection on `main`** in GitHub Settings: require the three
   CI checks, and disallow direct pushes. Confirm the default branch is `main`.
2. Then all five engineers can start in parallel — each against their own
   provider contract and fixtures, per CONTRIBUTING.md.
