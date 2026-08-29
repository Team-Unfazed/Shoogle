# fixtures/

**Development and test data only. This is NOT customer data and must never be
presented as such.**

## Why this folder exists

Some UI states cannot be built without data — you cannot lay out a post card
with no post. Rather than let invented values leak into feature code, every
example value lives here, is typed, and is clearly labelled as fake.

## Hard rules

1. **Every fixture value is obviously invented.** Business names are prefixed
   `[FIXTURE]`, and numbers are recognisable placeholders. If a fixture could be
   mistaken for a real business's data, it is wrong — rewrite it.
2. **Fixtures are unreachable in production.** They are only read when
   `isFixtureModeEnabled()` is true, which requires `__DEV__` *and*
   `EXPO_PUBLIC_ENABLE_FIXTURES=1`. Both preview and production EAS profiles set
   that variable to `0`.
3. **Any screen showing fixtures must say so.** Pass `showsFixtureData` to
   `<Screen>`; it pins an undismissable "Fixture data" banner.
4. **`ready()` values built from fixtures pass `isFixture: true`**, so the flag
   travels with the data rather than depending on someone remembering.
5. **Never import fixtures from `lib/`, from a provider implementation, or from
   any production data path.** ESLint blocks `@/fixtures` imports outside tests
   and dev-gated screens.
6. **Fixtures are not a substitute for an integration.** A screen wired to
   fixtures is not "done" — it is a layout with the data still missing.

## The four data kinds Shoogle distinguishes

| Kind | Meaning | How it renders |
|---|---|---|
| **fixture** | Invented, development-only | Value + `FixtureBanner` + `isFixture: true` |
| **real** | Genuinely fetched from a provider | The value, with `fetchedAt` |
| **unknown** | Not measured / not enough data | `—` plus a reason. **Never `0`** |
| **unavailable** | Not connected, expired, unsupported | `EmptyState` naming the reason |

The last two are different from each other and both are different from zero.
`Metric` and `Score` take `number | null` specifically so that "unknown" cannot
be typed as `0` by accident.
