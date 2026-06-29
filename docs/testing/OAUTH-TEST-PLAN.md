# OAuth End-to-End Test Plan

**Template version**: spernakit v3.3.1
**Tracks**: `audit-20260423-oauth-providers-untested`
**Status**: Skeleton — scenarios defined, execution pending

Spernakit ships OAuth provider implementations for Google, GitHub, and Microsoft (`backend/src/services/oauth/`, `frontend/src/components/auth/OAuthProviderButtons.tsx`) but all providers default to `enabled: false` in `backend/src/config/configSchemas/oauth.ts` and have never been exercised end-to-end. This plan validates the full OAuth path so every derived app inherits a known-good baseline.

No unit test framework is used — spernakit bans vitest/jest/@testing-library. Execution is manual against a running dev server, with screenshots captured to `screenshots/tester/` and results recorded inline below.

## Prerequisites

- [ ] GitHub OAuth app registered (recommended as the first provider — simplest setup, no tenant/org config)
    - Homepage URL: `http://localhost:5173`
    - Authorization callback URL: `http://localhost:3000/api/v1/auth/oauth/github/callback` (verify actual path in `oauthCore.ts` before registering)
- [ ] `clientId` and `clientSecret` stored via the project's secrets mechanism (`config/spernakit.secrets.json` — verify this path; `configSecrets.ts` may expect a different filename)
- [ ] Feature-blocking fixes for admin-UI toggle landed (see "Dependencies" below)
- [ ] Dev server running (`bun run dev`) with OAuth provider toggled on in Settings → Auth Security
- [ ] Baseline smoke pass: `bun run smoke:qc` green before starting

## Dependencies

These derived-app findings describe template-level bugs that must land in spernakit before scenario 2 can run:

- OAuth settings table credentials ignored — UI toggle currently non-functional (originates from a derived-app audit; template-equivalent fix required before GitHub can be enabled via admin UI rather than config edit)
- OAuth settings silent parse/decrypt failure — configuration errors must surface to the operator during manual setup

If these fixes have not landed when executing this plan, enable the provider directly by editing the secrets file and restart the server; document that path in the result column.

## Scenarios

Each scenario records: Steps executed / Expected behavior / Result (PASS | FAIL | BLOCKED) / Screenshot path / Notes.

### 1. Authorization redirect

| Field      | Value                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steps      | Visit `/login`, click "Continue with GitHub"                                                                                                                                                                |
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

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Steps      | Manually tamper with `state` query param on callback URL (e.g., change one character)                         |
| Expected   | 400 with error code `OAUTH_STATE_MISMATCH` (verify exact code constant in `oauthCore.ts`); no session created |
| Result     | _pending_                                                                                                     |
| Screenshot | `screenshots/tester/oauth-03-state-mismatch.png`                                                              |
| Notes      | _pending_                                                                                                     |

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
OAuth providers exercised end-to-end in spernakit v3.3.1 on YYYY-MM-DD; see docs/testing/OAUTH-TEST-PLAN.md for results.
```

| Provider  | Tested on     | Result        |
| --------- | ------------- | ------------- |
| GitHub    | _pending_     | _pending_     |
| Google    | _not started_ | _not started_ |
| Microsoft | _not started_ | _not started_ |
