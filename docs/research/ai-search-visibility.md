# AI-search visibility for Indian local businesses

**Status:** research only — nothing here is implemented.
**Owner:** Pranay (`features/audit/`, `features/seo/`, `features/gbp/`, `app/(tabs)/business.tsx`, `app/seo/`).
**Last verified:** 2026-08-30.
**Method:** first-party documentation where it exists; every third-party claim is
labelled with its source and confidence. Anything I could not confirm from a
first-party source is marked **UNVERIFIED** and must not be the basis of a
shipped claim.

> **Why this document exists.** An Indian salon owner is increasingly discovered
> through an AI answer, not only through the map pack. Grexa does not address
> this. Before we build anything, we need to know which of those signals are
> *real*, which are *measurable*, and which are neither — because a feature that
> claims to measure something it cannot is exactly what `CLAUDE.md` forbids
> (rules 6, 7, 8, 10).

---

## 0. How to read this document

Every claim carries a confidence label:

| Label | Meaning |
|---|---|
| **CONFIRMED** | Stated in first-party documentation by the party who owns the system (Google, OpenAI, Anthropic, Perplexity, schema.org), or directly observed by me during this research. |
| **STUDY** | A named third-party study with a stated sample and method. Correlational, not causal. Usable as *rationale copy*, never as a measured number we show the owner. |
| **INDUSTRY** | Practitioner consensus or a survey of practitioners. Directional only. |
| **UNVERIFIED** | Could not be confirmed. Do not build on it. |

---

## 1. Executive summary

1. **Google's own position is that there is no separate "AI SEO".**
   Google's AI optimization guide states there is no special markup, no
   AI-text file, no chunking and no AI-specific rewriting needed; a page needs
   to be *indexed and eligible to be shown with a snippet*. **CONFIRMED.**
   This is good news: the honest feature is a *local search hygiene* feature,
   not an "AI ranking" feature we cannot verify.

