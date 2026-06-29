# Spernakit v2 to v3 — Developer Reorientation Guide

This document maps v2 concepts, files, and patterns to their v3 equivalents. If you worked with Spernakit v2.0.0, use this as a lookup table to find where things moved and how patterns changed.

---

## Quick Reference Table

| What you did in v2                                               | What you do in v3                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Configure `jwtSecret` / `jwtRefreshSecret` in config             | Configure `jwtPrivateKey`/`jwtPublicKey` + `jwtRefreshPrivateKey`/`jwtRefreshPublicKey` (ES256 key pairs via `bun run generate-keys`) |
| Import from `frontend/src/api/types.ts` (manually synced)        | Import shared types from `spernakit-shared` workspace (`ErrorCode`, `UserRole`, `ROLE_HIERARCHY`, etc.)                               |
| Import UI from barrel `@/components/ui`                          | Import directly: `@/components/ui/button`, `@/components/ui/card`, etc.                                                               |
| Run unit tests with `bun test` / `bunx vitest`                   | Run `bun run smoke:qc` + `bun scripts/crawltest.ts` (unit test infrastructure removed)                                                |
| Manually sync frontend types with backend                        | Run `bun run check:api-types` to validate OpenAPI spec against frontend types                                                         |
| Manually apply template updates to derived apps                  | Run `bun run check:drift` to detect drift, then cherry-pick changes via the `/template-upgrade` slash command (manual workflow)       |
| Trust config JSON is valid                                       | Run `bun run config:validate` to validate config against Zod schema                                                                   |
| No CSRF tokens needed                                            | CSRF tokens required for state-changing requests (auto-handled by apiClient)                                                          |
| SQLite only (`bun:sqlite`)                                       | SQLite (default) or PostgreSQL via `database.dialect` config                                                                          |
| Schema in `backend/src/db/schema/` only                          | SQLite schema in `db/schema/`, PostgreSQL schema in `db/schema-pg/`                                                                   |
| `vitest`/`happy-dom`/`@testing-library/react` in devDependencies | Removed — use smoke:qc, crawltest, supertest pipeline                                                                                 |
| API fails immediately on 5xx                                     | API client retries transient 5xx with exponential backoff                                                                             |
| `react-hook-form` for forms                                      | React 19 native patterns (`useActionState`, controlled components) — react-hook-form removed                                          |
| `workspace: ['backend', 'frontend']`                             | `workspace: ['backend', 'frontend', 'shared']`                                                                                        |

---

## Backend Changes

### Security: JWT ES256

**v2** — HS256 symmetric:

```json
{
	"security": {
		"jwtRefreshSecret": "your-refresh-secret",
		"jwtSecret": "your-secret-key"
	}
}
```

**v3** — ES256 asymmetric:

```json
{
	"security": {
		"jwtPrivateKey": "-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----",
		"jwtPublicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
		"jwtRefreshPrivateKey": "-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----",
		"jwtRefreshPublicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
	}
}
```

Generate keys: `bun run generate-keys` (runs `scripts/generate-keys.ts`).

### Database: Dual Dialect

**v2** — SQLite only:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
```

**v3** — SQLite + PostgreSQL:

```
backend/src/db/
├── schema/        ← SQLite schema (default)
├── schema-pg/     ← PostgreSQL schema (parallel)
├── index.ts       ← Dialect-aware initialization
└── seed.ts
```

Config switch: `"database": { "dialect": "sqlite" }` or `"database": { "dialect": "postgres" }`

### Shared Workspace

**v2** — Types defined independently in each workspace:

```typescript
// frontend/src/api/types.ts - manually kept in sync
type UserRole = 'SYSOP' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER';
```

**v3** — Canonical types in shared workspace:

```typescript
// shared/src/roles.ts - single source of truth
import { UserRole, ROLE_HIERARCHY, hasMinimumRole } from 'spernakit-shared';
```

The `shared/` workspace exports: `ErrorCode` (39 codes), `UserRole`, `ROLE_HIERARCHY`, `hasMinimumRole`, `validateUserRole`, `DataResponse`, `PaginatedResponse`, `ErrorResponse`.

### CSRF Protection

**v2** — No CSRF:

```typescript
// POST requests worked without CSRF tokens
apiClient.post('/users', { body: data });
```

**v3** — CSRF enforced:

```typescript
// apiClient automatically captures CSRF token from X-CSRF-Token header
// and includes it on state-changing requests
// Token issued on GET /auth/me and login response
// Exempt endpoints: GET/HEAD/OPTIONS, login, register, forgot-password
```

### Config Validation

**v2** — Config loaded without formal validation:

```bash
# Just load and hope for the best
bun run dev
```

**v3** — Zod-validated config pipeline:

```bash
bun run config:validate    # Validate without starting server
bun run config:schema      # Generate JSON Schema for VS Code
```

---

## Frontend Changes

### Imports

**v2** — Barrel imports:

```typescript
import { Button, Card, Input, Label } from '@/components/ui';
```

**v3** — Direct imports:

```typescript
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
```

Migration: `bun scripts/codemod-barrel-imports.ts`

### Forms

**v2** — react-hook-form:

```typescript
import { useForm } from 'react-hook-form';
const {
	register,
	handleSubmit,
	formState: { errors },
} = useForm<FormData>();
```

**v3** — React 19 native patterns:

```typescript
// Controlled components with useState or useActionState
const [formData, setFormData] = useState<FormData>(initialValues);
```

### Testing

**v2** — Historical unit + integration test commands (do not use these in v3):

```bash
bun test              # v2 backend tests only
bunx vitest run       # v2 frontend tests only
```

**v3** — Smoke + crawl testing:

```bash
bun run smoke:qc      # typecheck → lint → build → format:check
bun scripts/crawltest.ts --page /dashboard
bun scripts/crawltest.ts --start-from /settings
bun run supertest     # Full release validation (reset + dev + docker-local + docker-prod + screenshots)
```

---

## Scripts

| v2 Script               | v3 Script                 | Notes                                |
| ----------------------- | ------------------------- | ------------------------------------ |
| `bun test`              | Removed                   | Use smoke:qc + crawltest             |
| `bun run test:coverage` | Removed                   | Coverage via crawltest page coverage |
| N/A                     | `bun run check:api-types` | OpenAPI vs frontend type validation  |
| N/A                     | `bun run config:validate` | Config pipeline validation           |
| N/A                     | `bun run config:schema`   | JSON Schema generation               |
| N/A                     | `bun run generate-keys`   | ES256 key pair generation            |
| Manual drift check      | `bun run check:drift`     | Template drift detection             |

---

## Package Dependencies Changed

**Removed**:

- `vitest`, `@vitest/coverage-v8` — Test infrastructure removed
- `happy-dom`, `jsdom` — DOM emulation for tests removed
- `@testing-library/react`, `@testing-library/jest-dom` — React test utilities removed
- `react-hook-form` — Replaced by React 19 native patterns

**Added**:

- `spernakit-shared` — Shared type workspace (internal)

---

## See Also

- [WHY_V3.md](WHY_V3.md) — Detailed rationale for each technology choice
- [STACK.md](STACK.md) — Canonical v3 tech stack reference
- [DEVELOPMENT.md](DEVELOPMENT.md) — v3 development patterns and best practices
