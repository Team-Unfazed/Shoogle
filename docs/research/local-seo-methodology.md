# Local SEO audit methodology

**Owner:** Pranay (`features/audit/`, `features/gbp/`, `features/seo/`, `app/(tabs)/business.tsx`)
**Status:** design document. No audit engine exists yet — `lib/providers/contracts.ts`
declares `AuditProvider`, `AuditReport` and `AuditFinding`, and nothing implements them.
**Date:** 2026-08-30

This document defines what Shoogle's audit checks, how it scores what it checked,
what it refuses to score, and whether geo-grid map rank tracking is worth building.

It exists because the Business tab has to answer one question — *"how do I look
online?"* — for a salon owner in Nerul who will read the answer on a 390pt screen
between two customers, and then act on at most three things.

---

## 0. Where this sits against the blocker

**Google Business Profile API access is not configured.** No credentials, no
approved quota, no OAuth client. Every `gbp.*` source named in this document
resolves to `unavailable('not_connected', …)` today.

That is not a reason to defer the design — it is the reason to fix the design now.
An audit built on the assumption that data arrives is an audit that will silently
render `0` the first time it doesn't. The scoring model in §3 is built so that the
current state (almost nothing checkable) produces **`score: null` plus a named list
of unchecked areas**, and that is the correct, shippable output.

Section §2 marks each check with what it needs. Roughly six of the thirty-three
scored checks can run today; §3.6 says exactly what the app shows in that state.

---

## 1. Method: PERCEIVE → ANALYZE → VALIDATE → ACT