2. **The two biggest local AI surfaces have different data sources.**
   Google's AI features are grounded in Google Business Profile / Google Maps
   data (Google ships "Grounding with Google Maps" over 250M+ places as a
   product — **CONFIRMED**). ChatGPT and Perplexity are grounded in *the open
   web they are permitted to crawl* — which for India means Justdial, Sulekha,
   IndiaMART, Zomato and the business's own website. I verified this directly:
   **Justdial's `robots.txt` explicitly `Allow: /` for `OAI-SearchBot`,
   `Claude-SearchBot`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`
   and `ChatGPT-User`, while `Disallow: /` for `GPTBot` and `ClaudeBot`**
   (the training-only crawlers). **CONFIRMED — observed 2026-08-30.**
   That is a concrete, India-specific finding: a Justdial listing is a live
   AI-answer surface, and Google Business Profile is not the only lever.
   **This matters because GBP is currently blocked for us and Justdial is not.**

3. **AI Overviews are not uniformly present on local queries.** Whitespark's
   540-query study found AI Overviews on **15%** of simple local-intent
   queries, **92%** of informational-intent queries and **97%** of hybrid
   queries — while local packs appeared on 93% of the simple local queries.
   **STUDY.** The widely-quoted "68% of local searches" figure is an average
   across all three intent classes and is misleading alone. **We must never
   tell a salon owner "AI answers 68% of your searches."**

4. **Off-site presence outweighs on-site tinkering.** Ahrefs' 75,000-brand
   study (Spearman, published 2025-05-26) found branded *web mentions*
   correlate 0.664 with AI Overview brand visibility versus 0.218 for
   backlinks. The authors explicitly write "correlation ≠ causation" and note
   all factors were "moderate to very weak". **STUDY.** Google separately
   warns that "seeking inauthentic 'mentions' across the web isn't as helpful
   as it might seem". **CONFIRMED.** So: real listings on real directories,
   never mention-farming.

5. **Most of what matters IS measurable for free** — because most of it lives
   on surfaces we can legitimately read: the owner's own website (JSON-LD,
   visible NAP, headings, robots.txt, server-rendered HTML), plus Google
   Places API (name / address / phone / rating / review count) at a free tier
   of **7,000 Place Details Enterprise calls per month for India**.
   **CONFIRMED.**

6. **The single hardest limit is caching.** Google Maps Platform terms allow
   storing only `place_id` indefinitely and lat/lng for 30 days; ratings,
   reviews and phone numbers must be fetched live and may not be warehoused.
   **CONFIRMED.** This kills any naive "review velocity chart" built on Places
   API. It does not kill the feature — see §7.6 for the honest form.

7. **We cannot measure "are you cited in AI Overviews".** There is no API for
   it. Search Console's Generative AI report is UI-only and is about the
   owner's *website*, not their Business Profile. Programmatic probing via
   Gemini grounding measures *the Gemini API's* answer, not what a consumer
   sees. Any feature built on it must say so on screen. See §6.1 and §7.5.

---

## 2. What actually drives whether a local business is cited in an AI answer

### 2.1 Google's first-party position (the floor)

From Google's AI optimization guide and the AI-features documentation
(**CONFIRMED**, quoted):

- "To be eligible to be shown as a supporting link in AI Overviews or AI Mode,
  a page must be indexed and eligible to be shown in Google Search with a
  snippet."
- "You don't need to create new machine readable files, AI text files, markup,
  or Markdown to appear in Google Search."
- "Structured data isn't required for generative AI search, and there's no
  special schema.org markup you need to add." (Google still recommends it for
  rich results and page understanding.)
- "There's no requirement to break your content into tiny pieces for AI to
  better understand it."
- "You don't need to write in a specific way just for generative AI search."
- "Seeking inauthentic 'mentions' across the web isn't as helpful as it might
  seem."
- On `llms.txt` and AI text files: they "won't harm (nor help) your visibility
  or rankings in Google Search, as Google Search ignores them."

**Consequence for Shoogle:** we must never sell "AI schema", "llms.txt" or
"AI-optimised rewriting" as a lever for Google. If we ever generate an
`llms.txt` (via Devashish's website feature) it ships with a banner saying
Google ignores it and that no provider has confirmed consuming third-party ones.

### 2.2 Google's first-party position on *local* ranking

From Google Business Profile Help (**CONFIRMED**):

- Local results are ranked on **relevance**, **distance** and **prominence**.
- "More reviews and positive ratings can help your business's local ranking."
- Complete, current information (address, hours, category, attributes) helps
  relevance.
- "There's no way to request or pay for a better local ranking on Google."

Because Google's AI local answers are grounded in Maps/GBP data (§2.4), the
things that make a profile rank are largely the things that make it citable.
That is the honest bridge from "local SEO" to "AI visibility" — and Google lays
it down itself.

### 2.3 The signal table

| Signal | Evidence | Confidence | Measurable without paid tooling? |
|---|---|---|---|
| Page indexed + snippet-eligible | Google AI features docs | CONFIRMED | Partly — we can read `robots.txt`, `<meta name="robots">`, `X-Robots-Tag`, canonical. We cannot confirm actual indexation without Search Console. |
| Correct GBP **primary category** | Whitespark 2026 survey ranks it the #1 local pack factor; wrong category the #1 negative factor | INDUSTRY (survey of ~47 practitioners) | Only with GBP connected, or loosely inferred from Places `primaryType` (§6.3). |
| Complete, current GBP (hours, phone, address, photos) | Google GBP Help, "relevance" | CONFIRMED | Partly via Places API (`regularOpeningHours`, `businessStatus`, `nationalPhoneNumber`, `websiteUri`). |
| Review **volume** and **rating** | Google GBP Help, "prominence" | CONFIRMED | Yes — Places `rating`, `userRatingCount`. Live-fetch only (§6.2). |
| Review **recency / velocity** | Sterling Sky case studies (tiny n: one listing 3→16→31; three businesses 9→10; three more 10→11). The "18-day rule" is their editorial TL;DR, not a measured threshold | STUDY, weak; the "18 days" number specifically is **UNVERIFIED** | Only with connected GBP (blocked), or repeated live Places calls, which the Maps caching terms make awkward (§6.2). |
| **NAP consistency** across website / schema / Google | Google's prominence definition + practitioner consensus | INDUSTRY (no first-party quantification found) | **Yes, for the three sources we can legitimately read** (§4.3). Not across third-party directories (§6.4). |
| Presence on directories that AI search engines crawl | Justdial / IndiaMART robots.txt observed to allow AI search crawlers | CONFIRMED (observed) | Presence: owner attestation only. Listing content: no (§6.4). |
| Branded **web mentions** | Ahrefs 75k brands, Spearman 0.664 vs 0.218 for backlinks; authors state correlation ≠ causation | STUDY | Not reliably — and Google warns against chasing them. |
| Wikipedia / Wikidata entity presence | claude-seo `seo-geo`; ChatGPT citation-source distributions (Wikipedia 47.9%, Reddit 11.3%) | STUDY / INDUSTRY | Technically yes (free APIs) — but **irrelevant** for a neighbourhood salon. Do not ship (§8). |
| Server-rendered HTML (AI crawlers do not run JS) | Vercel/MERJ analysis of 500M+ GPTBot fetches found zero JS execution; Google-Extended is the exception, inheriting Googlebot rendering | STUDY, strong and mechanistically plausible | **Yes** — fetch raw HTML, compare text volume against a JS-shell heuristic. |
| AI crawler allowed in `robots.txt` | OpenAI / Anthropic / Perplexity / Google crawler docs | CONFIRMED | **Yes**, trivially. |
| Structured data (`LocalBusiness` + subtype) | Google: not required for AI, recommended for rich results and understanding | CONFIRMED | **Yes** — parse JSON-LD from the site. |
| Passage citability (134–167-word self-contained blocks; ~44% of citations from the first 30% of a page) | claude-seo `seo-geo`, citing an SE Ranking study | STUDY, third-party thresholds | Mechanically yes (word counts). The *threshold* is not first-party — see §7.7. |
| `llms.txt` | Google says Search ignores it; SE Ranking's 300k-domain study found 1 of the 50 most-cited domains had one; OtterlyAI server logs found 0.1% of AI-bot requests hit it | CONFIRMED (Google) + STUDY | Yes, but **assign zero weight**. |

### 2.4 The two-surface problem (the part most people get wrong)

There is not one "AI search". There are at least four, with different inputs:

| Surface | What grounds it | What that means for a Nerul salon |
|---|---|---|
| **Google AI Overviews** | Same ranking systems as classic Search; cites pages that already rank. **CONFIRMED** (Google docs) | Classic local SEO plus a crawlable website. |
| **Google AI Mode** | Custom Gemini, broader citation pool. Ahrefs (540k query pairs) reports AI Mode and AI Overviews cite the same URLs only 13.7% of the time. **STUDY** | Freshness and entity clarity matter more than raw position. |
| **Google Maps / Gemini grounding** | "Grounding with Google Maps", GA in 2026, over **250 million businesses and places**; subjective review-based questions supported for places in **the United States and India**. **CONFIRMED** | GBP completeness and reviews feed Gemini answers directly. India is explicitly in scope. |
| **ChatGPT / Perplexity / Claude** | The open web they are permitted to crawl. `OAI-SearchBot` determines ChatGPT search inclusion; `GPTBot` is training-only and does **not** affect it. **CONFIRMED** (OpenAI docs) | Justdial / Sulekha / IndiaMART / Zomato listings and the business's own raw HTML. |

**Crawler facts, all CONFIRMED from the owning party's own documentation:**

| Agent | Owner | Purpose | Respects robots.txt | Affects AI-search inclusion |
|---|---|---|---|---|
| `GPTBot` | OpenAI | Foundation-model training | Yes | **No** |
| `OAI-SearchBot` | OpenAI | "surface websites in search results in ChatGPT's search features" | Yes | **Yes** |
| `ChatGPT-User` | OpenAI | User-initiated fetches | No — "robots.txt rules may not apply" | No |
| `ClaudeBot` | Anthropic | Model training | Yes | No |
| `Claude-SearchBot` | Anthropic | "improve search result quality for users" | Yes | Yes |
| `Claude-User` | Anthropic | User-initiated fetches | Yes | No |
| `PerplexityBot` | Perplexity | "surface and link websites in search results on Perplexity… not used to crawl content for AI foundation models" | Yes | **Yes** |
| `Perplexity-User` | Perplexity | User-initiated | "generally ignores robots.txt" | No |
| `Google-Extended` | Google | Gemini training + grounding opt-out | Yes | "does not impact a site's inclusion in Google Search nor is it used as a ranking signal" |

**The trap this table lets us avoid:** the common advice "allow GPTBot so
ChatGPT can find you" is **wrong per OpenAI's own docs**. Any robots.txt audit
Shoogle ships must check `OAI-SearchBot`, `Claude-SearchBot` and
`PerplexityBot` — not `GPTBot`.

### 2.5 India-specific finding: the directories are already AI surfaces

Observed directly on 2026-08-30 by fetching `robots.txt`:

- **justdial.com** — `Allow: /` for `OAI-SearchBot`, `OAI-AdsBot`,
  `ChatGPT-User`, `Claude-User`, `Claude-SearchBot`, `anthropic-ai`,
  `claude-web`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`,
  `Googlebot`, `Bingbot`, `Applebot`, `Amazonbot`.
  `Disallow: /` for `GPTBot`, `ClaudeBot`, `Baiduspider`, `Yandex`,
  `ia_archiver`. Only API and internal paths are blocked for `*`.
