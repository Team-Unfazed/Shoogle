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

---

## Date

2026-09-16 (session 7 — Phase 1 schema decisions 1-4, type-level only)

## What I changed

Yash is now the sole engineer; `HANDOVER-YASH.md` at the repo root is the current
context document and supersedes older handovers. A read-only architecture audit
compared the branch against the Phase 1 schema plan and found nine blocking
decisions. Four were taken and implemented at the type level. **No migration, no
SQL and no change to the remote Supabase project — the schema decisions below are
decisions, not a schema.**

- **Decision 1 — LinkedIn removed from the product.** It was never a publishing
  target, but it survived in `ProviderId`, so the compiler required a
  `DISPLAY_NAMES` entry, a `PROVIDER_ICON` entry and an `ALL_PROVIDER_IDS` slot,
  and the Business tab rendered a fourth "not connected" row for it. Supported
  platforms are now exactly Instagram, Facebook and Google Business Profile.
- **Decision 2 — a bare business can say "nobody has told us".** `Business.name`
  and `Business.category` are nullable. Three audit checks that read them now
  reach `not_checked` instead of crashing or excusing themselves.
- **Decision 3 — `Business.city` added, nullable**, beside `locality`.
- **Decision 4 — post persistence direction settled; one UUID generator built.**
  The only code this needed was identifiers: three id defaults produced values a
  `uuid` column would reject.

## Files changed

```
Decision 1  types/domain.ts  lib/providers/{registry,contracts}.ts
            lib/env/index.ts  app/(tabs)/business.tsx  .env.local.example
            features/social/{types,index,publisher}.ts
            __tests__/{foundation,screens}.test.tsx
            features/social/__tests__/honesty.test.ts
            README.md  lib/providers/README.md  features/social/README.md
            docs/research/README.md  .claude/agents/api-researcher.md

Decision 2  types/domain.ts
            features/audit/checks/area-{b-nap,c-categories,d-hours}.ts
            features/audit/test-support/build.ts
            features/audit/__tests__/checks.test.ts
            __tests__/foundation.test.tsx

Decision 3  types/domain.ts  features/audit/test-support/build.ts
            fixtures/{index,audit}.ts  __tests__/foundation.test.tsx

Decision 4  features/social/ids.ts               (new)
            features/social/__tests__/ids.test.ts (new)
            features/social/publisher.ts
            features/social/compose/useCompose.ts
            features/social/media/expoPicker.ts
            jest.setup.ts
```

`package-lock.json` untouched. No dependency added.

## Decisions made

1. **LinkedIn is removed from Shoogle entirely**, not merely excluded from
   publishing. Settled before the `provider_connections` provider enum is
   written, because removing a value from a Postgres enum later is expensive
   while adding one is not.
2. **No placeholder business name and no `category: 'other'` default.** A
   stand-in is indistinguishable from a real answer, which breaks two things:
   provider hydration cannot tell what it may safely overwrite, and
   `features/social/generation` would add an invented name to the facts a model
   is allowed to assert — so the anti-fabrication guard would approve a caption
   naming a business that has no such name. Null means nobody has told us.
3. **`Business.timezone` stays required, defaulting to `Asia/Kolkata`.** It is
   infrastructure, not a claim about the business: scheduling needs a zone from
   the first moment, and a default asserts nothing false about the owner.
4. **Phase 1 `businesses` columns are exactly**: `id`, `name`, `category`,
   `locality`, `city`, `timezone`, `created_at`, `updated_at`.
5. **`services`, `keywords`, `audience`, `hours` and `offer_*` are deferred** to
   the phase that builds their capture UX. `ALTER TABLE ADD COLUMN` is cheap and
   non-breaking, and `services` carries an unresolved semantic conflict (below).
6. **`declaredName` is not a separate persisted field.** `businesses.name` is
   canonical; `OwnerContext.declaredName` stays a runtime audit concept.
7. **`OwnerContext`'s orphan fields are deferred**: `declaredOpenStatus`,
   `confirmed24x7`, `confirmedNoWeeklyClosure`, `stateCode`, `dismissedCheckIds`.
   No speculative columns or tables for them.
8. **Post content persists as a single `posts.content` JSONB column** holding the
   whole `{ instagram?, facebook?, google_business? }` map. Not normalised: the
   Posts list already reads content for every row (`view.ts` calls
   `missingContentFor` and `primaryText`), so a child table would force a join on
   the most frequent query, and six relational tables would mirror three volatile
   provider APIs to enforce constraints the discriminated unions already make
   unwriteable.
9. **JSONB guardrails**: a `content_version` integer, a CHECK restricting
   top-level keys to the three platforms, and a per-platform discriminant check so
   a `facebook` key cannot hold Instagram-shaped content. The app stays the
   primary validator; these are cheap corruption guards.
10. **Media persistence direction (not yet implemented)**: preserve device-local
    media honestly, including origin/device information, so a second device can
    distinguish unavailable local media from a hosted asset. `MediaAsset` is
    deliberately unchanged for now.
11. **`posts.carousel_id` is reserved as a nullable UUID**; no `carousels` or
    `carousel_slides` tables. It is `null` at every construction site today.
12. **UUIDs everywhere**: `gen_random_uuid()` as the database default, and
    app-side `expo-crypto.randomUUID()` through the existing `newId` seams.
