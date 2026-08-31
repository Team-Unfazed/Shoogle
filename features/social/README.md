# features/social

**Owner: Yash**

Instagram, Facebook and LinkedIn: connecting accounts, composing, scheduling and publishing posts, and reading back real performance.

## Where this appears
The Posts tab and the create-post flow.

## Boundary rules

1. Everything for this feature lives in this folder: screens, hooks, provider
   implementations, feature-specific types, and its own tests.
2. **Do not edit another feature's folder.** If you need something from one,
   ask its owner to export it from that feature's `index.ts`.
3. **Do not edit `components/ui/`, `components/shared/`, `theme/` or
   `lib/` to make this feature work.** Those are shared. If a primitive is
   missing a variant, raise it with the team and add it there with a test -
   never fork a copy in here and never restyle one with inline colours.
4. Register any provider implementation at runtime with
   `registerProvider(id, impl)` from `@/lib/providers`. Do not add your
   provider to `lib/providers/registry.ts` by hand.
5. Add routes under `app/` only for screens this feature owns.

## Data rules (non-negotiable)

- Return `DataState<T>` from anything that touches the network.
- **Unknown is not zero.** No placeholder `0`, no empty chart standing in for
  missing data, no invented percentages. Use `unavailable(reason, message)`.
- Never claim an integration exists before it does.
- Never present fixture data as the owner's real data. Fixtures live in
  `fixtures/`, are only readable when `isFixtureModeEnabled()` is true, and
  any screen showing them must pass `showsFixtureData` to `<Screen>`.

## Before you implement an integration

Run the API research agent (`.claude/agents/api-researcher.md`) and commit its
findings to `docs/research/`. Do not guess scopes, quotas, pricing or review
requirements.

## Watch out

- **Posts are scheduled by default** (product rule 4). Schedule is the primary
  action; "Post now" is secondary.
- **Skip and pause must be one tap** from the list (product rule 5).
- Only report "Published" once the provider confirms it. An optimistic success
  toast is a false claim.
- Instagram publishing requires a Business/Creator account linked to a Facebook
  Page, plus app review. Verify current requirements before building the UI.

---

## What exists today (day 1)

The domain foundation, with no integration behind it. Nothing publishes.

| File | What it is |
|---|---|
| `types.ts` | `Platform`, `Caption`, `MediaAsset`, `Schedule`, `PublishTarget`, `PostInsights`, `SocialPost` |
| `postState.ts` | The lifecycle state machine — a transition TABLE, not `if` statements |
| `captions.ts` | Caption construction, hashtags, code-point length, provenance, review |
| `platforms.ts` | The platform capability matrix. **Every limit is `null` / UNVERIFIED** |
| `scheduling.ts` | Shoogle-owned scheduling rules and the runner contract |
| `time.ts` | Timezone-correct schedule labels, in the business's zone |
| `generator.ts` | `SocialContentGenerator` — the seam. No model SDK is imported |
| `publisher.ts` | `SocialPublisher` + `attemptPublish`. Refuses to act with no adapter |
| `store.ts` | `PostStore`. Real one is Supabase, which is Sunny's |
| `view.ts` / `usePostsView.ts` | `SocialPost[]` -> what the Posts tab renders |

### Three things that must not change without a reason

1. **`PLATFORM_CAPABILITIES` stays unverified until researched.** Caption
   lengths, accepted formats and slide counts are claims about someone else's
   API. `assumesFormatAccepted()` is asserted to be `false`; filling any of it
   in from memory rather than from `docs/research/` breaks that test, which is
   the intended outcome.
2. **No `registerProvider()` call for Instagram, Facebook or LinkedIn.** The
   Business tab shows "Integration not built yet" precisely while they are
   unregistered. Register the day `connect()` completes a real OAuth flow.
3. **`schedule()` refuses while no platform adapter exists.** Storing a due
   date with no publisher and no runner behind it would show the owner posts
   that can never go out.

### Blocked on

- **Meta / LinkedIn API research** — nothing in `docs/research/` covers them,
  so no limit in `platforms.ts` can be filled in.
- **A durable post store and a server-side runner** (Sunny). A phone that is
  asleep cannot publish, so on-device timers are not an option.
- **A generation endpoint and an approved model tier.** A generation key must
  never be `EXPO_PUBLIC_*` — it would ship inside the APK.
