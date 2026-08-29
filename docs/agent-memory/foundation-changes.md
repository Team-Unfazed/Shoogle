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
