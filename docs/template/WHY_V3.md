# Why Spernakit v3 — Technology Decisions

This document explains the technology choices made for Spernakit v3 and why each v2 component was changed or added. Every change was deliberate, driven by security hardening, multi-database support, type contract reliability, and operational scalability across 10+ derived applications.

---

## JWT Signing: ES256 over HS256

**v2**: HS256 symmetric JWT secrets (`jwtSecret`, `jwtRefreshSecret`)
**v3**: ES256 asymmetric EC P-256 key pairs (`jwtPrivateKey`/`jwtPublicKey`, `jwtRefreshPrivateKey`/`jwtRefreshPublicKey`)

| Consideration      | HS256                                        | ES256                                                 |
| ------------------ | -------------------------------------------- | ----------------------------------------------------- |
| Key Type           | Shared secret (symmetric)                    | Private/public key pair (asymmetric)                  |
| Verification       | Requires the signing secret                  | Public key only — signing key never leaves the issuer |
| Distribution       | Every verifier needs the secret              | Public keys can be freely distributed                 |
| Rotation           | Must update secret everywhere simultaneously | Rotate private key; distribute new public key         |
| Key Generation     | Manual random string                         | `bun run generate-keys` (`scripts/generate-keys.ts`)  |
| Compromise Surface | Any verifier can forge tokens                | Only the private key holder can sign                  |

**Why**: HS256 means every service that needs to verify a JWT must hold the signing secret — and any of them can forge tokens. ES256 separates signing (private key) from verification (public key). In distributed deployments where multiple services verify tokens, this eliminates shared-secret risk entirely. Key generation is automated via `bun run generate-keys`, which produces the EC P-256 key pairs and writes them to the config file.

---

## Database: Dual-Dialect (SQLite + PostgreSQL) over SQLite-Only

**v2**: SQLite only via `bun:sqlite` + `drizzle-orm/sqlite-core`
**v3**: SQLite (default) + PostgreSQL support via `backend/src/db/schema-pg/` with config-driven dialect switching

| Consideration     | SQLite-Only              | Dual-Dialect                                               |
| ----------------- | ------------------------ | ---------------------------------------------------------- |
| Default Engine    | SQLite via `bun:sqlite`  | SQLite via `bun:sqlite` (unchanged default)                |
| PostgreSQL        | Not supported            | Native support via `backend/src/db/schema-pg/`             |
| Schema Parity     | Single schema definition | Dual schemas with type-level parity                        |
| Dialect Selection | Hardcoded                | `database.dialect` config key                              |
| Self-Hosted       | Zero-dependency database | SQLite for single-node, PostgreSQL for team infrastructure |
| Migration         | `db:push` only           | generated migrations plus `db:migrate`                     |

**Why**: Self-hosted applications benefit from SQLite's zero-dependency simplicity — no database server to install, configure, or maintain. But teams with existing PostgreSQL infrastructure shouldn't be forced to run SQLite alongside it. The dual-dialect approach maintains SQLite as the default while providing native PostgreSQL support through a parallel schema directory. The `database.dialect` config key switches between them without code changes. Both schemas maintain type-level parity so application code is dialect-agnostic.

---

## Type Contract: Shared Workspace over Independent Type Definitions

**v2**: Frontend types independently defined in `frontend/src/api/types.ts`, manually kept in sync
**v3**: `spernakit-shared` workspace with canonical `ErrorCode` (39 codes), `UserRole`, `ROLE_HIERARCHY`, `hasMinimumRole`, `DataResponse`, `PaginatedResponse`, `ErrorResponse`