- **indiamart.com** — `Allow: /` for `OAI-SearchBot`, `GPTBot`,
  `Google-Extended`; `Disallow: /` for `ClaudeBot`.
- **sulekha.com** — directives present for `GPTBot`, `OAI-SearchBot`,
  `Google-Extended`, `Applebot`, `Bingbot`, but the per-agent allow/disallow
  values were not cleanly readable in one pass. Treat Sulekha's specifics as
  **UNVERIFIED** until re-read.
- **zomato.com** — permissive `Allow: /` with path-level exclusions under
  `Googlebot`; no AI-specific agent directives seen in the head of the file.
- **practo.com** — returns `403 Access Denied` to a non-browser client, so its
  robots.txt could not be read. **UNVERIFIED.**

**So:** Justdial deliberately lets the AI *search* crawlers in and keeps the
*training* crawlers out. A complete, accurate Justdial listing is therefore a
genuine ChatGPT/Perplexity visibility asset for an Indian salon — and unlike
GBP it is not gated behind an API quota approval. This is the strongest
India-specific angle in this document and the one Grexa is least likely to have.

Caveat that must survive into the UI: robots.txt is a *permission*, not proof
of crawling or citation. We may say "this directory permits AI search
crawlers". We may **not** say "listing here gets you cited".

---

## 3. Schema.org markup that matters for local businesses

### 3.1 Google's required and recommended properties

From Google's LocalBusiness structured-data documentation (**CONFIRMED**):

- **Required:** `name`, `address` (a `PostalAddress` with `streetAddress`,
  `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`).
- **Recommended:** `geo` (lat/lng, 5+ decimal places), `telephone`, `url`,
  `openingHoursSpecification`, `priceRange` (under 100 characters), `image`,
  `menu` and `servesCuisine` (restaurants), `department`, and
  `aggregateRating` / `review` **only where the site captures reviews about a
  business** — a business must not self-serve its own aggregate rating.
- Google recommends using "the most specific `LocalBusiness` sub-type
  possible".
- Enables: knowledge panel in Search and Maps, business carousels, hours and
  department display.

### 3.2 Subtype map for Shoogle's seven verticals

`types/domain.ts` defines `BusinessCategory` as
`salon | gym | clinic | restaurant | bakery | boutique | repair_shop | other`.
Mapping each to the most specific schema.org type (**CONFIRMED** against
schema.org):

| `BusinessCategory` | schema.org `@type` | Hierarchy | Vertical properties worth emitting |
|---|---|---|---|
| `salon` | `HairSalon` (or `BeautySalon`, `NailSalon`, `DaySpa`) | Thing → Organization/Place → LocalBusiness → **HealthAndBeautyBusiness** → HairSalon | `hasOfferCatalog` / `makesOffer` of `Service` (haircut, colour, bridal), `openingHoursSpecification`, `priceRange` |
| `gym` | `HealthClub` — schema.org has no `Gym` type; `ExerciseGym` exists separately under `SportsActivityLocation` | LocalBusiness → HealthAndBeautyBusiness → HealthClub | `openingHoursSpecification` (early/late hours matter), `amenityFeature`, membership `Offer` |
| `clinic` | `MedicalClinic`, or `Dentist` / `Physiotherapy` where applicable — **not** generic `MedicalBusiness` | LocalBusiness → MedicalBusiness → MedicalClinic | `medicalSpecialty`, `availableService`, `Physician` (a `Person`) with `sameAs` to a Practo profile |
| `restaurant` | `Restaurant` (or `CafeOrCoffeeShop`, `FastFoodRestaurant`) | LocalBusiness → **FoodEstablishment** → Restaurant | `servesCuisine`, `hasMenu` with `MenuSection` + `MenuItem`, `acceptsReservations` |
| `bakery` | `Bakery` | LocalBusiness → FoodEstablishment → Bakery | `hasMenu`, `servesCuisine`, `openingHoursSpecification` |
| `boutique` | `ClothingStore` | LocalBusiness → **Store** → ClothingStore | `hasOfferCatalog`, `paymentAccepted`, `currenciesAccepted` |
| `repair_shop` | `AutoRepair` for vehicles; otherwise `ProfessionalService` or an appropriate `Store` subtype | LocalBusiness → AutomotiveBusiness → AutoRepair | `areaServed`, `makesOffer` of `Service` |
| `other` | `LocalBusiness` | — | Stay generic rather than guess wrong. |

