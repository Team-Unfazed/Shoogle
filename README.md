# Shoogle

An AI marketing operator for Indian local businesses — salons, gyms, clinics,
restaurants, bakeries, boutiques and repair shops.

Native **Android-first** React Native app, built with Expo. Runs in Expo Go for
development and ships to Google Play as an Android App Bundle via EAS.

> **Status: frontend foundation.** The app shell, design system, routing,
> provider contracts and testing setup are in place. **No integration is
> implemented** — not Google Business Profile, Meta, LinkedIn, billing, AI
> generation, website generation, publishing or scheduling. The UI reports this
> honestly rather than simulating it.

---

## Getting started

```bash
npm install
cp .env.local.example .env.local     # then fill in the values you have
npx expo start
```

Scan the QR code with **Expo Go** on an Android device, or press `a` for a
connected emulator. The app runs without `.env.local` — Settings › Diagnostics
will name which variables are missing.

### Commands

| Command | What it does |
|---|---|
| `npx expo start` | Dev server + QR code for Expo Go |
| `npm run android` | Launch on a connected device or emulator |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npm test` | Jest + React Native Testing Library |
| `npm run build:android:preview` | Internal-distribution APK via EAS |
| `npm run build:android:production` | Play Store AAB via EAS |

---

## Requirements

- Node 20+
- **Expo Go** on an Android device, or an Android emulator (API 24+)
- An [Expo account](https://expo.dev) for EAS builds

Everything the foundation uses is available inside Expo Go, so **no custom
development build is required yet**. That changes the first time a feature needs
a native module Expo Go does not bundle — Google Sign-In and in-app purchases
are the likely triggers. See `docs/android-release.md`.

---

## Project layout

```
app/                 Expo Router routes (four tabs: Home, Posts, Business, Settings)
components/ui/       Design-system primitives
components/shared/   App shell — Screen, TopBar, error/loading boundaries
theme/               Design tokens (single source of truth)
lib/                 Env, provider contracts + registry, DataState, Supabase
features/            One folder per engineer, isolated
fixtures/            Development-only data, gated and clearly labelled
docs/                Agent memory and API research
```

Read `CLAUDE.md` before contributing — it carries the product rules the code
enforces and the boundary rules that keep five engineers out of each other's way.

---

## Design

The visual source of truth is the Claude Design project **"Shoogle Mobile App"**.
Colours, type scale, control geometry, radii and badge states in `theme/tokens.ts`
are transcribed from its design-system reference, and `__tests__/foundation.test.tsx`
pins those values so a drift is a test failure.

Two families are bundled: **Sora** (display, screen titles) and **Manrope** (all
UI text).

---

## Honest data

The single rule that shapes most of this codebase: **unknown is not zero.**

Anything crossing the network is a `DataState<T>` —
`loading | ready | unavailable | error` — and screens render it through
`<DataStateView>`, which turns each case into the right UI. `Metric` and `Score`
accept `number | null` so an unmeasured value cannot be typed as `0` by accident.

A metric we have not fetched, cannot fetch, or that a provider does not expose
renders as `—` with a stated reason. It never renders as `0`, an empty chart, or
a flat trend line.

---

## Secrets

Copy `.env.local.example` to `.env.local`. It is git-ignored.

**Anything prefixed `EXPO_PUBLIC_` is compiled into the APK and is readable by
anyone who downloads the app.** Only publishable identifiers belong there — the
Supabase anon key (protected by RLS), OAuth *client ids*, the Razorpay *key id*.
Service role keys, OAuth client secrets and the Gemini key are server-side only
and are deliberately unreachable from `lib/env`.

Never commit real values.

---

## Play Store

Not published. Release configuration lives in `eas.json` and `app.config.ts`
(package `com.shoogle.app`, `targetSdkVersion` 36). See `docs/android-release.md`
for the steps that still need doing.