13. **Retry and lease columns are deferred** until the server runner is designed.
    Retry policy and lease semantics belong with the implementation, not frozen
    into the core schema ahead of it.
14. **No ordinal on `post_targets`** — the application's canonical platform order
    is the single source, and a stored ordinal could disagree with it.
15. **`isFixture` is never persisted**; the persistence adapter must refuse a post
    carrying it.
16. **`posts.title` is persisted** (an internal working name, never sent to a
    platform). **`Schedule.owner` is not** — it is a type-level literal with one
    possible value.
17. **`PostInsights` is deferred** to the metrics decision.
18. **`newUuid()` throws rather than returning an unusable id.** `expo-crypto`
    does not throw when its native side is missing — `randomUUID()` returns
    `undefined` — so a naive default would have produced a post with id
    `undefined` and told the owner their draft was saved. Same reasoning as
    `transition()`: a caught error rather than a corrupt row.

## Current state

- `npm run typecheck`, `npm run lint` clean. **2694 tests pass, 1 skipped, 61
  suites** (2674 at the previous checkpoint; +20, no regressions).
- Supported Social platforms: Instagram, Facebook, Google Business Profile.
- `supabase/` is scaffolded and linked, but contains only `config.toml`. There are
  still **no migrations, no RLS, no tables and no seed**.
- Real authentication is still not wired: `registerSignInHandler()` is never
  called, so the sign-in button remains honestly disabled.

## Known issues

Carried over: placeholder icons/splash, no Supabase schema or RLS, no auth
handler, no registered providers, media hosting unconfigured. Plus:

1. **`BusinessContext.name` and `.category` are still non-null** while
   `Business.name`/`.category` are nullable. The mapping between them must be a
   gate that can fail, not a projection. Not built yet — deliberately.
2. **`services` is modelled twice with opposite empty-array meanings.**
   `BusinessContext.services` `[]` means "not stated"; `OwnerContext.declaredServices`
   `[]` means "the owner told us none". One column cannot be both. Unresolved by
   design, and it blocks persisting services.
3. **`BusinessContext.hours` is free text while GBP hours are structured.** Two
   representations of one fact; deferred.
4. **`expo-image-picker` and `expo-image-manipulator` were declared but not
   installed** in the local `node_modules`, which broke typecheck until
   `npm install` was run. The lockfile was restored afterwards.
5. **Decisions 5-9 of the audit are still open**: business member roles, metrics,
   provider credentials, token encryption at rest, media and carousels.

## Things future engineers must NOT change

Everything from sessions 1-6, plus:

- **Do not reintroduce LinkedIn** in any form.
- **Do not add a placeholder business name or default a category.** Null is the
  answer when nobody has told us.
- **Do not make `posts.state` store the six-value `PostStatus`.** The database
  stores the full eight-value `PostState`; `PostStatus` is a lossy badge
  projection.
- **Do not drop `failure_*` on a skipped target.** A skip with no failure is the
  owner's deliberate choice (rule 5); a skip with one is Shoogle failing to reach
  the platform (rule 13). Collapsing them breaks `independence.test.ts`.
- **Do not let a target read `succeeded` without both `remote_id` and
  `published_at`.** `permalink` stays nullable, and must be HTTPS when present.
- **Do not collapse `dueAt` and `timeZone`** into one timestamp. Display uses the
  business's zone, never the device's.
- **Do not derive post content from `post_targets`.** A post can target a platform
  it has no content for; `missingContentFor()` exists to report exactly that.
- **Do not reintroduce a non-UUID id fallback.** Ids reach `uuid` columns.

## Next recommended step

Work through the remaining audit decisions in order before writing any SQL:
business member roles and the last-owner guard, then metrics, then provider
credentials and token encryption at rest, then media and carousels. Only once
those are settled should the Phase 1 migration and RLS plan be written, reviewed
and approved — and `supabase/tests/rls_verification.sql` should be authored
alongside the migrations, not after, because RLS failures are silent.

---

## Date

2026-09-16 (session 8 — Decision 5: membership, roles, multi-business)

## What I changed

Settled how people relate to businesses, and added the two domain types that
settled decision 4 ("model staff membership from day one") has been owed since
session 1. **Type level only — no migration, no SQL, no RLS, no Supabase change,
and `create_business()` is still unwritten.**

Before this session the repository had **no membership concept at all**: no role
type, no member type, and nothing anywhere that resolved a current business. The
product intent was already on screen and unmodelled — `app/(tabs)/settings.tsx`
renders a "Team" group with "Employees" and "Roles & permissions", `AccountCard`
carries a "Switch business" control, and `fixtures/settings.ts` shows
`ownerLine: 'Ravi Deshmukh · Owner'`.

Added to `types/domain.ts`: `BUSINESS_ROLES`, `Role`, `ROLE_LABEL`, `isRole()`,
`BusinessMember`, `sameMembership()`.

## Files changed

```
types/domain.ts                 Role / BusinessMember and their helpers
__tests__/foundation.test.tsx   membership tests + a type-level LinkedIn guard
docs/agent-memory/foundation-changes.md
```

`package-lock.json` untouched. No dependency added. No Social domain change.

## Decisions made

1. **5a — roles are exactly `owner | member`.** Two tiers, because two is what
   the customer distinguishes: one person who owns the business and the money,
   and helpers who write posts. A third tier earns its place only when an owner
   must delegate *membership management* without granting billing, which no
   planned feature needs. Adding an enum value later is cheap; removing one is
   not, and every extra role is another silently-failing RLS branch.
