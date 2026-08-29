# API research

Output from the `api-researcher` agent (`.claude/agents/api-researcher.md`).

**This folder is empty of findings — no API has been researched yet.**

Before implementing any integration, run the agent and commit its report here as
`<provider>-<api>.md`. The agent only accepts first-party documentation as
verification and marks anything it cannot confirm as `UNVERIFIED`.

Integrations that will need a report before work starts:

| Integration | Owner | Why it needs research first |
|---|---|---|
| Google Business Profile | Pranay | Needs an approved quota request; write operations require a verified location |
| Instagram / Meta Graph | Yash | Publishing requires app review and a Business/Creator account linked to a Page |
| LinkedIn | Yash | Posting permissions are gated by partner-programme access |
| Razorpay | Aryan | Interacts with Google Play billing policy |
| Gemini | Yash / Devashish | Pricing and free-tier limits; must be called server-side |
| Supabase | Sunny | Auth flows and RLS patterns for React Native |

**Never record a secret in this folder — variable names only.**