| Consideration   | Independent Definitions                       | Shared Workspace                                           |
| --------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Source of Truth | Two copies — backend schemas + frontend types | Single canonical definition in `spernakit-shared`          |
| Sync Mechanism  | Manual comparison and copy                    | Bun workspace protocol — import directly                   |
| Error Codes     | Duplicated string literals                    | `ErrorCode` enum (39 codes) — single source                |
| Role Logic      | Duplicated hierarchy checks                   | `ROLE_HIERARCHY`, `hasMinimumRole` — shared implementation |
| Response Types  | Separately defined interfaces                 | `DataResponse`, `PaginatedResponse`, `ErrorResponse`       |
| Drift Detection | None (discovered at runtime)                  | TypeScript compiler catches mismatches at build time       |

**Why**: Independent type definitions drift. A backend developer adds a new error code or changes a response shape, and the frontend definition isn't updated until something breaks in production. The `spernakit-shared` workspace provides a single source of truth consumed by both backend and frontend via Bun's workspace protocol. When a type changes in shared, both consumers see the change immediately — TypeScript catches mismatches at build time, not runtime.

---

## Config Validation: Zod Schema over Unchecked JSON

**v2**: JSON config loaded and used with basic validation
**v3**: Full Zod schema validation pipeline — `bun run config:validate` and `bun run config:schema`

| Consideration     | Basic Validation         | Zod Schema Pipeline                                          |
| ----------------- | ------------------------ | ------------------------------------------------------------ |
| Validation Depth  | Key existence checks     | Full type, range, format, and cross-field validation         |
| Pre-Flight Check  | None — errors at runtime | `bun run config:validate` catches errors before server start |
| IDE Support       | None                     | `bun run config:schema` generates JSON Schema for VS Code    |
| Env-Var Injection | Basic substitution       | Validated after injection — catches broken env vars          |
| Error Messages    | Generic runtime errors   | Zod paths pinpoint the exact misconfigured field             |

**Why**: Config errors are the #1 cause of deployment failures. A missing key, a wrong type, or an invalid value produces a cryptic runtime error minutes after startup. The Zod schema validates the entire config — load, merge, env-var injection — before the server starts. `bun run config:validate` runs the full pipeline without starting the server, making it suitable for CI/CD pre-flight checks. `bun run config:schema` generates a JSON Schema file that provides VS Code autocomplete and inline validation while editing config files.

---

## Imports: Direct File Imports over Barrel Files

**v2**: UI barrel file `frontend/src/components/ui/index.ts` re-exporting all 22 shadcn/ui components
**v3**: Direct imports from source files (`@/components/ui/button`, not `@/components/ui`)

| Consideration    | Barrel Imports                         | Direct Imports                                        |
| ---------------- | -------------------------------------- | ----------------------------------------------------- |
| Tree-Shaking     | Defeated — bundler sees all re-exports | Optimal — bundler sees only what's imported           |
| Circular Deps    | Risk increases with barrel depth       | Eliminated by design                                  |
| Bundle Size      | Larger — unused components pulled in   | Smaller — only imported components included           |
| IDE Auto-Import  | Points to barrel, not source           | Points directly to source file                        |
| Migration Effort | N/A                                    | `scripts/codemod-barrel-imports.ts` handles 56+ files |

**Why**: Barrel files (`index.ts` re-exporting everything) are convenient but defeat tree-shaking — the bundler must analyze every re-exported module even when only one component is used. They also create circular dependency risks when modules in the barrel depend on each other. Direct imports (`@/components/ui/button` instead of `@/components/ui`) give the bundler precise information for code splitting and eliminate circular dependency paths. The `scripts/codemod-barrel-imports.ts` codemod automates the migration across the entire codebase.

---

## API Contract Validation: OpenAPI Spec Check over Manual Sync

**v2**: Frontend types manually synchronized with backend schemas
**v3**: `bun run check:api-types` validates enum/union consistency at build time, wired into `smoke:qc`

| Consideration   | Manual Sync                          | Automated Validation                              |
| --------------- | ------------------------------------ | ------------------------------------------------- |
| Detection       | Runtime — user encounters wrong type | Build time — `check:api-types` fails the pipeline |
| Coverage        | Developer memory                     | Systematic enum/union comparison                  |
| CI Integration  | None                                 | Part of `smoke:qc` pipeline                       |
| Source of Truth | Ambiguous — backend or frontend?     | Backend TypeBox schemas via OpenAPI spec          |