2. **5b — many owners allowed, at least one always required.** Single-owner
   makes succession a support ticket and a lost account unrecoverable.
3. **5c — a user may belong to many businesses** at the database level. The
   switching UI is deferred; the join table gives the capability for free.
4. **5d — the last-owner rule is a concurrency-safe database trigger.** It
   cannot be an RLS policy: a policy is evaluated per row and cannot count what
   would remain. Without row locking, two simultaneous departures each see
   another owner and both commit.
5. **5e — permissions.** Owner only: business identity, provider
   connect/disconnect, membership, billing. Owner and member: create, edit,
   schedule and skip posts; read posts, metrics and audit.
6. **5f — shape.** `user_id` references `auth.users(id)`; composite primary key
   `(business_id, user_id)`; hard delete, no `status` soft-delete; invitations
   deferred.
7. **5g — `create_business()` is zero-argument, authenticated-only,
   SECURITY DEFINER with a pinned `search_path`, and idempotent for bootstrap.**
   `auth.uid()` becomes the owner and no `user_id` is ever accepted from the
   client. Idempotency is the abuse control: it caps each user at one
   self-created business, and it makes a double-tap or a retry safe.
8. **5h — the current business is derived from available memberships.** Local
   persistence arrives with the switching UI. A fixture business id must never
   appear in a real authenticated flow.
9. **5i — types now, provider contract later.** `BusinessProvider` is NOT
   widened; it gains `createBusiness`/`listBusinesses` when Phase 2 actually
   implements business persistence.
10. **5j — `ConnectableProvider` business scoping is a recorded blocker.** Its
    methods take no `businessId` and the registry is a process-global `Map`,
    while `provider_connections` is business-scoped. Not changed now; see Known
    issues.
11. **5k — `posts.created_by` is a schema requirement, not a type change.**
    `uuid NULL`, references `auth.users(id)`, `ON DELETE SET NULL`, so posts
    survive member removal. Deliberately NOT added to `SocialPost`: with no
    persistence layer it would be an in-memory-only field, and inventing one to
    satisfy a future column is the kind of speculative change this log exists to
    prevent.

## Current state

- `npm run typecheck` and `npm run lint` clean. **2707 tests pass, 1 skipped,
  61 suites** (2694 at the previous checkpoint; +13, no regressions).
- Membership exists as a vocabulary only. Nothing reads it, nothing writes it,
  and no screen renders it — which is correct, because there is no database.
- Phase 1 planned table list is unchanged. `supabase/` still holds only
  `config.toml`.

## Known issues

Carried over from session 7, plus:

1. **`ConnectableProvider` cannot express which business a connection belongs
   to.** `getConnection()`, `connect()` and `disconnect()` take no `businessId`,
   and `lib/providers/registry.ts` is a module-level singleton. This is a
   blocker for the first real provider registration, not a nice-to-have: that
   change will write a row to a business-scoped table through an API that does
   not know the business.
2. **The bootstrap membership check is ambiguous under RLS.** A `SELECT`
   returning no rows is indistinguishable from a filtered read, because RLS
   filters silently. A client that reads "no memberships" and creates a business
   can duplicate one. 5g's idempotency is what makes this safe.
3. **The Team screen will need to widen `profiles` read access** from "your own
   row" to "profiles of people in the same business". That policy must be scoped
   through shared membership, or any authenticated user can enumerate profiles.
4. **Removing a member does not revoke provider access.** Credentials belong to
   the business and stay valid. If departure-triggered revocation is ever
   required it is a separate flow.
5. Decisions 6-9 remain open: metrics, provider credentials, token encryption at
   rest, media and carousels.

## Things future engineers must NOT change

Everything from sessions 1-7, plus:

- **Do not copy the last-owner rule into application code.** A screen may
  disable a control, but the guarantee is the database trigger's. A client-side
  check cannot see a concurrent transaction, and a business with zero owners is
  unreachable — every access rule routes through membership, so nobody can
  repair it.
- **Do not add a `status` column to `business_members`.** It creates a second
  truth about membership that every policy must remember to check; forgetting it
  once is a silent authorisation hole.
- **Do not let `create_business()` accept a `user_id`.** The owner is
  `auth.uid()` and nothing else.
- **Do not write a `SECURITY DEFINER` function without pinning `search_path`.**
  A caller who can create objects earlier on the path can shadow a referenced
  table or function and have it run with the definer's rights.
- **Do not rely on "no INSERT policy" to mean "no INSERT privilege".**
  `auto_expose_new_tables` is left at its default `true` in `config.toml`, so
  `metric_snapshots` needs an explicit `REVOKE` as well.
- **Do not expose the `private` schema** through `[api] schemas`. That setting,
  not RLS, is what keeps `provider_credentials` unreachable from a client
  holding the anon key — which ships inside the APK.
- **Do not treat an unrecognised role as a permission.** `isRole()` exists so a
  role Shoogle cannot interpret is refused rather than defaulted.

## Next recommended step

Decision 6 (metrics / `metric_snapshots`), then provider credentials and token
encryption at rest, then media and carousels. Only once all nine are settled
should the Phase 1 migration and RLS plan be written and approved, with
`supabase/tests/rls_verification.sql` authored alongside it — including the
cross-business isolation, client metric insertion, credential unreachability and
last-owner cases the handover names.

