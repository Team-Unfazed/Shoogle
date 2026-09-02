# Aryan — handover

Where the Home vertical stands and what to pick up next. Read this first, then
`aryan-changes.md` for the reasoning behind the decisions already made.

**Owner:** Aryan · **Branch:** `feature/aryan-dashboard` · **Last commit:** `cf34049`
**Owns:** `features/dashboard/`, `features/billing/`, `app/(tabs)/index.tsx`,
`app/(tabs)/settings.tsx`, `app/notifications.tsx`
**Also:** named review owner for shared `components/` and `theme/`

---

## Done — 2026-09-03

### The Home data layer

Home was rendering the wireframe fixture straight to screen. It now has a real
aggregation layer, and the fixture goes through it like any other source.

| File | What it is |
|---|---|
| `features/dashboard/types.ts` | View model + the shapes Home needs from other features |
| `features/dashboard/aggregate.ts` | Pure aggregation — tiles, alert, module rows, view model |
| `features/dashboard/suggestions.ts` | Derivation + ranking of what Shoogle proposes next |
| `features/dashboard/fixtureSources.ts` | Fixture decomposed into provider-shaped sources |
| `features/dashboard/useHome.ts` | The only stateful file in the feature |
| `features/dashboard/index.ts` | Barrel (was `export {}`) |
| `__tests__/aggregate.test.ts`, `__tests__/suggestions.test.ts` | 40 tests |

`app/(tabs)/index.tsx` now renders a finished view model and decides nothing
itself. `app/(tabs)/settings.tsx` imports through the barrel instead of reaching
into `components/` directly.

### The three decisions worth remembering

1. **Home has no provider, and should not get one.** It aggregates summaries
   that Social, SEO and Website own. Those features adapt their own types down
   to `SocialSummary` / `SeoSummary` / `WebsiteSummary`. `lib/` was not touched.

2. **Independent facts stay independent; combined facts refuse to be partial.**
   Metric tiles each keep their own state, so one dead provider does not blank
   the tile beside it — `combineData()` is deliberately not used there. Anything
   summed *across* sources requires every contributor ready, because a total
   missing a provider is a lie told with a real-looking number.

3. **A suggestion may only be derived from a `ready` source.** Proposing "reply
   to 2 reviews" while SEO is still loading sends the owner to a screen that
   contradicts the card that sent them.

### Verified

`npm run typecheck && npm run lint && npm test` — **2258 tests, 44 suites, all
pass.** The four pre-existing Home screen tests pass unchanged, so the rewiring
is behaviour-preserving.

### Housekeeping

- `feature/aryan-dashboard` created off `main` and pushed.
- Stale `ARYAN-SINGH` branch deleted (had no commits).
- `package-lock.json` reverted after npm stripped the emnapi entries that commit
  `69a2069` added to keep `npm ci` alive in CI. **Watch for this** — if it
  reappears after an `npm install`, do not commit it.

---

## Pending — in the order I would do it

### 1. Open the PR  ·  small

`feature/aryan-dashboard` → `main`. CI runs typecheck, lint, tests, Android
bundle and the secret scan. Nothing is blocking it.

Check while you are in GitHub Settings: `foundation-changes.md` records that
**branch protection on `main` was never enabled** and the default branch may
still be `master`. That is a five-person problem, not just yours.

### 2. Razorpay research  ·  medium  ·  blocks all of billing

`features/billing/` is still `export {}`. The contract is already written at
`lib/providers/contracts.ts:203` — `listPlans`, `getSubscription`,
`startCheckout`, `cancel`.

CLAUDE.md requires the `api-researcher` agent to run and its report to be
committed to `docs/research/` **before** any integration code. Do not guess at
pricing, KYC, settlement timelines or the India-specific rules.

Two constraints the contract has already settled:

- **`priceInPaise: number`** — integer paise, never floats. ₹499 is `49900`.
- **`startCheckout` returns a `checkoutUrl`** — hosted checkout only. *"No card
  data ever touches Shoogle."* Never build a card form.

The one that will shape your design: the Razorpay **key id** may be
`EXPO_PUBLIC_`, the **key secret** may never be. Order creation therefore cannot
happen on-device. Settle where it does happen before writing the provider.

Note `BillingProvider` deliberately does not extend `ConnectableProvider`, and
`ProviderId` has no `razorpay` entry — billing is subscription state, not an
OAuth-linked account. Do not force it through `registerProvider()`.

### 3. Build the billing surface  ·  large  ·  after research

Plans screen, subscription state, the Settings → Subscription row (currently a
`notBuilt` toast at `app/(tabs)/settings.tsx:149`). Everything returns
`DataState`; `status: 'none'` is a real state and must not render as a blank
plan card.

### 4. Subscribe Home to real summaries  ·  small each, as they land

`disconnectedSources()` reports `not_connected` for everything, which is
currently the literal truth. As each engineer exports a summary from their
barrel, subscribe to it in `useHome.ts`. Nothing else changes — that is the
point of the seam.

- Yash → `SocialSummary` (scheduled / draft / failed counts)
- Pranay → `SeoSummary` (unanswered reviews, improved keywords — nullable)
- Devashish → `WebsiteSummary` (`none` / `draft` / `awaiting_review` / `published`)
- Sunny → the real `Business` and `ProviderConnection[]`

Ask each of them to export the adapter from their own `index.ts`. Do not write
it for them inside their folder.

### 5. Dead controls on Home and Settings  ·  medium

CONTRIBUTING's PR checklist says **no new dead controls**, and several existing
ones predate this session:

- `SuggestCard` **Skip** only toasts. Product rule 5 says skip and pause must
  always be easy — which implies it must also *persist*. A skip that comes back
  on the next render is worse than no skip button.
- **"N more"** on the suggestion card goes nowhere; there is no suggestions
  screen.
- **Business switcher** in `BusinessHeader` routes to the Business tab rather
  than switching business. Multi-business may be out of scope for v1 — if so,
  make the header non-pressable rather than leaving a control that lies.
- `MetricTile` accepts `onPress` and nothing passes it.
- Nine `notBuilt` rows in Settings. Each currently says so honestly, which is
  acceptable, but they are a running debt.

### 6. Notifications  ·  medium

`app/notifications.tsx` is an honest empty state and nothing produces a
notification. `HomeSources.unreadNotifications` is already a `DataState<number>`
waiting for a real source. The bell dot only appears when the count is *known*
and greater than zero — keep it that way.

### 7. The content engine  ·  large  ·  probably not yours alone

The `content`-kind suggestion — a drafted post ready to schedule — is the thing
that makes Shoogle an operator rather than a report. Nothing derives it; it
arrives on `sources.suggestions`. Today only the fixture supplies one. Worth a
team decision about who owns generation before you build around it.

---

## Rules that must not be quietly broken

These are load-bearing. If a future change needs one of them relaxed, raise it
with the team rather than editing around it.

- **Do not use `combineData()` for metric tiles or module rows.** It collapses
  to one non-ready state and would blank three tiles because one provider is
  down.
- **Do not add a numeric fallback to the aggregation.** `DataState.ts` has no
  `unwrapOr(state, 0)` on purpose. No value means a dash and a reason.
- **Do not derive a suggestion from a non-ready source.**
- **Do not turn `not_connected` into the Home alert.** It is an offer, not a
  fault; as a red banner it nags every owner who does not use that provider.
- **Do not edit `components/ui/`, `components/shared/`, `theme/` or `lib/`** to
  make a feature work — including your own. You review those; you do not get to
  skip the review.
- **Run `npm run typecheck && npm run lint && npm test` before every commit.**