**Why**: Type drift between frontend and backend is one of the most common sources of production bugs. A backend developer adds a new enum value, the frontend doesn't know about it, and the UI silently drops the new case. `bun run check:api-types` compares backend TypeBox schemas (via the OpenAPI spec at `/api/v1/docs/json`) against frontend type definitions and fails the build on inconsistency. Wiring it into `smoke:qc` ensures drift is caught before every commit.

---

## Testing Strategy: Smoke + Crawl over Unit Tests

**v2**: Vitest + happy-dom + @testing-library/react for frontend, bun:test for backend
**v3**: Test infrastructure removed — verification via `smoke:qc`, `crawltest.ts`, and supertest pipeline

| Consideration | Unit Tests                                    | Smoke + Crawl                                            |
| ------------- | --------------------------------------------- | -------------------------------------------------------- |
| What's Tested | Individual functions with mocked dependencies | Entire build pipeline + every rendered page              |
| Setup Cost    | Test framework + DOM emulation + mocks        | Zero — uses existing build + running server              |
| Maintenance   | Tests break on refactors (false positives)    | Tests break on real failures                             |
| Coverage      | High line coverage, low integration coverage  | Full integration — every page, every interactive element |
| Type Safety   | Tested at test scope                          | Enforced at build scope (typecheck across all files)     |

**Why**: For a template/framework, structural correctness (type safety, lint rules, build success) and integration testing (crawl every page, test every interactive element) catch more real bugs than unit tests on mocked dependencies. Unit tests on mocked React components verify the mock, not the component. `smoke:qc` verifies the entire build pipeline (typecheck, lint, build, format), and `crawltest.ts` crawls every page with screenshots to verify rendering. Unit tests are deferred to derived applications where domain logic warrants them.

**What we dropped**: `@testing-library/react`, `@testing-library/jest-dom`, `happy-dom`, `vitest` (frontend), and all `*.test.ts` / `*.test.tsx` files from the template.

---

## Template Lifecycle: Drift Detection over Manual Diff

**v2**: Manual comparison and copy between template and derived apps, no drift signal
**v3**: `bun run check:drift` with file classification (pure/branded/infrastructure), `bun run template:sync-plan` review packets, plus a manual cherry-pick workflow driven by the `/template-upgrade` slash command

| Consideration   | v2 Manual Diff                              | v3 Drift-Driven Manual Sync                             |
| --------------- | ------------------------------------------- | ------------------------------------------------------- |
| Scale           | Manageable at 2-3 apps                      | Workable at 10+ derived applications                    |
| File Handling   | Developer judgment per file                 | Template manifest classifies files (pure/branded/infra) |
| Pure Files      | Copy manually with no signal                | Drift checker flags divergence; copy manually           |
| Branded Files   | Copy and re-brand manually                  | Drift checker normalizes branding before comparison     |
| Infra Files     | Diff and merge manually                     | Drift checker baseline tracks domain customizations     |
| Drift Detection | None — divergence discovered during upgrade | `check:drift` detects template drift proactively        |

**Why**: With 10+ derived applications, manual template synchronization needs a signal — `check:drift` provides that signal by classifying every template-managed file and flagging divergence. `template:sync-plan` turns that signal into a read-only review packet with pure copy candidates, branded copy candidates, infrastructure diffs, and suppressed app-owned files. The actual sync remains a manual cherry-pick: an auto-apply script (`scripts/template-upgrade.ts`) was tried from 2026-03-16 to 2026-04-10 but silently clobbered domain-extended files in apps without `.templateoverrides` coverage and was removed. The slash command `/template-upgrade` walks operators through the per-file decisions (pure → copy, branded → copy + re-brand, infrastructure → three-way diff and hand-merge).

