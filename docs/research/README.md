# API research

Verified research produced by the `api-researcher` agent
(`.claude/agents/api-researcher.md`) and by research passes run against
first-party documentation.

**Rule for this folder:** only first-party provider documentation counts as
verification. Anything that could not be confirmed against the provider's own
docs is marked `UNVERIFIED` in the report and must stay that way until someone
confirms it. Never treat an `UNVERIFIED` line as settled.

**No secrets in this folder — variable names only.**

---

## Committed reports

| Report | Covers | Verdict |
|---|---|---|
| [`google-business-profile.md`](./google-business-profile.md) | The full GBP API family: endpoints, the single OAuth scope, the access-request gate, verification gating, reviews, local posts, media, performance metrics, quotas, pricing | **VIABLE WITH CONDITIONS** |
| [`local-seo-methodology.md`](./local-seo-methodology.md) | The audit check registry (Areas A–I), scoring and the coverage gate, severity and ordering, and the geo-grid / maps build decision | Methodology, not a provider |
| [`ai-search-visibility.md`](./ai-search-visibility.md) | Being cited by AI answers, schema.org for Indian local verticals, NAP consistency, what is and is not measurable | Mixed — see §7A vs §7B |
| [`competitive-grexa.md`](./competitive-grexa.md) | Grexa AI teardown: features, onboarding, pricing, user complaints, and where Shoogle can win | Competitive, not a provider |

---

## The three findings that change what gets built

1. **Google exposes no search rank position via any API.** Not rate-limited, not
   approval-gated — it does not exist. `SeoProvider.getRankings()` returns
   `unavailable('not_supported', …)` and `KeywordRanking.position` stays `null`.
   Real rank tracking needs a paid third party plus server infrastructure.

2. **GBP API access is a hard gate.** A project sits at **0 QPM until an access
   request is approved** — reviewed within 14 days, and requiring a profile
   verified and active for 60+ days plus a matching website. No code works around
   it.

3. **A large slice of the expected "marketing dashboard" was deleted by Google in
   2023.** Post views, photo views, query-type breakdowns and driving-direction
   metrics are gone with no replacement. They must render
   `unavailable('not_supported')` **forever** — never `0`, never "coming soon".

---

## Still unresearched

| Integration | Owner | Why it needs research first |
|---|---|---|
| Instagram / Meta Graph | Yash | Publishing requires app review and a Business/Creator account linked to a Page |
| LinkedIn | Yash | Posting permissions are gated by partner-programme access |
| Razorpay | Aryan | Interacts with Google Play billing policy |
| Gemini | Yash / Devashish | Free-tier data-use terms are unsuitable for real customer data; pricing is model-dependent |
| Supabase | Sunny | Auth flows and RLS patterns for React Native |
| Google Maps Platform | Pranay | Only if geo-grid is revisited — needs a billing account and a ToS answer on competing services |

Before implementing any of these, run the agent and commit the report here as
`<provider>-<api>.md`.