Adopted from [`AgriciDaniel/claude-seo`](https://github.com/AgriciDaniel/claude-seo),
whose `seo-local` and `seo-maps` skills are mined throughout this document. Its
governing idea:

> "Falsifiable, not promotional. Every recommendation carries … an explicit
> 'how would we know this failed?' check."

That is the same rule as Shoogle's *unknown is not zero*, pointed at
recommendations instead of metrics. A finding that cannot name the observation it
rests on is a guess wearing a confident font.

| Phase | In Shoogle |
|---|---|
| **PERCEIVE** | Read raw fields from providers. Record *what was literally returned*, including "the call failed" and "the field was absent". Never infer at this stage. |
| **ANALYZE** | Apply the rules in §2 to observations. A rule may only read observations that are `ready`; a rule whose inputs are `unavailable` returns `not_checked` and stops. |
| **VALIDATE** | Pressure-test the finding: is it actionable by *this* owner, can Shoogle do the work, and what would prove it wrong? Findings that fail this are dropped, not softened. |
| **ACT** | Emit an ordered action list (§5), and register the leading indicator that will tell us in 28 days whether the fix worked. |

### 1.1 The finding record

`lib/providers/contracts.ts` defines `AuditFinding` as
`{ id, title, detail, severity, fixHref }`. That is the shared contract and it is
Sunny's file — **do not edit it**. The audit engine works with a feature-local
superset in `features/audit/types.ts` that *composes* the contract type, and
narrows to `AuditFinding` at the provider boundary:

```ts
type ShoogleFinding = AuditFinding & {
  checkId: string;             // 'gbp.cat.primary.present'
  area: AuditArea;             // scoring bucket, see §3.1
  observation: string;         // PERCEIVE: what was literally seen
  observedAt: string;
  source: SourceId;            // which API/field produced it
  fixMode: 'auto' | 'assisted' | 'guided' | 'owner';
  failureCheck: string;        // "how would we know this was wrong?"
  leadingIndicator: string;    // the Performance metric that should move
  confidence: 'observed' | 'inferred';
};
```

`observation` and `failureCheck` are not decoration. They are what stops the audit
from telling an owner to change a category because a heuristic from a US SEO blog
said so. `confidence: 'inferred'` findings **never** rank above an `'observed'`
one of the same severity (§5.3).

### 1.2 Two kinds of nothing

This is the single most important implementation rule in the document.

| | Meaning | Type | Renders as |
|---|---|---|---|
| **Measured zero** | We asked, the provider answered, the answer was none. | `ready(0, fetchedAt)` | `0`, and a finding: *"You have no Google reviews yet."* |
| **Unknown** | We could not ask, or the provider does not expose it. | `unavailable(reason, message)` | `—` plus the reason. **No finding is emitted.** |

`DataState<T>` already separates these. The audit's job is to not collapse them.
Concretely: `listReviews()` returning `ready({ items: [], nextCursor: null })` is a
**measured zero** and fails check `F1`. `listReviews()` returning
`unavailable('not_connected', …)` makes `F1` `not_checked`, contributes nothing to
the score, and adds "Reviews" to `uncheckedAreas`.

A `not_checked` outcome is never scored as a fail (that fabricates a problem) and
never scored as a pass (that fabricates health). It is removed from the
denominator and named out loud.

### 1.3 Provenance of the thresholds below

Split deliberately, because they are not the same kind of fact.

**First-party, verified this session:**

- The `Location` resource fields (`categories`, `regularHours`, `specialHours`,
  `serviceArea`, `profile.description`, `serviceItems`, `moreHours`, `attributes`,
  `latlng`, `openInfo`, `metadata.hasVoiceOfMerchant`, `metadata.placeId`,
  `metadata.canOperateLocalPost`, `metadata.canModifyServiceList`) — My Business
  Business Information API v1.
- Reviews live at `accounts.locations.reviews` and media at
  `accounts.locations.media` in the **legacy Google My Business API v4.9**, not in
  the v1 APIs. This matters: two different API surfaces, two different enablement
  requests.
- The twelve `DailyMetric` values (Performance API v1) listed in §4.4.
- Places API India pricing and free tiers (§4.2).

**Third-party practitioner heuristics** (from `claude-seo`, sourced there to
Sterling Sky / Whitespark / BrightLocal). Useful for *ordering our own work*.
**Never shown to an owner as a Google fact, and never the sole basis of a
`critical`.**

- "18-day rule" — ranking decay when no new review arrives for ~3 weeks.
- 10 reviews as a credibility floor; 4.5★ as a preference threshold.
- Primary category as the strongest single local-pack factor, and a wrong primary
  category as the strongest negative one.
- "Businesses open at search time rank higher."

Anything in the second list drives `severity: 'important'` at most, is tagged
`confidence: 'inferred'`, and its `detail` text states the observation, not the
theory. We tell the owner *"you have no reviews from the last 3 weeks"*; we do not
tell them *"Google will demote you."*

---

## 2. The checks

**34 checks: 1 gate + 33 scored.** Nine areas. Weights sum to 100 and are used in §3.

Column key:

- **Source** — `gbp.info` = Business Information API v1 · `gbp.legacy` = Google My
  Business API v4.9 (reviews, media, local posts) · `gbp.perf` = Performance API v1
  · `gbp.verify` = Verifications API v1 · `web` = fetch of the owner's website ·
  `own` = Shoogle's own `Business` record.
- **Sev** — `crit` / `imp` / `min`, matching `AuditFinding['severity']` exactly
  (`critical | important | minor`). Definitions in §5.1.
- **Fix** — `auto` = Shoogle writes it without asking · `assist` = Shoogle drafts,
  owner approves in one tap · `guide` = Shoogle cannot write it; deep-link plus
  steps · `owner` = needs a real-world fact only the owner has.

> **Note on `auto`.** Every `auto` requires three things to be true: GBP connected,
> `metadata.hasVoiceOfMerchant === true`, and the relevant write method existing on
> our provider. `GoogleBusinessProfileProvider` today declares only
> `replyToReview`, `createLocalPost` and `updateBusinessHours`. Categories,
> description, service items, attributes and photos need methods added — that is a
> PR to `lib/providers/contracts.ts` reviewed by **Sunny**, not an edit. Until they
> exist, those rows degrade to `guide`, and the UI must say so rather than showing
> a button that does nothing (no dead controls).

### Area A — Foundation & verification (weight 10)

| ID | Observes / needs | Source | W | Sev | Fix | Owner-facing finding |
|---|---|---|---|---|---|---|
| `A1` **Listing linked** *(gate, unscored)* | Does the registry hold a connected `google_business` provider, and does `listLocations()` return ≥1 location? | registry | — | crit | owner | "Shoogle can't see your Google listing yet. Connect it and we'll check everything on this page." |
| `A2` **Verified listing** | `metadata.hasVoiceOfMerchant`; if false, `locations.verifications.list` for a pending request | `gbp.info`, `gbp.verify` | 6 | crit | guide | "Your Google listing isn't verified yet. Until it is, Google limits what shows publicly and Shoogle can't change anything for you. Verification is a postcard or phone call from Google — we'll walk you through it." |
| `A3` **Open status is true** | `openInfo.status` ∈ `OPEN` / `CLOSED_TEMPORARILY` / `CLOSED_PERMANENTLY`, compared with `own` business state | `gbp.info`, `own` | 4 | crit | auto | "Google is telling customers you're temporarily closed. If you're open, this is costing you every search today." |

*Falsifiability for A:* if `A2` reports unverified but the owner can publish a
Google post successfully (`metadata.canOperateLocalPost === true` and a post
returns `published`), our verification read is wrong — recheck before re-raising.

### Area B — Name, address, phone, reach (weight 14)

| ID | Observes / needs | Source | W | Sev | Fix | Owner-facing finding |
|---|---|---|---|---|---|---|
| `B1` **Name consistent** | `location.title` vs `own.name` vs the name in the website's `<title>`/footer/schema. Normalised (case, punctuation, `Pvt Ltd`, `&`/`and`) before comparison. Also flags keyword-stuffed titles (`"Best Salon Nerul Hair Spa"`). | `gbp.info`, `own`, `web` | 3 | imp | assist | "Your business is called '{gbp}' on Google but '{site}' on your website. Customers and Google both use the name to match you — pick one and we'll make them agree." |
| `B2` **Address complete** | `storefrontAddress` has `addressLines`, `locality`, `administrativeArea`, `postalCode`; *N/A* when the business is service-area only | `gbp.info` | 3 | crit | assist | "Your address is missing its {PIN code / area}. People searching nearby may not be shown your shop at all." |
| `B3` **Map pin accurate** | `latlng` present; distance between `latlng` and the geocode of `storefrontAddress` | `gbp.info` | 2 | imp | guide | "Your map pin is about {n} m from your address. Customers following directions will end up on the wrong side of the road." |
| `B4` **Phone reachable** | `phoneNumbers.primaryPhone` present and a valid Indian number (`+91`, 10 digits, valid prefix; landline STD codes accepted) | `gbp.info` | 3 | crit | assist | "There's no phone number on your Google listing. The call button is the most-used button on a local listing — right now yours isn't there." |
| `B5` **Website link present & live** | `websiteUri` set; HTTP status; final URL after redirects | `gbp.info`, `web` | 2 | imp | auto | "Your Google listing has no website link." / "Your website link is broken ({status}). Every customer who taps it hits an error page." |
| `B6` **Service area defined** | For `CUSTOMER_LOCATION_ONLY` / `CUSTOMER_AND_BUSINESS_LOCATION`: `serviceArea.places` non-empty; *N/A* for pure storefronts | `gbp.info`, `own` | 1 | imp | assist | "You travel to customers but haven't told Google where. Add the areas you cover and you'll appear in searches from those neighbourhoods." |

*Falsifiability for B:* `B1` fires on a false positive whenever a business
legitimately trades under a different registered name than its shopfront name. If
the owner dismisses `B1` once, suppress it permanently for that pair — do not
re-raise on every audit run.

### Area C — Categories & services (weight 18)

Highest-weighted area. `claude-seo` puts the primary category as the single
strongest local-pack signal *and* a wrong one as the strongest negative signal.
Independent of whether that ranking claim is exactly right, it is the field that
decides which searches a business is even a candidate for, and it is one API call
to fix.

| ID | Observes / needs | Source | W | Sev | Fix | Owner-facing finding |
|---|---|---|---|---|---|---|
| `C1` **Primary category set** | `categories.primaryCategory` non-null | `gbp.info` | 5 | crit | assist | "Your listing has no main category. Google uses it to decide which searches you show up in — without it, you're competing for nothing." |
| `C2` **Primary category fits** | `primaryCategory.displayName` vs `own.category`, `serviceItems`, and the words customers actually use in reviews. Uses `categories.list` (region `IN`, `languageCode` `en`) for valid options. Always `confidence: 'inferred'`. | `gbp.info`, `gbp.legacy`, `own` | 5 | imp | assist | "You're listed as '{current}' but you mostly do {evidence}. '{suggested}' matches what customers search for. We'll change it if you say yes." |
| `C3` **Supporting categories** | `additionalCategories.length`. Flags 0; flags >9 as dilution. | `gbp.info` | 3 | imp | assist | "You have one category. Adding two or three more — like {suggestions} — puts you in more searches without changing your main one." |
| `C4` **Services listed** | `serviceItems` non-empty, gated on `metadata.canModifyServiceList`; compared with services the owner has described to Shoogle | `gbp.info`, `own` | 3 | imp | assist | "Your services aren't listed on Google. Someone searching 'hair smoothening near me' can't find you if you haven't said you do it." |
| `C5` **Service prices** | `serviceItems[].price` populated where the category supports it | `gbp.info` | 2 | min | assist | "Adding prices to your services helps people decide before they call — and cuts down 'how much?' phone calls." |

*Falsifiability for C:* `C2` is the most dangerous check in the audit — it proposes
changing the field that most affects visibility, from inference. Guardrails: it is
**never `auto`**; it must cite its evidence in `detail`; it is suppressed entirely
if fewer than 5 reviews and no `serviceItems` exist (not enough to infer from); and
its `leadingIndicator` is `searchkeywords.impressions.monthly` — if the query mix
does not shift within two monthly windows of the change, the recommendation was
wrong and must be reversible in one tap.

### Area D — Hours & availability (weight 13)

| ID | Observes / needs | Source | W | Sev | Fix | Owner-facing finding |
|---|---|---|---|---|---|---|
| `D1` **Regular hours set** | `regularHours.periods` non-empty and covering ≥1 day | `gbp.info` | 5 | crit | assist | "Your opening hours are missing. Google shows 'Hours not available' and many people won't risk the trip." |
| `D2` **Hours plausible** | Not `00:00–00:00`; not 24×7 unless the owner confirmed it; a weekly closure day present or explicitly declared none (many Indian salons and clinics close Monday or Tuesday) | `gbp.info`, `own` | 2 | imp | assist | "Google says you're open 24 hours, 7 days. If that's not right, customers are turning up to a closed shutter." |
| `D3` **Festival & special hours** | `specialHours.specialHourPeriods` covering the next major holiday within 21 days, from a maintained India calendar keyed by the business's state; also flags a `specialHours` block whose periods are *all* in the past | `gbp.info`, `own` | 5 | imp | assist | "{Diwali} is in {n} days and Google still shows your normal hours. Tell us if you're closed or on shorter hours and we'll set it — Google shows a 'holiday hours' note to everyone searching that day." |
| `D4` **Department hours** | `moreHours` where the category supports it (clinic OPD vs pharmacy, restaurant delivery/takeaway, gym staffed hours) | `gbp.info` | 1 | min | assist | "Your {delivery} hours are different from your shop hours. Adding them separately stops customers arriving at the wrong time." |

*India specifics for `D3`.* This is the highest-value low-effort check in the whole
audit and is genuinely under-served by generic SEO tooling. The calendar must be
**state-aware**, not national: Gudi Padwa and Ganesh Chaturthi in Maharashtra,
Onam in Kerala, Pongal in Tamil Nadu, Durga Puja in West Bengal, alongside Diwali,
Holi, Eid, Christmas, and the gazetted national holidays. Store it as a versioned,
dated data file in `features/audit/data/` carrying the year it covers, so a stale
calendar is visible rather than silently wrong. If the calendar has no entry for
the coming 21 days, `D3` is `not_applicable`, not `pass`.

*Falsifiability for D:* `D2` fires wrongly for genuinely 24×7 businesses (some gyms,
some clinics, chemists). One owner confirmation writes `own.is24x7 = true` and the
check becomes `not_applicable` forever.

### Area E — Photos & media (weight 9)

| ID | Observes / needs | Source | W | Sev | Fix | Owner-facing finding |
|---|---|---|---|---|---|---|
| `E1` **Cover photo exists** | A `PROFILE`/`COVER` category item in `accounts.locations.media` | `gbp.legacy` | 3 | imp | assist | "Your listing has no cover photo. It's the first thing anyone sees — and a listing without one reads as closed or abandoned." |
| `E2` **Enough photos, right mix** | Count of owner-uploaded media; coverage across exterior, interior, team, product/work | `gbp.legacy` | 4 | imp | assist | "You have {n} photos. Listings with a shopfront photo, inside shots, and pictures of your work get looked at far longer. We can turn your recent posts into listing photos." |
| `E3` **Photos are recent** | Age of the newest owner-uploaded item | `gbp.legacy` | 2 | min | assist | "Your newest photo is from {month year}. A fresh one this month tells people you're open and busy." |

*Falsifiability for E:* photo counts from `media.list` exclude customer-uploaded
photos. A listing rich in customer photos can fail `E2` while looking fine to a
searcher. `detail` must say "photos you've added", never "photos on your listing".

### Area F — Reviews & replies (weight 18)

Tied with categories as the heaviest area, and the area where an owner's effort
converts fastest.

| ID | Observes / needs | Source | W | Sev | Fix | Owner-facing finding |
|---|---|---|---|---|---|---|
| `F1` **Has reviews** | `reviews.length` from a *successful* fetch. `ready(0)` fails; `unavailable` is `not_checked`. Floor: 10 (`inferred`). | `gbp.legacy` | 4 | imp | guide | 0 reviews: "You have no Google reviews yet. This is the biggest single thing standing between you and the customer choosing the shop next door." · <10: "You have {n} reviews. Around ten is where people start trusting the rating." |
| `F2` **Rating** | Mean `starRating`. Bands: ≥4.5 pass · 4.0–4.4 warn · <4.0 fail. Suppressed below 5 reviews (`insufficient_data`). | `gbp.legacy` | 3 | imp | guide | "Your rating is {x}. Getting a few recent happy customers to review you moves this faster than anything else." |
| `F3` **Reply rate** | `reviews.filter(r => r.reply !== null).length / reviews.length`. Bands: ≥90% pass · 50–89% warn · <50% fail. | `gbp.legacy` | 5 | imp | assist | "You've replied to {n} of {total} reviews. Shoogle can draft a reply to each one in your voice — you approve, we post." |
| `F4` **Negative reviews unanswered** | 1★ and 2★ reviews with `reply === null` | `gbp.legacy` | 4 | crit | assist | "{n} unhappy {reviews} have no reply. An unanswered complaint is the first thing a new customer reads. We'll draft a calm reply for each — you approve before anything is posted." |
| `F5` **Review recency** | Days since newest `createTime`. Warn at 21 days ("18-day rule", `inferred`), fail at 90. | `gbp.legacy` | 2 | min | guide | "Your last review was {n} days ago. A steady trickle matters more than a big pile — we can send a review link to customers after their visit." |

*Falsifiability for F:* `F3`/`F4` assume `reply` is populated on the review
resource. If replies posted outside Shoogle do not appear, we would nag an owner
who has already replied — so the first run after connecting must sample and
confirm that a known existing reply comes back non-null before `F3` or `F4` may
emit anything.

*Hard rule:* Shoogle must never build, suggest, or tolerate **review gating** —
pre-screening customers for satisfaction before sending them to Google. It is
prohibited by Google's fake-engagement policy. The review-request flow implied by
`F1`/`F5` sends the same link to everyone.

### Area G — Posts & freshness (weight 7)

| ID | Observes / needs | Source | W | Sev | Fix | Owner-facing finding |
|---|---|---|---|---|---|---|
| `G1` **Recent Google post** | Days since the newest `localPosts` entry; `metadata.canOperateLocalPost` gates the check | `gbp.legacy`, `gbp.info` | 5 | imp | assist | "You haven't posted to Google in {n} days. A post keeps your listing looking alive — Shoogle can write and schedule one a week." |
| `G2` **Cadence & call-to-action** | Post count in the last 90 days; share carrying a CTA/link | `gbp.legacy` | 2 | min | assist | "You've posted {n} times in three months, and none of them had a button. An offer or a 'Call now' gives people something to do." |

*Note.* Anything `G1`/`G2` proposes is **scheduled by default**; "Post now" is the
secondary action, and skip/pause stay one tap away (product rule 4/5). Post bodies
are generated *business content* and may be Hindi/Marathi/Hinglish; the surrounding
UI stays English.

*Falsifiability for G:* posting has never been demonstrated to move local ranking.
`G1`'s claim is about how the listing *looks*, and its `leadingIndicator` is
`BUSINESS_IMPRESSIONS_MOBILE_SEARCH` + `CALL_CLICKS` over 28 days. If four weeks of
weekly posts move neither, stop recommending weekly posting to that business and
say so.

### Area H — Description & attributes (weight 7)

| ID | Observes / needs | Source | W | Sev | Fix | Owner-facing finding |
|---|---|---|---|---|---|---|
| `H1` **Description present** | `profile.description` non-empty | `gbp.info` | 3 | imp | assist | "Your listing has no description. It's the paragraph that tells someone why to pick you — we'll write one from what you've told us, and you can edit it." |
| `H2` **Description quality** | Length ~250–750 chars; mentions the locality and at least one real service; contains no URL and no phone number (Google's description guidelines disallow them); not duplicated from the website's meta description | `gbp.info`, `web` | 2 | min | assist | "Your description doesn't mention {locality} or what you actually do. Both are what people scan for." · "Your description contains a link. Google removes descriptions with links." |
| `H3` **Attributes set** | `locations.attributes` vs `attributes.list` for the category and region `IN` | `gbp.info` | 2 | min | assist | "You haven't set {UPI payments / wheelchair access / appointment needed / air conditioning}. These show as small labels on your listing and answer questions before people call." |

*Falsifiability for H:* the attribute set available for a category in India is
returned by `attributes.list` and changes without notice. `H3` must never
hard-code an attribute id; if `attributes.list` is unavailable, `H3` is
`not_checked`, not a guessed list.

### Area I — Website & schema signals (weight 4)

Weighted low on purpose. Most Shoogle businesses either have no website or have
one that Devashish's generator produced — in which case these are his to get right,
not the owner's to fix. The audit reports them; it does not lecture.

| ID | Observes / needs | Source | W | Sev | Fix | Owner-facing finding |
|---|---|---|---|---|---|---|
| `I1` **Site loads on a phone** | HTTP status, TLS validity, redirect chain, viewport meta | `web` | 2 | imp | guide | "Your website doesn't load properly on a phone. Almost everyone who taps that link is on one." |
| `I2` **LocalBusiness schema** | JSON-LD `LocalBusiness` (or correct subtype — `Restaurant`, `HairSalon`, `MedicalClinic`, `Bakery`) with `name`, `address`, `telephone`, `geo` (≥5 decimals), `openingHoursSpecification`; and that `name`/`address`/`telephone` match GBP | `web`, `gbp.info` | 1 | min | auto* | "Your website doesn't tell Google what kind of business it is, and the phone number on it doesn't match your listing." |
| `I3` **Click-to-call** | A `tel:` link present in mobile-rendered markup | `web` | 1 | min | auto* | "Your phone number on the website isn't tappable. On a phone, that's one more reason not to call." |

\* `auto` only for Shoogle-generated sites (Devashish's module). For an
owner-supplied site Shoogle has no write access and these are `guide`. That
handoff is a coordination point between `app/(tabs)/business.tsx` and
`app/website/` — neither side changes it unilaterally.

**Deliberate omissions.** Backlinks, Domain Authority, "best of" list placement,
chamber-of-commerce citations, and data-aggregator submission all appear in
`claude-seo`'s `seo-local`. They are **excluded**: they require paid link data we
do not have, the citation ecosystem they assume (Yelp, BBB, Data Axle, Neustar) is
largely irrelevant to an Indian neighbourhood salon, and none of them is anything
Shoogle could fix. A check that produces an unfixable finding is a check that makes
the owner feel bad for free.

### 2.1 Applicability

Three modifiers decide whether a check runs at all. `not_applicable` is **not**
`not_checked` — it leaves the denominator entirely and is never listed as unchecked.

1. **Business type**, derived from `serviceArea.businessType` and `openInfo`:
   - *Storefront* — all checks.
   - *Service-area* (`CUSTOMER_LOCATION_ONLY`) — `B2`, `B3` become N/A; `B6`
     becomes `critical`.
   - *Hybrid* (`CUSTOMER_AND_BUSINESS_LOCATION`) — all checks, `B6` included.
2. **Category**, from `own.category` — `D4` for clinics/restaurants/gyms; `C5` for
   salons/clinics/repair shops; `I2` subtype selection.
3. **Capability flags** — `metadata.canOperateLocalPost` gates area G;
   `metadata.canModifyServiceList` gates `C4`/`C5`; `metadata.canHaveFoodMenus`
   gates the restaurant variant of `C4`. When a flag is false, the check is
   `not_applicable` **and the UI does not offer a fix button for it.**

---

## 3. Scoring

The requirement: a score computed from half the signals must never be presented as
if it were whole. `components/ui/Score.tsx` already takes `value: number | null`
and `uncheckedCount`, and renders *"{n} checks could not be run"*. The scoring
model exists to feed it honestly.

### 3.1 Outcomes and areas

```ts
type CheckOutcome =
  | { kind: 'pass' }
  | { kind: 'warn'; ratio: number }                     // 0 < ratio < 1, partial credit
  | { kind: 'fail' }
  | { kind: 'not_applicable'; why: string }             // leaves the denominator
  | { kind: 'not_checked'; reason: UnavailableReason }; // named, not dropped
```

`reason` reuses `UnavailableReason` from `lib/state/DataState.ts` verbatim, so the
audit's honesty vocabulary is the app's honesty vocabulary — and `UNAVAILABLE_COPY`
already has owner-facing text for each.

Areas and weights, from §2:

| Area | Weight |
|---|---|
| A Foundation & verification | 10 |
| B Name, address, phone, reach | 14 |
| C Categories & services | 18 |
| D Hours & availability | 13 |
| E Photos & media | 9 |
| F Reviews & replies | 18 |
| G Posts & freshness | 7 |
| H Description & attributes | 7 |
| I Website & schema | 4 |
| **Total** | **100** |

This diverges from `claude-seo`'s split (GBP 25 / reviews 20 / on-page 20 / NAP 15
/ schema 10 / links 10) on purpose. That model audits a *website* and infers the
listing from it. Shoogle operates the *listing* directly, so listing fields carry
the weight and website signals carry 4.

### 3.2 Computation

Per area:

```
applicable  = checks where outcome ≠ not_applicable
earnable    = Σ weight over (applicable ∧ outcome ≠ not_checked)
earned      = Σ weight × credit over the same set
                 credit: pass = 1, warn = ratio, fail = 0
coverage    = earnable / Σ weight over applicable      // 0 when nothing ran
areaScore   = earnable > 0 ? earned / earnable : null  // null, never 0
```

Overall:

```
overallCoverage = Σ earnable / Σ applicable weight
score           = round(100 × Σ earned / Σ earnable)   // only if the gates pass
```

Note what is *not* here: no imputation, no default value, no "assume pass". Checks
that did not run are absent from both numerator and denominator. The score is
always "out of what we could actually check", and the caveat that says so is
mandatory, not conditional.

### 3.3 When a score is emitted

`runAudit()` returns `ready(report)` with a numeric `score` **only if all four
gates pass**:

| Gate | Condition | Why |
|---|---|---|
| **G-identity** | `A1` passes *and* at least one of `A2`/`A3` ran | Without a linked, identified location we are not auditing a business, we are auditing nothing. |
| **G-coverage** | `overallCoverage ≥ 0.70` | Below this the number is a guess with a decimal point. |
| **G-breadth** | Every area with weight ≥ 10 (A, B, C, D, F) has `coverage ≥ 0.50` | Stops a "78" that is really a photo-and-description score with the reviews and categories missing. |
| **G-freshness** | Every contributing observation is < 7 days old | An audit assembled from month-old fragments is a claim about the past. |

If any gate fails:

```ts
return unavailable(
  'insufficient_data',
  `Shoogle checked ${ran} of ${applicable} things. That isn't enough to score your ` +
  `profile honestly — here's what we could and couldn't see.`
);
```

`score` is `null`. `<Score value={null} />` renders "Not measured yet". The findings
from checks that *did* run are **still returned and still shown** — a missing score
never suppresses a real problem. An unverified listing or an unanswered 1★ review
is worth acting on whether or not we can put a number next to it.

### 3.4 When a score *is* emitted

Even at 100% coverage the report carries:

- `uncheckedAreas: string[]` — the contract field. Populated with the owner-facing
  name of every area at `coverage < 1`, plus its reason:
  `"Reviews — not connected"`, `"Photos — Google didn't respond"`. Never silently
  empty.
- `uncheckedCount` for `<Score />` — the count of `not_checked` checks.
- A per-area coverage strip beneath the dial, so "Categories 5/5, Reviews 0/5" is
  visible without a tap.

Bands follow the existing `scoreBand()` in `components/ui/Score.tsx` — ≥70 green,
≥40 amber, else red. The audit must not invent its own bands; one module, one
opinion.

### 3.5 Score movement is not comparable across runs

If run 1 covered 100% and run 2 covered 75%, the two numbers are not the same
measurement and a delta between them is meaningless. Rule: **never show a score
trend, arrow, or delta unless both runs share the same set of checked checks.**
Otherwise show the two scores with their coverage and no arrow. `Metric.changePct`
is `number | null` precisely so this can be expressed.

### 3.6 What the app shows today

With GBP unconnected, only checks reading `web` and `own` can run — roughly `B1`
(partial), `B5`, `I1`, `I2`, `I3`, and only when the owner has given us a website
URL. `overallCoverage` lands around 0.06. **G-identity fails immediately.**

Output today:

```
score: null
uncheckedAreas: [
  'Verification — not connected',
  'Address and phone — not connected',
  'Categories and services — not connected',
  'Hours — not connected',
  'Photos — not connected',
  'Reviews — not connected',
  'Google posts — not connected',
  'Description — not connected',
]
findings: [ A1 ]   // "Connect your Google listing…"
```

This is exactly what `app/(tabs)/business.tsx` renders now in its non-fixture
branch — "Not measured yet", "Connect Google Business Profile and Shoogle will
measure how people find you." The design and the code already agree. Nothing about
the current screen needs to lie while we wait for API access.

---

## 4. Geo-grid rank tracking — "is the map thing needed?"

**Short answer: no, not for v1, and probably not for v2.** Reasoning below, then
what to ship instead.

### 4.1 What it actually is

Local Maps results are computed **relative to where the searcher is standing**.
Proximity is one of the three factors Google names for local ranking. So "what rank
am I?" has no single answer: a salon can be #1 to someone outside its own door, #6
from a kilometre away, and absent from three kilometres.

Geo-grid tracking makes that visible. Per `claude-seo`'s `seo-maps` skill, the
method is:

1. Geocode the business address to a centre point.
2. Generate a lattice — default **7×7 = 49 points over a 5 km radius** — using
   Haversine offsets.
3. Run a Maps search for the keyword **from each point's coordinates**.
4. Record the business's position at each point.
5. Compute **SoLV** (Share of Local Voice) = `(top_3_count / total_points) × 100`.
6. Render a heatmap.

It is a genuinely good diagnostic. The question is whether it is a good *Shoogle
feature*.

### 4.2 Can it be done without paid APIs?

Three routes. None is both free and sound.

**Route 1 — Google Places API with location bias.**
Verified India pricing (Google Maps Platform India pricing list):

| SKU | Free/month | Cost per 1,000 |
|---|---|---|
| Places Nearby Search (Essentials/Pro tier) | 70,000 Essentials / 35,000 Pro | **$9.60** |
| Places Text Search (Essentials/Pro tier) | 70,000 / 35,000 | **$9.60** |
| Place Details (Essentials) | 70,000 | $1.50 |

So a 49-point grid × 1 keyword = 49 calls ≈ **$0.47**, and the free tier would cover
thousands of grids a month. Sounds free. It is not usable:

- **It measures the wrong thing.** Places API Nearby/Text Search is a *place search
  endpoint with its own ranking*, not the Google Maps local pack. Its results are
  ordered by its own `rankPreference`. Reporting them to an owner as "your Maps
  rank" would be a fabricated metric — precisely the thing Shoogle exists not to do.
- **The caching policy blocks the product.** Places API content may not be
  pre-fetched, cached or stored except within narrow allowances; **only Place IDs
  are explicitly exempt and storable indefinitely.** A rank-over-time chart *is* a
  stored time series of Places content. That is a compliance question, not a detail.
  **UNVERIFIED:** whether storing derived positional data (not content) clears the
  Maps Platform Terms. Do not build on this until someone reads the Terms and gets a
  written answer.
- **Deriving a competing ranking product** from Maps Platform content sits near the
  ToS restriction on using content to create competing services. Also **UNVERIFIED**,
  also needs a real answer before a line of code.

**Route 2 — scraping Google Maps from spoofed coordinates.**
Violates Google's Terms outright, breaks on every layout change, requires
residential proxies for Indian geolocation, and cannot run on a phone. **Rejected
unconditionally.** It is also exactly the kind of thing that gets an app removed
from Play.

**Route 3 — DataForSEO Google Maps SERP API.**
Vendor-published pricing (dataforseo.com, per SERP page): standard queue (5 min)
**$0.0006**, priority (1 min) **$0.0012**, live mode (6 s) **$0.002**. Minimum
deposit **$50**.

| Scenario | SERPs | Cost/run (USD) | ≈ INR¹ |
|---|---|---|---|
| 7×7 grid, 1 keyword, standard | 49 | $0.029 | ₹2.6 |
| 7×7 grid, 5 keywords, standard | 245 | $0.147 | ₹13 |
| Weekly, 5 keywords, per business | 980/mo | $0.588/mo | **≈₹52/business/month** |
| 500 businesses, weekly, 5 keywords | 490,000/mo | $294/mo | ≈₹26,000/month |

¹ at ≈₹88/USD, indicative only; DataForSEO bills in USD and FX moves.

This route works, is legitimate, and is affordable *per business*. It is also a paid
third-party dependency, requires a server (an API key like this can never ship in
the APK — anything `EXPO_PUBLIC_*` is readable by anyone who downloads the app), and
needs a vendor decision nobody has made.

### 4.3 Recommendation: do not build it

Five reasons, in order of weight.

1. **It is downstream of the actual blocker.** Geo-grid needs a canonical location
   identity — `metadata.placeId`, `latlng`, a verified listing. All of that comes
   from the GBP connection that does not exist. Building the measuring instrument
   before the thing it measures is connected is building the roof first.

2. **Shoogle is an operator, and this produces no operations.** The product rule is
   *propose and do work, don't build record-keeping surfaces*. A heatmap says "you
   are weak two kilometres north." The available levers are: category, reviews,
   photos, posts, hours, description — all of which the audit in §2 already surfaces
   and most of which Shoogle can fix in one tap — plus proximity, which is not
   editable because you cannot move a bakery. The grid generates anxiety with no
   button attached to it.

3. **The audit is the causal upstream.** Rank is an *output*. Categories, reviews
   and completeness are *inputs*. Shipping the output view first tells an owner
   their score is bad and gives them nothing; shipping the input view tells them
   which three things to fix. Fix the inputs, then measure.

4. **Cost and legality.** The free route (Places API) measures something else and
   has two unresolved ToS questions. The correct route (DataForSEO) costs real money
   per business forever, needs server infrastructure Shoogle does not yet have, and
   needs a vendor relationship and a paid tier to fund it.

5. **It doesn't fit the screen or the reader.** A 49-cell heatmap at 390×844, for a
   bakery owner who opened the app between two customers, is not a legible artifact.
   The honest mobile rendering of a geo-grid is a single SoLV number — and a single
   number is exactly the "rank #4" oversimplification the grid was invented to
   replace.

### 4.4 Ship this instead

In priority order. The first three are free once GBP is connected, first-party, and
directly useful.

1. **The audit in §2.** Every finding is actionable and most are one-tap fixable.
   This is the feature.

2. **Where people find you — from the Performance API.** The verified `DailyMetric`
   enum gives us, first-party and free: `BUSINESS_IMPRESSIONS_DESKTOP_MAPS`,
   `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH`, `BUSINESS_IMPRESSIONS_MOBILE_MAPS`,
   `BUSINESS_IMPRESSIONS_MOBILE_SEARCH`, `BUSINESS_CONVERSATIONS`,
   `BUSINESS_DIRECTION_REQUESTS`, `CALL_CLICKS`, `WEBSITE_CLICKS`,
   `BUSINESS_BOOKINGS`, `BUSINESS_FOOD_ORDERS`, `BUSINESS_FOOD_MENU_CLICKS`.
   Maps-vs-Search and mobile-vs-desktop splits answer "where are people finding me"
   with real numbers instead of a simulated grid.

3. **What people searched to find you.**
   `locations.searchkeywords.impressions.monthly` returns the actual queries that
   surfaced the listing. For a salon owner, *"1,240 people found you searching 'hair
   spa near me'"* is more useful, more true, and more motivating than *"you are rank
   4."* It is also the honest source of keyword suggestions for `C2`, `C4` and post
   copy — real demand, not a guessed keyword list.

4. **Did the fix work?** After Shoogle changes something, chart the
   impressions/calls/directions delta against the change date. This is the ACT
   phase's monitoring loop and the `leadingIndicator` field earning its keep. It is
   also the only ranking-adjacent claim we can make honestly: not "you moved to #2",
   but "since we fixed your categories, 40% more people asked for directions."

5. **Keep `SeoProvider` honest in the meantime.** `getRankings()` returns
   `unavailable('not_supported', 'Shoogle does not measure map rankings yet.')`. The
   contract already allows `position: null` and the README already requires it render
   as words. No placeholder ranks, no "coming soon" chart with fake bars.

6. **Revisit with a concrete trigger, not "never".** Reconsider geo-grid when all of:
   (a) GBP is connected for a majority of active businesses, (b) a server-side job
   runner exists, (c) there is a paid tier that can absorb ≈₹50/business/month, and
   (d) owners are actually asking for it. Then it ships behind that tier, via
   DataForSEO, server-side, presented as SoLV plus a "strongest / weakest direction"
   sentence — not as a 49-cell grid on a phone.

**One thing worth borrowing from `seo-maps` now, for free:** cross-platform presence.
Bing Places is a plausible input to AI assistants, and Apple Maps matters for iPhone
users. A one-off "are you listed on Bing Places / Apple Business Connect?" check is
cheap, needs no grid, and produces a real action. Park it as a candidate check for
v2 rather than adding it to §2 unverified — first confirm what those platforms'
self-serve listing flows actually support in India.

---

## 5. Severity and ordering

### 5.1 Severity definitions

Three levels, matching `AuditFinding['severity']` exactly. `claude-seo` uses four
(Critical/High/Medium/Low); we collapse High→`important` and Medium+Low→`minor`
rather than widening a shared contract.

**`critical` — a customer is being lost or misled *today*.**
The listing is invisible, unreachable, or actively saying something false. The owner
would be angry if they knew. Qualifying: `A2` unverified, `A3` wrongly marked
closed, `B2` no address, `B4` no phone, `C1` no primary category, `D1` no hours,
`F4` unanswered 1–2★ reviews.
*Test:* can you finish the sentence "because of this, someone who wanted to buy from
you today could not"? If not, it is not critical.

**`important` — measurably suppresses discovery or conversion.**
Nothing is broken, but the business is competing with a hand tied. The owner would
notice the difference within a few weeks of fixing it. Everything inferred from a
practitioner heuristic caps out here.

**`minor` — polish.**
Real, cheap, small. Never surfaced above the fold. Never notified about.

**Not a severity: `not_checked`.** It has no severity because it is not a finding.
It goes to `uncheckedAreas`.

### 5.2 Ordering

The owner will act on two or three things. Ordering is the feature.

```
priority = severityWeight × confidenceFactor × fixability ÷ effort
```

| Term | Values |
|---|---|
| `severityWeight` | critical 100 · important 40 · minor 10 |
| `confidenceFactor` | observed 1.0 · inferred 0.6 |
| `fixability` | auto 1.3 · assist 1.2 · guide 1.0 · owner 0.8 |
| `effort` | minutes of owner time: auto 1 · assist 2 · guide 5 · owner 15 |

`fixability` deliberately rewards what Shoogle can do *for* the owner. A fix that
costs one tap and a fix that costs a trip to the bank are not the same
recommendation even at identical severity.

### 5.3 Hard rules that override the formula

1. **`A1` alone, or nothing.** If GBP is not connected, the report contains exactly
   one finding — connect — and no others. Twelve findings that all say "we can't see
   anything" is noise.
2. **`A2` outranks everything.** An unverified listing blocks most writes; fixing
   anything else first wastes the owner's afternoon.
3. **One category-change proposal per run.** `C2` is high-impact and inferred; two at
   once is a coin flip presented as advice.
4. **`observed` beats `inferred` at equal severity**, regardless of the formula.
5. **Top three, then a fold.** The Business tab shows three findings and "{n} more
   things to check". Notifications fire only for `critical`, at most one per day.
6. **Never re-raise a dismissed inferred finding.** Dismissal is data. Persist it per
   check id and suppress it until the underlying observation changes.
7. **Never surface a fix whose write path does not exist.** If the provider method is
   not implemented, the finding shows as `guide` with real steps, or does not ship.
   No dead controls.

### 5.4 The presented shape

```
Your profile — not scored yet
Shoogle checked 6 of 33 things. Connect Google to check the rest.

DO THIS FIRST
  1  Two unhappy reviews have no reply          [Draft replies]
  2  Your listing has no main category          [Suggest one]
  3  Diwali is in 9 days — hours not set        [Set hours]

  ▸ 4 more things to check

NOT CHECKED
  Photos · Google posts · Description
  — not connected
```

Every row is a verb the owner recognises. No jargon: no "NAP", no "schema", no
"citations", no "SoLV". The severity colour comes from `theme`, never hard-coded.

---

## 6. Implementation notes

- **Boundaries.** Everything lands in `features/audit/` (engine, checks, scoring,
  types), `features/gbp/` (GBP provider implementation), `features/seo/` (rankings,
  which stays `not_supported`), `app/(tabs)/business.tsx`, and new routes under
  `app/seo/`. Fixtures for check outcomes go in `fixtures/`, dev-gated, behind
  `<FixtureBanner />`.
- **Registration.** `registerProvider('google_business', gbpProvider)` from
  `features/gbp/register.ts` at runtime. `lib/providers/registry.ts` is not edited.
- **Contract changes needed** (PR to Sunny, not an edit): write methods on
  `GoogleBusinessProfileProvider` for categories, description, service items,
  attributes, special hours, and media upload. The `warn` outcome and the
  falsifiability fields are handled entirely feature-side, so `AuditFinding` itself
  needs no change.
- **Two API surfaces.** Business Information API v1 for the location fields; legacy
  Google My Business API v4.9 for reviews, media and local posts. Both need
  enabling; the quota approval covers the project, not a single API. Confirm scopes
  and the current quota-request process with the `api-researcher` agent before any
  integration code — this document is methodology, not an API report.
- **Tests.** Each check is a pure function `(observations) => CheckOutcome` and gets
  a table test covering pass, fail, measured-zero, `not_checked`, and
  `not_applicable`. The scorer gets tests asserting that (a) a `not_checked` never
  changes the score, (b) each gate in §3.3 returns
  `unavailable('insufficient_data')`, and (c) no code path can produce `score: 0`
  from absent data.

---

## 7. Open questions

| # | Question | Blocks |
|---|---|---|
| 1 | Does the Maps Platform ToS permit storing *derived* rank positions (not content) from Places API? | Any free geo-grid route |
| 2 | Current GBP quota-approval process, timeline, and required scopes for v1 + v4.9 | Everything `gbp.*` |
| 3 | Does `reviews.reply` reflect replies posted outside Shoogle? | `F3`, `F4` |
| 4 | Do Bing Places and Apple Business Connect offer usable self-serve listing flows in India? | The v2 cross-platform check |
| 5 | Is there a maintained, state-aware Indian holiday dataset we can license, or must we curate one? | `D3`, the highest-value check |
| 6 | Which website does `I1`–`I3` audit when the owner has both their own site and a Shoogle-generated one? | Handoff with `app/website/` |