---

## Date

2026-09-16 (session 9 — Decision 6: metrics / metric_snapshots, design only)

## What I changed

Almost nothing in code, and that is the finding. Decision 6 settled the shape of
`metric_snapshots`, and the audit of the existing metric types showed the domain
**already encodes every invariant the table has to preserve** — the exact vs
below-threshold union, reported vs not-reported days, coverage metadata, and the
removed-metric registry are all modelled and thoroughly tested. There was no
honest TypeScript work to do beyond recording one deferral.

**The schema itself is DEFERRED to the reviewed schema phase. No migration, no
SQL, no `metric_snapshots`, no `metric_definitions`, no collector, no server
job, and no in-memory stand-in was created.**

The one code change: `PostInsights` in `features/social/types.ts` now records
why post-level metrics are deferred, and the structural warning that it must not
be persisted in its current shape.

## Files changed

```
features/social/types.ts                  PostInsights deferral annotation
docs/agent-memory/foundation-changes.md
```

No test files changed — see "Current state" for why, with citations.
`package-lock.json` untouched.

## Decisions made

1. **6a — one narrow `metric_snapshots` table with explicit value columns.** Not
   polymorphic JSONB and not per-platform tables. Metrics are always queried
   (filtered by business, key and period, ordered by time), which is the exact
   inverse of the access pattern that justified JSONB for `posts.content` in
   Decision 4.
2. **6b — post-level metrics are deferred entirely, and `post_target_id` is NOT
   reserved.** No supported platform has a verified post-level metric source:
   GBP removed post performance on 2023-02-20 with no replacement, Instagram's
   chosen Instagram Login path lists no insights scope and the research records
   the trade-off as accepted, and Facebook has no provider contract at all.
   Requires `api-researcher` verification before it is revisited.
3. **6c — explicit value columns** (`value_kind`, `value`, `threshold`,
   `reported_days`, `total_days`) with CHECK constraints binding which fields are
   valid for each `value_kind`. The fabrication-critical distinctions belong
   where the database can hold them, not inside JSON.
4. **6d — `business_id uuid NOT NULL` plus `location_id text NULL`.** GBP metrics
   are per location and a business may have several; keying only on the business
   would silently merge two shops' numbers. No `locations` table yet.
5. **6e — `id bigint GENERATED ALWAYS AS IDENTITY`.** The handover's own carve-out
   for "append-heavy metric identity if justified". Metrics are never addressed
   by a client-held id.
6. **6f — store per-day rows; derive window totals and changes.** `GbpDailyPoint`
   is already the provider's grain, and `totalOver()`/`changePercent()` already
   derive the rest.
7. **6g — keyword impressions share the table**, with `keyword` as a nullable
   subject detail and an explicit `partial` boolean so a truncated read can never
   present as complete.
8. **6h — metrics survive subject deletion.** `business_id` is retained
   independently so historical rows stay business-scoped and RLS still applies.
   No cascade that would destroy the record of what a published post did.
9. **6i — a `metric_definitions` reference table**, distinguishing live from
   removed. Server/schema controlled; no client INSERT/UPDATE/DELETE. A removed
   key must be impossible to insert into `metric_snapshots`. Its source of truth
   is the existing `LIVE_DAILY_METRICS` and `REMOVED_METRICS` registries.
10. **6j — retention deferred.** No first-party source in this repository states
    a GBP retention window, and inventing one is the guessing rule 11 forbids.

## Current state

- `npm run typecheck` and `npm run lint` clean. **2707 tests pass, 1 skipped,
  61 suites** — unchanged from session 8, because no test was added or removed.
- Every Decision 6 domain invariant was already under test before this session:

```
exact vs below-threshold   features/seo/__tests__/keywords.test.ts:29,35,46,56,105,148
                           features/gbp/__tests__/performance.test.ts:232-262
not reported vs zero       features/gbp/__tests__/performance.test.ts:97-136
                           features/seo/__tests__/metrics.test.ts:88,94,101
coverage semantics         features/gbp/__tests__/performance.test.ts:137-161
changePct not invented     features/gbp/__tests__/performance.test.ts:163-198
removed never live         features/seo/__tests__/metrics.test.ts:50,112-160
partial keyword reports    features/seo/__tests__/searches-screen.test.tsx:210
no LinkedIn                __tests__/foundation.test.tsx:45, __tests__/screens.test.tsx:229
```

  Duplicating them under a Decision 6 heading would add noise and a second place
  to maintain the same assertion — the trap §11 names.
- Nothing reads or writes a metric. `publisher.ts` still sets `insights: null`.

## Known issues

Carried over from session 8, plus:

1. **`SocialPost.insights` cannot say which platform a number belongs to.** One
   field, up to three targets. Reach is per-platform and `remoteId` lives on the
   target, so a durable row must key on the target. Recorded in the type itself.
2. **Instagram post insights are UNVERIFIED on the chosen auth path**, and
   Facebook has no provider contract. Post-level metrics cannot be designed
   responsibly until `api-researcher` establishes both.
3. **Timezone semantics for a metric's own calendar day are unresolved.** GBP
   returns `GoogleDate` on Google's day boundary, which is not necessarily the
   business's IANA zone. Left open for the schema review rather than assumed.
4. **`Metric.value` is non-nullable and `toMetrics()` omits unknowns**, so the
   app cannot currently express "we asked and got nothing" as a value. A nullable
   stored value would express something the app has no representation for.
