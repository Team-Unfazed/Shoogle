# Provider contracts

Interfaces only. **No implementation lives in this folder.**

Every external capability Shoogle will eventually use is declared here as a
TypeScript interface returning `DataState<T>`. The foundation ships *contracts*
so five engineers can build against a stable shape in parallel, and so the UI
can render honest `not_connected` / `unavailable` / `error` states long before
any integration exists.

## Rules

1. **Never** add a live network call to this folder. Implementations belong in
   the owning feature folder (e.g. `features/gbp/providers/`).
2. Every method returns `Promise<DataState<T>>` — never a bare value, never a
   thrown error for an expected condition.
3. A capability that is not wired yet returns
   `unavailable('not_connected', …)`. It must never return `0`, `[]` framed as
   a real result, or fabricated numbers.
4. Before implementing any of these, run the `api-researcher` agent
   (`.claude/agents/api-researcher.md`) and record findings in
   `docs/research/`. Do not guess at scopes, quotas, or pricing.

## Ownership

| Contract | Owner |
|---|---|
| `GoogleBusinessProfileProvider` | Pranay |
| `AuditProvider`, `SeoProvider` | Pranay |
| `InstagramProvider`, `LinkedInProvider`, `SocialPublisher` | Yash |
| `WebsiteGenerator` | Devashish |
| `BillingProvider` | Aryan |
| `AuthProvider` | Sunny |
