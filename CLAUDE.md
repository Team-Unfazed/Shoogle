# Shoogle — engineering guide

Shoogle is an **AI marketing operator** for Indian local businesses: salons,
gyms, clinics, restaurants, bakeries, boutiques and repair shops.

This is a **native Android-first React Native app** built with Expo. It runs in
Expo Go during development and ships to Google Play as an Android App Bundle via
EAS Build.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Expo SDK 57, React Native 0.86, React 19.2 |
| Routing | Expo Router 57 (file-based, typed routes) |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` |
| Styling | Typed design tokens + `StyleSheet` (see below) |
| Backend | Supabase (`@supabase/supabase-js`, AsyncStorage session persistence) |
| Testing | Jest (`jest-expo`) + React Native Testing Library 14 |
| Release | EAS Build / EAS Submit, `targetSdkVersion` 36 |

### Why not NativeWind / Tailwind

NativeWind v4 is not validated against React Native 0.86 with the React
Compiler (which this project enables), and v5 is preview-only. Putting a preview
dependency under five parallel engineers was not an acceptable risk. Styling
uses a typed token module instead, which also gives strict-TypeScript
autocomplete that `className` strings cannot. See
`docs/agent-memory/foundation-changes.md`.

---

## Commands

```bash
npm start                 # Expo dev server — scan the QR code with Expo Go
npm run android           # open on a connected device/emulator
npm run typecheck         # tsc --noEmit
npm run lint              # expo lint
npm test                  # jest
npm run build:android:production   # EAS production AAB
```

Run `npm run typecheck && npm run lint && npm test` before every commit.

---

## Layout

```
app/                   Expo Router routes ONLY
  _layout.tsx          provider stack (order matters — see the file)
  index.tsx            splash / route decision
  (auth)/              unauthenticated group
  (tabs)/              the four primary tabs
components/ui/         design-system primitives  ← SHARED, change with care
components/shared/     app shell (Screen, TopBar, boundaries)  ← SHARED
theme/                 design tokens  ← SHARED, single source of truth
lib/
  env/                 typed public env access
  providers/           provider CONTRACTS + runtime registry
  state/DataState.ts   the loading/ready/unavailable/error model
  supabase/            client factory
features/<name>/       one folder per engineer — see each README
fixtures/              development-only fake data, dev-gated
types/                 cross-feature domain types
docs/
  agent-memory/        session log — update it every session
  research/            api-researcher output
```

---

## The product rules the code enforces

1. **Shoogle is an operator, not a CRM.** Propose and do work; do not build
   record-keeping surfaces.
2. **Minimise owner input.** Every field you add is a cost.
3. **Never ask for what can be retrieved.** Hydrate from a connected provider
   first. `Input` has a `prefilledFrom` prop for exactly this.
4. **Posts are scheduled by default.** "Post now" is the secondary action.
5. **Skip and pause must always be easy** — one tap from the list.
6. **Never show fake metrics.**
7. **Unknown is not zero.** This is enforced by types: `Metric` and `Score`
   take `number | null`, and everything crossing the network returns
   `DataState<T>`. There is deliberately no `unwrapOr(state, 0)`.
8. **Never claim an integration exists when it does not.** The provider
   registry answers `not_connected` until a feature registers a real one.
9. **Never present fixture data as customer data.** Fixtures are dev-gated and
   force a visible banner.
10. **No progress theatre.** Indeterminate spinners are fine; fake percentages
    and self-ticking checklists are not.
11. **No unnecessary onboarding.**
12. **English UI.** Generated *business content* may be Hindi/Marathi/Hinglish.

---

## Working rules for engineers

- **Stay in your feature folder.** Ownership is listed in each
  `features/*/README.md`. Do not edit another engineer's folder.
- **Do not edit `components/ui/`, `components/shared/`, `theme/` or `lib/` to
  make one feature work.** They are shared. Missing a variant? Add it there
  *with a test*, and tell the team.
- **Never hard-code a colour, radius, font size or spacing value.** Import from
  `@/theme`.
- **Register providers at runtime** with `registerProvider()`. Never edit
  `lib/providers/registry.ts` to add yours — that would put five engineers on
  one line.
- **Research before you integrate.** Run the `api-researcher` agent
  (`.claude/agents/api-researcher.md`) and commit its report to `docs/research/`.
  Do not guess scopes, quotas, pricing or review requirements.

## Android specifics that are already handled

`<Screen>` owns safe areas, keyboard avoidance, scroll behaviour and horizontal
padding. `<BottomSheet>` and `<Dialog>` handle the hardware back button. The tab
bar owns the bottom inset — screens inside `(tabs)` must not add it again.

Target viewports: **390×844** and **412×915**. There must be no horizontal
overflow at either.

## Secrets

Only `EXPO_PUBLIC_*` variables exist on-device, and **everything with that
prefix ships inside the APK and is readable by anyone who downloads it.** Only
publishable identifiers may use it. Service role keys, OAuth client secrets and
generation API keys must never be prefixed and must never be imported into the
app. Copy `.env.local.example` to `.env.local`; never commit real values.

## Every session

Update `docs/agent-memory/foundation-changes.md` before you finish. No secrets
in it.