5. **`view.ts` reads `post.insights.reach` directly.** Moving metrics to a table
   will require changing `buildPostsView`'s input — a Social domain change, out
   of scope here, and it means the table alone will not light up the UI.

## Things future engineers must NOT change

Everything from sessions 1-8, plus:

- **Never turn a threshold into a count.** `below_threshold` is a bound, not a
  value. Rendering it as a number fabricates data; rendering it as 0 breaks
  "unknown is not zero" twice.
- **Never store `changePct`.** It is derived by `changePercent()`; storing it
  creates a second truth that can disagree with its own inputs.
- **Never resurrect a `REMOVED_METRICS` key.** Twelve metrics Google deleted in
  2023 must render `unavailable('not_supported')` forever, not "coming soon".
- **Never drop coverage metadata.** `reportedDays < totalDays` makes a total a
  floor, not a fact, and the caller must be able to say so.
- **`business_id` goes directly on every metric row** and is the RLS boundary. Do
  not reach it through another table as the sole boundary.
- **Metrics are server-written only.** Client SELECT by membership; INSERT,
  UPDATE and DELETE denied — and denied by explicit `REVOKE`, because
  `auto_expose_new_tables` defaults to `true` and an absent policy is not an
  absent privilege.
- **Prefer a service-role background collector over a client-callable
  SECURITY DEFINER writer.** Any definer function must pin `search_path`.
- **`captured_at` is when Shoogle learned the value.** It is not the metric's own
  day, and the two must stay separate columns.

## Next recommended step

Decision 7 (provider credentials), then token encryption at rest, then media and
carousels. Separately, commission `api-researcher` for Instagram and Facebook
insight surfaces — that research gates post-level metrics and is calendar-time
work worth starting before it blocks anything.

---

## Date

2026-09-16 (session 10 — Decision 7: provider credentials and secret boundaries)

## What I changed

Settled where provider credentials live and how the client is kept away from
them. **No OAuth, no token exchange, no refresh, no encryption, no server relay,
no `provider_connections`, no `private.provider_credentials` — none of that was
implemented, and no credential exists anywhere in the repository.** What was
built is the boundary that stops one appearing in the wrong place.

- **`GbpSession` annotated as a migration blocker.** Its `accessToken` is a
  client-side field, which the chosen relay design (7j) removes. Recorded rather
  than changed: rewriting the seam without a server behind it would be a worse
  lie than an honest blocker.
- **`keySafety.test.ts` generalised** from one Gemini key to every server-side
  secret name, with four assertions each.
- **`__tests__/credential-boundary.test.ts`** — new: client-facing connection
  types declare no credential field, device storage is allowlisted, and the
  `private` schema stays out of `[api] schemas`.
- **`PROVIDER_CREDENTIAL_ENCRYPTION_KEY`** declared by NAME in
  `.env.local.example` (7c). Unprefixed, server-only. No value.

## Files changed

```
features/gbp/provider.ts                   GbpSession + GbpTransport annotations
features/social/__tests__/keySafety.test.ts generalised to all server secrets
__tests__/credential-boundary.test.ts       (new)
.env.local.example                          encryption key NAME only
docs/agent-memory/foundation-changes.md
```

`package-lock.json` untouched. No dependency added. No secret value anywhere.

## Decisions made

1. **7a** — one credential row per provider connection; Facebook's Page token is
   an additional field on that row, not a second row.
2. **7b** — application-level server-side encryption. The database stores
   ciphertext, never plaintext provider tokens. Supabase Vault was NOT chosen:
   its behaviour is version-dependent and nothing in this repository verifies
   it, so recommending it would have been guessing.
3. **7c** — the encryption key is server environment configuration, with a
   `key_id` stored beside the ciphertext so rotation is a re-encryption rather
   than a redesign. External KMS deferred.
4. **7d** — replace credentials in place. Obsolete versions are not retained: a
   rotated token is already dead at the provider, and keeping it only enlarges
   what a future leak yields.
5. **7e / 7l** — one ACTIVE connection per (business, provider), with the
   selected provider sub-identity stored as connection metadata. Facebook Pages
   and GBP locations are NOT separate Shoogle connections yet.
6. **7f** — owner-facing state on `provider_connections`; mechanical credential
   state with `private.provider_credentials`.
7. **7g** — the full display-safe metadata set, preserving `eligible_page_ids`
   null-vs-`[]` semantics. Tokens, ciphertext, `key_id`, client secrets,
   service-role credentials and raw provider error payloads never reach the
   client. Token expiry timestamps are withheld too, absent a product need.
8. **7h** — three independent barriers on the credentials table: `private` stays
   out of `[api] schemas`, `REVOKE ALL` from `anon` and `authenticated`, and RLS
   enabled with no client policies.
9. **7i** — `provider_connections` is SELECT-only from the client. Connect and
   disconnect are server-side flows.
10. **7j** — a **server relay**. The client keeps building `GbpRequest`s; the
    adapter posts them to a Shoogle endpoint that resolves the credential and
    forwards. The client never holds a provider token. The server must resolve
    authenticated caller → membership → business → connection → credential, and
    must verify the connection belongs to the same business as the operation.
    **Never resolve a credential by provider alone.**
11. **7k** — `ConnectableProvider` business scoping is fixed in the same change
    that registers the first real provider. CF1 remains a recorded blocker.