Notes:
- `HairSalon`, `BeautySalon`, `NailSalon`, `DaySpa` and `HealthClub` are all
  direct children of `HealthAndBeautyBusiness`. **CONFIRMED (schema.org).**
- A **service-area business** (mobile beautician, home repair) should carry
  `areaServed` and may legitimately omit `streetAddress` — but then it is no
  longer eligible for address-dependent features, and our audit must not score
  it as "missing address".
- India specifics: `addressCountry: "IN"`, `postalCode` = 6-digit PIN,
  `addressRegion` = state, `priceRange` in ₹ bands (`"₹₹"` or `"₹300–₹1500"`),
  `currenciesAccepted: "INR"`, `telephone` in E.164 (`+91XXXXXXXXXX`).

### 3.3 The honest framing for schema

Google says structured data is **not required** for AI features. So the copy in
the app must read like this:

> "Adds machine-readable business details to your site. Google says this isn't
> required to appear in AI answers, but it's how search engines and assistants
> read your hours, address and services without guessing."

Not: "Add schema to get into AI Overviews."

### 3.4 Validation: what we can and cannot do

- Google's **Rich Results Test** and schema.org's **Markup Validator** have no
  documented public API. We therefore cannot outsource validation; we must
  validate locally.
- Locally we *can* do a genuinely useful subset with no dependencies: parse
  every `<script type="application/ld+json">`, `JSON.parse` it, walk `@graph`,
  check `@type` is a `LocalBusiness` descendant, check `name` and `address`
  exist and `address` carries the required sub-properties, check `telephone`
  parses as a phone number, check `priceRange` is under 100 characters, check
  `geo` precision. That is a real, defensible set of checks.
- We **cannot** claim "your schema is valid" — only "these specific checks
  passed". `AuditReport.uncheckedAreas` exists for exactly this.

---

## 4. NAP consistency

### 4.1 What it is

**N**ame, **A**ddress, **P**hone — the identity triple. NAP consistency means
the same business is described identically everywhere it appears. Its purpose
is *entity resolution*: letting a machine confirm that the Justdial listing,
the Google Business Profile, the website footer and the JSON-LD describe one
business rather than four.

### 4.2 Why it matters

- Google's stated **prominence** factor is about how well known a business is,
  informed by information Google has about it across the web. **CONFIRMED.**
- Practitioner consensus is that inconsistent NAP reduces confidence in the
  entity and splits signals. **INDUSTRY** — I found no first-party Google
  statement quantifying this. Do not present a number.
- For AI answers specifically this is the mechanism that matters most: an
  assistant assembling an answer from Justdial plus the website plus Maps must
  decide those are the same business. Conflicting phone numbers are the most
  common way an Indian small business breaks that.

### 4.3 How to check it — the three-source method we can actually run

claude-seo's `seo-local` compares three sources — **visible page HTML**,
**LocalBusiness JSON-LD**, and **visible GBP data** — and flags discrepancies
between them. That is exactly the right scope for us, because all three are
readable without a paid API:

| Source | How Shoogle reads it | Availability |
|---|---|---|
| A. Visible page HTML (footer / contact page) | Fetch the owner's site, strip tags, match phone patterns and the address block | Free, available whenever the owner has a website |
| B. `LocalBusiness` JSON-LD on the same page | Parse `application/ld+json` | Free |
| C. Google's record | Places API `displayName` / `formattedAddress` / `nationalPhoneNumber`, or the connected GBP once quota is approved | Places free tier (§5.3); GBP currently blocked |
| D. Owner-attested directory listings | Owner pastes their Justdial / Practo / Zomato listing URL once | Free; owner input, so use sparingly (product rule 2) |

Comparison must be **normalised** or it will produce false alarms constantly:

**Phone (India).** Strip every non-digit. Drop a leading `0`. Drop a leading
`91` when 12 digits remain. Compare the final 10 digits for mobiles. For
landlines keep the STD code (`022`, `020`, `011`…) and compare
`STD + subscriber`. Treat `+91 98765 43210`, `098765 43210`, `9876543210` and
`+919876543210` as **identical** — flagging those as a mismatch is the fastest
possible way to make the feature untrustworthy.

**Name.** Case-fold, collapse whitespace, strip legal suffixes (`Pvt Ltd`,
`LLP`, `& Co`) and strip appended location or keyword tails
(`— Best Salon in Nerul`). Report a difference as *"your website says X, Google
says Y"* — never auto-"fix", because Google's version may be the wrong one.

**Address.** Do not attempt string equality. Anchor on the **6-digit PIN code**
and `addressLocality`, then token-overlap the remainder (Jaccard over
lower-cased tokens, treating `shop`, `no`, `floor`, `opp`, `near`, `road`,
`rd`, `marg`, `sector`, `chs` as stopwords). Report one of three states:
`match` / `partial` / `conflict` — and when `partial`, say which tokens differ
rather than asserting a fault.

**Every one of these comparisons must be able to return "not checked".**
If the owner has no website, A and B are `unavailable('no_data_yet', …)`, not
a failing score.

### 4.4 What NAP checking must never do

- Never auto-edit a directory listing. We have no write access and no
  permission.
- Never report a "citation score" derived from directories we did not read.
- Never scrape Justdial / Practo / Zomato listing pages. Justdial's robots.txt
  permits AI search bots *by name*; Shoogle is not one of them. Practo returns
  403 to non-browser clients (observed). Owner-pasted URLs and owner
  attestation are the honest path.

---

## 5. What is measurable without a paid API

### 5.1 The owner's own website — free, high signal, no credentials

A plain `fetch()` returns the raw HTML. React Native imposes no CORS
restriction so this works on-device today; a server-side fetch (Supabase edge
function) is preferable for caching and a consistent user-agent. From one fetch
of the homepage plus `/robots.txt` we can honestly compute:

| Check | Method | Evidence basis |
|---|---|---|
| Site reachable, final status, redirect chain, HTTPS | HTTP response | Baseline |
| AI-search crawlers permitted | Parse `robots.txt` for `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Googlebot`, `Bingbot` | OpenAI / Anthropic / Perplexity docs — **CONFIRMED** |
| Indexing blocked | `<meta name="robots">`, `X-Robots-Tag` header | Google: page must be indexable — **CONFIRMED** |
| Snippet suppressed | `nosnippet`, `max-snippet:0`, `data-nosnippet` | Google: page must be *snippet-eligible* — **CONFIRMED**. A silent killer almost nobody checks |
| Content visible without JavaScript | Ratio of text in raw HTML to `<script>` bytes; detect empty `#root` / `#app` shells | Vercel/MERJ 500M-fetch analysis — **STUDY** |
| `LocalBusiness` JSON-LD present, correct subtype, required properties | Parse `application/ld+json` | Google structured-data docs + schema.org — **CONFIRMED** |
| Visible NAP in HTML | Pattern match + normalisation (§4.3) | INDUSTRY |
| `tel:` click-to-call present | Anchor scan | INDUSTRY |
| Title / H1 contain locality and service | Text parse | INDUSTRY |
| Dedicated service pages exist | Internal link + sitemap scan | INDUSTRY (Whitespark ranks service pages highly) |
| Freshness | `Last-Modified` header, sitemap `<lastmod>`, `dateModified` in schema | SE Ranking freshness study — **STUDY** |
| `llms.txt` present | Fetch `/llms.txt` | **Report only. Zero weight.** Google ignores it — **CONFIRMED** |

**Cost: zero. Credentials: none. Blocked by the GBP quota: no.**
This is the single most shippable body of work in this document.

### 5.2 Google Search Console — free, but needs owner verification

- Free, OAuth'd, and the only first-party source of *Google's own* view of the
  site.
- Since 2026-06 there is a **Generative AI performance report** in Search
  Console showing impressions inside AI Overviews and AI Mode. **CONFIRMED**
  that Google announced it.
- **UNVERIFIED and important:** whether that breakdown is exposed through the
  Search Analytics API. The published API reference lists `type` values as only
  `discover | googleNews | news | image | video | web`, with no AI value, and
  does not enumerate `searchAppearance` values. Secondary sources contradict
  each other on whether `AIOverview` / `AIGenerated` search appearances now
  exist. **Verify with a live API call before any UI promises it.**
- Practical blocker: requires the owner to have a website *and* verify
  ownership of it. Most Indian salons fail both. Treat as an upgrade path, not
  a foundation.

### 5.3 Google Places API (New) — cheap, no GBP quota approval needed

This is the workaround for the current GBP blocker. It is a **read-only,
public** view of the business, needs no owner OAuth, and returns:
`displayName`, `formattedAddress`, `nationalPhoneNumber`,
`internationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount`,
`reviews`, `regularOpeningHours`, `primaryType`, `types`, `businessStatus`.
**CONFIRMED** (Place Details (New) docs).

India pricing, **CONFIRMED** from Google's India pricing list:

| SKU | Free per month | Then, per 1,000 |
|---|---|---|
| Place Details **Essentials** (India) | 70,000 | $1.50 |
| Place Details **Pro** (India) | 35,000 | $5.10 |
| Place Details **Enterprise** (India) | 7,000 | $6.00 |
| Place Details **Enterprise + Atmosphere** (India) | 7,000 | $7.50 |

`rating`, `userRatingCount` and `reviews` sit in the Enterprise / Atmosphere
tiers, so the practical budget is **7,000 rating-bearing lookups per month
free**. At one refresh per business per day that is roughly 230 businesses —
enough for launch, a real cost line at scale.

**Hard constraint (CONFIRMED — Places policies plus Maps Platform terms):** you
may store `place_id` indefinitely and cache lat/lng for up to 30 days.
Everything else — ratings, review counts, reviews, phone numbers — must not be
pre-fetched, cached or stored, and displaying it requires Google Maps
attribution. See §6.2 for what this rules out.

### 5.4 Gemini API grounding — a real but carefully bounded probe

- **Grounding with Google Search**: 5,000 free grounded search requests per
  month, then **$14 per 1,000**. **CONFIRMED** (Gemini API pricing).
- **Grounding with Google Maps**: 5,000 free prompts per month, then $14 per
  1,000. Globally available, English-only prompts and responses; subjective
  review-based questions are supported for places in the **US and India**.
  **CONFIRMED.**
- Returns source annotations carrying the source URL and place name, and
  mandates that Google Maps sources "immediately follow the generated content
  that the sources support" and be "viewable within one user interaction", with
  the "Google Maps" wording preserved and unlocalised. **CONFIRMED** — these
  are display obligations we would have to honour in React Native.
- **Must be called server-side.** Per `CLAUDE.md`, generation API keys are
  never `EXPO_PUBLIC_` and never enter the app.

**What this can honestly measure:** "When we asked Gemini, grounded in Google
Search and Maps, `best hair salon in Nerul West`, these businesses and sources
were cited. Yours was / was not among them."

**What it cannot measure:** what a consumer sees in AI Overviews, AI Mode,
ChatGPT or Perplexity. It is one model, one prompt, one moment, from one server
location. §7.5 gives the only honest way to ship it.

### 5.5 Free supporting APIs, and whether they are worth it

| API | Free? | Useful for Shoogle? |
|---|---|---|
| **PageSpeed Insights API** | Usable with or without a key; a key is "recommended for frequent, automated queries". **CONFIRMED**. Exact quota numbers are not in the get-started doc — **UNVERIFIED** | Marginal. Speed is not an AI-citation lever. Skip for v1. |
| **Wikidata / Wikipedia API** | Free | **No.** A neighbourhood salon will never have an entity. An always-red "no Wikipedia presence" row is noise dressed as insight. |
| **OpenStreetMap Nominatim** | Free, but a hard **1 request/second** limit, requires an identifying User-Agent, forbids systematic/grid querying, and requires ODbL attribution. **CONFIRMED** (OSMF policy) | Possible address cross-check. Low value, policy risk if batched. Not for v1. |
| **Bing Places / Bing Webmaster Tools** | Free, needs verification | Worth revisiting. The practitioner claim that Bing's index feeds ChatGPT and Copilot is **UNVERIFIED** — OpenAI does not document its index source. Do not assert it. |

