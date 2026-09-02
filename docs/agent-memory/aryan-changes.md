# Aryan — Dashboard / Billing / shared review

Session log for the Home vertical. Read this before starting any session and
continue from the recorded state. **No secrets in this file — variable names only.**

Branch: `feature/aryan-dashboard`
Owns: `features/dashboard/`, `features/billing/`, `app/(tabs)/index.tsx`,
`app/(tabs)/settings.tsx`. Named review owner for `components/` and `theme/`
(per `foundation-changes.md`, decision 4).

---

## Date

2026-09-03 · Session 1

## Task

Build the Home data layer: the aggregation that turns other features'
`DataState` sources into the Home view model, plus the suggestion engine.

---

## Starting state

The layout was already built and wired — `HomeParts.tsx` (579 lines) and
`SettingsParts.tsx` (286 lines), transcribed from "Shoogle Home.dc.html". Both
were rendering `homeFixture` directly from `app/(tabs)/index.tsx`, with a
`data === null` branch for the empty state. `features/dashboard/index.ts` and
`features/billing/index.ts` were both `export {}`.

Branch `ARYAN-SINGH` existed locally with zero commits, never pushed.

---

## The design problem, and the decision

Home is the only feature with **no provider of its own**. There is no
`DashboardProvider` in `lib/providers/contracts.ts` and there should not be —
Home aggregates summaries that Social, SEO and Website own. Putting a dashboard
contract in the shared file would mean four engineers editing one file to feed
one screen.

**Decision: the dependency runs the other way.** Home declares the small shapes
it needs in `features/dashboard/types.ts` (`SocialSummary`, `SeoSummary`,
`WebsiteSummary`) and each owning feature adapts its own richer types down to
them, inside its own folder. Nothing in `features/dashboard/` reaches into
anyone else's code, and `lib/` was not touched.

### The two aggregation rules

A dashboard mixes two kinds of fact and they need **opposite** treatment. This
is the core of the session and is documented at the top of `aggregate.ts`:

1. **Independent facts** — metric tiles, module rows, insight chips. Each keeps
   its own state. `combineData()` is deliberately NOT used: it collapses to a
   single non-ready state, which is right for one coherent row and wrong for a
   grid of separate readings. Instagram being unreachable must not blank the
   Google tile beside it.

2. **Combined facts** — anything summed across sources. Every contributor must
   be ready or the whole thing is `unavailable`. A total that silently omits a
   provider is not a partial answer, it is a wrong one. `combinedTotal()` uses
   `combineData()` for exactly this, and an empty list is `insufficient_data`,
   never `0`.

Nothing on Home renders a cross-provider total today. `combinedTotal()` exists
so the first person who wants one finds the honest implementation instead of
reducing over `unwrapOrNull` and defaulting the gaps to zero.

### The suggestion engine

`suggestions.ts` enforces one rule: **a suggestion may only be derived from a
`ready` source.** "Reply to 2 reviews" is a claim that two reviews exist; if
SEO is loading or errored we do not know that, and proposing it sends the owner
to a screen that contradicts the card that sent them. Every branch is gated on
`isReady` and there is no guessing fallback.

Ranking is `blocked > content > attention > nudge`, tie-broken by id. `content`
sits above `attention` on purpose — proposing prepared work IS the product
(rule 1); a surface that only ever lists chores is the CRM we said we would not
build. The id tie-break stops the headline card flickering between two
equal-weight suggestions across refreshes.

---

## Files changed

```
features/dashboard/types.ts               (new)  the view model + source shapes
features/dashboard/aggregate.ts           (new)  pure aggregation
features/dashboard/suggestions.ts         (new)  derivation + ranking
features/dashboard/fixtureSources.ts      (new)  fixture → HomeSources adapter
features/dashboard/useHome.ts             (new)  the only stateful file
features/dashboard/index.ts               (was `export {}`)
features/dashboard/__tests__/aggregate.test.ts    (new)
features/dashboard/__tests__/suggestions.test.ts  (new)
app/(tabs)/index.tsx                      wired through useHome()
app/(tabs)/settings.tsx                   deep import → barrel import
```

---

## Other decisions made

1. **The fixture is decomposed, not rendered.** `fixtureSources.ts` takes
   `homeFixture` apart into the sources a real provider would supply — counts,
   connection rows, metric readings — and the production aggregation rebuilds
   the screen from them. Previously the wireframe's pre-written subtitles and
   alert went straight to the screen, so the aggregation and ranking would never
   have run until they first ran against a live provider. Module subtitles and
   the alert in development are now **generated**.

2. **`not_connected` is not an alert.** Never having linked Instagram is an
   offer, not a fault to fix at the top of Home. It belongs in the module rows
   and the empty state. As a red banner it would nag every owner who simply does
   not use Instagram. Only `expired`, `revoked` and `error` raise the banner, at
   most one at a time.

3. **The derived alert copy is English**, where the fixture's hand-written
   version was Hinglish. An alert is UI chrome, and rule 12 keeps chrome
   English; the Hinglish insight chips are generated business content and stay
   as they are.

4. **`useHome` takes `isPreview` as an argument** rather than reading
   `features/auth`. Reaching into another engineer's folder for one boolean
   would couple the features; the screen already knows and passes it down.

5. **Unread notifications are a `DataState<number>`**, not a plain number. The
   bell dot is a claim — an unsubstantiated red dot sends the owner looking for
   something that may not be there. Unknown means no dot.

6. **`isEmpty` means we know nothing at all**, not that one source failed. A
   single real metric, suggestion, alert or business name is enough to render
   the page: a page with one true thing on it beats an empty state that hides it.

---

## Verification

`npm run typecheck && npm run lint && npm test` all pass — **2258 tests, 44
suites**. The four pre-existing Home screen tests in `__tests__/screens.test.tsx`
pass unchanged, including "shows an honest empty state when no data source
exists" and "distinguishes a real zero change from an unknown one", so the
rewiring is behaviour-preserving.

---

## Known issues / carried forward

1. **`features/billing/` is still `export {}`.** The contract exists at
   `lib/providers/contracts.ts:203`. Razorpay research has NOT been run and must
   be, per CLAUDE.md, before any integration code.
2. **No feature exports a summary yet.** `disconnectedSources()` reports
   `not_connected` for all of them, which is the literal truth. Social, SEO and
   Website need to export `SocialSummary` / `SeoSummary` / `WebsiteSummary` from
   their barrels; then they get subscribed to in `useHome` and nothing else
   changes.
3. **No content engine**, so the authored `content` suggestion only exists in
   the fixture. The engine's output plugs into `sources.suggestions`.
4. **`ARYAN-SINGH` branch** still exists locally on the same commit as `main`,
   never pushed. Safe to delete.

---

## Things future engineers must NOT change

- **Do not use `combineData()` for the metric tiles or module rows.** It is
  correct for one coherent row and wrong for a grid of independent readings; it
  would blank three tiles because one provider is down.
- **Do not add a numeric fallback to the aggregation.** There is no
  `unwrapOr(state, 0)` in `DataState.ts` on purpose. If a tile has no value the
  answer is a dash and a reason.
- **Do not derive a suggestion from a non-ready source.**
- **Do not turn `not_connected` into the Home alert.**