12. **7m** — disconnect attempts provider revocation, then deletes credentials,
    then marks the connection disconnected. A failed revocation must never be
    reported as a successful one.
13. **7n** — both guards: the generalised `keySafety.test.ts` and the existing CI
    secret-pattern scan.

## Current state

- `npm run typecheck` and `npm run lint` clean. **2744 tests pass, 1 skipped,
  62 suites** (2707 at the previous checkpoint; +37, no regressions). Most of the
  increase is `it.each` expanding the secret guard across seven names.
- **No provider credential exists in this repository**, in any form. No provider
  is registered, `GbpProviderDeps.transport` defaults to `null`, `getSession` is
  injected, and nothing constructs a `GbpSession`. No token has ever been on a
  device.
- `lib/env` still exposes exactly five publishable values, now pinned by a test.

## Known issues

Carried over from session 9, plus:

1. **`GbpSession.accessToken` is the migration blocker.** The client-side GBP
   code is written around holding a token (`GbpTransport.send(request,
   accessToken)`). The relay removes it, but only the server can. Until then the
   field is ephemeral: never persisted, never logged.
2. **CF1 remains** — `ConnectableProvider` takes no `businessId` and the registry
   is a process-global `Map`, while credentials are per-connection per-business.
   Blocker for the first real provider registration.
3. **`features/seo/ai/gemini.ts` reads `GEMINI_API_KEY` from `process.env` in
   client code.** Found by the generalised guard, which the narrower Gemini-only
   version never checked. It is NOT an exposure — the variable is unprefixed, so
   Expo does not inline it and the value is `undefined` on a device, and the
   client is gated on `__DEV__` plus fixture mode. It is now an explicit,
   justified allowlist entry rather than an unnoticed one.
4. **Two unreconciled connection-state axes** — `ConnectionStatus` (6 values) and
   `PlatformConnection.authorization` (3). Plus three overlapping connection
   types. Reconcile when CF1 is fixed, not before.
5. **`keySafety.test.ts` now asserts repo-wide facts from a feature folder.** It
   always did (`git grep` from the repo root), but the scope is now obviously
   wider than `features/social`. Moving it to `__tests__/` is a tidy-up.
6. **Shoogle's own session is in AsyncStorage, which is not encrypted**, and
   `expo-secure-store` is installed but unused. Distinct from provider
   credentials and still open.

## Things future engineers must NOT change

Everything from sessions 1-9, plus:

- **Provider access, refresh and Page tokens never reach the client** — not in
  the bundle, not in AsyncStorage, not in an `EXPO_PUBLIC_` variable, not in a
  connection type the client can read.
- **Never resolve a credential by provider alone.** Resolve through the
  authenticated caller's membership to a business, then its connection. A job
  that skips this publishes one business's content to another's account, and RLS
  cannot stop it because service role bypasses RLS.
- **Never add a `SECURITY DEFINER` function that returns a token.** That is a
  client-callable exfiltration endpoint.
- **Never put a secret in `lib/env`.** It is the only `process.env` reader and
  everything it exports is publishable; its key set is pinned by a test.
- **Never relay a raw provider error payload to the client.** Provider errors
  echo request URLs, which can carry the access token.
- **Authorization codes, PKCE verifiers and `state` are ephemeral.** Instagram's
  code is single-use and valid one hour; none of them is ever persisted.
- **Concurrent credential refresh needs row locking.** Without it one worker
  persists a token the provider has already rotated away, and the connection
  breaks silently.

## Next recommended step

Decision 8. Separately, the provider research below gates all credential
implementation and is calendar-time work: start it before it blocks anything.

Still UNVERIFIED and not to be guessed: Instagram refresh-token rotation and
revocation behaviour; **Facebook Page-token expiry and refresh**; Google
refresh-token issuance, rotation and expiry; the OAuth verification category for
`business.manage`; and Meta per-permission App Review requirements. The external
gates — GBP API access approval, Meta Business Verification and App Review —
remain on the critical path.

---

## Date

2026-09-16 (session 11 — Decision 8: the Phase 1 schema, as local migrations)

## What I changed

Wrote the first real Shoogle database schema as local, version-controlled
migrations. **Nothing was applied to the remote project** *at the time of this
session*. No `supabase db push`, no `db reset`, no dashboard action; the linked
project was untouched and these were files on disk awaiting review.
**Superseded by session 12: the schema has since been applied to the remote
project.**

Four requirements from Decisions 1-7 were underspecified and were resolved by
the product owner before any SQL was written, rather than guessed: `posts.media`
is omitted (Decision 4c's approved C1 depends on a deferred `MediaAsset` field,
so a bare column would have been the option that was NOT approved);
`metric_definitions` is created empty (the TypeScript registries stay the single
source of truth); `profiles` SELECT is own-row-only; `metric_definitions` is
readable but never client-writable.

## Files changed

```
supabase/migrations/20260916120000_schemas_and_helpers.sql        (new,  51)
supabase/migrations/20260916120100_profiles.sql                   (new,  48)
supabase/migrations/20260916120200_businesses_and_membership.sql  (new, 316)
supabase/migrations/20260916120300_provider_connections.sql       (new, 186)
supabase/migrations/20260916120400_posts.sql                      (new, 252)
supabase/migrations/20260916120500_metrics.sql                    (new, 203)
supabase/tests/rls_verification.sql                               (new, 240)
docs/agent-memory/foundation-changes.md
```