---

## 6. Honest limits — what we cannot measure, and why

These belong in the UI, not only in this file. `AuditReport.uncheckedAreas` and
`DataState.unavailable(reason, message)` exist for exactly this.

### 6.1 We cannot measure whether a business appears in AI Overviews

No API exposes AI Overview citations. Search Console's generative-AI report is
UI-only, applies to a verified *website* rather than a Business Profile, and its
API availability is **UNVERIFIED**. Every third-party AI-visibility tracker
(Profound, Peec, Otterly, SE Ranking, Ahrefs Brand Radar) samples by running
queries itself — the same approximation as §5.4, sold at a subscription price.
**Any claim of "your AI Overview visibility is N%" is fabricated unless we state
the sampling method.**
→ `unavailable('not_supported', 'No provider exposes AI Overview citations.')`

### 6.2 We cannot chart review velocity from the Places API

Maps Platform terms permit caching only `place_id` (indefinitely) and lat/lng
(30 days); ratings and review counts must be fetched live and not warehoused.
**CONFIRMED.** A time series of review count requires storing review counts.
So:

- ✗ "Reviews over the last 6 months" chart built on Places data.
- ✓ Live "Right now: 4.3★ from 128 ratings on Google", with Google attribution.
- ✓ A real velocity chart **once GBP is connected**, because then the data is
  the owner's own, retrieved with their consent under the GBP API terms — a
  separate legal basis that the api-researcher agent must confirm before we
  build it.

### 6.3 We cannot verify the GBP primary category without GBP

Places API returns `primaryType` from Google's public place taxonomy, which is
*related to* but not identical to the GBP category list the owner selects. We
can say "Google currently classifies you as `hair_care`". We cannot say "your
primary category is wrong" — that needs the category the owner actually set.
→ Blocked on GBP quota approval.

### 6.4 We cannot audit NAP across third-party directories

Reading Justdial, Sulekha, Practo or Zomato listing pages programmatically
means either scraping (against their terms; Practo returns 403 to non-browser
clients) or a paid data provider (DataForSEO business listings, BrightLocal,
Yext). Both are out of scope.
→ We audit the three sources we can legitimately read (§4.3) and ask the owner
to *paste a link* for anything else. One field, once — acceptable under product
rule 3 because no connected provider can return it.

### 6.5 We cannot measure local pack or geo-grid rank

Requires SERP scraping or a paid SERP API. `KeywordRanking.position` must stay
`null` with reason `not_supported` until we buy one. The contract already
documents this: "`null` means not ranked or not measured, and must render as
'Not ranked' or 'Not measured' — never 0."

### 6.6 We cannot score "citability" against a validated threshold

The 134–167-word passage window and "44% of citations come from the first 30%
of the page" come from a third-party study surfaced via claude-seo, not from
Google. A 0–100 "citability score" built on them would be inventing precision.
We may *describe the structure of a page* (passage lengths, heading hierarchy,
whether the first 200 words answer the question the heading asks) as
**observations**, citing the study as the reason we looked. See §7.7.

### 6.7 Sample-size honesty on the studies we do cite

- Sterling Sky's review studies used **single-digit numbers of businesses**.
  Directionally interesting; not a basis for a threshold.
- Ahrefs' 75k-brand study is Spearman correlation, and the authors say
  "correlation ≠ causation" and that all factors were "moderate to very weak".
- Whitespark's factor weights come from a **survey of practitioners**, not from
  measurement.

None of these numbers may be rendered as a metric in the app. They may appear
as *rationale* inside a finding's `detail`, attributed.

---

## 7. WHAT SHOOGLE CAN SHIP

Everything below is implementable inside Pranay's ownership — `features/audit/`,
`features/seo/`, `features/gbp/`, `app/seo/`, `app/(tabs)/business.tsx`,
`fixtures/` — with no change to `lib/`, `components/ui/` or `theme/`.

**Architectural note that saves an argument later.** `AuditProvider` and
`SeoProvider` in `lib/providers/contracts.ts` are **not** `ConnectableProvider`
and are **not** keyed by `ProviderId`; the runtime registry only holds
`ConnectableProvider` implementations. So an AI-visibility audit needs **no new
`ProviderId`** and therefore **no edit to `types/domain.ts` or the registry** —
it is an `AuditProvider` implementation living in `features/audit/`. If we ever
did need a new `ProviderId`, that is a `lib/` change owned by Sunny and must go
through a PR he reviews.

**Second note.** `Metric.value` in `lib/providers/types.ts` is `number`, not
`number | null`. The contract's rule is that **unknown metrics are omitted from
the array**, never zeroed (see the comment on `getPerformance`). Our audit must
follow that, and use `<Score uncheckedCount={n} />` to show how much could not
be measured.

---

### 7.1 **AI Visibility Check** — the flagship, and it is free

A one-tap audit of the owner's website answering: *can an AI assistant read and
use your business at all?*

| Finding | Check | Severity | Evidence basis |
|---|---|---|---|
| AI search crawlers are blocked | `robots.txt` disallows `OAI-SearchBot` / `Claude-SearchBot` / `PerplexityBot` | critical | OpenAI, Anthropic, Perplexity crawler docs — **CONFIRMED** |
| Your page tells Google not to index it | `noindex` in meta or `X-Robots-Tag` | critical | Google: must be indexed to appear in AI features — **CONFIRMED** |
| Your page blocks snippets | `nosnippet` / `max-snippet:0` | critical | Google: must be *snippet-eligible* — **CONFIRMED** |
| Your content only appears after JavaScript runs | Raw-HTML text volume vs script volume; empty root element | important | Vercel/MERJ, 500M+ GPTBot fetches, zero JS execution — **STUDY**, labelled as such in copy |
| Your business details are not machine-readable | No `LocalBusiness` JSON-LD, or a wrong/generic subtype | important | Google structured-data docs + schema.org — **CONFIRMED** |
| Your phone number is not on the page as text | No `tel:` link and no phone string in the HTML | important | INDUSTRY |
| Your site has not changed in over six months | `Last-Modified` / sitemap `lastmod` / `dateModified` | minor | SE Ranking freshness study — **STUDY** |

