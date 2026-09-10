# features/social

**Owner: Yash**

Instagram, Facebook and Google Business Profile: connecting accounts, composing,
scheduling and publishing posts, and reading back real performance. LinkedIn is
out of scope (2026-09-01).

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
- Instagram publishing needs a professional (Business **or** Creator) account
  and App Review — but **no Facebook Page**. Meta's *Instagram API with
  Instagram Login* states outright that a linked Page is not required; see
  `docs/research/meta-instagram.md` §1. The older Facebook-Login path does
  require one, which is why this feature does not use it.

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

0. **`isVerified()` to CLAIM, `isEnforceable()` to REFUSE.** A limit whose own
   documentation contradicts itself — Facebook's scheduling horizon is 30 days
   on one Meta page and 75 on another — is `conflicted()`, carrying the
   conservative end. It is not verified, so nothing may state it as fact; it is
   enforceable, so a check may still refuse at the tighter bound. Conflating the
   two is how a disputed number becomes a stated one.
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

### Scope, and the independence rule

**Instagram, Facebook and Google Business Profile.** The owner picks any
combination — and **one platform never blocks another** (product rule 13).

A Facebook Page is optional at the product level. Meta requires one to publish
*to Facebook*; that requirement belongs to the Facebook connection and must
never reach Instagram onboarding, Instagram authorization, or a GBP-only owner.
An Instagram professional account with no linked Page is a common shape for an
Indian local business, and it must work normally.

This is why `availabilityFor()` takes **one** connection rather than a map of
all of them: a cross-platform dependency is then a type error rather than
something a reviewer has to notice. The six-row acceptance matrix is executable,
in `__tests__/independence.test.ts`. LinkedIn is out of scope (2026-09-01) and is the only `ProviderId`
deliberately missing from `SOCIAL_PLATFORMS` — listing it as an unconnected
account elsewhere is truthful; targeting it is not supported.

The three are not variations of one thing. Per `docs/research/`, they disagree
on nearly every rule that decides whether a post can be built:

| | Instagram | Facebook | GBP |
|---|---|---|---|
| Media source | public URL only | **URL or binary** | public URL only |
| PNG | rejected | **accepted** | unverified |
| Native scheduling | no | **yes**, 10 min–30 days | **yes** |

Content is therefore per-platform, and `platforms.ts` carries a source per limit
rather than one shared constant.

### Scheduling bounds are per-target

`MIN_SCHEDULE_LEAD_MINUTES` and `MAX_SCHEDULE_HORIZON_DAYS` are Shoogle's own
floor and ceiling, **not the answer**. Always validate through
`scheduleWindowFor(targets)`, which intersects every target's documented window
— strictest minimum lead, tightest horizon. Facebook narrows a post to 10
minutes and 30 days; the module constants alone would accept a schedule
Facebook refuses. That was a real defect, fixed 2026-09-09.

### Blocked on

- **A server.** Instagram token exchange needs `client_secret`, Meta and Google
  both fetch media from a public URL, and Instagram requires JPEG — so a
  transcode + hosting step is mandatory. See `docs/research/meta-instagram.md`
  §7.
- **A durable post store and a server-side runner** (Sunny). A phone that is
  asleep cannot publish, so on-device timers are not an option.
- **A generation endpoint and an approved model tier.** A generation key must
  never be `EXPO_PUBLIC_*` — it would ship inside the APK.

---

## Generation (`generation/`)

Three prompts, not one prompt with the platform's name swapped in. Each surface
has a different reader, and the prompts say so:

| | Reader | What it optimises for |
|---|---|---|
| Instagram | someone scrolling who stopped for the photo | one line that earns the second; hashtags |
| Facebook | a local who follows the Page | noticeboard detail, longer, **no hashtags** |
| GBP | someone who just searched and is comparing listings | **SEO / AEO / GEO** |

GBP carries the SEO/AEO/GEO weight because it is the only surface read by
someone actively searching. AEO in particular means asking for at least one
**self-contained, quotable sentence** — an answer engine can lift "we do
walk-ins on weekday mornings" and cannot lift "come see us!".

### The two guards are code, not prompt text

"Write naturally, do not invent facts" in a prompt is a *request*, honoured most
of the time — which is the worst failure rate available, because the rare bad
output goes out in a real business's name and nobody is checking.

- **`fabrication.ts`** rejects any claim not traceable to `BusinessContext`:
  invented prices, percentages, phone numbers, awards, guarantees, or a discount
  when `context.offer` is null. **This is the most important file in the
  feature.** A weak caption costs nothing; a fabricated 20% discount costs a
  customer who turns up expecting it, and the owner finds out from them.
- **`humanize.ts`** rejects AI-tell phrases, template openers and keyword
  stuffing; it *advises* on flat sentence rhythm. Blocking vs advisory is
  deliberate — a false positive that blocks a good caption costs the owner a
  post.

When every attempt fails both guards, `createSocialGenerator` returns **nothing**
and says why. It never hands over its least-bad draft with a warning attached: a
warning beside a caption that looks finished gets dismissed.

### No key is read anywhere in this feature

Generation goes through Pranay's `AiProvider` (`features/seo/ai/`), the single
door out to a model in this repository and where the data-classification guards
stand. Nothing here reads, names, holds or receives `GEMINI_API_KEY`.

`tools/dev-ai-proxy/server.js` exists because `GEMINI_API_KEY` has no
`EXPO_PUBLIC_` prefix and is therefore `undefined` on a real phone — correct,
and the reason generation cannot be seen in Expo Go. The proxy holds the key in
a Node process on the developer's machine; the device gets a LAN URL, which is
not a credential. **The proxy re-enforces the fixture-only guard itself**, on
the machine that holds the key, because a check running on a device is one that
can be skipped.