No application code changed. `package-lock.json` untouched. `supabase/` is still
UNTRACKED in git — the migrations are not yet under version control.

## Decisions made

1. **Nine tables**: `public.profiles`, `businesses`, `business_members`,
   `provider_connections`, `posts`, `post_targets`, `metric_definitions`,
   `metric_snapshots`, and `private.provider_credentials`.
2. **Two composite foreign keys do real work.**
   `private.provider_credentials (connection_id, business_id)` references
   `provider_connections (id, business_id)`, so a credential cannot claim a
   business its connection does not belong to — it is unwriteable, not merely
   wrong. `metric_snapshots (metric_key, metric_is_live)` references
   `metric_definitions (metric_key, is_live)`, which is how a removed metric
   key becomes unstorable without a trigger.
3. **`authorization` became `authorization_state`.** AUTHORIZATION is a reserved
   word in PostgreSQL and would need quoting at every use site. Same three
   values, same meaning. Recorded here because it deviates from Decision 7g's
   wording.
4. **`service_role` is granted explicitly on every table** rather than inheriting
   from the project's default privileges. Found by running the migrations: a
   server job otherwise depends on a project setting rather than on this
   migration, which is not deterministic on a fresh database.
5. **No `FORCE ROW LEVEL SECURITY`.** `service_role` bypasses RLS through its
   role attribute regardless, so FORCE would only remove the table owner's
   exemption — and the owner is `postgres`, which migrations and maintenance run
   as. The operational footgun outweighs the benefit here.
6. **`create_business()`** takes no arguments, so impersonation is unexpressible
   rather than refused. Null `auth.uid()` raises SQLSTATE 28000. Idempotent for
   bootstrap, with `pg_advisory_xact_lock` on the caller closing the
   double-call race.
7. **`metric_snapshots` uses `NULLS NOT DISTINCT`** on its natural key. Verified
   to be load-bearing, not decorative — see Known issues.

## Current state

- `npm run typecheck`, `npm run lint` clean. **2744 tests pass, 1 skipped, 62
  suites** — unchanged, because no application code was touched.
- All six migrations apply cleanly to a fresh database.
- `rls_verification.sql`: **14 of 14 assertions pass**.
- Constraint probes: 9 of 9. Metric-semantics probes: 8 of 8.
- Verified privileges: `authenticated` holds **no privilege of any kind** on the
  `private` schema. All four SECURITY DEFINER functions have `search_path` pinned
  to the empty string.

**How it was verified without the remote project.** Docker was not running, so
validation used disposable local PostgreSQL clusters in the scratch directory on
non-default ports, with a minimal `auth` schema stub. PostgreSQL 15 was used for
the authoritative run because `NULLS NOT DISTINCT` needs 15 or newer; the
clusters were destroyed afterwards. This never touched the remote project.

## Known issues

**Two real defects were found by RUNNING the migrations rather than reading
them. Reading would have found neither. Both were reported, approved, fixed and
re-verified within this session; they are recorded here because the reasoning
matters more than the diff.**

1. **A live metric could never be retired once it had a snapshot.** The composite
   foreign key had no `ON UPDATE` action, so
   `update metric_definitions set is_live = false` failed with SQLSTATE 23503
   against any existing snapshot. Decision 6h says metrics survive and 6i says
   removed metrics are unstorable; the only way to satisfy both when a provider
   retired a metric already collected would have been to delete real history —
   and Google retiring metrics is not hypothetical, it happened in 2023.
   **Fixed:** `on update cascade` on the foreign key, and the now-redundant
   `metric_snapshots_only_live_metrics` CHECK removed (a new row defaults
   `metric_is_live` to true, which is what keeps new writes live-only).
   Re-verified: the metric retires, three historical snapshots survive with
   `metric_is_live` cascaded to false, new snapshots for that key are rejected,
   and an unknown key is still rejected.

2. **The last-owner guard did not hold under REPEATABLE READ.** It locked the
   `businesses` row, which serialises two concurrent departures but does NOT
   refresh the snapshot their count reads from. Two transactions at REPEATABLE
   READ both committed and left a business with **zero owners** — the
   unrecoverable state Decision 5d exists to prevent, because every policy routes
   through membership so nobody can repair it. READ COMMITTED (the PostgREST
   default) and SERIALIZABLE were both safe; only REPEATABLE READ was exposed.
   **Fixed:** also lock the surviving `business_members` rows before counting, so
   a row a concurrent transaction already deleted raises a serialization failure
   instead of being counted as still present. Re-verified at both isolation
   levels: exactly one transaction fails (`could not serialize access due to
   concurrent update` under REPEATABLE READ, the guard's own message under READ
   COMMITTED), one owner remains, business deletion still cascades cleanly, and
   all 14 RLS assertions still pass.

Still open, plus smaller observations:

3. ~~**`supabase/` is untracked.**~~ RESOLVED in session 12: committed as
   `2a7dbb3`, and the branch has been pushed.
4. **`metric_definitions` is empty**, so `metric_snapshots` currently rejects
   every insert. Deliberate — nothing writes metrics — but it means the table is
   not usable until the collector seeds it.
5. **Nothing creates a `profiles` row.** The policy permits a user to insert
   their own, but no code does, and `SessionUser.displayName` still reads
   `user_metadata`.
