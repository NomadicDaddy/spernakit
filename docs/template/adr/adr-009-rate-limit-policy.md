# ADR-009: Rate-Limit Auth Exemption Policy

## Status

Accepted

## Context

Spernakit applies two layers of rate limiting:

1. **Global API limiter** (`rateLimitPlugin`): 600 requests / 15 minutes, keyed by user ID for authenticated requests or IP for anonymous. Applied to every `/api/v1/*` route.
2. **Auth-specific limiter** (`authRateLimitPlugin`): tighter per-endpoint limits on non-safe (mutating) `/api/v1/auth/*` requests - 10 requests / 15 minutes per IP, plus a 10-attempts-per-account limit for login and forgot-password.

The global limiter exempts a small set of path prefixes from counting against the 600/15min budget. Over a 30-day window, the exempt-prefix list flipped four times, twice on the same day, and two of those flips landed silently inside version-bump commits. The root cause was the absence of a written policy. Each agent who touched the list re-argued the tradeoff from scratch. And because the SPA polls `/auth/me` on every navigation, pulling that endpoint back under the global limiter produced false session-expiry redirects.

This ADR codifies the exemption policy so future changes are a deliberate policy decision, not an incidental edit.

## Decision Drivers

- **SPA UX**: Authenticated users hit `/auth/me` on every route navigation. Global limits sized for API workloads cause false 429s, which the SPA reads as session expiry and turns into forced logouts.
- **Defense in depth**: Auth mutation endpoints already have targeted rate limiting via `authRateLimitPlugin` with far stricter limits (10/15min vs 600/15min) and account-level checks.
- **Lockout prevention**: A user who exhausts the global 600/15min limit must still be able to re-authenticate. If `/auth/login` and `/auth/refresh` count against the same exhausted budget, the user is locked out of their own account.
- **Abuse resistance**: Exemptions must not create a bypass for credential-stuffing or token-refresh abuse. `authRateLimitPlugin` must cover any global-exempt mutation endpoint.

## Considered Alternatives

### Alternative 1: No exemptions - all `/auth/*` endpoints count against global limiter

Pros:

- Uniform policy, no edge cases
- No risk of forgetting to wire exempt endpoints into `authRateLimitPlugin`

Cons:

- SPA `/auth/me` polling causes false 429s under normal navigation patterns
- Users whose global budget is exhausted (e.g., by a runaway frontend loop) cannot log in or refresh to recover
- Conflicts with ADR-002 (cookie-based JWT) which assumes `/auth/me` is cheaply callable

### Alternative 2: Blanket exemption - all `/auth/*` endpoints exempt from global limiter

Pros:

- No false logouts anywhere in the auth flow
- Simple mental model

Cons:

- `/auth/register` and `/auth/verify-email` have no dedicated auth plugin coverage and would be rate-limit-free
- Creates a credential-stuffing surface on registration
- Breaks "defense in depth" - the global limiter is a fallback for endpoints without targeted limits

### Alternative 3: Selective exemption by coverage status (Selected)

Exempt an endpoint from the global limiter if and only if **both** conditions hold:

1. The endpoint is hit frequently enough by normal SPA use that global limits cause false 429s, OR lockout from it prevents recovery
2. The endpoint is covered by a dedicated rate-limit plugin (`authRateLimitPlugin`) or is idempotent/safe (GET/HEAD)

Pros:

- Each exemption has a stated reason
- Guarantees no endpoint is both globally exempt AND unprotected
- Matches actual observed SPA behavior

Cons:

- Requires the policy be checked whenever a new `/auth/*` endpoint is added

## Decision Outcome

Chosen alternative: **Selective exemption by coverage status**

### Exempt from global limiter

