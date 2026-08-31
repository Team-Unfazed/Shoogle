# features/carousel

**Owner: Yash**

Multi-image carousel creation: templates, image composition and per-slide copy.

## Where this appears
Reached from the create-post flow in the Posts tab.

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

- Render text as real `<Text>` nodes wherever it is UI. Only burn text into an
  image when the exported artwork itself requires it - dashboard text must never
  be drawn onto a canvas, because it stops being readable by TalkBack.

---

## What exists today (day 1)

| File | What it is |
|---|---|
| `types.ts` | `Carousel`, `CarouselSlide`, `SlideContent`, aspects, Shoogle's own slide floor/ceiling |
| `ordering.ts` | The only sanctioned way to move, add, insert or remove a slide. All pure |
| `validation.ts` | Shoogle's own rules, plus the platforms' — which are all unverified |

### Notes

- **Generation state and edit state are separate fields.** "A model wrote this
  and the owner has since changed it" is a real state, and one enum cannot say
  it. Keeping them apart is what lets "regenerate" avoid discarding edits.
- **Order is the array.** There is no `index` field to drift out of sync.
- **`reviewCarousel(...).ok` is not a claim about the platform.** It means
  Shoogle found no fault. The platform checks land in `unchecked` until the
  research in `features/social/platforms.ts` is done, and the editor must show
  that rather than a bare green tick.
- Slide copy is real `<Text>`, never burned into a bitmap — see above.
