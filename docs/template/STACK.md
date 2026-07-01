# Technical Stack and Architecture Reference for Spernakit v3

This file is the canonical tech stack and architecture reference for the Spernakit repository.

> **Dependency policy:** package manifests use exact dependency versions for reproducible
> installs. Keep dependency changes deliberate, update the lockfile in the same change, and
> validate with `bun run check-deps` plus the full quality gate.

## Prerequisites

- **Bun 1.3.14+** - Required package manager ([Install Bun](https://bun.sh))
- **Node.js 24.x** - Optional, for npm compatibility

## Core Development Commands

### Initial Setup

```bash
# Install dependencies and initialize everything
bun run setup

# Quick setup for existing installations
bun install
bun run db:setup
bun run dev
```

### Development Workflow

```bash
# Start development servers (both frontend and backend)
bun run dev

# Start individual services
bun run dev:backend    # Backend only (Elysia + Drizzle)
bun run dev:frontend   # Frontend only (React + Vite)

# Quick start (parallel, no log aggregation)
bun run dev:quick

# Stop development servers (both frontend and backend, either running locally or in docker)
bun run stop
```

### Database Management

```bash
# Complete database setup (migrate schema + seed)
bun run db:setup

# Individual database operations (run from repo root; execute in backend workspace)
bun run --cwd backend db:seed          # Seed with default data
bun run --cwd backend db:studio        # Open Drizzle Studio
# Migration workflow (for production deployments)
bun run db:generate                    # Generate migration SQL from schema changes
bun run db:migrate                     # Apply pending migrations (transaction-wrapped)
bun run db:migrate:status              # Show migration status
bun run db:migrate:baseline            # Mark migrations as applied (for existing dbs)

# Note: SQLite databases auto-apply pending migrations on startup (autoMigrate.ts)
# and auto-seed when the users table is empty (autoSeed.ts).
# Manual db:migrate/db:seed is only needed for PostgreSQL or explicit control.
```

### Build and Production

```bash
# Build both frontend and backend
bun run build

# Build individually
bun run build:frontend
bun run build:backend

# Validate the preview/staging-like smoke target
bun run smoke:preview
```

### Code Quality

```bash
# Full quality check (check-only: drift + typecheck + lint + build + api-types + format check + deps)
bun run smoke:qc

# Repair lint/format drift, then validate
bun run qc:fix

# Validate config without starting server
bun run config:validate

# Format code with Prettier
bun run format
bun run format:check

# Lint code with ESLint
bun run lint
bun run lint:fix

# TypeScript type checking
bun run typecheck
```

**Quality Gate Pipeline** (`smoke:qc` — must pass before every commit):

1. `check:drift` - Template drift check
2. `check:config` - Config invariants check
3. `check:schema-drift` - Config schema artifact drift check
4. `config:validate` - Config schema validation (defaults + example + instance)
5. `check:db-location` - Database location guard
6. `check:secrets-shape` - Secrets file shape parity
7. `check:process-env` - Process environment access check
8. `check:max-lines` - Source file size gate
9. `check-application` - Application structure validation
10. `check:destructive-confirmation` - Destructive action confirmation check
11. `check-docs` - Documentation link check
12. `typecheck` - TypeScript compilation
13. `lint` - ESLint rules
14. `build` - Production build validation
15. `check:api-types` - API type contract validation
16. `check:feature-integration` - Route and page reachability
17. `check:schema-parity` - SQLite/PG schema structural parity
18. `format:check` - Prettier formatting check
19. `check-deps` - Dependency version check

**Quality Standards**:

- Fix ALL lint warnings when touching a file
- Do not skip or bypass any checks
- Do not relax linting rules without explicit justification
- Do not dismiss lint warnings

### Docker Deployment

```bash
# Build and start all services
bun run docker:build
bun run docker:up

# View logs and stop services
docker compose logs -f
bun run docker:down
```

### Testing and Analysis

```bash
# Crawl test (requires services running)
bun run crawltest              # Full crawl — all routes
bun run crawltest:preview      # Full crawl against preview build
bun scripts/crawltest.ts --page /settings/users    # Test single page
bun scripts/crawltest.ts --start-from /settings    # Test section
bun scripts/crawltest.ts --404                     # Verify 404 page

# Full validation chain (reset + dev + docker-local + docker-prod + screenshots)
bun run supertest

# Bundle/compression verification
bun run verify-compression
bun run verify-minification
```

## Architecture Overview

Spernakit v3 implements a modern **SDERN stack** (SQLite, Drizzle, Elysia, React, Node.js/Bun) with additional enterprise features.

```mermaid
graph TD
    A[Frontend: React 19 + Vite 8] -->|API Calls| B[Backend: Elysia on Bun]
    B -->|Database Access| C[Drizzle ORM]
    C -->|SQL Queries| D[SQLite Database]
    B -->|WebSocket| A
    A -->|Authentication| B
    B -->|Audit Logs| D
    B -->|Health Checks| D
    B -->|Notifications| D
```

### High-Level Structure

**Spernakit** is a full-stack enterprise application template built with a **monorepo workspace architecture**:

- **Shared**: Types, constants, and pure functions shared between backend and frontend (zero runtime deps)
- **Backend**: Bun runtime + Elysia HTTP framework + Drizzle ORM + SQLite
- **Frontend**: React 19 + TanStack Query + Zustand + Vite 8 + Tailwind CSS + shadcn/ui
- **Authentication**: JWT (ES256) with HTTP-only cookies + comprehensive RBAC system
- **Database**: SQLite (default) or PostgreSQL with Drizzle ORM; auto-migration and auto-seed on startup for SQLite, generated migrations for schema changes, idempotent transaction-wrapped `db:migrate` for production. Dialect configured via `config.database.dialect` (`sqlite` | `postgres`)
- **Deployment**: Docker monolithic container with nginx + supervisord

### Key Architectural Patterns

#### Authentication & Authorization

- **5-tier RBAC system**: SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER
- **Hierarchical permissions**: Higher roles inherit lower role permissions
- **Guard-based protection**: Both route and component-level security
- **JWT in HTTP-only cookies** with automatic token validation
- **Account security**: Failed login tracking, configurable account locking (via database settings), password reset flows, email verification on registration, password expiry and minimum age enforcement, optional forced password change via `requiresPasswordChange` flag, self-registration toggle
- **JWT token revocation**: Database-backed SHA-256 blacklist with scheduled cleanup for immediate token invalidation on logout (persists across restarts)

#### Data Management

- **Soft delete pattern**: Core entities support recoverable deletion (ephemeral/security tables like `token_blacklist`, `password_history`, `rate_limit_entries` use hard delete)
- **Audit trail**: Comprehensive logging of all user actions and system events
- **Drizzle ORM**: Type-safe database operations with schema push
- **Virtual scrolling**: High-performance rendering for large datasets (10,000+ items)

#### Frontend Architecture

- **Component-based**: Reusable UI components with consistent design system
- **State management**: TanStack Query for server state, Zustand for global state
- **Route protection**: `ProtectedRoute` component with role-based access control
- **React Compiler**: Automatic memoization via `babel-plugin-react-compiler` (no manual `React.memo` needed)
- **Performance optimized**: Code splitting, lazy loading, memory management

#### Backend Architecture

- **Service layer pattern**: Business logic separated from route handlers
- **Handler extraction**: Complex route handlers (>30 lines) extracted as named functions co-located in the route file
- **Service organization**: Hybrid flat + subdirectory — simple services are flat files, complex services get a subdirectory with a facade file (see DEVELOPMENT.md for details)
- **Plugin pipeline**: Client IP → Request ID → Logger → CORS → Security Headers → Auth → Password Change Guard → CSRF → Rate Limit → Auth Rate Limit → Workspace → Audit (note: `apiKey` is a per-route guard, not a plugin)
- **Session correlation**: `X-Request-ID` (session-scoped counter) + `X-Session-ID` (per-browser-session UUID) for full request traceability
- **Configuration**: JSON-driven config via `config/spernakit.json` (Bun is configured with `env = false`, so `.env` files are not auto-loaded)
- **Security-first**: CSP headers, rate limiting, input validation, SQL injection prevention

### Core Services & Utilities

#### Backend Services

- **authService**: JWT token management, bcrypt password hashing, session handling (facade + `services/auth/` subdirectory)
- **auditService**: Comprehensive audit trail logging for all user actions
- **metricsService**: Performance monitoring and analytics (facade + `services/metrics/` subdirectory)
- **notificationService**: Real-time user notifications (facade + `services/notification/` subdirectory)
- **workspaceService**: Workspace management and access control (facade + `services/workspace/` subdirectory)
- **databaseAdminService**: SQLite schema introspection, data operations, query execution, safe mode (facade + `services/database-admin/` subdirectory)
- **userService**: User management with password operations (facade + `services/user/` subdirectory)
- **dashboardService**: Custom dashboard CRUD operations (facade + `services/dashboard/` subdirectory)
- **healthService**: System health checks and monitoring (facade + `services/health/` subdirectory)
- **backupService**: Database backup, restore, encryption, integrity (facade + `services/backup/` subdirectory)
- **schedulerService**: Interval-based task scheduling and execution (facade + `services/scheduler/` subdirectory)
- **settingsService**: Generic key-value settings with encryption support
- **smtpService**: SMTP configuration management (database-driven, encrypted credentials)
- **emailService**: Email sending with template rendering
- **oauthService**: OAuth provider integration (GitHub, Google, Microsoft) (facade + `services/oauth/` subdirectory)
- **fileService**: File upload management with validation and storage
- **imageService**: Image processing and optimization
- **templateService**: Template rendering for emails and exports
- **onboardingService**: Post-install onboarding flow tracking
- **rateLimitService**: IP-based rate limiting with TTL eviction
- **apiKeyService**: API key lifecycle management
- **apiKeySignatureService**: HMAC-SHA256 request signing for API key authentication
- **demoService**: Demo account provisioning (development only)

#### Backend Utilities

- **logger** (`utils/logger.ts`): pino-based structured logging with pretty output in development and JSON in production

#### Frontend Hooks & Stores

**Hook organization**: All hooks live under `frontend/src/hooks/` (never colocated under `pages/*/hooks/`). Keep a hook flat at `hooks/{name}.ts` unless a single domain has **3 or more** related hooks — then group them under `hooks/{domain}/{name}.ts` (e.g., `hooks/dashboards/`, `hooks/notifications/`, `hooks/layout/`). Do not nest more than one level deep.

- **useAuth** (`hooks/useAuth.ts`): Authentication state, user info, login/logout methods
- **useAuthorization** (`hooks/useAuthorization.ts`): Hierarchical role-based permission checking (`hasMinRole()`, `hasRole()`, `can()`, `isSysop`, `isAdmin`)
- **useWebSocket** (`hooks/useWebSocket.ts`): Real-time WebSocket connection and event handling
- **useAppFeatures** (`hooks/useAppFeatures.ts`): App-wide feature flags (nav visibility, default layout, super-theme)
- **useFormatters** (`hooks/useFormatters.ts`): User-preference-aware date/time formatting via `Intl.DateTimeFormat`
- **useKeyboardShortcuts** (`hooks/useKeyboardShortcuts.ts`): Global keyboard shortcut registration with single-key, sequence, and modifier support
- **useContainerWidth** (`hooks/useContainerWidth.ts`): `ResizeObserver`-based container width measurement (replaces recharts `ResponsiveContainer`)
- **useDashboardLayout** (`hooks/dashboards/useDashboardLayout.ts`): Dashboard grid layout management
- **useDashboardWidgets** (`hooks/dashboards/useDashboardWidgets.ts`): Dashboard widget CRUD and state
- **useNotificationSocket** (`hooks/useNotificationSocket.ts`): WebSocket-driven notification handling
- **usePagination** (`hooks/usePagination.ts`): Pagination state management with optional URL parameter synchronization (`syncToUrl`)
- **useTheme** (`hooks/useTheme.ts`): Theme-color meta tag updates for mobile browser chrome and color-scheme CSS property management
- **useUnsavedChanges** (`hooks/useUnsavedChanges.ts`): Warns users before navigating away with unsaved changes (browser `beforeunload` + React Router blocker)
- **useUrlFilters** (`hooks/useUrlFilters.ts`): Combines URL-synced pagination with URL search parameter filters; auto-resets page on filter change
- **useWorkspace** (`hooks/useWorkspace.ts`): Current workspace context
- **useWorkspaces** (`hooks/useWorkspaces.ts`): Workspace list and management
- **useSyncUiSettings** (`hooks/useSyncUiSettings.ts`): Syncs UI preferences (theme, layout, density) with server
- **authStore** (`stores/authStore.ts`): Global authentication state management (Zustand)
- **layoutStore** (`stores/layoutStore.ts`): Layout mode (sidebar/topbar), container width, and UI density (compact/comfortable/relaxed) (Zustand)
- **themeStore** (`stores/themeStore.ts`): Theme mode (light/dark/system) and app color theme (Zustand)
- **sidebarStore** (`stores/sidebarStore.ts`): Sidebar collapsed/expanded state (Zustand)
- **workspaceStore** (`stores/workspaceStore.ts`): Active workspace selection (Zustand)
- **commandStore** (`stores/commandStore.ts`): Command palette state (Zustand)
- **wsStore** (`stores/wsStore.ts`): WebSocket connection state (Zustand)

#### Frontend API Client

- **apiClient** (`api/client.ts`): Base API client with automatic auth token handling, CSRF, 5xx retry with exponential backoff (GET by default, opt-in for mutations), and error interception

#### WebSocket Architecture

Spernakit uses **native WebSocket** throughout:

- **Backend**: Bun native WebSocket via Elysia
- **Frontend**: Browser's native `WebSocket` API via `stores/wsStore.ts`
- **Protocol**: Channel-based pub/sub with JSON messages

Key files:

- `backend/src/routes/ws/ws.ts` - Main WebSocket route and connection handling
- `backend/src/routes/ws/rate-limit.ts` - WebSocket connection rate limiting
- `backend/src/services/websocket/wsBroadcast.ts` - Broadcasting helpers
- `backend/src/services/websocket/wsHelpers.ts` - WebSocket utility functions
- `frontend/src/stores/wsStore.ts` - WebSocket client and state management
- `frontend/src/lib/websocket/` - WebSocketManager singleton, dispatcher, constants, types, utils
- `frontend/src/hooks/useWebSocket.ts` - React hook interface (re-exports from lib/websocket/)

#### WebSocket Authentication Lifecycle

- WebSocket connections authenticate via JWT on initial handshake
- JWT expiry is re-validated every 2 minutes via periodic ping
- If JWT expires between re-validation intervals, the connection persists until the next check
- This 2-minute window is an accepted trade-off for connection stability vs. strict token enforcement

### Database Schema Highlights

#### Core Models

- **User**: Authentication, roles, security fields (failed logins, locked accounts, password expiry)
- **AuditLog**: Complete audit trail with indexed queries for performance
- **Notification**: Real-time user notifications with read/unread states and per-user preferences
- **Setting**: Runtime configuration with encryption support (SMTP, auth policy, feature flags)
- **SystemMetric**: Performance monitoring and analytics data (CPU, memory, disk, heap, event loop)
- **Workspace**: Multi-tenant workspace isolation with member roles (workspaces + workspace_members)
- **Dashboard**: Custom user dashboards with configurable widgets (dashboard_configs + dashboard_widgets)
- **FileUpload**: File upload metadata with ownership tracking
- **OAuthAccount**: OAuth provider account linking (GitHub, Google, Microsoft)
- **ScheduledTaskExecution**: Interval-based scheduled task execution history with results
- **HealthCheck**: Health check results and alert history (health_check_logs + health_check_alerts)
- **BusinessEvent**: Business event tracking for analytics
- **ApiKey**: API key lifecycle management with nonce replay protection (api_keys + api_key_nonces)
- **RateLimitEntry**: IP-based rate limit tracking with TTL
- **TokenBlacklist**: SHA-256 hashes of revoked JWTs for persistent blacklisting
- **PasswordHistory**: Historical password hashes for reuse prevention

#### Security Features

- **Soft delete fields**: `isDeleted`, `deletedAt`, `deletedBy` on core models (not on ephemeral/security tables)
- **Audit fields**: `createdAt`, `updatedAt`, `createdBy` tracking
- **Indexed queries**: Optimized database performance with strategic indexes
- **Schema versioning**: Migration tracking with rollback support

#### Database Naming Conventions

- **Column names**: `snake_case` in database, `camelCase` in Drizzle schema
- **Table names**: Plural `snake_case` (e.g., `users`, `audit_logs`, `workspace_members`)
- **Indexes**: `idx_{table}_{columns}` format (e.g., `idx_users_email`)
- **Foreign keys**: `fk_{table}_{column}_{target}` format (e.g., `fk_audit_logs_user_id_users`) — declared via `foreignKey({...}).onDelete(...)` in constraints array, never inline `.references()`

### Development Patterns

#### Error Handling

- **Backend**: Standardized error responses with proper HTTP status codes
- **Frontend**: React Query error boundaries with retry strategies
- **Audit logging**: All errors logged with context for debugging

#### Form Handling

- **Validation**: Client-side (React) + Server-side (Elysia t.Object schemas) validation
- **State management**: Local component state with global state for complex forms
- **User feedback**: Toast notifications with success/error states

#### API Patterns

- **API versioning**: All API endpoints use `/api/v1` prefix for forward-compatible versioning
- **RESTful endpoints**: Consistent URL structure with proper HTTP methods
- **Request/Response format**: Standardized JSON responses with success flags
- **Rate limiting**: Environment-configurable limits with IP-based tracking
- **CORS configuration**: Environment-specific origin allowlists

#### Shared Type Contract

- **Single source of truth**: `shared/` workspace contains canonical type definitions consumed by both backend and frontend
- **Shared types**: `ErrorCode`, `UserRole`, `ROLE_HIERARCHY`, `ROLES`, `DataResponse<T>`, `PaginatedResponse<T>`, `SuccessResponse`, `ErrorResponse`, `BulkOperationResult`, `AppFeaturesDefaults`
- **Shared constants**: `AUTH_ERROR_CODES`, `ERROR_CODES`, `RATE_ERROR_CODES`, `RESOURCE_ERROR_CODES`, `SERVER_ERROR_CODES`, `VALIDATION_ERROR_CODES`, `APP_FEATURES_DEFAULTS`
- **Shared functions**: `hasMinimumRole()`, `validateUserRole()`
- **Zero runtime deps**: `shared/` contains only types, constants, and pure functions — Vite tree-shakes it
- **Re-export shims**: Backend and frontend maintain thin re-export files at their original import paths, so consuming code does not need import path changes
- **Package resolution**: Both workspaces depend on `spernakit-shared` via Bun workspace protocol (`workspace:*`)

#### Frontend-Backend Contract

- **Shared types via `shared/` workspace**: `ErrorCode`, `UserRole`, response envelopes, and role hierarchy are defined once in `shared/` and consumed by both workspaces
- **Domain-specific types**: Frontend-only types (e.g., `User`, `ApiKey`, `RoleLabels`) remain in `frontend/src/api/types/`
- **Backend-only helpers**: Response construction functions (`dataResponse()`, `createErrorResponse()`, etc.) remain in backend
- **Source of truth**: The OpenAPI spec at `/api/v1/docs/json` is the source of truth for the API contract (development mode only — Swagger/OpenAPI docs are not mounted in production)
- **Contract validation**: `bun run check:api-types` validates enum/union type consistency between OpenAPI spec (backend TypeBox schemas) and frontend type definitions — mandatory in `smoke:qc`

#### Module Export Standards

- **Named exports only**: All modules use named exports exclusively (no `export default`)
- **Barrel files**: Use `index.ts` barrels to re-export in subdirectories (e.g., `services/auth/index.ts`, `routes/auth/index.ts`). Exception: `components/ui/` uses direct file imports (`@/components/ui/button`) — no barrel file. Top-level `hooks/` and `services/` do not have barrel files; consumers import directly
- **Lazy loading**: For `React.lazy()`, adapt named exports with `.then()`:
    ```typescript
    const Component = lazy(() => import('./Component').then((m) => ({ default: m.Component })));
    ```
- **Rationale**: Enables better tree-shaking, consistent imports, explicit API surfaces

### Security Implementation

#### Route Protection

- **Frontend**: `ProtectedRoute` component with role requirements
- **Backend**: `requireRoleFresh()` guard with hierarchical permission checking (re-validates role from database)
- **API endpoints**: Every endpoint validates authentication and authorization

#### Data Security

- **Input validation**: All user inputs validated and sanitized (Elysia type schemas)
- **SQL injection prevention**: Drizzle ORM with parameterized queries, runtime table/column allowlist validation in database admin
- **XSS protection**: Content Security Policy (CSP) headers with strict `font-src 'self' data:` (Inter font self-hosted via `@fontsource-variable/inter`; `data:` permits inline data-URI fonts used by Recharts)
- **CSRF protection**: HTTP-only cookies with SameSite attributes + Origin header validation for unauthenticated endpoints. CSRF cookie name configurable via `config.security.csrfCookieName` (default: `{slug}_csrf`) and exposed to frontend via `__CSRF_COOKIE_NAME__` Vite define
- **Password security**: bcrypt hashing with configurable rounds
- **Backup encryption**: Optional AES-256-GCM encryption with HKDF key derivation and gzip compression for database backups

#### CSP style-src Policy

The Content Security Policy uses `style-src 'self' 'unsafe-inline'`. The `'unsafe-inline'` directive is required by Radix UI (used by shadcn/ui) for runtime style injection. This is a known trade-off:

- Radix UI injects inline styles for positioning, measurements, and animations
- Removing `'unsafe-inline'` breaks all Radix-based components (dialogs, popovers, dropdowns, tooltips)
- This will be revisited when Radix UI supports CSP-compatible style injection (nonce-based or adoptedStyleSheets)
- Tracked as a deferred audit finding (P4/informational)

### Default User Accounts

```javascript
// Default users for testing (passwords sourced from config.testing.crawlLoginPassword)
// Username: role
sysop: SYSOP; // System administration
admin: ADMIN; // Application administration
manager: MANAGER; // Team and user management
operator: OPERATOR; // Standard operations
viewer: VIEWER; // Read-only access
```

### Configuration System

All application configuration is JSON-based via `config/{app-slug}.json`. Environment variables are **not used** for general configuration — Bun is configured with `env = false` in `bunfig.toml`, so `.env` files are not auto-loaded.

**Approved exception — secret injection:** In production/Docker deployments, security secrets (JWT key pairs, cookie secret, encryption key, API key) may be injected via environment variables derived from the app slug (e.g., `SPERNAKIT_JWT_PRIVATE_KEY` for slug `spernakit`). This is handled by `configLoader.ts` via the `SECRET_CONFIG_KEYS` mapping, which is the only approved use of `process.env` in the application.

**Secrets file pattern (inline vs split):** Two patterns exist; pick by category:

- **Inline (default for spernakit and most derived apps)** — Security secrets live in `config/{slug}.json` directly. Use this for **app-internal cryptographic material**: JWT key pairs, `cookieSecret`, `encryptionKey`, `applicationApiKey`, `oauthStateSecret`. These are generated by the app itself (`bun run generate-keys`), owned by the app, rarely rotated, and consumed invisibly by every request. Adding a `*Ref` indirection layer for them is pure overhead.

- **Split (`config/{slug}.secrets.json`, optional sibling file)** — Reserved for **operator-provided third-party credentials**: external API keys (Anthropic, OpenAI, GitHub PATs), provider tokens, integration credentials. Used by derived apps that need operator-provided third-party credentials (for example, coordinator API keys and signal-provider tokens). Implemented in `backend/src/config/configSecretsFile.ts`:
    - The file is loaded into a sealed namespace separate from the main config
    - Config fields ending in `Ref` (e.g., `apiKeyRef: 'interpreter.anthropic'`) are dot-path pointers into that namespace, resolved at config load
    - `getSecret('dot.path')` is the typed accessor for direct lookups (e.g., `getSecret('github.token')`)
    - The resolved value never appears in the main config object — it is fetched at the use site, which keeps it out of admin UIs, audit logs, and broad `getConfig()` consumers
    - The secrets file is gitignored so the public `{slug}.json` can stay committed

    Choose split when secrets are: third-party (external lifecycle), operator-owned (different per deployment), optional (feature can be disabled by omitting the secret), or growing (new providers added without schema changes).

**Configuration file structure:**

```json
{
	"app": {
		"description": "Spernakit Application Template",
		"name": "Spernakit",
		"slug": "spernakit"
	},
	"database": {
		"allowDbPush": false,
		"url": "file:./data/spernakit.db"
	},
	"security": {
		"cookieSecret": "...",
		"encryptionKey": "...",
		"jwtPrivateKey": "-----BEGIN PRIVATE KEY-----\n...",
		"jwtPublicKey": "-----BEGIN PUBLIC KEY-----\n...",
		"jwtRefreshPrivateKey": "-----BEGIN PRIVATE KEY-----\n...",
		"jwtRefreshPublicKey": "-----BEGIN PUBLIC KEY-----\n..."
	},
	"server": {
		"backendPort": 3331,
		"backendUrl": "http://localhost:3331",
		"frontendPort": 3330,
		"frontendUrl": "http://localhost:3330"
	}
}
```

**Key configuration sections (config.json — static, loaded at startup):**

| Section        | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `app`          | Application identity (slug, name, description)                        |
| `server`       | Ports, URLs, host binding, timezone, trusted proxies                  |
| `database`     | Database URL, dialect (sqlite/postgres), migration, backup, SSL       |
| `security`     | JWT ES256 key pairs, encryption keys, bcrypt rounds, CSRF cookie name |
| `cors`         | CORS origin allowlists, allow-no-origin flag                          |
| `email`        | Email retry settings (retryAttempts, retryDelayMs)                    |
| `healthCheck`  | Health monitoring thresholds and intervals                            |
| `rateLimit`    | API rate limiting configuration                                       |
| `websocket`    | WebSocket connection parameters                                       |
| `alerting`     | Alert channels (email, webhook, in-app) and cooldown                  |
| `audit`        | Audit logging enable/disable and IP whitelist                         |
| `dashboards`   | Dashboard feature limits (maxPerUser, sharing)                        |
| `logging`      | Log file rotation, path, and level                                    |
| `metrics`      | System metrics collection interval                                    |
| `oauth`        | OAuth provider configuration (GitHub, Google, Microsoft)              |
| `retention`    | Data retention policies for audit logs, metrics, events               |
| `roles`        | Custom role labels and descriptions                                   |
| `storage`      | File storage adapter (local/S3), allowed MIME types, max file size    |
| `testing`      | Crawl test configuration (login credentials, timeouts, depths)        |
| `tokenCleanup` | JWT blacklist cleanup scheduling                                      |

**Runtime settings (database `settings` table — editable via UI without restart):**

| Setting Category     | Access   | Purpose                                                                  |
| -------------------- | -------- | ------------------------------------------------------------------------ |
| SMTP configuration   | SYSOP    | Email server credentials (host, port, user, password — encrypted)        |
| Auth security policy | SYSOP    | Account locking, password expiry, self-registration, password rules      |
| Feature flags        | ADMIN+   | Toggle analytics, dashboards, files, workspaces, onboarding, bug reports |
| Super-theme          | ADMIN+   | Application-wide UI paradigm (default, terminal, bbs)                    |
| User UI preferences  | Per-user | Theme, layout, timezone, date/time format, density                       |

**Important:** Run `bun run generate-keys` to generate unique EC P-256 key pairs and security secrets for each deployment. Default config includes placeholder values that must be replaced in production.

**Config Validation Tooling:**

```bash
# Validate config against Zod schema + security checks (without starting server)
bun run config:validate
bun run config:validate --json    # Machine-readable output for CI

# Generate JSON Schema for editor intellisense
bun run config:schema
```

Config files support a `$schema` property for VS Code intellisense:

```json
{
	"$schema": "./config-schema.json",
	"app": { ... }
}
```

The `config:validate` command runs the full config pipeline (load defaults, deep-merge with user config, apply env-var secret injection, Zod schema validation, security checks) and reports categorized errors/warnings with a summary. The `config:schema` command generates `config/config-schema.json` from the backend Zod schemas — regenerate it after modifying config schemas.

**defaults.json ↔ Zod schema consistency**: `backend/src/config/defaults.json` must contain every config section registered in `backend/src/config/configSchema.ts`. When a Zod schema is wrapped with `withEmptyDefault()` and the corresponding section is missing from `defaults.json`, the section relies entirely on Zod defaults at runtime — invisible to anyone reading the JSON file. Every section in `configSchema.ts` must have a matching entry in `defaults.json` with all default values explicitly stated, and there must be no sections in `defaults.json` that lack a corresponding Zod schema.

### Performance Considerations

- **Bundle optimization**: Vite with code splitting and tree shaking
- **Database indexes**: Strategic indexing on frequently queried fields
- **Memory management**: Built-in cleanup utilities and performance monitoring
- **Lazy loading**: Images and components loaded on demand with route preloading on hover/focus
- **Skeleton loaders**: Prevent layout shift during data loading
- **Compression**: Gzip and Brotli compression for all text-based responses
- **Image optimization**: WebP conversion, lazy loading, and responsive images

### Verification Strategy

- **Smoke tests**: Check-only quality gate (typecheck, lint, build, format check) via `bun run smoke:qc`
- **Crawl tests**: Automated page discovery, content assertions, and interaction testing
- **Supertest**: Full validation chain across dev, Docker local, Docker prod, and screenshots
- **Integration scripts**: Auth reset API/UI verification, compression/minification checks
- **No unit test frameworks**: Spernakit does not use vitest, jest, @testing-library, or similar -- crawltest verifies features end-to-end in the running application

### Docker Deployment

Spernakit uses a **monolithic container** approach:

- **nginx** serves the React frontend and proxies API/WebSocket requests
- **Bun/Elysia backend** runs on internal port 3331 (not exposed)
- **Only port 3330** needs to be exposed - nginx handles all routing
- **supervisord** manages both processes

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment guide.

### Template Version

**Spernakit v3** - See [CHANGELOG.md](CHANGELOG.md) for version history.