Each maps directly onto the existing `AuditFinding` shape (`id`, `title`,
`detail`, `severity`, `fixHref`). Checks that could not run go into
`uncheckedAreas` — for example `"Google indexing status (needs Search
Console)"`.

**Why this is the right first feature:** zero cost, zero credentials, not
blocked by the GBP quota, and it produces findings an owner can act on today.
Nobody in this market ships it.

**The no-website case is the common case.** For a salon with no site the audit
returns `unavailable('no_data_yet', 'You do not have a website yet.')` and the
single finding hands off to `app/website/` (Devashish). Pranay and Devashish
must agree that handoff — `CONTRIBUTING.md` already flags that the Website row
lives in Pranay's `business.tsx`.

### 7.2 **AI-ready website output** — the strongest competitive move

The audit above tells an owner their site is invisible to AI assistants. The
website Shoogle *generates* can be born correct: server-rendered HTML, visible
NAP in the footer, a `tel:` link, correct `LocalBusiness` subtype JSON-LD
derived from `BusinessCategory`, a robots.txt that names the AI *search*
crawlers, and a `lastmod`-bearing sitemap.

This is a **Pranay → Devashish** dependency, not Pranay's code. Pranay owns the
schema-generation logic in `features/seo/`, exported through
`features/seo/index.ts`; Devashish consumes it in `features/website/`. Pranay
must not write into `features/website/`.

