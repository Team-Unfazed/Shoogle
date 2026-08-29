# Design system

**Source of truth:** the Claude Design project *"Shoogle Mobile App"*
(`777ab412-9581-4e29-8e50-e616b7464d19`), design-system reference card `1d`.

Every value below lives in `theme/tokens.ts` and is pinned by
`__tests__/foundation.test.tsx`, so drifting from the design breaks the build.

## Colour

| Role | Light | Dark | Used for |
|---|---|---|---|
| `bg` | `#f5f6f8` | `#0d0d0d` | Screen background |
| `card` | `#ffffff` | `#1a1a1a` | Raised surfaces |
| `card2` | `#f0f1f4` | `#161616` | Recessed surfaces, inputs, skeletons |
| `border` | `#e4e7ec` | `#2a2a2a` | Hairlines |
| `text` | `#101317` | `#ffffff` | Primary text |
| `muted` | `#6c737f` | `#9c9a92` | Secondary text |
| `muted2` | `#a0a6b0` | `#6b6a64` | Tertiary, uppercase labels |
| `blue` / `blueSoft` | `#2f7ad6` / `#e9f2fc` | `#378add` / `#16283c` | **Social**, primary action |
| `green` / `greenSoft` | `#17a97f` / `#e5f6f1` | `#5dcaa5` / `#132b23` | **SEO**, success |
| `amber` / `amberSoft` | `#e0900f` / `#fdf3e0` | `#ef9f27` / `#2e2314` | **Website**, warning |
| `red` / `redSoft` | `#d9534f` / `#fcebea` | `#e05a5a` / `#2e1717` | Error, destructive |

Never write a hex value outside `theme/tokens.ts`.

## Type

**Sora** for display and screen titles; **Manrope** for all UI text. Both are
bundled locally, so the app opens correctly on a poor connection.

| Variant | Family | Size / line | Notes |
|---|---|---|---|
| `display` | Sora 600 | 29 / 36 | `-0.02em` |
| `screenTitle` | Sora 600 | 24 / 30 | `-0.02em` |
| `cardTitle` | Manrope 700 | 16 / 22 | |
| `body` | Manrope 400 | 14 / 20 | |
| `bodyStrong` | Manrope 600 | 14 / 20 | |
| `caption` | Manrope 400 | 12.5 / 18 | Usually `tone="muted"` |
| `label` | Manrope 700 | 11.5 / 15 | Uppercase, `.07em` |

## Geometry

| Token | Value |
|---|---|
| `minTouchTarget` | **44** — the Android floor; nothing pressable is smaller |
| `buttonPrimaryHeight` | 54 |
| `buttonSecondaryHeight` | 50 |
| `chipHeight` | 38 |
| `inputHeight` | 52 |
| `tabBarHeight` | 60 (+ bottom safe-area inset) |
| `appBarHeight` | 56 |

Radii: `xs` 8 (badges) · `sm` 11 (chips) · `md` 15 (buttons) · `lg` 16 (inputs,
inner cards) · `xl` 20 (cards, dialogs) · `sheet` 26 (bottom-sheet top corners)
· `full` 999.

Card elevation matches `0 2px 10px rgba(0,0,0,.07)` and emits both Android
`elevation` and iOS `shadow*`.

Spacing is a 4pt scale: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56.

## Status badges

11px/700 uppercase on a soft fill, radius 8.

| Status | Accent |
|---|---|
| Scheduled / Publishing | blue |
| Published | green |
| Draft | amber |
| Failed | red |
| Skipped | neutral |

Use `<PostStatusBadge status={...} />` rather than mapping these yourself.

## States every primitive supports

Each primitive handles, where applicable: **default · pressed · disabled ·
loading · empty · error · focused**, with an accessible name and a target of at
least 44pt.

`IconButton` requires `accessibilityLabel` in its type — an icon carries no text.

## The honesty primitives

- **`Metric`** — `value: number | null`. `null` renders `—` plus a reason. Never
  `0`. `changePct: null` renders no trend at all, which is different from a
  trend of 0%.
- **`Score`** — `value: number | null`. `null` renders "Not measured yet".
  `uncheckedCount` surfaces how much of an audit could not run.
- **`EmptyState` / `ErrorState`** — what you render instead of a zero.
- **`DataStateView`** — maps `DataState<T>` onto the three above automatically.
  Use it rather than hand-rolling status ladders.

## Dark mode

`ThemeProvider` follows the system scheme. Both palettes define the same
semantic keys, so a component written against roles works in both without
branching. Never branch on `scheme` to pick a colour — add a role instead.