| Path prefix                  | Method | Why exempt                                                                                                                         | Dedicated protection                                                                       |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/api/v1/auth/me`            | GET    | Polled on every SPA navigation; rate-limiting causes false session-expiry redirects                                                | Safe method (GET) - `authRateLimitPlugin` skips safe methods; account-bound via JWT cookie |
| `/api/v1/auth/login`         | POST   | Lockout here blocks recovery from any other rate-limit exhaustion                                                                  | `authRateLimitPlugin`: 10 req/15min per IP + 10 attempts/15min per account                 |
| `/api/v1/auth/refresh`       | POST   | Lockout here forces re-login, compounding the problem                                                                              | `authRateLimitPlugin`: 10 req/15min per IP                                                 |
| `/api/v1/health`             | any    | Infrastructure endpoint (load balancers, uptime monitors)                                                                          | Trivial compute, no auth state                                                             |
| `/api/v1/docs`               | any    | OpenAPI docs UI served to authenticated developers                                                                                 | Trivial compute                                                                            |
| `/api/v1/dashboards/shared/` | GET    | Unauthenticated; shared dashboard 429 triggers TanStack Query retries that cascade and exhaust the global budget for all endpoints | Dedicated per-route limiter: 30 req/60s per IP (`templates-import.ts`)                     |

### NOT exempt - count against global limiter

| Path prefix                     | Why not exempt                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/api/v1/auth/register`         | Credential creation; global limiter is part of defense in depth. Also covered by `REGISTRATION_RATE_LIMIT` (5 req/hour per IP) |
| `/api/v1/auth/logout`           | Low frequency; no lockout-recovery concern                                                                                     |
| `/api/v1/auth/password-reset/*` | Covered by `PASSWORD_RESET_*` limits; still benefits from global cap                                                           |
| `/api/v1/auth/verify-email`     | One-shot token redemption, low frequency                                                                                       |
| `/api/v1/auth/oauth/*`          | Covered by `OAUTH_CALLBACK` limits; still benefits from global cap                                                             |
| `/api/v1/auth/forgot-password`  | Covered by `PASSWORD_RESET_EMAIL` + `PASSWORD_RESET_IP` limits; still benefits from global cap                                 |

### When to reconsider this policy

Revisit this ADR if any of the following change:

1. **SPA polling pattern changes** - e.g., `/auth/me` replaced by WebSocket session events or moved behind React Query cache with aggressive stale time (then the exemption may no longer be necessary)
2. **Global limits tighten below ~100 req/15min** - then `/auth/login` and `/auth/refresh` exemption becomes critical, not just helpful
3. **`authRateLimitPlugin` is refactored or removed** - exemptions depend on its coverage of login/refresh; any gap reopens the policy
4. **New `/auth/*` endpoint added** - confirm it falls into one of the tables above

### Where this policy is implemented

- Exempt list: `backend/src/plugins/rateLimit/rateLimitPlugin.ts` - `RATE_LIMIT_EXEMPT_PREFIXES` constant
- Auth-specific limits: `backend/src/plugins/rateLimit/authRateLimitPlugin.ts`
- Limit constants: `backend/src/constants/rateLimit.ts`
- Independent kill switches: `config.rateLimit.enabled` (global limiter) and `config.rateLimit.authEnabled` (auth-specific limiter). The two flags are independent so dev environments can disable auth throttling for scripted multi-role test runs without losing general request throttling, and production deployments can keep auth throttling on even if a tenant opts out of general limits. The auth bypass is consulted by `isAuthRateLimitBypassed()` in `plugins/rateLimit/helpers.ts`.

## Consequences

### Positive

- Stable policy - the `RATE_LIMIT_EXEMPT_PREFIXES` constant should not flip without an ADR amendment
- New `/auth/*` endpoints have a decision checklist to apply
- Every exempt endpoint has a stated protection mechanism; no "ghost" endpoints
- `/auth/me` SPA polling no longer causes false logouts

### Negative

- Developers adding new auth endpoints must check this policy (mitigated by cross-reference from the source file JSDoc)
- The dual-plugin architecture has more moving parts than a single uniform limiter
- Exemptions are path-prefix based - a future sub-route like `/api/v1/auth/me/extended` would inherit the exemption, which may not always be desired

## Related ADRs

- [ADR-002](adr-002-cookie-based-jwt-auth.md): Cookie-based JWT auth (defines the `/auth/me` polling pattern)
- [ADR-003](adr-003-rbac-system.md): RBAC system (authenticated-user identity used as rate-limit key)