Evidence basis: §3.1 (Google's required and recommended properties), §3.2
(subtype map), §5.1 (crawler and rendering checks). Every item is something we
control end to end, which means we can *state* it as done rather than estimate
it — the difference between a claim and a measurement.

### 7.3 **NAP consistency check** — three sources, honestly labelled

Compare website HTML vs JSON-LD vs Google's record (Places API), normalised per
§4.3. Render as three rows with `match` / `differs` / `not checked` — never a
percentage.

Copy pattern:

> Phone — **differs.** Your website shows `022 2766 1234`. Google shows
> `+91 98765 43210`. Someone calling from an AI answer will reach the second
> one.

And when we cannot check:

> Justdial — **not checked.** We can't read directory listings. Paste your
> Justdial link and we'll compare what you have there.

Evidence basis: Google's prominence factor (**CONFIRMED**) and claude-seo
`seo-local`'s three-source method.

### 7.4 **Directory coverage for India** — a checklist, not a scanner

A short, honest list of directories that *permit AI search crawlers*, with the
owner ticking what they have and a deep link to each signup:

| Directory | Relevant for | AI-search crawlers permitted (observed 2026-08-30) |
|---|---|---|
| Google Business Profile | everyone | Grounds Google's AI features directly — **CONFIRMED** |
| Justdial | everyone | `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Google-Extended` — **CONFIRMED (observed)** |
| IndiaMART | repair shops, boutiques, B2B | `OAI-SearchBot`, `GPTBot`, `Google-Extended` — **CONFIRMED (observed)** |
| Sulekha | services, salons, gyms | Directives present; per-agent values **UNVERIFIED** |
| Zomato / Swiggy | restaurants, bakeries | Permissive to search crawlers; AI-agent specifics **UNVERIFIED** |
| Practo | clinics | robots.txt not retrievable (403) — **UNVERIFIED** |
| Bing Places | everyone | Free; the claim that it feeds ChatGPT/Copilot is **UNVERIFIED** — do not assert |

The honest framing is *"these sites let AI assistants read them, so a complete
listing there is readable"* — **not** *"listing here gets you cited"*. Owner
input is one tap per row, the minimum possible, and no connected provider can
return it, so product rule 3 is satisfied.

### 7.5 **Ask an AI** — a labelled probe, not a metric

Server-side, call Gemini with Google Search + Maps grounding on three to five
queries the owner's customers would actually type (`best hair salon in Nerul
West`, `bridal makeup near Seawoods`). Show the cited sources and whether the
business appeared.

Non-negotiable presentation rules:

- Header: **"What one AI assistant said, just now"** — never "Your AI
  visibility score".
- Permanent caption: *"This is one model's answer to one question at one
  moment. It is not what every person sees, and it is not Google AI Overviews."*
- Show the returned source annotations, linked, with Google Maps attribution
  immediately following the generated content and viewable within one
  interaction. **CONFIRMED as mandatory** by Google's grounding docs.
- Never trend it. Two samples of a non-deterministic model are not a trend.
- Budget: 5,000 free grounded requests per month, then $14 per 1,000 (roughly
  ₹1.2 per query). Cap per business, and surface
  `unavailable('rate_limited', …)` when the cap is hit rather than silently
  degrading.
- Key is server-side only; never `EXPO_PUBLIC_`.

### 7.6 **Live Google reputation row** — real, but live-only

`rating` and `userRatingCount` from Places API, fetched on view, displayed with
Google Maps attribution and **not stored**. Renders as `4.3 ★ · 128 ratings`,
or `—` with `no_data_yet` when the business has none.

Because we cannot store history (§6.2) there is no chart. The honest version of
"review velocity" until GBP is connected is a *prompt*, not a *measurement*:
"Ask your last five customers for a review", with the Sterling Sky finding
quoted as attributed rationale in `detail` and explicitly not shown as a number.

### 7.7 **Page readability for assistants** — observations, not a score

For each key page: passage lengths, whether an H1 exists, whether headings form
a hierarchy, whether the first 200 words answer the question the heading asks,
whether there is a list or table. Present as **observations with a cited
reason**:

> Your services page is one 900-word block. Studies of AI citations suggest
> self-contained passages of roughly 135–170 words get quoted more often
> (SE Ranking, via claude-seo). We haven't verified this against Google's own
> documentation.

No number. No score. This is the only form in which §6.6 permits shipping it.

### 7.8 What the audit score means

`AuditReport.score` is `number`, and the `Score` component takes
`number | null`. Rules:

- `null` until an audit has genuinely run. A business that has never been
  audited does not have a score of 0.
- Score only over checks that actually ran. Every check that did not run goes
  into `uncheckedAreas`, and `<Score uncheckedCount={n} />` renders the caveat.
- A business with no website gets `unavailable`, not a low score. "We could not
  measure you" and "you scored badly" are different statements, and the product
  rules require both to be representable.

---

## 8. What we must NOT build

| Tempting | Why not |
|---|---|
| "AI Visibility Score: 62/100" | Nothing measures it. Fabrication. |
| "You appear in 3 of 10 AI Overviews" | No API. Sampling is not measurement. |
| A review-count chart over time from Places data | Maps ToS forbids storing it. **CONFIRMED.** |
| "Add llms.txt to get cited" | Google states Search ignores it. **CONFIRMED.** |
| "Allow GPTBot so ChatGPT finds you" | Wrong per OpenAI's own docs — `OAI-SearchBot` governs ChatGPT search inclusion; `GPTBot` is training only. **CONFIRMED.** |
| A Wikipedia / Wikidata entity-presence row | Structurally always red for a neighbourhood salon. Noise. |
| Scraping Justdial / Practo / Zomato listings | Against their terms; Practo blocks non-browser clients outright. |
| Auto-"fixing" NAP anywhere | We have no write access to any of it, and Google's copy may be the wrong one. |
| Local pack or geo-grid rank tracking | Needs a paid SERP API. `position` stays `null` with `not_supported`. |
| Any GBP write action before quota approval | `GbpLocation.verificationState` gates writes and we have no credentials. |

---

## 9. Open questions to resolve before implementation

1. **Search Console Search Analytics API** — does it expose generative-AI
   impressions (an `AIOverview` / `AIGenerated` search appearance, or an
   equivalent `type`)? The published reference lists no AI value; secondary
   sources conflict. **Verify with a live API call.**
2. **Places `primaryType` vs the GBP category taxonomy** — how close is the
   mapping? Determines whether §6.3 stays blocked.
3. **PageSpeed Insights API quota** — exact daily and per-minute limits are not
   in the get-started doc.
4. **Sulekha, Zomato, Swiggy, Practo robots.txt** — re-read carefully and record
   per-agent directives before the §7.4 table appears in the app.
5. **GBP API review data and retention terms** — whether we may store review
   history once the owner connects. Needed before any velocity chart. This
   belongs in the api-researcher report for Google Business Profile, which does
   not exist yet.
6. **Gemini grounding display requirements in React Native** — "sources
   immediately follow the content" and "viewable within one user interaction"
   need a concrete component design, and `components/ui` is Aryan's.

---

## 10. Sources

**First-party (CONFIRMED):**

- Google — AI features and your website: https://developers.google.com/search/docs/appearance/ai-features
- Google — AI optimization guide: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google — LocalBusiness structured data: https://developers.google.com/search/docs/appearance/structured-data/local-business
- Google — Google common crawlers (Google-Extended): https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
- Google — Improve your local ranking on Google: https://support.google.com/business/answer/7091
- Google — Search Analytics API reference: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Google — Generative AI performance reports in Search Console (2026-06): https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- Google — Place Details (New): https://developers.google.com/maps/documentation/places/web-service/place-details
- Google — Places API policies (caching, attribution): https://developers.google.com/maps/documentation/places/web-service/policies
- Google — Maps Platform India pricing: https://developers.google.com/maps/billing-and-pricing/pricing-india
- Google — Maps Platform Service Specific Terms: https://cloud.google.com/maps-platform/terms/maps-service-terms
- Google — Grounding with Google Search: https://ai.google.dev/gemini-api/docs/google-search
- Google — Grounding with Google Maps: https://ai.google.dev/gemini-api/docs/maps-grounding
- Google — Grounding with Google Maps is now GA: https://developers.googleblog.com/en/your-ai-is-now-a-local-expert-grounding-with-google-maps-is-now-ga/
- Google — Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Google — PageSpeed Insights API: https://developers.google.com/speed/docs/insights/v5/get-started
- OpenAI — Bots and crawlers: https://developers.openai.com/api/docs/bots
- Anthropic — Does Anthropic crawl data from the web: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- Perplexity — Perplexity crawlers: https://docs.perplexity.ai/docs/resources/perplexity-crawlers
- schema.org — LocalBusiness: https://schema.org/LocalBusiness
- schema.org — HairSalon: https://schema.org/HairSalon
- schema.org — HealthAndBeautyBusiness: https://schema.org/HealthAndBeautyBusiness
- OSM Foundation — Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/

**Directly observed (CONFIRMED, 2026-08-30):**

- `https://www.justdial.com/robots.txt`
- `https://www.indiamart.com/robots.txt`
- `https://www.sulekha.com/robots.txt`
- `https://www.zomato.com/robots.txt`
- `https://www.practo.com/robots.txt` (403 Access Denied)

**Methodology source:**

- claude-seo (MIT, v2.2.5) — `skills/seo-geo/SKILL.md`,
  `skills/seo-geo/references/llmstxt-evidence.md`, `skills/seo-local/SKILL.md`:
  https://github.com/AgriciDaniel/claude-seo

**Third-party studies (STUDY — correlational, cited as rationale only):**

- Ahrefs — An analysis of AI Overview brand visibility factors, 75,000 brands: https://ahrefs.com/blog/ai-overview-brand-correlation/
- Whitespark — The prevalence of AI Overviews in local search, 540 queries: https://whitespark.ca/blog/case-study-the-prevalence-of-ai-overviews-in-local-search/
- Sterling Sky — Does the number of Google reviews impact ranking: https://www.sterlingsky.ca/number-of-reviews-impact-ranking/
- Vercel — The rise of the AI crawler: https://vercel.com/blog/the-rise-of-the-ai-crawler
- Search Engine Journal — AI Overviews now answer most local searches: https://www.searchenginejournal.com/ai-overviews-now-answer-most-local-searches-how-to-get-your-business-cited/580757/
