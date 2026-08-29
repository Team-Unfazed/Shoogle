# Contributing to Shoogle

Five engineers work on this repo in parallel. These rules exist so that stays
possible — they are about avoiding collisions and keeping the app honest, not
about ceremony.

Read `CLAUDE.md` first. It carries the product rules the code enforces.

---

## Getting set up

```bash
git clone https://github.com/Team-Unfazed/Shoogle
cd Shoogle
npm install
cp .env.local.example .env.local     # fill in what you have
npx expo start
```

Scan the QR code with **Expo Go** on an Android phone, or press `a` for an
emulator.

The app runs fine without `.env.local` — Settings › Diagnostics names whichever
variables are missing. Sign-in stays unavailable until Supabase is configured
and someone registers a sign-in handler.

**To walk the app before authentication exists**, set `EXPO_PUBLIC_DEV_PREVIEW=1`
in `.env.local` and restart with `npx expo start -c`. The sign-in screen then
offers "Preview the app without signing in". Nobody is signed in and no data is
real — a banner says so on every screen, and it cannot happen in a release build.

---

## Who owns what

| Area | Owner |
|---|---|
| Auth, Supabase, DB, RLS, shared infrastructure | **Sunny** |
| SEO, Google Business Profile, Audit, Business tab | **Pranay** |
| Posts, Carousel, Social | **Yash** |
| Website | **Devashish** |
| Home, onboarding, billing, settings, UX | **Aryan** |

### Files with exactly one owner

| File | Owner |
|---|---|
| `app/(tabs)/index.tsx` | Aryan |
| `app/(tabs)/posts.tsx` | Yash |
| `app/(tabs)/business.tsx` | Pranay |
| `app/(tabs)/settings.tsx` | Aryan |

`app/_layout.tsx` and `app/(tabs)/_layout.tsx` belong to nobody. They are the
app shell. Changing them affects all five features — open an issue first.

> **Devashish has no tab.** Website folded into Business when the app went to
> four tabs, so the Website row lives in *Pranay's* `business.tsx` and points at
> `app/website/`. Those two need to agree before either changes that handoff.

---

## Route namespacing

Expo Router registers files automatically, so adding a screen never means
editing a shared layout. But two people can still pick the same filename. Put
your routes in your own folder:

```
app/social/      Yash
app/seo/         Pranay
app/website/     Devashish
app/account/     Aryan
app/(auth)/      Sunny
```

Only the four tab roots and the shell live directly under `app/`.

---

## Shared code

Some folders are shared by everyone. Editing them directly causes conflicts and
silently changes other people's screens.

| Folder | Change it via |
|---|---|
| `components/ui/`, `components/shared/`, `theme/` | PR reviewed by **Aryan** |
| `lib/` — contracts, registry, `DataState` | PR reviewed by **Sunny** |

If a primitive is missing a variant you need: **add the variant there, with a
test.** Do not fork a copy into your feature folder, and do not restyle one
inline with hard-coded colours or sizes.

**Never hard-code a colour, radius, font size or spacing value.** Import from
`@/theme`. If a token is missing, add it to `theme/tokens.ts` and note it in
`docs/agent-memory/foundation-changes.md`.

---

## Registering a provider

Do **not** edit `lib/providers/registry.ts` to add your integration. Register it
at runtime from your own feature, so no two engineers ever touch the same line:

```ts
// features/social/register.ts
import { registerProvider } from '@/lib/providers';
import { instagramProvider } from './providers/instagram';

registerProvider('instagram', instagramProvider);
```

Until you do, the app honestly reports that provider as `not_connected`.

---

## The rules that are not negotiable

These are enforced by types and tests, not by review. If you find yourself
fighting them, you are probably about to make the app lie.

1. **Unknown is not zero.** Anything crossing the network returns
   `DataState<T>`. `Metric`, `Score`, `StatTile` and `GridMetric` take
   `number | null`. A value we have not fetched, cannot fetch, or that a
   provider does not expose renders as `—` with a reason — never `0`, never an
   empty chart, never a flat trend line.
2. **Never claim an integration exists before it does.** Ask the registry.
3. **Never present fixture data as real.** Fixtures live in `fixtures/`, are
   gated to development, and force a visible banner. ESLint blocks importing
   them into `lib/` or any data layer.
4. **Posts are scheduled by default.** Schedule is primary; "Post now" is
   secondary. Skip and pause stay one tap from the list.
5. **Only report success a provider confirmed.** An optimistic "Published"
   toast is a false claim.
6. **No progress theatre.** Indeterminate spinners are fine. Fake percentages
   and self-ticking checklists are not.
7. **No dead controls.** A button with no implementation must say so — disable
   it, or toast "not built yet". It must never silently do nothing.
8. **English UI.** Generated *business content* may be Hindi/Marathi/Hinglish.

---

## Before you write integration code

Run the API research agent (`.claude/agents/api-researcher.md`) for your
provider and commit its report to `docs/research/`.

Do not guess scopes, quotas, pricing, or review requirements. Google Business
Profile needs an approved quota request; Instagram publishing needs app review
and a Business account linked to a Facebook Page. Building against a guessed API
shape is the most expensive rework available.

---

## Branches and pull requests

`main` is protected. Never push to it directly.

```
feat/<area>-<what>     feat/social-create-post-flow
fix/<area>-<what>      fix/seo-ranking-null-state
chore/<what>           chore/bump-expo-sdk
```

Every PR must pass CI: **typecheck, lint, tests, Android bundle, and the secret
scan.** All five run automatically.

### PR checklist

- [ ] `npm run typecheck && npm run lint && npm test` pass locally
- [ ] New or changed behaviour has a test
- [ ] No hard-coded colours, sizes or spacing
- [ ] Every value from outside the app is a `DataState<T>`
- [ ] Nothing unknown renders as `0`
- [ ] No fixture data reachable outside development
- [ ] No new dead controls
- [ ] Touch targets at least 44pt, and every control has an accessible label
- [ ] No horizontal overflow at 390×844 or 412×915
- [ ] Only your own feature folder and your own files changed

---

## Secrets

`.env.local` is git-ignored. **Never commit real values**, and never paste a
service-role key, OAuth client secret or database password into an issue, a PR
or a chat.

Anything prefixed `EXPO_PUBLIC_` is **compiled into the APK and readable by
anyone who downloads the app**. Only publishable identifiers belong there — the
Supabase anon key (protected by RLS), OAuth *client ids*, the Razorpay *key id*.
Service-role keys, client secrets and the Gemini key are server-side only and
are deliberately unreachable from `lib/env`.

If a secret is ever committed, **rotate it** — removing the commit is not enough.

---

## Every session

Update `docs/agent-memory/foundation-changes.md` with what changed, what you
decided, what is still broken, and what should happen next. No secrets in it.