6. **`provider_connections` does not constrain `status` against
   `disconnected_at`.** A row could claim `status = 'connected'` while carrying a
   disconnection timestamp. The partial unique index keys off `disconnected_at`,
   so that column is the one that matters, but the two can disagree.
7. **`metric_snapshots` has no `updated_at`.** `captured_at` carries when Shoogle
   learned the value, which is the fact that matters for an upsert.

## Things future engineers must NOT change

Everything from sessions 1-10, plus:

- **Do not add `private` to `[api] schemas` in `supabase/config.toml`.** That is
  the primary barrier for provider credentials, not RLS.
- **Do not grant any privilege on `private.provider_credentials`** to `anon` or
  `authenticated`. It has RLS on, zero policies, and zero grants; all three are
  deliberate.
- **Do not remove `NULLS NOT DISTINCT`** from the metric natural key. Without it
  two rows with a NULL `location_id` are treated as distinct and the constraint
  silently stops constraining — demonstrated during this session on a PG14
  cluster where the clause could not be parsed.
- **Do not replace the last-owner constraint trigger with a policy.** A policy
  cannot count what would remain after a statement.
- **Do not give `create_business()` a `user_id` parameter.**
- **Do not drop the `WITH CHECK` on `posts_update_members`.** Without it a member
  could move a post into a business they do not belong to.
- **Do not null the `failure_*` columns on a skipped target.** A skip with no
  failure is the owner's choice; a skip with one is Shoogle failing to reach the
  platform, and collapsing them breaks product rule 13.

## Next recommended step

**Superseded by session 12 — both steps below are now done.** `git add supabase/`
(committed as `2a7dbb3`) and applying to the remote project, whose review gate
was cleared by Decisions 1-8 being approved one at a time.

A lesson worth carrying: both defects in this schema were invisible to review and
obvious to execution. Any future migration should be applied to a disposable
database and probed before it is considered reviewed.

---

## Date

2026-09-16 (session 12 — the Phase 1 schema applied to the remote project)

## What I changed

Nothing in the repository except this log. The change is to the world outside it:
**the Phase 1 schema now exists on the remote Supabase project.**

`npx supabase db push` applied all six migrations to project
**`dkzizcaapnpkvmcmobfr`**, in order and without error:

```
20260916120000_schemas_and_helpers.sql
20260916120100_profiles.sql
20260916120200_businesses_and_membership.sql
20260916120300_provider_connections.sql
20260916120400_posts.sql
20260916120500_metrics.sql
```

`npx supabase migration list` then reported all six present remotely with
versions matching local exactly — no migration skipped, none left pending.

The review gate the handover set for this was cleared first: Decisions 1-8 were
each approved individually, the SQL was reviewed statement by statement, two real
defects were found by executing it and were fixed, and all five commits were
pushed to `origin/feature/yash-social` before anything touched the remote.

## Files changed

```
docs/agent-memory/foundation-changes.md   this entry, plus three stale
                                          session-11 statements corrected
```

No application code, no migrations, no `package-lock.json`.

## Decisions made

None. This session executed an already-approved plan; it settled nothing new.

## Current state

- The remote project holds the Phase 1 schema as defined by the six migrations:
  the eight `public` tables, the `private` schema with `provider_credentials`,
  the membership helper functions, `create_business()`, the last-owner constraint
  trigger, the RLS policies and the grant/revoke configuration.
- The repository is unchanged from `3d3c195` apart from this entry.
- `npm run typecheck`, `npm run lint` and the Jest suite were last green at
  `3d3c195`: 2744 passed, 1 skipped, 62 suites.

**What was verified, precisely.** The `db push` output and `migration list` are
the evidence: they establish which migrations RAN and that local and remote
histories agree. They do not describe the resulting objects.

## Known issues

1. **Remote drift was NOT verified.** `npx supabase db diff --linked` could not
   run: it builds a shadow database in Docker and the local daemon was not
   running (`LegacyImagePrepullError`). So no comparison between the remote
   schema and these migrations has been performed, and none should be claimed.
2. **No direct inspection of the remote objects was performed.** Nobody has
   queried the remote for its tables, policies, grants or functions. That the
   migrations applied cleanly is good evidence they produced what they describe,
   but it is inference, not observation. Verifying it needs either Docker (for
   `db diff`) or a direct psql session with the database password.
3. **`metric_definitions` is empty on the remote**, so `metric_snapshots` will
   reject every insert until a collector seeds it. Deliberate — nothing writes
   metrics yet — but it is now true of a real database rather than a plan.
4. Carried over from session 11: nothing creates a `profiles` row;
   `provider_connections` does not constrain `status` against `disconnected_at`;
   `metric_snapshots` has no `updated_at`.

## Things future engineers must NOT change

Everything from sessions 1-11. The rules that previously protected a design now
protect live tables, so the cost of breaking one has gone up:

- **The remote schema is migration-managed.** Do not create, alter or drop
  objects through the Supabase dashboard. A dashboard change is invisible to
  `supabase/migrations/` and the next `db push` will not know about it.
- **Do not edit an applied migration file.** These six are now part of the remote
  history. Change the schema with a NEW timestamped migration.

## Next recommended step

Verify the deployment independently, since this session could not:
`npx supabase db diff --linked` with Docker running, or
`psql "<connection string>" -f supabase/tests/rls_verification.sql`, which is
transactional and rolls back. Then Decision 9.
