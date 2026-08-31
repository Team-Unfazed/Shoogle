# Competitive teardown — Grexa AI (grexa.ai)

**Owner:** Pranay (SEO / GBP / Audit / Business tab)
**Date:** 2026-08-30
**Scope:** Shoogle's closest competitor. Focus on the local-SEO / Google Business
Profile vertical, because that is the surface Pranay owns.

**Method and honesty rules.** Everything below is either quoted from a first-party
source (grexa.ai, the App Store listing, the Apple customer-review RSS feed,
Trustpilot, Google's own developer and policy docs) or explicitly marked
`UNVERIFIED`. Nothing here is inferred and presented as fact. Two things I could
**not** get:

- **Google Play review text.** `play.google.com/store/apps/details?id=ai.grexa.app`
  renders reviews client-side; every fetch returned a truncated shell. The Play
  rating, install count and review bodies are therefore **UNVERIFIED**. The user
  asked specifically for Play reviews — they need a browser session or a Play
  scraper to get them. Apple review bodies *were* retrievable via the iTunes
  customer-review RSS feed and are quoted verbatim below.
- **The in-app onboarding flow itself.** Grexa gates it behind account creation
  and a sales call. What follows is reconstructed from their own funnel copy plus
  customer descriptions of what actually happened to them.

---

## 1. TL;DR — the shape of the competitor

Grexa is **not really an app company; it is a sales-led managed-service company
with an app on top.** Every path on grexa.ai terminates in "Book Free Demo" or a
lead-capture report. The 1-star reviews are almost entirely about *human*
service failure — sales pressure, post-payment silence, 45-day activation, 3–4
hour meetings — not about software bugs. That is the seam.

Their product surface is broad (GBP + WhatsApp chat agent + WhatsApp marketing +
CRM + free website) and their GBP feature list overlaps Shoogle's Business/SEO
vertical almost exactly. Their weakness is not features. It is **time-to-value,
opacity, and claims they cannot substantiate.**

Shoogle cannot out-feature them in one semester. Shoogle can beat them on
**honesty, zero-input onboarding, and minutes-not-weeks time to first value** —
and those are exactly the things `DataState<T>` and the "unknown is not zero"
rule already make cheap for us and expensive for them.

---

## 2. Company facts

| Fact | Value | Source |
|---|---|---|
| Founded | 2024 | Moneymint, Startup Story |
| Founders | Ashutosh Kumar, Ayush Varshney, Arpit Oswal, Narendra Agrawal | Moneymint |
| HQ | Thane / Navi Mumbai (Trustpilot lists 704 Maithilis Signet, Navi Mumbai 400703) | Trustpilot |
| Seed round | ₹15.5 Cr (~$1.85M), July 2025, led by Utsav Somani; DeVC, Bharat Founders Fund, Vernalis Capital + angels (Revant Bhate, Vaibhav Domkundwar, Ramakant Sharma, Sumit Gupta) | Entrepreneur India, Startup Story |
| iOS app | `id6670168657`, 4.8 / 5 | App Store |
| iOS rating count | **151** on one fetch, **174** on another, same day | App Store (both fetches) — treat as ~150–175, storefront-dependent |
| Android app | `ai.grexa.app` | Play Store |
| Android rating / installs | **UNVERIFIED** — page is client-rendered | — |
| Trustpilot | TrustScore **4.6**, **128** reviews; 86% 5★, 7% 4★, <1% 3★, 0% 2★, **6% 1★** | trustpilot.com/review/grexa.ai |
| Release cadence | Very fast. v2.44.0 (31 Jul) → v2.45.3 (~26 Aug). At least 5 releases in 4 weeks. | App Store version history |

### Their own customer-count claims do not agree with each other

This matters, because it tells you how much of their marketing is load-bearing.

- **21,600+** businesses — July 2025 funding coverage (Moneymint)
- **"Trusted by more than 60,000+ business owners"** — grexa.ai homepage, today
- **"3.6 L+ Indian businesses already on Grexa"** — shop.grexa.ai/v10 funnel, today

3.6 lakh and 60,000 are the same company on the same day. One 1-star reviewer
noticed the same thing: *"the promoters claim to be serving 360000 small
businesses, there is not a single user customer review on their website."*

**Do not let Shoogle acquire this habit.** It is exactly product rule 6.

---

## 3. Complete feature list

Grexa packages everything as four "AI agents" plus a data layer. Quoted verbatim
from grexa.ai.

### 3.1 Google Business Profile Agent — *the direct overlap with Pranay's area*

- "Finds the best SEO keywords for your business"
- "Rewrites SEO-optimised GBP content and services"
- "Auto-publishes SEO-powered GBP posts"
- "Crafts SEO-rich replies to all Google reviews"
- "Generates authentic Google reviews from your paid customers"

Plus, from the App Store changelog:

- v2.44.0 (31 Jul 2026): "New Business Growth Agent, AI-powered Google Business Profile posts"
- v2.45.0 (14 Aug 2026): "AI-powered GBP Reviews Summary, Business Growth Agent improvements"
- v2.45.3 (~26 Aug 2026): "Enhanced **reviews, ranking, and location management**"

So they **do** ship a "ranking" surface and multi-location / "organization
switching". What powers the ranking number is **UNVERIFIED** — see §7.

### 3.2 WhatsApp Chat Agent

- "Exclusively trained for your business"
- "Knows everything about your offerings, price and testimonials"
- "Remembers every customer's purchase history"
- 24/7 customer interaction

### 3.3 WhatsApp Marketing Agent

- "Creates Offers, Visuals & Messaging"
- "Analyses purchase data to pick the right customers"
- "Spots repeat-purchase opportunities from conversations"
- "Answers all promotion-related customer queries"
- "Sends offers & reminders directly on WhatsApp"

### 3.4 Data Intelligence / CRM

- "Captures and Stores Leads, Customer and Sales Data"
- "Provides Real-time Data Intelligence to All 3 AI Agents"
- "Analyses WhatsApp Chat Conversations to Identify Potential Leads"
- "Analyses Purchase Data to Segment High-Potential Customer Pool"
- "Tracks & Displays Key Business Performance Data"

### 3.5 Website

- "In just one WhatsApp chat, Grexa AI can: ✓ Build you a forever free website
  linked to your Google Business Profile ✓ Run a full SEO audit" (their Facebook page)
- "Amazing and fast website for creating website from your Google business
  profile" — Trustpilot 5★, Bugree BrothersFarm, 27 Aug 2026

Note for **Devashish**: Grexa generates the website *from the GBP listing*. That
is the same hydration trick Shoogle should use, and it is why the Website row
lives in Pranay's `business.tsx` — the GBP data is the input to both.

### 3.6 Verticals they name

Gym & Fitness, Doctors & Health Clinics, Bakers & Cake Shops, Salon Owners,
Restaurants & Bars, Pest Control, Car Garages & Mechanics, Tours & Travels,
Yoga & Wellness, Handyman Services. Dedicated landing pages per vertical
(e.g. `/travel-agency-marketing-software`).

**This is Shoogle's exact vertical list.** There is no vertical wedge available.

---

## 4. Onboarding — what they demand, and the evidence it hurts

The user's claim was that Grexa's onboarding "destroys the UX by asking too
much." The evidence says the problem is worse and more specific than that: the
onboarding is **not self-serve at all**. It is a sales funnel into a human
services queue.

### 4.1 The funnel, as they built it

1. **Top of funnel:** "Get Your Free Google Business Profile Rank Report" →
   `shop.grexa.ai/v10`. Promises: *"100% Free report. No card or sign-up
   required"*, *"30 sec — Time to get your full report"*, *"3.6 L+ Indian
   businesses already on Grexa"*.
   *(When I fetched it, the business-search input was rendering
   `"Search is unavailable - please refresh or contact support"` — their
   headline lead-capture control was broken at the time of fetch.)*
2. **Every other CTA on the site is "Book Free Demo."** There is no
   "start free" / "create account" path from the marketing site.
3. **A salesperson calls.** Repeatedly (see quotes).
4. **Payment.**
5. **Then** onboarding begins — human-assisted, and slow.

### 4.2 What they ask the owner for

Their vertical pages are deliberately vague: *"You just tell us your services and
packages — we'll handle the rest."* But the agents cannot run without it, and
the feature copy names the inputs:

- **Services and packages** ("tell us your services and packages")
- **Prices** ("Knows everything about your offerings, **price** and testimonials")
- **Testimonials**
- **Purchase / sales history per customer** ("Remembers every customer's purchase
  history", "Analyses **Purchase Data** to Segment High-Potential Customer Pool")
- **Their customer list** (the CRM has to be populated)
- **Their WhatsApp Business number**, handed over to Grexa's WhatsApp Business
  API tenancy (evidenced by the complaint below about getting it *back*)
- **GBP access** as a manager/owner (required to publish posts and reply to reviews)

That is a very large first-run ask: a catalogue, a price list, testimonials,
a customer database, and control of the owner's WhatsApp number and Google
listing — **before anything works.**

### 4.3 Evidence that it hurts — verbatim

> "There are just wasting our time for **simple onboarding** … Even for a small
> issue, I need to schedule a meeting, which will be assigned after 2-3 days...
> Just pathetic in terms of service"
> — *India Travel Awards Best Tour Operator South 2018*, 1★ Trustpilot, 9 Jul 2026

> "As a business owner, my time is incredibly limited, but this team expects me
> to **sit through a 3–4 hour diagnostic meeting** just to fix errors on their
> end. I offered a reasonable 30–40 minute window, which was ignored."
> — *Gaurang Vora*, 1★ Trustpilot, 25 Aug 2026

> "I was introduced to a human agent who told me that the app would take
> **45 days from date of purchase to fully activate**. I had bought on 14-05-26.
> It's 24 days since then and I am waiting for it's getting operational."
> — *Dsk (Davinder Khanna, LakaGOLD)*, 1★ Trustpilot, 7 Jun 2026

> "**slow onboarding process**" — theme identified in Trustpilot's own review summary

Press describes a "**7-day onboarding process**" (Moneymint). Customers describe
45 days. Both cannot be true.

### 4.4 The reading

Grexa's onboarding is not merely long — **the product does nothing until a human
finishes configuring it.** The gap between "paid" and "working" is measured in
weeks, and the owner has to attend meetings during business hours to close it.

That is the single biggest exploitable weakness in this teardown.

---

## 5. Pricing and packaging

| Item | Value | Source |
|---|---|---|
| Structure | **One single all-inclusive plan.** No tiers. | grexa.ai/pricing |
| Quarterly | **₹15,000 + GST** | grexa.ai/pricing |
| Annual | **₹60,000/yr** option | grexa.ai/pricing |
| Effective monthly | ~₹5,000/month | derived |
| Included | "AI GBP Suite, AI Lead Conversion Suite, AI Re-marketing Suite, AI WhatsApp Agent, and AI CRM" | grexa.ai/pricing |
| Setup fee | "no hidden charges or setup fees" | grexa.ai/pricing |
| Lock-in | "no cancellation or lock-in period", "Cancel anytime" | grexa.ai/pricing |
| Multi-user | "Grexa AI supports multi-user access" | grexa.ai/pricing |
| Trial | **None.** Only "Book Free Demo" + free GBP report. | grexa.ai/pricing |
| App price | Free to download; iOS listing declares **no in-app purchases** | App Store |

### The cracks in the pricing story

- A Trustpilot reviewer reports a **₹9,999/year** plan ("I bought grexa.ai
  Rs9999/- per year plan") — not on the pricing page. So there is **off-menu
  sales-negotiated pricing**, or there was a cheaper tier.
- The same reviewer: *"The designated human agent will inform you that the
  facility you are trying to avail is **not available in your plan**. When you
  will ask what more is not available he/she will coolly inform you that he/she
  would contact team and inform you — which will never happen. You will be
  advised to upgrade."* That directly contradicts "one single all-inclusive plan."
- Another reviewer reports paying **"$23,000"** (Sagar Pillai) — almost certainly
  a currency-symbol error for ₹23,000, but either way it is not ₹15,000.
- **Billing is not through the app stores.** No IAP on iOS. It is invoiced/collected
  by sales. That is why refunds are a manual fight (see §6.2).

### Implication for Shoogle's billing (Aryan's area, but relevant)

₹5,000/month is the price of a part-time marketing intern. It prices out most
single-chair salons, small bakeries and repair shops — the low end of Shoogle's
stated market. **There is a real, unserved price band below Grexa.** Aryan should
see this.

---

## 6. What users actually say

### 6.1 What they PRAISE

Themes: *it works on Google*, *it's simple*, *it's cheap relative to an agency*,
*the website generation is fast*, *the AI review replies are good*.

> "I really had to say such product are needed much in the market where local
> business owners like us dreamt of boosting our business by digital marketing
> but due to **lack of expertise and low budget cost** we were not able to
> achieve digital presence. Thanks to the team for making such product and
> boosting my digital marketing by **organically increasing my rank without my
> much technical input and time.**"
> — *Sumant Dusane*, 5★ App Store, 21 Aug 2025

> "Me and a couple of my business owner friend have **used this app as a CRM**
> for our salons and clinic and it works great. My Google Reviews increased and
> repeat customer revenue has more than doubled. **It should add more features
> for marketing.**"
> — *Local Biz Owner PR*, 5★ App Store, 30 Aug 2024

> "Through **AI generated replies** and services are very good and trustworthy.!"
> — *Harrpalay Clinick*, 5★ App Store

> "jab se grexa ai aya hai tub se grexa ai ne bahut kuch sikhaya hai or meri
> business sudhar ne me bahut madat kari hai"
> — *sawariya mehandi artist*, 5★ App Store *(note: Hinglish/Hindi reviewer —
> confirms the market reads and writes Hinglish, which is why our generated
> **business content** must too, per product rule 12)*

> "**Amazing and fast website** for creating website from your Google business profile"
> — *Bugree BrothersFarm*, 5★ Trustpilot, 27 Aug 2026

> "It helps me to much for **building my profile** … it's doing everything for me
> to make my profile better"
> — *Dhruvika Enterprise*, 5★ Trustpilot, 13 Jun 2026

> "Is very **good report and simple prosses** it's very helpfull"
> — *Wood Story*, 5★ Trustpilot, 11 Jun 2026 *(this is about the free GBP report —
> their top-of-funnel audit is genuinely well-liked)*

> "Should be free for 1 year" — *Hisrani*, 5★ App Store *(price sensitivity, in a 5★)*

**Read this carefully: the thing users love most is the free GBP report and the
profile/website generation — i.e. the audit. That is Pranay's feature.**

### 6.2 What they COMPLAIN about

Every substantive complaint is about **service, speed and money** — not the software.

**Post-payment abandonment (the dominant theme):**

> "Requesting everyone to cancel the subscription with Grexa…. Initially they
> will **follow up multiple times for the payment** — once done, all the
> questions will be unanswered and I'm following up to fix a simple thing but no
> one seems to assist and it's more then 48 hours"
> — *Sachin TAS*, 1★ App Store, v2.45.1

> "Before we became a customer, their team followed up with us continuously.
> However, **after we signed up, the level of support changed completely.** …
> we did not receive the guidance we expected."
> — *Gaurang Vora*, 1★ Trustpilot, 30 Jun 2026

> "Grexa is just **wastage of time and money. The promises they make in the
> beginning are never met.** The AI AGENTS are also not helpful at all. After
> your payment is done no one will bother about the problems that you face."
> — *Shilpy Munjal*, 1★ Trustpilot, 12 Jul 2026

> "**After payment, the app failed.** Very slow support team."
> — *raghav3545*, 1★ App Store, v2.38.0

**Unsubstantiated promises / no written deliverables:**

> "We paid ₹23,000 based on **verbal promises** that Grexa.ai would provide AI
> marketing services and help complete our **Google Business verification**. More
> than two months later, **no meaningful work has been completed.** … the
> salesperson who handled our account is no longer reachable … make sure you have
> a **detailed written contract with clear deliverables** before making any payment."
> — *Sagar Pillai*, 1★ Trustpilot, 4 Aug 2026

*(Note what they sold: help completing **GBP verification**. That is a process
Google controls, on Google's timeline. Selling it as a deliverable is selling
something you cannot ship. Shoogle must never do this.)*

**Refunds and hostage data:**

> "They **refuse to issue a refund** despite failing to deliver a working service."
> — *Gaurang Vora*, 1★ Trustpilot, 25 Aug 2026

> "They are money mongers. Not a single response at all. Worst experience. Fraud company"
> — *Ankur Goel*, 1★ Trustpilot, 12 Aug 2026

> A customer reported the **release/disconnection of their WhatsApp Business
> number** was substantially delayed, "affecting their business operations", and
> that the refund "took an extended period of time and required repeated
> follow-ups, escalations, and continuous communication."
> — 1★ Trustpilot (summarised in search results; full text not retrieved — **UNVERIFIED verbatim**)

**Aggressive sales:**

> A company named *Dentethix* wrote: *"What we got in return was a masterclass in
> **unethical sales practices**"*, describing a representative who kept calling
> during their vacation and family time.
> — 1★ Trustpilot (surfaced in search; full text not retrieved — **UNVERIFIED verbatim**)

**Bait pricing:**

> "Payable hai but free bolo aap ne" *(You said it was free, but it's payable)*
> — *Tushar Shinde photography*, 1★ Trustpilot, 17 Jun 2026

**Notably: Grexa replies to none of these 1-star reviews on Trustpilot.**

### 6.3 The review distribution is suspicious and you should say so internally

Trustpilot: 86% 5★, 7% 4★, **<1% 3★, 0% 2★**, 6% 1★. A perfectly bimodal
distribution with a hollowed-out middle is the classic signature of solicited
5-star reviews plus organic angry ones. Grexa's own homepage advertises
"**Generates authentic Google reviews from your paid customers**" — they run
review solicitation as a product. It would be surprising if they did not point it
at themselves.

This is relevant to us because of §8.5 (review-request compliance).

---

## 7. Gaps — what Grexa does NOT do in local SEO / GBP

Ranked by how exploitable each gap is.

1. **No honest unknown state, anywhere.** Their entire UI vocabulary is
   "optimised", "boosted", "ranked". There is no evidence of a surface that says
   "we could not check this, and here is why." Every 1-star review about
   "45 days and nothing happened" is a customer discovering the absence of that
   surface the expensive way.
2. **No stated data provenance.** They say "Rank #1 on Google" and ship a
   "ranking" screen (v2.45.3). Google's Business Profile Performance API
   **does not return rank position at all** (§8, first-party confirmed). So their
   rank number is either scraped, bought from a third-party SERP API, or derived
   from impressions and labelled "rank". They never say which. **UNVERIFIED
   which it is — but it definitionally is not GBP API data.**
3. **No geo-grid / heatmap rank map.** Competitors in the agency tool space
   (e.g. LeadSnap) ship per-neighbourhood grid rankings. Grexa shows no evidence
   of it. For a salon whose catchment is 2 km wide, "where do I rank *in my own
   locality*" is the actual question.
4. **No competitor benchmarking surfaced.** No "the other 4 gyms in your pin code
   have 240 reviews and you have 31."
5. **No NAP / citation consistency audit.** Name-Address-Phone mismatches across
   JustDial, Practo, Zomato, Sulekha, IndiaMART are a real Indian local-SEO
   problem and nobody in this list touches it.
6. **No Q&A management.** GBP Questions & Answers is unmanaged by them and is a
   genuine ranking/conversion surface.
7. **No photo/UGC audit.** Photo count and freshness materially affect GBP
   performance. Not in their feature list.
8. **No self-serve anything.** No trial, no free tier that survives past the
   report, no way to see value without a sales call. This is the big one.
9. **No transparency about what needs a verified listing.** GBP write operations
   require a verified location. They sold verification help as a deliverable and
   then could not deliver it (Sagar Pillai).
10. **Heavy WhatsApp Business API dependency.** It makes their product powerful
    and their exit painful — customers report their number being held. It is also
    expensive and slow to provision, which is likely a real cause of the 45-day
    activation. **Shoogle should not chase WhatsApp Business API.**

---

## 8. Reality check: what the GBP API actually gives us

This section exists so the differentiators below are honest. All of it is
first-party from `developers.google.com`. **A full `api-researcher` report is
still required before any integration work** — this is a teardown, not that report.

### 8.1 Access is genuinely blocked, and the prerequisites are non-trivial

From the Business Profile APIs prerequisites page, to even *apply*:

- "Manage a Google Business Profile that is **verified and active for 60+ days**"
- "Have a **website** representing the business listed on the GBP"
- A Google Cloud project + an **Organization account**
- Submit the **GBP API contact form**, selecting "Application for Basic API Access",
  from an email that is an owner/manager on the profile
- "A follow-up email will be sent to you after your request has been reviewed" —
  **no stated SLA**
- Approval is observable as quota: **0 QPM = not approved, 300 QPM = approved**

**This is a blocker Pranay cannot clear alone.** It needs a real verified business
profile aged 60+ days and a website. Plan for it not arriving this semester.

### 8.2 What Performance gives us, exactly (`DailyMetric` enum, verbatim)

`BUSINESS_IMPRESSIONS_DESKTOP_MAPS`, `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH`,
`BUSINESS_IMPRESSIONS_MOBILE_MAPS`, `BUSINESS_IMPRESSIONS_MOBILE_SEARCH`,
`BUSINESS_CONVERSATIONS`, `BUSINESS_DIRECTION_REQUESTS`, `CALL_CLICKS`,
`WEBSITE_CLICKS`, `BUSINESS_BOOKINGS`, `BUSINESS_FOOD_ORDERS`,
`BUSINESS_FOOD_MENU_CLICKS`.

Note: impressions are deduplicated — "Multiple impressions by a unique user
within a single day are counted as a single impression."

**There is no rank, no position, no competitor, and no conversion-rate metric in
that list.** `GbpLocation`/`Metric` in `lib/providers/contracts.ts` are shaped
correctly for this; `KeywordRanking.position: number | null` is already the right
type, and `null` is the correct value until a *real ranking provider* is registered.

### 8.3 The threshold behaviour — this is a gift to Shoogle

`locations.searchkeywords.impressions.monthly.list` returns search keywords with
monthly impression counts. When the count is too low, Google does **not** return a
number. It returns a `threshold`, documented as:

> "A threshold that indicates that the actual value is below this threshold."

So the honest rendering of that keyword is **"fewer than N"** — not `N`, not `0`,
not a bar of height zero. This is literally a fourth state that every competitor
in this space flattens into a number or a zero.

`DataState<T>` cannot express it today; it is a *ready* value with a bounded
shape, not an unavailable one. **See §9.6.**

### 8.4 Reviews are on the legacy v4 API

`accounts.locations.reviews` exposes `list`, `get`, `updateReply`, `deleteReply`
(plus `batchGetReviews` at the `accounts.locations` level). This is **v4.9**, the
older My Business API surface, and access is part of the same gated request.
It matches `GoogleBusinessProfileProvider.listReviews` / `replyToReview` as
already declared in our contracts.

### 8.5 Grexa's review-generation claim sits close to a policy line

Google's Maps user-contributed-content policy prohibits, verbatim:

> "Content that has been posted **due to an incentive offered by a business** —
> such as payment, discounts, free goods and/or services."

and merchants must not

> "require or pressure users to leave ratings or write reviews while on the
> premises, nor should they request that specific content be included."

but merchants **may**

> "Solicit or encourage the posting of content that does represent a genuine
> experience, without offering incentives to do so or attempting to influence the
> rating or the contents of the review."

Grexa's homepage says: "**Generates authentic Google reviews from your paid
customers**", and their social copy describes sending "customers a direct
WhatsApp link for Google reviews, ratings almost doubling". Sending a review link
to a real customer is **allowed**. Steering the content, gating by sentiment, or
attaching an incentive is **not**.

**UNVERIFIED** whether Grexa gates or incentivises. But the phrase "generates …
reviews" is a claim Shoogle should never make, and a compliance line Shoogle can
publicly draw. See §9.7.

---

## 9. WHERE SHOOGLE CAN BEAT THEM ON THE BUSINESS/SEO VERTICAL

Ranked by **(impact to an Indian local business owner) × (feasibility given no
GBP API access)**. Each item states its API dependency honestly.

Everything in tier 1 ships **without GBP API access**. That is deliberate: the
blocker is real and may not clear.

---

### TIER 1 — high impact, buildable now, zero GBP dependency

#### 9.1 The 60-second zero-input audit — *beat their 45 days with 60 seconds*
**Impact: very high. Feasibility: high. GBP API: not required.**

Grexa's most-loved artefact is their free GBP report ("very good report and
simple prosses"). Their most-hated property is that nothing else happens for
weeks. **Ship the loved thing, instantly, with no sales call.**

The owner picks their business from a place search. That is the *entire* input —
one tap. From public place data we can already assess: is there a website, is
there a phone, are hours set, is a primary category set, how many photos, rating,
review count, review recency, description present, is the listing claimed.

Implementation home: `features/audit/` (currently `README.md` + `index.ts` only —
greenfield), rendering into `app/(tabs)/business.tsx` and `app/seo/`.
Register a real `AuditProvider` via `registerProvider()` from your own feature —
do not touch `lib/providers/registry.ts`.

**Honest caveat:** this needs a *public* place-data source (Google Places API is
the obvious candidate — it is Maps Platform, billed, key-based, and **separate
from the gated GBP API**). It needs its **own `api-researcher` report** before a
line of integration code: field names, caching/retention restrictions in the
Maps Platform terms, attribution requirements, and cost per call are all things
we must not guess. Until that report exists, build the audit against
`fixtures/` with the dev banner.

#### 9.2 The coverage ledger — "here is what we could not check, and why"
**Impact: very high. Feasibility: very high. GBP API: not required.**

`AuditReport.uncheckedAreas: string[]` already exists in our contracts and no
competitor has an equivalent. Render it as a **first-class, prominent section of
the report**, not a footnote:

> **Checked 9 of 14 signals.**
> Not checked: Google Search impressions — *needs a connected Google Business
> Profile*. Keyword impressions — *same*. Direction requests — *same*.
> Competitor review counts — *we don't have a licensed source for this, so we
> won't guess*. NAP consistency across directories — *not built yet*.

This is the single cheapest, highest-trust differentiator available. It costs
one component. It converts our biggest weakness (no GBP API) into a visible
demonstration of honesty, and it structurally prevents the failure mode that
generated every one of Grexa's 1-star reviews.

Also: **never emit an audit `score` when coverage is thin.** `AuditReport.score`
is documented "Only produced when enough signals were collected" — enforce that.
Return `unavailable('insufficient_data', …)` instead of a 43/100 built from four
signals. A confident-looking score derived from partial data is a lie with a
number on it.

#### 9.3 Draft-and-hand-over fix cards — *do the work we're allowed to do*
**Impact: high. Feasibility: high. GBP API: not required for the draft; required only for auto-apply.**

We cannot write to GBP without API access. Grexa can, and still takes 45 days.
So don't race them on automation — race them on **elapsed time to a fixed profile.**

For each `AuditFinding`, generate the actual artefact and hand it over:
- a rewritten 750-char business description
- a recommended primary + secondary category with the reasoning
- a service list with descriptions
- a drafted review reply, in the language the review was written in
  (Hindi / Marathi / Hinglish — permitted for generated *business content*)

with **copy-to-clipboard** and a **deep link into the Google Business Profile
app/web at the exact screen**. Ten seconds of owner effort, zero API dependency,
and the profile is genuinely improved today.

`AuditFinding.fixHref` already exists for exactly this routing.

**Rule:** the button must say "Copy and open Google" — never "Fix it". We report
only what a provider confirmed (CONTRIBUTING rule 5), and pasting is the owner's
action, not ours.

#### 9.4 Refuse to claim rank — and explain why, in the UI
**Impact: high (trust). Feasibility: very high. GBP API: N/A — this is a refusal.**

Grexa's entire pitch is "Rank #1 on Google". Google's own API does not expose
rank. Shoogle should ship a screen that says, plainly:

> **Search ranking: not measured.**
> Google does not publish your ranking position through any official API, and
> rank changes by device, by user and by how far away someone is standing. We
> will not show you a number we cannot stand behind. Here is what Google *does*
> report: impressions, calls, direction requests, website clicks.

`KeywordRanking.position: number | null` and
`UnavailableReason.not_supported` ("The provider does not expose this data at
all") already model this exactly. Ship the honest empty state as a *feature*.

If we ever add a genuine ranking source (a licensed SERP/grid API), it registers
as a provider and the state flips to `ready` — with the source named on screen.

#### 9.5 Price and packaging below ₹5,000/month, self-serve
**Impact: high. Feasibility: high (but Aryan's call). GBP API: not required.**

Grexa: ₹15,000/quarter, no trial, sales call mandatory, off-menu pricing,
refund fights. There is an unserved band beneath them, and the audit in §9.1
is a free artefact good enough to acquire on.

Not Pranay's file, but this teardown is the evidence — hand §5 to Aryan.

---

### TIER 2 — high impact, blocked or partially blocked on GBP API

#### 9.6 Threshold-aware metrics — the state nobody else renders
**Impact: medium-high. Feasibility: medium. GBP API: REQUIRED.**

Per §8.3, Google returns "fewer than N" for low-volume keywords. Every competitor
renders that as a number or a zero. Shoogle should render it as
**"fewer than 15 — Google doesn't report exact counts this low"**.

`DataState<T>` does not model this today, and it is *not* an
`UnavailableReason` — it is a real, ready, bounded measurement. It probably wants
a domain type in `types/` (Pranay may not add to `lib/state/`), something like
`type Counted = { kind: 'exact'; value: number } | { kind: 'below'; threshold: number }`.

**This is a conversation with Sunny before any code.** `lib/` is his and
`DataState` is explicitly "do not add states here without agreeing it with the
team". Raise it as an issue; do not fork a copy into `features/seo/`.

Build the **renderer and the fixtures now** — the component, the tests, and the
`fixtures/` data can all land before the API does, so the day quota is approved
we are wiring, not designing.

#### 9.7 A review-request flow that is provably compliant
**Impact: high. Feasibility: medium. GBP API: partially (reading/replying needs it; requesting does not).**

Grexa says it "generates authentic Google reviews from your paid customers."
Shoogle can do the honest version and *say so in the UI*:

- send a plain review link to a real customer — allowed
- **no incentive**, ever — Google's policy prohibits reviews posted "due to an
  incentive offered by a business"
- **no sentiment gating** — we never ask "were you happy?" first and route only
  the happy ones to Google
- **no content steering** — we never suggest what the customer should write

Ship a visible "why we do it this way" note quoting the policy. In a market where
the incumbent's review distribution looks like §6.3, being the one that cannot
get a listing suspended is a real sale.

*Requesting* reviews needs no GBP API. *Reading and replying to* reviews does
(v4, §8.4).

#### 9.8 Geo-grid visibility map
**Impact: very high for the owner. Feasibility: LOW. GBP API: not the blocker — but there is no free source.**

"Where do I show up within 2 km of my shop" is the question a salon owner
actually has, and it is Grexa's clearest missing feature.

**Be honest: we probably cannot build this.** It requires either a licensed
grid-rank API (paid, per-point, adds up fast) or scraping Google results from
spoofed coordinates, which violates Google's terms. Do not build the scraper.
Do not ship a fake heatmap. If we cannot license a source, this stays on the
"deliberately not built" list — and the coverage ledger (§9.2) names it as such.

Listed here because it is the biggest opportunity in the space and Pranay should
know it is real, expensive, and currently out of reach.

#### 9.9 NAP / citation consistency across Indian directories
**Impact: medium-high. Feasibility: LOW-MEDIUM. GBP API: not required.**

JustDial, Practo, Zomato, Sulekha, IndiaMART. Nobody in this competitive set
checks it, and inconsistency genuinely hurts local ranking. But it means either
per-directory scraping (ToS risk, brittle) or a licensed aggregator. **Do not
start this before a research report says a legitimate source exists.**

---

### TIER 3 — structural / process advantages

#### 9.10 Two-tier capability model, visible to the owner
**Impact: medium. Feasibility: very high. GBP API: N/A.**

Design `features/gbp/` from day one around two honest tiers:

- **Public tier** — works with zero connection, zero OAuth. Powers §9.1–§9.4.
- **Connected tier** — everything that needs the gated API: performance metrics,
  keyword impressions, review replies, post publishing.

Every connected-tier surface renders `unavailable('not_connected', …)` today, with
copy the owner can actually understand. The provider registry already returns
`not_connected` until a real provider is registered — this is the intended design,
not a workaround. Do not stub a fake `GoogleBusinessProfileProvider` that returns
plausible numbers.

#### 9.11 Never sell what Google controls
**Impact: medium (avoids their worst failure). Feasibility: N/A.**

Grexa sold "help complete our Google Business verification" and could not
deliver (§6.2). Verification is Google's process, on Google's timeline, and it
can fail. Shoogle should **guide** verification — checklist, what to expect, what
usually goes wrong — and **never** present it as something we complete.
`GbpLocation.verificationState` already models `verified | unverified | pending |
unknown`, and `unknown` is a legitimate answer.

#### 9.12 Works offline and answers instantly
**Impact: medium. Feasibility: high. GBP API: N/A.**

`UnavailableReason.offline` exists. Indian small-business owners check things on
patchy mobile data between customers. An app that says "you're offline, this will
refresh when you reconnect" beats one that spins. Also: no progress theatre —
Grexa's customers spent 45 days watching nothing happen; a Shoogle audit that
takes 8 seconds and says exactly what it did is a different product.

---

### Ranking summary

| # | Differentiator | Impact | Feasibility now | GBP API needed? |
|---|---|---|---|---|
| 9.2 | Coverage ledger (what we couldn't check + why) | Very high | Very high | No |
| 9.1 | 60-second zero-input audit | Very high | High* | No |
| 9.3 | Draft-and-hand-over fix cards | High | High | No |
| 9.4 | Refuse to claim rank, explain why | High | Very high | No |
| 9.5 | Sub-₹5k self-serve pricing | High | High (Aryan) | No |
| 9.7 | Provably compliant review requests | High | Medium | Partial |
| 9.6 | Threshold-aware metrics ("fewer than 15") | Med-high | Medium | **Yes** |
| 9.10 | Two-tier capability model | Medium | Very high | No |
| 9.11 | Never sell verification | Medium | N/A | No |
| 9.12 | Offline honesty, no progress theatre | Medium | High | No |
| 9.9 | NAP/citation consistency | Med-high | Low-med | No (needs a source) |
| 9.8 | Geo-grid visibility map | Very high | **Low** | No (needs a licensed source) |

\* §9.1 is high-feasibility *engineering* but is gated on a Places-API research
report and a Maps Platform billing account. Until then it runs on `fixtures/`
with the dev banner.

---

## 10. Things Grexa does that Shoogle must NOT copy

1. **Sales-call-gated onboarding.** It is their #1 complaint generator.
2. **Inconsistent public numbers** (21,600 / 60,000 / 3.6 lakh). Product rule 6.
3. **"Rank #1 on Google" as a promise.** Unfalsifiable and unbacked by any API.
4. **"Generates authentic Google reviews."** At best ambiguous, at worst against
   Google's incentive/solicitation policy.
5. **"50% More Google calls within 90 days."** A numeric outcome guarantee.
6. **Selling GBP verification as a deliverable.**
7. **Taking custody of the owner's WhatsApp number** with a painful exit.
8. **Off-menu pricing** alongside a page that says there is one plan.
9. **Long silent activation periods.** If something takes days, say so on day
   zero and show real state — not a self-ticking checklist (product rule 10).

---

## 11. Open questions / UNVERIFIED

- **Google Play rating, install count and review text.** Not retrievable via
  WebFetch (client-rendered). **Highest-value remaining gap** — the user
  explicitly wanted these. Needs a browser session or Play scraper.
- **What powers Grexa's "ranking" screen** (v2.45.3 changelog). Not the GBP API —
  it does not expose position. Scrape, licensed SERP API, or impressions
  relabelled as "rank"? Unknown.
- **Whether Grexa holds GBP API access**, and whether they publish posts via API
  or via a human logging into the owner's profile. The 45-day activation and the
  meeting-heavy support model both hint at significant manual operation.
- **Whether their review flow gates by sentiment or offers incentives.**
- **The exact in-app onboarding question set.** Gated behind account creation.
- **The ₹9,999/year plan** — legacy tier, or sales discretion?
- **Verbatim text** of the Dentethix and WhatsApp-number-release 1★ Trustpilot
  reviews (surfaced in search summaries, full text not retrieved).
- **Google Places API field list, caching terms, attribution and cost.** Assumed
  in §9.1 but deliberately not asserted here — needs its own `api-researcher`
  report before any code.

---

## 12. Sources

**Grexa first-party**
- https://grexa.ai/
- https://grexa.ai/pricing
- https://grexa.ai/travel-agency-marketing-software
- https://shop.grexa.ai/v10
- https://apps.apple.com/in/app/grexa-marketing-ai-platform/id6670168657
- https://itunes.apple.com/in/rss/customerreviews/id=6670168657/sortBy=mostRecent/json
- https://play.google.com/store/apps/details?id=ai.grexa.app (listing only; reviews not retrievable)
- https://www.facebook.com/GrexaAI/

**Third-party reviews**
- https://www.trustpilot.com/review/grexa.ai
- https://www.trustpilot.com/review/grexa.ai?stars=1
- https://www.trustpilot.com/review/grexa.ai?stars=5

**Press / funding**
- https://startupstorymedia.com/insights-grexa-ai-raises-%E2%82%B915-5-cr-in-seed-round-to-automate-marketing-for-indias-small-businesses/
- https://moneymint.com/four-iit-geeks-built-grexa-ai-to-simplify-digital-marketing-for-indias-local-businesses/
- https://india.entrepreneur.com/news-and-trends/kluiszai-and-grexa-ai-raise-early-stage-funding-for-growth/
- https://www.crunchbase.com/organization/grexa

**Google first-party (for §8)**
- https://developers.google.com/my-business/content/prereqs
- https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric
- https://developers.google.com/my-business/reference/performance/rest/v1/locations.searchkeywords.impressions.monthly/list
- https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews
- https://support.google.com/contributionpolicy/answer/7400114

**Adjacent competitor (for the geo-grid gap)**
- https://leadsnap.com/
