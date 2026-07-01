# OAuth End-to-End Test Plan

**Template version**: spernakit v3.13.1
**Tracks**: `audit-20260423-oauth-providers-untested`
**Status**: Manual plan — scenarios defined, execution pending

Spernakit ships OAuth provider implementations for Google, GitHub, and Microsoft (`backend/src/services/oauth/`, `frontend/src/components/auth/OAuthProviderButtons.tsx`). Providers are disabled until a SYSOP enables them in Settings > Authentication with complete credentials, or file config provides a complete enabled provider. This plan validates the full OAuth path so every derived app inherits a known-good baseline.

No unit test framework is used — spernakit bans vitest/jest/@testing-library. Execution is manual against a running dev server, with screenshots captured to `screenshots/tester/` and results recorded inline below.

## Prerequisites

- [ ] GitHub OAuth app registered (recommended as the first provider — simplest setup, no tenant/org config)
    - Homepage URL: `http://localhost:3330`
    - Authorization callback URL: `http://localhost:3330/api/v1/auth/oauth/github/callback`
- [ ] `clientId`, `clientSecret`, and callback URL override saved in Settings > Authentication > OAuth / SSO Providers as SYSOP, or equivalent file config prepared for fallback testing.
- [ ] GitHub provider enabled and saved; `GET /api/v1/auth/oauth/providers` returns `github`.
- [ ] Dev server running (`bun run dev`) with frontend on `http://localhost:3330`
- [ ] Baseline smoke pass: `bun run smoke:qc` green before starting

## Preflight Checks

- [ ] `GET /api/v1/settings/oauth-providers` is available to SYSOP users and returns all supported providers.
- [ ] Login page calls `GET /api/v1/auth/oauth/providers` and renders only enabled providers.
- [ ] The configured callback URL matches the provider registration exactly. When testing through the dev frontend proxy, prefer `http://localhost:3330/api/v1/auth/oauth/github/callback`.
- [ ] If the provider is configured through file config instead of Settings, restart the backend and record that setup path in the Notes column.

## Scenarios

Each scenario records: Steps executed / Expected behavior / Result (PASS | FAIL | BLOCKED) / Screenshot path / Notes.

### 1. Authorization redirect

| Field      | Value                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steps      | Visit `/login`, click "GitHub" (or directly request `/api/v1/auth/oauth/github` after enabling the provider)                                                                                                |
| Expected   | 302 with `Location` header pointing to `https://github.com/login/oauth/authorize?client_id=...&state=...&redirect_uri=...`; `state` is a 32+ char HMAC token; PKCE `code_challenge` present in query string |
| Result     | _pending_                                                                                                                                                                                                   |
| Screenshot | `screenshots/tester/oauth-01-authz-redirect.png`                                                                                                                                                            |
| Notes      | _pending_                                                                                                                                                                                                   |

### 2. Callback success

| Field      | Value                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Steps      | Complete GitHub consent; observe callback to `/api/v1/auth/oauth/github/callback?code=X&state=<valid>` |
| Expected   | 302 to `/dashboard`; session cookie set; `user` row created or linked; audit log entry written         |
| Result     | _pending_                                                                                              |
| Screenshot | `screenshots/tester/oauth-02-callback-success.png`                                                     |
| Notes      | _pending_                                                                                              |

### 3. Callback state mismatch

| Field      | Value                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Steps      | Manually tamper with `state` query param on callback URL (e.g., change one character)                                  |
| Expected   | 400 auth failure response; no session created; logs identify state/session-binding failure without creating an account |
| Result     | _pending_                                                                                                              |
| Screenshot | `screenshots/tester/oauth-03-state-mismatch.png`                                                                       |
| Notes      | _pending_                                                                                                              |

### 4. Callback expired code

| Field      | Value                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Steps      | Complete auth redirect, wait > 10 min before visiting callback URL                                                     |
| Expected   | 4xx from provider-error path (GitHub returns `bad_verification_code`); handled gracefully with user-facing error toast |
| Result     | _pending_                                                                                                              |
| Screenshot | `screenshots/tester/oauth-04-expired-code.png`                                                                         |
| Notes      | _pending_                                                                                                              |

### 5. Account linking (existing user)

| Field      | Value                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Steps      | Pre-create a user with email `X` via normal signup; log out; sign in via GitHub returning the same email `X` |
| Expected   | No duplicate user row; `oauthAccounts` row linked to existing user; existing role preserved                  |
| Result     | _pending_                                                                                                    |
| Screenshot | `screenshots/tester/oauth-05-link-existing.png`                                                              |
| Notes      | _pending_                                                                                                    |

### 6. New user creation

| Field      | Value                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| Steps      | Sign in via GitHub with email `Y` not in `users` table                                 |
| Expected   | `users` row created with default role `VIEWER`; `oauthAccounts` row linked to new user |
| Result     | _pending_                                                                              |
| Screenshot | `screenshots/tester/oauth-06-new-user.png`                                             |
| Notes      | _pending_                                                                              |

### 7. MFA interaction

| Field      | Value                                                                                |
| ---------- | ------------------------------------------------------------------------------------ |
| Steps      | As an MFA-enabled user, initiate GitHub OAuth and complete provider consent          |
| Expected   | Flow halts at `/mfa-verify`; completing second factor lands the user on `/dashboard` |
| Result     | _pending_                                                                            |
| Screenshot | `screenshots/tester/oauth-07-mfa.png`                                                |
| Notes      | _pending_                                                                            |

### 8. Denied consent

| Field      | Value                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Steps      | Initiate GitHub OAuth; deny the consent screen                                                          |
| Expected   | Callback with `error=access_denied`; redirect back to `/login`; user-facing toast explains cancellation |
| Result     | _pending_                                                                                               |
| Screenshot | `screenshots/tester/oauth-08-denied.png`                                                                |
| Notes      | _pending_                                                                                               |

## Follow-ups

For any scenario marked FAIL, file a feature under `.aidd/features/` referencing the scenario number and fix before marking the scope complete. Reference the feature id in the Notes column.

## Sign-off

When all 8 scenarios are PASS, append this line to `docs/template/DEVELOPMENT.md` (OAuth subsection):

```
OAuth providers exercised end-to-end in spernakit v3.13.1 on YYYY-MM-DD; see docs/testing/OAUTH-TEST-PLAN.md for results.
```

| Provider  | Tested on     | Result        |
| --------- | ------------- | ------------- |
| GitHub    | _pending_     | _pending_     |
| Google    | _not started_ | _not started_ |
| Microsoft | _not started_ | _not started_ |