---

## CSRF Protection: HMAC Token over None

**v2**: No CSRF protection
**v3**: HMAC CSRF tokens with SHA-256 hashing, 4-hour TTL, origin validation

| Consideration    | No Protection                        | HMAC CSRF Tokens                                    |
| ---------------- | ------------------------------------ | --------------------------------------------------- |
| Attack Surface   | Cookie-based auth vulnerable to CSRF | Tokens required on state-changing requests          |
| Token Generation | N/A                                  | HMAC-SHA256 with server-side secret                 |
| Token Lifetime   | N/A                                  | 4-hour TTL                                          |
| Read Methods     | N/A                                  | Exempt (GET, HEAD, OPTIONS)                         |
| Unauth Requests  | No protection                        | Origin header validation on state-changing requests |

**Why**: JWT auth via HTTP-only cookies is secure against XSS (JavaScript can't read the cookie) but inherently vulnerable to CSRF — a malicious site can trigger a POST to your API and the browser automatically attaches the cookie. HMAC CSRF tokens with SHA-256 hashing provide defense-in-depth: every state-changing request must include a token that the malicious site cannot obtain. The 4-hour TTL balances security with UX (users aren't interrupted mid-session). Read methods (GET, HEAD, OPTIONS) are exempt since they don't modify state. Unauthenticated state-changing requests validate the Origin header as a fallback.

---

## API Client: 5xx Retry over Fail-Fast

**v2**: API requests fail immediately on server errors
**v3**: Frontend HTTP client retries transient 5xx errors with exponential backoff

| Consideration    | Fail-Fast                              | Retry with Backoff                                |
| ---------------- | -------------------------------------- | ------------------------------------------------- |
| Transient Errors | User sees error, must manually refresh | Automatic retry — transparent to user             |
| Deploy Windows   | Requests during restart fail           | Retries bridge brief unavailability               |
| Backoff Strategy | N/A                                    | Exponential backoff with configurable retry count |
| Permanent Errors | Immediate feedback                     | Immediate feedback (only 5xx retried, not 4xx)    |

**Why**: Transient server errors — during deployments, brief overload, or container restarts — shouldn't require users to manually refresh the page. The frontend HTTP client retries 5xx responses with exponential backoff, transparently bridging brief unavailability. Only server errors (5xx) are retried; client errors (4xx) fail immediately since retrying a bad request won't fix it. The retry count is configurable to prevent infinite loops against a genuinely down server.

---

## What Stayed the Same

Not everything changed. These choices proved correct in v2 and carry forward:

- **React 19** — Component model, hooks, concurrent features
- **TanStack Query** — Server state management and caching
- **React Router** — Client-side routing
- **Tailwind CSS v4** — Utility-first styling
- **Elysia** — Backend framework on Bun
- **Drizzle ORM** — TypeScript-native ORM with no codegen
- **shadcn/ui** — Owned UI components via Radix primitives
- **Sonner** — Toast notifications
- **Zustand** — Client state management with selector subscriptions
- **Native fetch** — API client (no Axios)
- **Pino** — Structured JSON logging
- **cmdk** — Command palette (`Cmd+K`)
- **SQLite** — Default database engine (now with PostgreSQL as alternative)
- **JWT + HTTP-only Cookies** — Authentication strategy (now with ES256 signing)
- **5-Tier RBAC** — Role hierarchy (SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER)
- **Soft Delete Pattern** — Recoverable deletion
- **Audit Trail** — Comprehensive action logging
- **JSON Configuration** — No `.env` files, `bunfig.toml` has `env = false`
- **Monorepo Workspace** — Frontend + Backend in one repository
- **Docker Monolithic Container** — nginx + supervisord + Bun
- **lucide-react** — Icon library
- **Plugin + Guard Architecture** — Elysia plugins for cross-cutting concerns, guards for authorization
