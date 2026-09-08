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
| `platforms.ts` | The platform capability matrix. Instagram is researched; several limits are still UNVERIFIED and say so |
| `scheduling.ts` | Shoogle-owned scheduling rules and the runner contract |
| `time.ts` | Timezone-correct schedule labels, in the business's zone |
| `generator.ts` | `SocialContentGenerator` — the seam. No model SDK is imported |
| `publisher.ts` | `SocialPublisher` + `attemptPublish`. Refuses to act with no adapter |
| `store.ts` | `PostStore`. Real one is Supabase, which is Sunny's |
| `view.ts` / `usePostsView.ts` | `SocialPost[]` -> what the Posts tab renders |

### Three things that must not change without a reason

1. **A limit in `PLATFORM_CAPABILITIES` may only be claimed with a source.**
   Caption lengths, accepted formats and slide counts are claims about someone
   else's API. Instagram's are now filled in from
   `docs/research/meta-instagram.md`, each carrying the Meta URL it came from —
   and the ones Meta does not document (carousel *minimum*, provider-side
   scheduling) stay `unverified()` rather than being guessed. `unsourcedLimits()`
   is asserted to be empty, so a number written from memory breaks the build,
   which is the intended outcome.
2. **No `registerProvider()` call for Instagram.** The Business tab shows
   "Integration not built yet" precisely while it is unregistered. Register the
   day `connect()` completes a real OAuth flow.
3. **`schedule()` refuses while no platform adapter exists.** Storing a due
   date with no publisher and no runner behind it would show the owner posts
   that can never go out.

### Scope

**Instagram and Google Business Profile only.** LinkedIn was removed from scope
on 2026-09-01 and Facebook is not a publishing target; both remain valid
`ProviderId`s because listing them as unconnected accounts is truthful, but
neither is in `SOCIAL_PLATFORMS`.

### Blocked on

- **A server.** Instagram token exchange needs `client_secret`, Meta and Google
  both fetch media from a public URL, and Instagram requires JPEG — so a
  transcode + hosting step is mandatory. See `docs/research/meta-instagram.md`
  §7.
- **A durable post store and a server-side runner** (Sunny). A phone that is
  asleep cannot publish, so on-device timers are not an option.
- **A generation endpoint and an approved model tier.** A generation key must
  never be `EXPO_PUBLIC_*` — it would ship inside the APK.
