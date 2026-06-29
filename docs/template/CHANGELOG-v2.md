# Changelog

All notable changes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.9.9] - 2026-03-13

### Audit

- **13 audit passes completed** — SPERNAKIT, REACT_BEST_PRACTICES, FEATURE_INTEGRATION, HYGIENE, SECURITY, REORG, SSOC, COMPLICATION, DEAD_CODE, LOGIC, TECHDEBT, SCHEMA_CONSTRAINTS, COMPOSITION_PATTERNS
- **46 findings remediated** across 8 remediation commits — security, logic, performance, complexity, schema constraints, composition patterns, tech debt
- **Audit reports archived** — Consolidated into `.aidd/CHANGELOG.md` and deleted individual report files

### Added

- **Validation constants** — `backend/src/constants/validation.ts` with `DATE_RANGE_DEFAULT_DAYS`, `DATE_RANGE_MAX_DAYS`, `MAX_PROPERTIES_DEFAULT`, `FIELD_LENGTH_SHORT/MEDIUM/LONG` replacing magic numbers across route files
- **Health config constants** — `ALERT_THRESHOLDS` and `onConfigChangedListeners` array pattern in `backend/src/constants/health.ts`
- **AuthFormError component** — `frontend/src/components/auth/AuthFormError.tsx` for reusable form-level error display in auth pages
- **NotificationService facade** — `backend/src/services/notificationService.ts` barrel re-exporting from `notification/` subdirectory
- **Scheduler cleanup sub-modules** — `schedulerCleanupExecutor.ts` decomposed into `cleanupAuth.ts`, `cleanupData.ts`, `cleanupFiles.ts`, `cleanupHealth.ts`, `cleanupUtils.ts` with shared `createBatchCleanupTask()` and `createRetentionCleanupTask()` helpers
- **Duration formatters** — `formatDurationSeconds()` and `formatElapsed()` in `frontend/src/lib/formatters.ts`

### Changed

- **Auth pages use shared components** — Login, Register, ResetPassword pages import from `@/components/auth/` (AuthFormError, AuthPageLayout, AuthFooterLink, DemoAccountButtons, OAuthProviderButtons) instead of relative `./` paths
- **Auth components relocated** — Moved `AuthFooterLink`, `AuthPageLayout`, `AuthStatusMessage`, `DemoAccountButtons`, `OAuthProviderButtons` from `pages/auth/` to `components/auth/`
- **NotificationSettingsTab data-driven** — Uses `DELIVERY_TOGGLES` and `DEFAULT_PREF_TOGGLES` configuration arrays instead of inline repetitive toggle blocks
- **DataViewerTable EditableCell extraction** — Inline cell editing logic extracted as named `EditableCell` component within `DataViewerTable.tsx`
- **BusinessMetricsPage/UserActivitySection** — Upgraded from native HTML `<select>` to shadcn `Select` component
- **useSyncUiSettings** — Simplified from data-driven `syncMap` array to direct if/setter pattern
- **useDashboardWidgets** — `mapWidgetsToInput` now accepts `layoutMap` parameter
- **routes.tsx** — Uses `lazyNamed()` helper function reducing repeated `.then(m => ...)` boilerplate for React.lazy with named exports
- **CommandPalette** — Uses `CommandGroupSection` extracted component for DRY command group rendering
- **Role types enriched** — Added `RoleInfo` and `RoleAssignmentPermission` interfaces to `backend/src/types/roles.ts`
- **Rate limit plugin refactored** — Removed Redis support, simplified to in-memory only; route-level rate limits always enforced on security-critical endpoints regardless of global flag
- **QueryExecutionResult** — Discriminated union (`{ success: true, data }` | `{ success: false, error }`) for database admin query executor
- **Dashboard response cache** — Uses `lru-cache` package instead of plain `Map`
- **PG schema parity** — All 13 PostgreSQL schema files aligned with SQLite schemas (column types, indexes, foreign keys, cascade behavior)
- **Drizzle migrations consolidated** — 9 incremental migrations squashed into single migration file
- **WebSocket helpers** — Uses `WS_MESSAGE_TYPES` constant object for message type matching instead of inline string literals
- **Handler extraction** — `guardMutationRequest()` and `resolveFileWithAccess()` helpers extracted for route handler DRY
- **nginx.conf security headers** — Defense-in-depth headers on all location blocks, HSTS with preload directive

### Feature Specs

- **27 feature specs updated** — Version bumps and new spec points from cross-app diff-sync (a derived app, companion-app, acme-monitor, taskboard, sketch-game, family-hub)
- **2 feature specs removed** — `example-test-patterns` and `test-coverage-expansion` (no longer applicable after test suite removal)

## [2.9.8] - 2026-03-12

### Fixed

- **CI Docker tag case sensitivity** — Lowercase `GITHUB_REPOSITORY` via bash expansion (`${GITHUB_REPOSITORY,,}`) in both `ci.yml` and `docker.yml` to prevent Docker tag errors from mixed-case GitHub usernames
- **CI Docker GHCR authentication** — Added GHCR login step and `packages: write` permission to CI docker job for cache access
- **CI/CD workflow consistency** — Aligned both workflows to use `env.REGISTRY` env var instead of hardcoded registry strings

## [2.9.7] - 2026-03-12

### Fixed

- **CSP inline script hash updated** — SHA-256 hash in `securityHeaders.ts` and `docker/nginx.conf` synced with simplified theme-init script in `frontend/index.html`, fixing CSP violations in Docker deployments
- **CSP hash drift check** — `check-application.ts` now computes the inline script hash and verifies it matches both `securityHeaders.ts` and `nginx.conf`, catching drift before it reaches production
- **WebSocket loopback exemption** — Localhost connections (`127.0.0.1`, `::1`) exempt from per-IP WebSocket connection limits to prevent false rejections caused by Vite HMR proxy counter drift
- **Theme-init script simplified** — Removed hardcoded theme allowlist from inline script; any non-default theme name is now applied dynamically

### Changed

- **Test scaffolding removed** — Deleted backend test infrastructure (`backend/src/test/`), frontend test infrastructure (`frontend/vitest.config.ts`, `frontend/src/test/`), and associated test suites; removed `vitest`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom` dev dependencies
- **WorkspaceMemberRole type exported** — Added missing re-export from `frontend/src/api/types.ts`

## [2.9.6] - 2026-03-11

### Security

- **Auth rate limiter decoupled from global flag** — Authentication rate limiting (login, password reset) now operates independently of `rateLimit.enabled`, ensuring brute-force protection even when global rate limiting is disabled
- **Login account-level rate limit fix** — Fixed field name mismatch that prevented account-level login rate limiting from activating
- **API key routes use fresh DB role** — API key route handlers now query the database for current user role instead of relying on stale JWT claims
- **Password expiry enforced for null passwordChangedAt** — Password expiry checks no longer bypass users who have never changed their password
- **Upload directory permissions tightened** — Upload directories set to 0o750 and files to 0o640
- **WebSocket token tracking** — WebSocket connections now store `tokenIssuedAt` instead of raw cookie header for revocation checks
- **SQL sandbox PRAGMA query_only** — Database admin query executor enforces `PRAGMA query_only` to prevent write operations via SQL sandbox
- **Cookie secure simplification** — `isSecureCookie()` now uses config value directly (validator blocks insecure in production)
- **Nginx CSP alignment** — Nginx Content-Security-Policy aligned with backend strict CSP via shared `$csp_policy` map variable
- **OAuth unique constraint** — Added unique index on `(userId, provider)` in `oauth_accounts` to prevent duplicate provider links
- **CORS allowNoOrigin warning** — Startup warning when `cors.allowNoOrigin=true` in non-development environments
- **Config validator regex hoisting** — Duplicate regex patterns in `configValidator-secrets` hoisted to module scope

### Added

- **Backend test infrastructure** — bun:test setup with in-memory SQLite, migration runner, and test user seeding (`backend/src/test/`)
- **Backend starter tests** — `tokenBlacklist` (6 tests) and `authSecurityService` (10 tests)
- **Frontend test infrastructure** — Vitest + happy-dom + @testing-library/react + jest-dom (`frontend/vitest.config.ts`)
- **Frontend starter tests** — `correlationId` utility tests (7 tests)
- **Soft-delete storage purge task** — `softDeletedFilesCleanupTask` purges storage data after retention period (30 days default)
- **Retention config** — Added `retention.softDeletedFilesDays` config option
- **Lazy-loaded chart widgets** — `LineChartWidget` and `BarChartWidget` lazy-loaded with `React.lazy()` and `Suspense`
- **Dashboard query key factory** — Added `dashboardKeys` to `frontend/src/api/dashboards.ts`
- **Mutation error handlers** — Added `onError` toast handlers to `PasswordForm`, `CreateApiKeyDialog`, `RevokeApiKeyDialog`, `BroadcastDialog`
- **getUserAccountStatus() service** — Extracted reusable service for OAuth and WebSocket route handlers

### Audit

- **5 audit passes completed** — SECURITY (19 issues), REACT_BEST_PRACTICES (12 issues), SPERNAKIT (4 issues), SCHEMA_CONSTRAINTS (4 issues), COMPOSITION_PATTERNS (0 issues)
- **9 security findings remediated** — Rate limiting, stale JWT, permissions, SQL sandbox, cookie secure, storage purge, CSP, OAuth constraint, CSRF warning
- **20 resolved audit findings cleaned up** — Deleted resolved feature.json files

## [2.9.5] - 2026-03-11

### Removed

- **Unit and integration test suites** — Extracted all backend (bun:test) and frontend (Vitest + React Testing Library) test suites to a separate archive; removed 57 test files, test infrastructure (`test-db.ts`, `test-helpers.ts`, `setup.ts`, `vitest.config.ts`, `test-utils.tsx`), and test dependencies (`@testing-library/*`, `@vitest/*`, `jsdom`)
- **CI test job** — Removed the `test` job from GitHub Actions CI; Docker build now depends only on `build`
- **Test scripts** — Removed `test`, `test:backend`, `test:frontend`, `test:coverage` scripts from all `package.json` files and `smoke.json`

### Added

- **Route parameter validation helpers** — `requireRouteId()` and `optionalRouteId()` in `backend/src/utils/validation.ts` for type-safe route parameter parsing
- **`formatRelativeTime` formatter** — Human-readable relative time strings (e.g. "2 hours ago") in `frontend/src/lib/formatters.ts`
- **`WorkspaceMemberRole` type export** — Exported from `frontend/src/api/types/workspaces.ts` for downstream consumers
- **Migration history** — Added `data/migration-history.json` documenting all schema migrations applied to date

### Changed

- **TESTING.md rewritten** — Replaced unit/integration test documentation with verification-focused guide covering smoke tests, crawl tests, and supertest pipeline
- **knip config** — Removed stale `test-helpers.ts` ignore entry

## [2.9.4] - 2026-03-11

### Added

- **Auto-seed on startup** — Fresh installs automatically seed the database with default users and workspace when the users table is empty, eliminating the need for manual `db:seed`

### Fixed

- **Integrity check DB path resolution** — Database integrity check scheduled task now resolves the DB path from the project root instead of relative to the service file, preventing "file not found" errors
- **PRAGMA column name mismatch** — `quick_check` PRAGMA returns a column named `quick_check` (not `integrity_check`); fixed to use `Object.values()` for dynamic column access
- **Backup status FK constraint** — Backup status persistence used `updatedBy: 0` which violated the FK constraint to users table; changed to `null`
- **Auto-migrate idempotency** — Migrations now survive `db:push` + `autoMigrate` coexistence: added `DROP TABLE/INDEX IF EXISTS` rewriting and error-based skipping for `ALTER TABLE` conflicts (duplicate column, missing column)
- **CSP script-src hash drift** — Updated inline theme-init script SHA-256 hash in both `securityHeaders.ts` and `nginx.conf` to match current Vite build output

### Changed

- **Supertest pipeline order** — Reordered to `reset → dev → docker-local → docker-prod → screenshots` for better progression
- **Dependency updates** — eslint 10.0.3, puppeteer 24.39.0, typescript-eslint 8.57.0, @types/node 25.4.0

## [2.9.3] - 2026-03-11

### Security

- **Comprehensive security audit (batches 7–26)** — 20 audit batches covering 130+ security findings across authentication, authorization, CSRF, OAuth, API keys, encryption, file handling, rate limiting, and input validation
- **CSRF hardening** — Fixed CSRF body leak, token TTL bypass, retry on stale token, scope exemptions for read methods, and multi-session single-slot vulnerability
- **OAuth security** — Fixed deleted-user bypass, email collision takeover, auto-link without verification, missing rate limiting on callback, and session binding (PKCE)
- **API key security** — Fixed createdBy attribution, password change guard, deleted-user bypass, and nonce length validation
- **Login/auth hardening** — Fixed login lockout DoS accumulation, counter race condition (atomic), password reset age bypass, non-atomic password change, session revocation gaps
- **Input validation** — Added maxItems to bulk arrays, metadata schema bounds, CSV formula injection defense, SMTP CRLF injection prevention
- **Prototype pollution** — Fixed deepMerge prototype pollution vulnerability
- **Mass assignment** — Prevented profile update mass assignment
- **Timing-safe comparison** — Fixed timingSafeEqual crash on mismatched buffer lengths
- **File security** — Added symlink detection, upload directory permissions, file ownership enforcement on list
- **Config defaults** — Added missing allowed-origins, security fields, and per-user WS limit to shipped config
- **Error message safety** — Sanitized error messages to prevent information disclosure; synced frontend ErrorCode enum
- **GitHub Actions** — Pinned actions to digest hashes
- **Rate limiting** — Added eviction for in-memory store, account-level rate limiting for login/password-reset, disabled by default in dev config
- **PostgreSQL SSL** — Added SSL enforcement configuration for PostgreSQL connections

### Added

- **Auto-migration on startup** — SQLite databases now automatically apply pending Drizzle migrations when the app starts, handling both fresh installs and upgrades without manual `db:push` or `db:migrate`
- **CSRF token on `/auth/me`** — The GET `/auth/me` endpoint now returns an `X-CSRF-Token` header, allowing the frontend to restore CSRF protection after page reloads without triggering refresh token rotation

### Fixed

- **CSRF token lost after page reload** — Write operations (settings, health config, bug reports) returned 403 after page reload because the in-memory CSRF token was not restored; fixed by issuing CSRF token on `/auth/me` and capturing it in the API client's response interceptor
- **Rate limiting blocking health endpoint in dev** — Rapid health check polling during startup hit the rate limiter; rate limiting now defaults to disabled in development

### Improved

- **Dead code removal** — Removed unused WebSocket barrel re-exports, stale knip ignores, orphaned JSDoc, unused error codes, frontend API type exports, and zustand store exports (batches 8, 12, 15)
- **Type safety** — Eliminated unsafe double type casts, tightened role guard return types, fixed layout migration guard inversion (batches 12, 13, 25)
- **Schema constraints** — Removed redundant unique constraint on dashboard share token, added missing FK to users, added storage path uniqueness for file uploads (batch 16)
- **Code quality** — Extracted workspace helpers, consolidated auth props, batched onboarding queries, optimized SMTP status check, deduplicated notification handlers (batches 12, 13, 16, 25)
- **Rate limit consolidation** — Unified rate limit implementation with shared in-memory store, eviction, and cleanup (batch 24)
- **Frontend ErrorCode sync** — Aligned frontend error code enum with backend error codes for consistent error handling (batch 23)
- **Audit finding management** — Completed 249-finding review cycle across 15 audit categories; 136 feature.json files cleaned up after remediation

## [2.9.2] - 2026-03-10

### Security

- **Password history enforcement** — New `password_history` table (SQLite + PostgreSQL) tracks recent password hashes; `changeUserPassword` and `resetPassword` check history before allowing reuse. Configurable depth via `passwordHistoryDepth` in auth security settings (default: 5)
- **Sensitive value pattern matching** — `SENSITIVE_VALUE_PATTERNS` array (bcrypt hashes, PEM keys, JWT tokens) with `isSensitiveValue()` function redacts values regardless of column name
- **DBA mutation redaction** — `redactRow()` now wraps returned data from insert/update/delete operations in database admin to prevent sensitive data leakage in audit logs
- **Expanded baseline CSP** — Non-strict Content-Security-Policy now includes `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`, and `form-action 'self'` for meaningful protection even when strict mode is disabled
- **DNS-rebinding TOCTOU protection** — `urlValidator` returns `WebhookValidationResult` with resolved IP, rewrites webhook URL to resolved address, and preserves original `Host` header to prevent DNS rebinding between validation and fetch
- **Explicit localhost port allowlist** — `DEV_LOCALHOST_PORTS` restricts development-mode origin validation to specific known ports instead of accepting any localhost port
- **Null-byte path injection defense** — `backupDatabaseTo` validates target path contains no null bytes; uses parameterized `VACUUM INTO ?` instead of string interpolation
- **Nginx hardening** — WebSocket location gains `limit_req` rate limiting; `/assets/` and `/` locations gain `Strict-Transport-Security` and `Content-Security-Policy` headers
- **Cookie secure default** — `cookieSecure` config schema default restored to `true` (production-safe)

### Added

- **Password history schema** — `passwordHistory.ts` for both SQLite and PostgreSQL with `isPasswordInHistory()` and `recordPasswordHistory()` functions in `authCore.ts`
- **`generateSecurityToken()` helper** — Extracted shared token/hash/expiry generation used by password reset and email verification
- **`routeDetail()` helper** — Builds complete OpenAPI detail objects for standard routes (summary + success example + 401)
- **`validateUploadedFile()` + `trackUploadEvent()`** — Extracted file upload validation and event tracking from inline handler code
- **`FileRow` interface + `mapFileToRecord()`** — Centralized DB-to-API mapping for file records (replaces 3 inline mappings)
- **`assertWorkspace()` guard helper** — Validates non-null workspace ID with 400 response, reducing boilerplate in route handlers
- **`loginAs()` + `getDbUser()` test helpers** — Streamlined test setup for authenticated requests and user lookup
- **`resolveMetricValue()` widget helper** — Centralizes metric-to-value mapping for StatCardWidget and GaugeWidget (eliminates duplicated switch-case blocks)
- **`RoleInfo` + `RoleAssignmentPermission` interfaces** — Typed role metadata and assignment permission structures in `roles.ts`
- **`generateSecureSecret()` utility** — Cryptographically secure hex-encoded random bytes for secret generation
- **`requireRouteId()` + `optionalRouteId()` validators** — Numeric route parameter parsing with validation in `validation.ts`
- **`WIDGET_TYPES` + `METRIC_TYPES` arrays** — Typed constant arrays in PostgreSQL dashboard schema for runtime validation

### Improved

- **LRU caching** — `userCrud.ts` and `settingsService.ts` gain 500-entry/5-minute TTL LRU caches with cache invalidation on mutations
- **Batch notification preferences** — `notificationPreferenceService` uses single `getByKeys()` call with `parseBool()` helper instead of 5 individual `getByKey()` lookups
- **`markAllAsRead` optimization** — Uses `.returning({ id }).all()` single-step pattern instead of count-then-update two-step approach
- **`valueExists()` naming** — Renamed from `fieldExists()` with extracted `canActOnUser()` helper in `userValidationService.ts`
- **`BugReportButton` self-contained** — Calls API directly instead of receiving handler prop from layout components
- **`debouncedStorage` refactor** — Extracted top-level functions (`flushKey`, `debouncedGetItem`, `debouncedRemoveItem`, `debouncedSetItem`) with `DebouncedStorageState` interface
- **`bulkMemberMutationCallbacks` extraction** — DRY helper in `useWorkspaces.ts` replaces duplicated `onError`/`onSuccess` callbacks
- **`useUserColumns` memoization** — Columns array wrapped in `useMemo` for stable reference
- **Removed redundant index JSDoc** — `idx_users_email` and `idx_users_username` comments removed from `users.ts` (these are unique constraints, not separate indexes)
- **Formatter additions** — Added `formatRelativeTime`, `formatElapsed`, `formatDurationSeconds`, `formatDateTime` to `formatters.ts`
- **Tailwind utilities** — Added `safe-area-inset`, `pb-safe`, `touch-manipulation` utility classes
- **`StatCard` enhancements** — Added `subtitle` and `variant` props for richer dashboard stat display
- **Feature specs updated** — 20+ `.aidd/features/` specs refreshed to reflect current implementation

## [2.9.1] - 2026-03-08

### Security

- **Cache-Control header** — API responses now include `Cache-Control: no-store` to prevent browser/proxy caching of sensitive data
- **HSTS preload** — Added `preload` directive to Strict-Transport-Security header for HSTS preload list eligibility
- **Dashboard share token uniqueness** — Added unique constraint on `shareToken` column in dashboard configs schema
- **Cryptographic bug IDs** — Bug report IDs now use `crypto.randomUUID()` instead of `Math.random()` for unpredictable identifiers

### Improved

- **WebSocket rate limiting extraction** — Extracted per-IP and per-user connection limiting into dedicated `ws-rate-limit.ts` module for clarity and testability
- **Dashboard widget schema extraction** — Consolidated duplicated TypeBox widget schema from `dashboards-crud.ts` and `dashboards-templates-import.ts` into shared `dashboards-schemas.ts`
- **Chart constants relocation** — Moved `chartConstants.ts` from `components/dashboard/widgets/` to `lib/` for proper shared access by MetricChart, HealthTimeline, and dashboard widgets
- **ContentListSkeleton component** — New reusable skeleton component replacing 8 inline skeleton patterns across analytics, profile, settings, and database pages
- **PostgreSQL schema cleanup** — Removed duplicate `WIDGET_TYPES` and `METRIC_TYPES` arrays from PG schema (single source of truth in SQLite schema)
- **Dead code removal** — Removed unused `getDatabaseFilePath()` export and redundant `redactAuthPii()` logger helper
- **OAuth provider types** — Simplified provider type definitions and callback error handling
- **Service simplification** — Streamlined notification CRUD, user validation, and workspace CRUD services
- **Audit report cleanup** — Removed 9 superseded audit report files from `.aidd/audit-reports/`

## [2.9.0] - 2026-03-06

### Security

- **Comprehensive security audit** — 15-category deep audit (security, architecture, API design, code quality, deployment, logic, tech debt, hygiene, feature integration, React best practices, composition patterns, SSOC, reorg, dead code, database) with 200+ findings triaged and remediated
- **JWT token revocation** — Access tokens now blacklisted on logout; refresh token hash and CSRF token columns gain unique constraints to prevent replay attacks
- **CSRF enforcement in crawltest** — Crawler captures CSRF token from login response and includes it in dashboard create/delete requests
- **Rate limiting hardening** — Fixed TOCTOU race condition, bounded memory growth, corrected auth scope checks; timestamps aligned to `mode:'timestamp'` with Date objects
- **SQL injection defense-in-depth** — DB admin SQL sandbox gains additional parameterized query enforcement and input validation
- **Cookie security** — Deduplicated cookie settings, `cookieSecure` config wired through Zod schema, `isSecureCookie()` respects `X-Forwarded-Proto` behind reverse proxies
- **OAuth hardening** — URL encoding fixes, callback error handling, lockout check, password change redirect, state validation, provider filter on account lookup, PKCE store cap
- **WebSocket security** — Token revocation check on connection, deduped auth, periodic re-validation, origin validation for LAN access
- **Password security** — Min-password-age check moved from login to password change; login timing leak eliminated
- **Security headers** — Consolidated CSP (including `img-src`, `worker-src`, `ws:` for dev), removed premature HSTS preload
- **Workspace role hierarchy** — Enforced numeric role comparison in member operations to prevent privilege escalation
- **Error message sanitization** — Audit redaction for sensitive fields; error responses no longer leak internal details
- **HTML injection prevention** — Input sanitization added to user-facing text rendering paths
- **Soft-delete guards** — Validation and batch caps on cleanup operations to prevent accidental mass deletion

### Added

- **GitHub Actions CI/CD** — New `ci.yml` (typecheck, lint, build, format) and `docker.yml` (multi-stage Docker build) workflows
- **Health check scheduled execution** — `health-check-execution` task runs all health checks every 5 minutes with storage and alerting
- **Compile-time schema parity** — Build-time check verifies PostgreSQL schema stays in sync with SQLite schema
- **WebSocket-driven query invalidation** — Replaces 60s polling with real-time push notifications for data freshness
- **Config hygiene feature** — Final template feature (282/282) ensuring config validation and consistency
- **Migration history persistence** — `data/migration-history.json` tracks all applied migrations
- **Configurable file upload size** — Upload size limit now configurable via `server.maxBodySize`
- **Nested secret env var overrides** — OAuth, S3, alerting, and database secrets can be overridden via environment variables
- **Port verification** — `start.ts` validates port availability before launching servers
- **Migration safety checks** — Idempotent DDL, disk space health check before migrations
- **TLS termination docs** — Reverse proxy examples for nginx, Caddy, and Traefik
- **Route integration tests** — New test suites for files, database-admin, users-crud, and workspaces-crud endpoints
- **Plugin test coverage** — Tests for auth, CSRF, and rate limit plugins; API key guard tests for simple and HMAC auth
- **Bugs admin page** — Frontend page for viewing submitted bug reports (wired to existing API)

### Improved

- **Docker production hardening** — Use base image `bun` user (no custom user creation), Alpine package version bumps (nginx 1.28, gettext 0.24), tmpfs UID/GID alignment, NODE_ENV passthrough, read-only rootfs with nginx config written to `/tmp`, tolerant `chmod` for non-root containers
- **Docker compose** — Security options (`no-new-privileges`, drop all capabilities), `stop_grace_period`, resource limits, tmpfs mounts with UID/GID
- **Container startup** — Signal trapping, port defaults, nginx validation against `/tmp/nginx.conf`, retry-on-failure migrations, pre-migration backup
- **Supervisord** — Restart backoff to prevent crash loops, nginx reads config from `/tmp`
- **Health alerting** — Deduplication within 15-minute windows, delivery guarantee (awaited with try/catch), cooldown self-suppression fix, per-channel retry tracking
- **Config loader** — JSON error handling without `process.exit`, deep clone to prevent mutation, improved error messages
- **Scheduler hardening** — Drift compensation, orphaned record cleanup, N+1 query elimination, concurrency guard, validation
- **Backup operations** — Atomic `VACUUM INTO` for backups, close DB before restore overwrite, concurrency protection, retention enforcement, async I/O
- **Nginx** — Error pages, request ID propagation (`X-Request-ID`), removed double compression, keepalive/retry/timeouts for proxy, rate limiting config verification
- **PostgreSQL parity** — Synchronized 3 missing tables and 20+ missing fields in PG schema; health alerts parity; frontend backup types alignment
- **Frontend chunking** — TanStack libraries merged into `react-vendor` chunk to prevent circular chunk issues
- **Frontend build** — Test files excluded from `tsconfig.build.json`; `data/*.json` added to `.prettierignore`
- **Smoke tests** — `NODE_ENV=development` default for Docker smoke tests; 429 responses ignored in crawltest
- **Crawltest** — CSRF token capture from login for dashboard operations; improved error resilience

### Refactored

- **Route handler extraction** — Oversized route files decomposed into handler modules (`>30 lines` rule enforced across all route files)
- **Service decomposition** — `authCore`, `configLoader`, and other oversized services split into focused domain-specific modules
- **Component decomposition** — `DataViewerPanel` split into `CellValue`, `CreateRowDialog`, and focused sub-components; settings tabs reorganized into feature subdirectories
- **Complexity reduction** — Cyclomatic complexity reduced in 4 backend functions; data-driven `FeatureToggles`; deduplicated toggle handlers, shortcut handlers, shared table exports, file validators
- **CSRF origin validation** — Extracted from inline to dedicated module; WebSocket event handlers extracted
- **Files API** — Normalized to use `buildQueryParams` pattern consistent with other APIs
- **Crawltest modularization** — `crawltest.ts` decomposed into `crawltest-pages.ts`, `crawltest-types.ts`, and focused modules
- **Dashboard hooks** — Router decoupled from `useDashboards` hook; `NotificationSettingsTab` optimistic state hooks consolidated

### Changed

- **Audit completion** — All 15 audit categories completed with 84/84 actionable findings resolved; 282/282 template features verified complete
- **Dependency update** — `@types/node` bumped to 25.3.5

## [2.8.4] - 2026-03-02

### Fixed

- **Schema: unique constraints** — Added missing unique constraints on `api_key_nonces.nonce` (replay attack prevention), `user_notification_preferences.user_id` (one-to-one enforcement), and `rate_limit_entries.key` (rate limiting accuracy)
- **Schema: dashboard widget audit fields** — Added `createdBy` and `updatedBy` columns to `dashboard_widgets` table, matching the parent `dashboard_configs` pattern; `createDashboard()` and `updateDashboard()` now pass userId through to widget inserts
- **Metrics collection cron** — Fixed cron expression for `metrics-collection` scheduled task (was dividing ms by 60000 to produce invalid minute-based expression)

### Improved

- **Crawltest: browser recycling** — Browser instance is recycled every 25 routes to prevent CDP degradation (execution context accumulation, stale DOM refs, protocol timeouts) on long crawls
- **Crawltest: session expiry handling** — Automatic detection and re-login when session expires mid-crawl, with credential caching for seamless recovery
- **Crawltest: sub-tab screenshots** — New detection for in-page view switchers (variant toggle buttons, nav tabs, badge tabs) with automatic screenshot capture of each tab state
- **Crawltest: 404 page detection** — Content assertions now detect and flag 404 pages as failures (separate from error boundary detection)
- **Crawltest: screenshot reliability** — Switched from `fullPage` to viewport-only screenshots (`captureBeyondViewport: false`), added retry-on-timeout with page reload, increased protocol timeout to 120s

### Changed

- **Prettier formatting** — Removed `.aidd/features/`, `.aidd/iterations/`, and `.aidd/status.md` from `.prettierignore` (now formatted consistently)
- **Gitignore** — Added `.aidd/_common/`, `.aidd/audit-prompt.md`, `.aidd/filtered-prompt.md` (AIDD-generated files)
- **Database schema docs** — Updated ERD and FK reference table in `database-schema.md` to reflect all audit/creator FK columns across tables

## [2.8.3] - 2026-02-28

### Fixed

- **`crypto.randomUUID` on LAN HTTP** — `correlationId.ts` now falls back to `crypto.getRandomValues()` when `crypto.randomUUID` is unavailable (non-secure contexts like plain HTTP on LAN IPs)
- **WebSocket Origin Rejection on LAN** — Origin validation now allows any origin whose port matches the configured frontend port when `trustProxy` is enabled, resolving WebSocket upgrade failures for LAN IP access through Docker/nginx
- **Login Redirect Loop over HTTP** — `isSecureCookie()` no longer hardcodes `Secure` flag in production; respects `cookieSecure` config setting and checks `X-Forwarded-Proto` header behind reverse proxies, preventing browsers from silently dropping cookies on plain HTTP
- **Layout Flash on First Load** — `useAppFeatures()` now returns `{ features, isLoaded }` and `AppShell` defers rendering until layout mode is known, preventing a visible sidebar → topbar flash when the admin default differs from the zustand-persisted default

### Security

- **Cookie Secure Flag Control** — Added `cookieSecure` to security config schema (was in `defaults.json` but silently stripped by Zod validation), giving operators explicit control over the cookie Secure flag

### Changed

- **Docker Config Generation** — `start.sh` now sets `trustProxy: true` and `nodeEnv: 'production'` in generated Docker configs, ensuring origin validation and cookie security work correctly behind nginx

## [2.8.2] - 2026-02-28

### Fixed

- **Docker App Metadata** — Frontend builder stage now copies `defaults.json` so Vite injects correct app name and version instead of fallback "Application" / "v0.0.0"
- **Docker Migration Crash Loop** — Migration script now makes DDL statements idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`) and skips `ALTER TABLE ADD COLUMN` for columns that already exist, preventing infinite restart loops after partial migration failures
- **Docker Entrypoint Resilience** — `start.sh` retries migrations up to 3 times before continuing, replacing the previous fail-fast behavior that killed the container on transient errors

### Security

- **CSP worker-src Directive** — Added `worker-src 'self' blob:` to Content-Security-Policy in both Elysia security headers plugin and nginx.conf, resolving browser console violations from DevTools worker scripts

### Changed

- **Migration Squash** — Consolidated 4 incremental migration files into a single baseline migration for cleaner deployment history

## [2.8.1] - 2026-02-28

### Added

- **Registration Test Suite** — 16-test `auth-register.test.ts` covering valid registration, workspace assignment, password validation (length, uppercase, lowercase, digit, mismatch), duplicate username/email (409), invalid email format, username constraints, VIEWER role default, and cookie suppression
- **OAuth Callback Tests** — 7-test `OAuthCallbackPage.test.tsx` covering loading state, navigation on success, user store hydration, error param handling, and API failure recovery
- **Settings Layout Tests** — 5-test `SettingsLayout.test.tsx` verifying page title, description, all 11 navigation tabs, outlet rendering, and tab count
- **Registration Rate Limit Reset** — Exported `clearRegistrationRateLimits()` helper from `auth-register.ts` for test isolation between runs

### Changed

- **Demo Accounts 403 Response** — Replaced generic `FORBIDDEN_EXAMPLE` with descriptive inline OpenAPI example including specific error message and `"Demo accounts disabled or in production mode"` description

## [2.8.0] - 2026-02-27

### Added

- **Database Administration Panel** — New Settings > Database tab with four panels:
    - **Schema Explorer** — Browse tables, columns, types, constraints, and foreign key relationships
    - **ERD Visualization** — Interactive SVG entity-relationship diagram with clickable tables and FK arrows
    - **Data Viewer** — Paginated data grid with inline editing, add/delete rows, soft-delete toggle, safe mode, CSV/JSON export
    - **SQL Sandbox** — Read-only SELECT query editor with results table and export
- **Database Admin REST API** — 10 new endpoints under `/api/database-admin/` with ADMIN read / SYSOP write RBAC, TypeBox validation, and audit logging
- **Database Admin Service Layer** — `services/databaseAdmin/` with facade pattern: schema introspection via PRAGMA, CRUD data operations, read-only query executor, safe mode manager
- **Email Verification** — Full registration flow with 24-hour verification tokens, `POST /auth/verify-email` endpoint, email template, and `/verify-email` frontend page
- **Registration Rate Limiting** — Dedicated 5 requests/hour per IP rate limiter on registration endpoint
- **Route Preloading** — Navigation links preload heavy page chunks on hover/focus for reduced perceived latency
- **Database Reset Script** — `scripts/reset-database.ts` utility to reset SQLite database and re-seed

### Security

- **SQL Injection Prevention** — Table and column names validated against `sqlite_master` / `PRAGMA table_info` allowlists at runtime
- **SQL Keyword Blocklist** — Added `REPLACE` and `LOAD_EXTENSION` to blocked SQL keywords
- **OAuth Account Takeover Prevention** — Account linking now requires bidirectional email verification (both OAuth provider and local account)
- **CSRF on Token Refresh** — Origin header validation and CSRF token enforced on `/auth/refresh`
- **Error Detail Redaction** — Error boundaries hide stack traces in production, show only in development
- **OAuth Error Code Allowlist** — OAuth callback maps error codes to allowlist instead of reflecting raw parameters
- **Password Reuse Prevention** — Password change rejects reuse of current password
- **Bug Report Mass Assignment** — Whitelist validation on allowed fields for bug report submissions
- **Dashboard Widget Validation** — Strict `t.Union(t.Literal())` validation for metricType and widgetType
- **Settings Route Protection** — Frontend settings routes wrapped in `<ProtectedRoute requiredRole="ADMIN" />`
- **Demo Account Guard** — Demo credentials endpoint restricted to loopback IPs with logging warnings

### Changed

- **Bun 1.3.10** — Upgraded runtime from 1.3.6 to 1.3.10 (35% faster async/await, barrel import optimization, ESM bytecode compilation)
- **Native Parallel Dev** — `dev:quick` uses `bun run --parallel` instead of `concurrently` (removed dependency)
- **Profiling Scripts** — Added `profile:cpu` and `profile:heap` scripts for backend profiling
- **Keyboard Shortcuts** — Command palette shortcut changed to `mod+k`, deduplicated global keydown listeners via single registration
- **Username Check** — `useUsernameCheck` hook migrated from manual fetch to TanStack Query
- **Password Generator** — Dev users now get predictable passwords (`{username}123`) instead of config-derived passwords
- **Elysia 1.4.26** — Backend framework bump
- **react-router-dom 7.13.1**, **tailwindcss 4.2.1**, **@tailwindcss/vite 4.2.1** — Frontend dependency bumps
- **Crawltest** — Screenshots now auto-placed in versioned `screenshots/v{version}/` directories

### Documentation

- Added `docs/internal/bun-assess-1310.md` — Bun 1.3.7–1.3.10 feature utilization assessment

## [2.7.4] - 2026-02-26

### Changed

- **Configurable CSRF Cookie Name** -- Added `csrfCookieName` to `config.security` (default: `{slug}_csrf`), replacing the hardcoded `spernakit_csrf` cookie name. Backend OAuth callback, frontend `OAuthCallbackPage`, and Vite configs all source from this field via the new `__CSRF_COOKIE_NAME__` compile-time define. Enables multi-app template compatibility where each derived app uses a unique CSRF cookie.
- **Notification Types Expanded** -- Added `security` and `marketing` notification types to backend TypeBox schema, preference service, and frontend (filter dropdown, stat cards with Shield/Megaphone icons, responsive 8-column grid layout).
- **Notification Metadata** -- POST `/api/notifications` now accepts an optional `metadata` JSON object for extensible notification payloads.
- **Template Manifest** -- Added `backupEncryptionService.ts` to the customize list in `template-manifest.json` (downstream apps may need custom encryption key derivation).

### Documentation

- Updated 2 feature.json files (OAuth Login Buttons, OAuth Provider Service) with CSRF cookie name configurability spec and version stamps.

## [2.7.3] - 2026-02-25

### Changed

- **Template Drift Detection Refactored** -- Major overhaul of `check-template-drift.ts`: file enumeration now derived dynamically from `git ls-tree` instead of static manifest, matching exclusions used during app initialization. Classification (branded/infrastructure/pure) comes from simplified `template-manifest.json`. Added package.json normalization for consistent comparison across template and derived apps.
- **Template Manifest Simplified** -- Removed `pure` array from `template-manifest.json` (now derived from git). File now only contains classification overrides for branded and infrastructure files.
- **Setup Script Enhanced** -- Added handling for additional meta tag patterns (og:description, twitter:description) in `setup.ts` with improved comments and pattern ordering.
- **Email Service Cleanup** -- `emailService.ts` now uses `isSmtpConfigured()` helper instead of manual config validation.

### Documentation

- Updated 15+ feature.json files with enhanced security and validation requirements.

## [2.7.2] - 2026-02-25

### Fixed

- **Upload Directory Resolution** -- `localAdapter.ts` now resolves the upload directory from the module path (`import.meta.url`) instead of `process.cwd()`, preventing incorrect paths when the backend is launched from a different working directory (e.g., Docker or test runners).
- **Docker-Prod Config Sync** -- `smoke.ts` now copies the current config file to the docker-prod test directory before running smoke tests, preventing stale config from causing failures.

### Changed

- **AppConfig Type Completeness** -- Expanded the `AppConfig` interface in `load-json-config.ts` to include all configuration sections (alerting, audit, email, OAuth, rate limiting, retention, storage, WebSocket, etc.), providing full type coverage for downstream consumers.
- **Key Generator Branding** -- Removed "Spernakit" prefix from the key generator banner to be product-neutral for downstream apps.
- **Config Backup Gitignore** -- Added `config/*.json.backup.*` pattern to `.gitignore` to prevent config backup files from being tracked.

## [2.7.1] - 2026-02-25

### Security

- **JWT ES256 Migration** -- Migrated JWT signing from HMAC symmetric secrets (HS256) to asymmetric EC P-256 key pairs (ES256). Config now uses `jwtPrivateKey`/`jwtPublicKey` and `jwtRefreshPrivateKey`/`jwtRefreshPublicKey` instead of `jwtSecret`/`jwtRefreshSecret`. Key generation via `bun run generate-keys`.
- **SMTP Role Revalidation** -- Changed 3 SMTP settings routes from `requireRole('SYSOP')` to `requireRoleFresh('SYSOP')` for consistent DB-checked authorization on sensitive writes.
- **File Upload Framework Validation** -- Added `maxSize: 10 * BYTES_PER_MB` to `t.File()` schema in files route for defense-in-depth alongside existing handler-level check.
- **User Create Atomicity** -- Wrapped user creation check+insert in a transaction with UNIQUE constraint error mapping for friendly error messages under race conditions.
- **Workspace Create Atomicity** -- Wrapped workspace+member creation in a single transaction to prevent orphaned records.
- **HSTS Preload** -- Added `preload` directive to HSTS headers in nginx.conf.

### Refactored

- **Configuration Loader** -- Major hardening of `configLoader.ts` to support ES256 key pairs, improved validation, and production safety checks.
- **Service Barrel Indexes** -- Added `index.ts` barrel files for notification, health, scheduler, and backup service domains.
- **Frontend Hook Relocation** -- Moved hooks from scattered page/component directories to centralized `hooks/` directory (`hooks/layout/`, `hooks/dashboards/`, `hooks/notifications/`, `hooks/settings/`).
- **Command Palette** -- Refactored to use `navItems` from `navConfig.tsx` instead of duplicated route definitions (DRY).
- **AppShell Optimization** -- Select `user.role` instead of full `user` object from auth store to reduce unnecessary re-renders.
- **Header/TopBar Cleanup** -- Removed unused `useHeader()` calls from Header and TopBar; hook now only used in NotificationBell where needed.
- **Encryption Consolidation** -- Removed `generateSecureSecret` from `utils/encryption.ts` (unused after key generation refactor).
- **Business Metrics API** -- Reordered exports and added JSDoc annotations.

### Added

- **Accessibility Skip Link** -- New `SkipLink` component with `id="main-content"` target on `<main>` elements for keyboard navigation.
- **Backend Test Setup** -- Ephemeral EC P-256 key pair generation in test setup for ES256 JWT signing during tests.

### Documentation

- 30+ feature.json files updated with current version stamps (`spernakit_version: 2.7.0`).
- Status summary cleaned: removed 6 resolved-without-code-change audit findings (81 → 75 tracked features).
- `.aidd/project.txt` renamed to `project.md`.

## [2.7.0] - 2026-02-23

### Security

- **Encrypted Database Backups** -- New AES-256-GCM backup encryption via `backupEncryptionService.ts` with HKDF key derivation (isolated info string from field-level encryption). Gzip compression support also implemented. Backup files support `.backup.db`, `.backup.db.gz`, `.backup.db.enc`, and `.backup.db.gz.enc` extensions. Restore auto-detects and decrypts/decompresses. Enabled via `database.backup.encrypt` and `database.backup.compress` config flags.
- **CSP Alignment** -- Unified Content Security Policy across backend (`securityHeaders.ts`) and nginx (`nginx.conf`). Removed Google Fonts CDN domains, `data:`/`blob:` from `img-src`, and `ws:` from production `connect-src`. Development mode retains `ws:` for Vite HMR.
- **Self-Hosted Inter Font** -- Replaced Google Fonts CDN with `@fontsource-variable/inter` npm package. Font files are now bundled in the build and served from `/assets/`, eliminating external CDN dependency and complying with strict `font-src 'self'` CSP.
- **CSRF Origin Validation** -- Added Origin header validation for unauthenticated state-changing requests (`/auth/login`, `/auth/register`, `/auth/forgot-password`) as defense-in-depth.
- **User Enumeration Prevention** -- Unified login failure responses to return generic "Invalid credentials" for all failure reasons (deleted, locked, invalid). Password-expired retains specific message for recovery guidance.
- **Seed Password Hardening** -- Removed hardcoded seed passwords from source code. Passwords now sourced from `config.testing.crawlLoginPassword` at runtime.
- **HSTS in Non-Dev Environments** -- HSTS header now enabled in all non-development environments (was production-only), preventing SSL stripping in staging/QA.
- **Rate Limit Header Removal** -- Removed `X-RateLimit-*` headers from normal responses to prevent information leakage about rate limit configuration. `Retry-After` header retained on 429 responses.
- **PII Redaction in Logs** -- Added `email` to pino logger redaction paths to prevent sensitive email addresses from appearing in logs.
- **Key Generation Bias Fix** -- Replaced modulo-based character selection with rejection sampling in `generate-keys.ts` to eliminate cryptographic bias.
- **GDPR Soft Delete** -- Clear `lastLoginIp` on user soft-delete for data minimization compliance.
- **Fresh Session on Sensitive Operations** -- Expanded `requireRoleFresh` to backup restore, auth security settings, and bulk user operations.

### Added

- **TabLayout Component** -- New `frontend/src/components/shared/TabLayout.tsx` providing a reusable tab-based page layout with React Router integration. Used by Settings and Profile layouts, eliminating duplicated NavLink/Outlet boilerplate.
- **Notification Type Badges** -- Added `marketing` (outline) and `security` (destructive) badge variants to notification columns.

### Changed

- **API Client Refactored** -- Extracted timeout/abort handling into `withTimeout()` helper. Moved refresh token deduplication from module-level singleton to instance property. Removed separate `requestDeduplication.ts` and `requestHelpers.ts` modules.
- **Backup Core Async** -- `createBackup()` and `restoreFromBackup()` are now async to support post-processing (compression/encryption). Scheduler already supports async handlers.
- **Settings/Profile Layouts Simplified** -- Both `SettingsLayout` and `ProfileLayout` refactored to use new `TabLayout` component, reducing ~80 lines of duplicated layout code.
- **Zustand Selector Narrowing** -- Narrowed store selectors in `useHeader` and `ApiKeysTab` from full user objects to specific fields, reducing unnecessary re-renders.
- **Store Persistence Debouncing** -- `themeStore` and `layoutStore` now use `debouncedLocalStorage` instead of raw `createJSONStorage`, reducing excessive localStorage writes.
- **Analytics Fire-and-Forget** -- Login `trackEvent()` is now fire-and-forget; logout runs analytics and API call in parallel via `Promise.allSettled()`.
- **ResizeObserver Transition** -- `useContainerWidth` wraps `setWidth()` in `startTransition()` to prevent blocking interactive updates.
- **Functional Form Updaters** -- `CreateWorkspaceDialog` and `EditWorkspaceDialog` use functional state updaters instead of spread pattern.
- **sessionStorage Error Handling** -- `correlationId.ts` wraps all `sessionStorage` calls in try-catch with in-memory fallback for private browsing mode.
- **Lucide Plugin Fix** -- `lucideDirectImports.ts` now uses per-import type detection instead of file-level bail-out.
- **Nginx WebSocket Timeout** -- Reduced `proxy_read_timeout` from 24h to 5min for WebSocket connections.

### Removed

- **Request Deduplication Module** -- Deleted `frontend/src/api/requestDeduplication.ts` and `frontend/src/api/requestHelpers.ts`. Deduplication logic consolidated into `ApiClient` class.
- **ApiKeysLoadingSkeleton** -- Deleted `frontend/src/pages/profile/api-keys/ApiKeysLoadingSkeleton.tsx`, replaced with generic `CardSkeleton`.
- **Bug Report Setting** -- Removed `bugReportEnabled` toggle from `ApplicationTab` settings UI.
- **Unnecessary Memoization** -- Removed premature `useMemo` from chart constants and gauge widget calculations.

## [2.6.1] - 2026-02-22

### Fixed

- **Docker Production Reliability** -- Improved production Docker setup reliability and fixed backup path references in `Dockerfile` and `docker-compose.production.yml`.
- **Password Min Length Alignment** -- Frontend password validation minimum length aligned with backend (8 characters) in `ResetPasswordConfirmPage`.
- **Typed Email Results** -- `emailService` now returns a typed `SendEmailResult` discriminated union instead of silently swallowing errors, enabling callers to distinguish delivery success from failure.
- **Orphaned ThemeToggle Removed** -- Deleted orphaned `ThemeToggle` component and its test from `components/layout/` (theme toggle was relocated to UserMenu in v2.5.0).

### Refactored

- **OAuth Provider Extraction** -- Extracted per-provider logic (GitHub, Google, Microsoft) from monolithic `oauthCore.ts` into dedicated `services/oauth/providers/` files with shared `OAuthProviderAdapter` interface, reducing `oauthCore.ts` by ~100 lines.
- **WebSocket Module Relocated** -- Moved WebSocket utilities from `hooks/websocket/` to `lib/websocket/` (constants, dispatcher, manager, types, utils), reflecting their non-hook nature. `hooks/useWebSocket.ts` re-exports from the new location.
- **SecurityHealthSection Extracted** -- Extracted security health summary section from `AuthenticationTab` into `settings/auth/SecurityHealthSection.tsx`.
- **PersonalInfoTab Decomposed** -- Extracted `ProfileForm`, `PasswordForm`, `UsernameHint`, and `useProfile` hook from `PersonalInfoTab`, reducing the file from ~300 lines to ~30.
- **PreferencesTab Decomposed** -- Extracted `ThemePreferences` and `LayoutPreferences` sections from `PreferencesTab`, reducing complexity.
- **BroadcastDialog Extracted** -- Extracted broadcast notification dialog from `NotificationSettingsTab` into `settings/notifications/BroadcastDialog.tsx`.
- **UsersTab Bulk Dialogs Extracted** -- Extracted `BulkDeleteDialog` and `BulkRoleDialog` from `UsersTab` into `settings/users/`.
- **MembersDialog Props Grouped** -- Consolidated scattered boolean/string props in `MembersDialog` into structured prop objects for clarity.
- **LoginPage Demo Credentials** -- Extracted `fillDemoCredentials` helper from `LoginPage` into `pages/auth/demoAccount.ts`.
- **File Validation Extracted** -- Extracted file validation logic from `fileService.ts` into dedicated `fileValidation.ts` service.
- **Backup Validation Helpers** -- Extracted validation functions from `backupCore.ts`, reducing cyclomatic complexity.
- **User Batch Validation Helpers** -- Extracted validation functions from `userBatchService.ts`, reducing cyclomatic complexity.

### Code Quality

- **Comprehensive Audit Campaign** -- Completed 10 audit categories (SPERNAKIT, REACT_BEST_PRACTICES, FEATURE_INTEGRATION, HYGIENE, SECURITY, REORG, SSOC, COMPLICATION, DEAD_CODE, LOGIC, TECHDEBT) with 91/91 features passing. 16 new audit feature findings tracked in `.aidd/features/`.
- **Hygiene Cleanup** -- Removed unused code: dead scheduler constants, orphaned email settings barrel file, unused broadcast route helpers, and stale domain schemas.

## [2.6.0] - 2026-02-22

### Security

- **PII Removed from Logs** -- Email addresses removed from `auth-password-reset.ts` and `emailService.ts` log context. Only non-identifying metadata (user ID, event type) is logged.
- **SSRF Protection Utility** -- New `urlValidator.ts` with `validateWebhookUrl()` blocks private IPs, loopback, link-local addresses, and non-HTTP schemes. Applied to webhook alert dispatch in `alertNotificationService.ts`.
- **Encrypted Settings Redaction** -- `settingsService.getAll()` now replaces values of `isEncrypted` settings with `[encrypted]` placeholder in API responses.
- **Stricter Path Traversal Check** -- `backupCore.ts` validates resolved paths start within the expected backup directory, preventing directory traversal via crafted filenames.
- **Text Content Validation** -- New `validateTextContent()` in `fileValidation.ts` detects dangerous HTML patterns and malformed JSON in text-based uploads. Wired into `fileService.validateFile()`.
- **WebSocket Payload Limit** -- Added `maxPayloadLength` (1 MiB) to WebSocket handler to reject oversized messages at the Bun transport level before buffering.
- **OAuth Route Validation** -- Replaced unsafe `as OAuthProvider` type casts with TypeBox `params` schema validation on OAuth routes, rejecting invalid provider names at the framework level.
- **Demo Service Hardened** -- Demo accounts now only exposed when `nodeEnv === 'development'` (was `!== 'production'`), blocking access in staging, QA, and test environments.

### Added

- **Password Strength Indicator** -- `ForcePasswordChangePage` and `RegisterPage` now display a real-time password strength meter using the shared `PasswordStrengthIndicator` component.
- **Frontend Unit Tests** -- 12 new test files covering layout components (AppShell, Header, MobileNav, Sidebar, ThemeToggle, UserMenu), shared components (ErrorBoundary, TimeRangeSelector), and hooks (useAuth, useAuthorization, useTheme, useWorkspace). Uses `__APP_NAME__` constant for app-name assertions.
- **Analytics Tracking Events** -- `NotificationsPage` fires `page_view` and action events. `SettingsLayout` fires `settings_tab_change` on tab navigation.
- **Dashboard Cache TTL** -- New `DASHBOARD_CACHE_TTL` constant in `backend/src/constants/dashboard.ts` for system dashboard response caching.
- **WebSocket Broadcast Helpers** -- `ws-broadcast.ts` gains `broadcastToChannel()` and `getConnectionCount()` for admin monitoring.

### Changed

- **Dashboard Helpers Extracted** -- `mapWidgetInputsToValues()` and `findOwnedDashboard()` extracted to `dashboardTypes.ts`, replacing duplicated inline queries across `dashboardCrud.ts` and `dashboardSharingService.ts`.
- **Parallel Alert Dispatch** -- `alertNotificationService` sends email recipients and notification channels in parallel via `Promise.allSettled` instead of sequential loops.
- **Parallel OAuth Encryption** -- `oauthAccountService.encryptOAuthTokens()` encrypts access and refresh tokens concurrently via `Promise.all`.
- **Optimistic Notification Updates** -- `useNotificationSocket` now updates unread count and recent notifications cache via `setQueryData` instead of full query invalidation. Includes reconnection-aware refetch.
- **Workspace Dialog State** -- `WorkspaceManagementPage` refactored from multiple boolean state variables to a single discriminated union `DialogState` type.
- **ProtectedRoute Store Subscription** -- `requiresPasswordChange` now uses a Zustand selector subscription instead of `getState()`, ensuring proper React re-renders.
- **Widget Query Key Factory** -- `useWidgetData.ts` centralizes query keys via `widgetDataKeys` factory object.
- **OAuth Callback API Usage** -- `OAuthCallbackPage` uses `getMe()` from auth API module instead of raw `apiClient.get()`.
- **MembersDialog Barrel Import** -- `Checkbox` imported from main `@/components/ui` barrel instead of direct `@/components/ui/checkbox` path.
- **App.tsx Simplified** -- Removed unused `HelmetProvider` wrapper.
- **Vite Chunk Consolidation** -- Updated `lucideDirectImports` plugin and vite chunk strategy for better tree-shaking.
- **Business Metrics Typing** -- `businessMetricsService` uses `EventCategory` type instead of raw `string` for event categories.
- **User Service Export** -- Added `export type { UserPublic }` for external consumption.

### Removed

- **CONTRIBUTING.md** -- Removed from template; contribution guidelines are not applicable to derived applications. Removed from `template-manifest.json` and `smoke-cache.ts`.

## [2.5.6] - 2026-02-21

### Security

- **CSRF Token Hashing** -- CSRF tokens are now hashed with SHA-256 before database storage. Raw tokens are sent to the client; only the hash is persisted, preventing token exposure if the database is compromised. Validation compares hashes using `timingSafeEqual`. Expiration enforced via embedded timestamp.
- **Non-Root Docker Container** -- Docker container now runs as a dedicated `spernakit` user instead of root. Nginx tmp/log directories created with proper ownership.
- **Nginx Security Headers** -- Added CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy headers to nginx config for static files and the `/assets/` cache location block.
- **Password Generator Bias Fix** -- `generateSecurePassword` now uses rejection sampling to avoid modulo bias when mapping random bytes to the character set.
- **Logger Redaction Extended** -- Added `connectionPassword`, `keySecret`, and `smtpPassword` to pino log redaction paths.

### Added

- **Template Drift Detection** -- New `bun run check:drift` command (`scripts/check-template-drift.ts`) compares template-managed files in derived apps against the spernakit baseline at their declared `spernakit_version`. Reports pure, branded, and infrastructure file drift. Runs as part of `smoke:qc` (informational, never fails the build). File registry in `scripts/template-manifest.json`.
- **Anti-FOIT Theme Script** -- Inline theme initialization script in `index.html` reads the Zustand theme store from localStorage and applies `dark` class and app theme synchronously before React renders, preventing flash of incorrect theme.
- **formatDateTime Helper** -- New date/time formatting utility and `BYTES_PER_GB` constant in backend utils.
- **Secure Cookie Production Override** -- `isSecureCookie` now always returns `true` in production mode regardless of host header, with localhost/loopback exception only in development.

### Fixed

- **Bug Report Metadata Validation** -- TypeBox schema for bug report `metadata` values now accepts arrays (e.g., `localStorageKeys`), fixing 400 errors on submission.
- **API Key Guard Body Clone** -- API key guard now clones the request before reading body (`request.clone().text()`), preventing stream consumption that blocked downstream handlers.
- **Pagination Floor** -- `paginatedQuery` ensures page number is at least 1, preventing negative offsets from invalid input.
- **Backup Path Consolidation** -- Consolidated backup directory references to root-level `data/backups/` path consistently.
- **Scheduler Cron Expression** -- Fixed metrics collection cron expression that incorrectly computed minutes from milliseconds interval.
- **Web Vitals CSRF Header** -- Web vitals reporting endpoint now includes CSRF header with POST requests.
- **CSP Script Hash** -- Added SHA-256 hash for the inline anti-FOIT theme script to the CSP `script-src` directive in `securityHeaders.ts`.

### Changed

- **Config Example Renamed** -- `config/spernakit.json.example` renamed to `config/example.json`. All references updated across docs, scripts, and gitignore.
- **Rate Limit Refactor** -- Rate limiting refactored to factory pattern with `RateLimitStore` interface and `createRateLimitStore()` constructor, improving testability and encapsulation.
- **Client IP Refactored** -- `getClientIp()` refactored to extract `getClientIpFromRealIpHeader()` helper. WebSocket routes now use the shared `getClientIp()` utility.
- **React Hook Cleanup** -- Removed unnecessary `useCallback`/`useMemo` wrappers from 14 frontend hooks and components. React Compiler handles memoization automatically.

### Dependencies

- `eslint` 10.0.0 → 10.0.1
- `@types/nodemailer` 7.0.10 → 7.0.11
- `rollup-plugin-visualizer` ^6.0.8 → ^7.0.0

### Documentation

- **DEVELOPMENT.md** -- Added template drift detection section with file classifications and manifest maintenance instructions.

## [2.5.5] - 2026-02-21

### Added

- **Business Metrics Event Tracking Endpoint** -- New `POST /business-metrics/track` route allowing authenticated users to submit business events from the frontend. Validates event category against allowed list (`user_action`, `conversion`, `feature_usage`). Body includes `eventName`, `eventCategory`, and optional `metadata`.
- **Frontend Event Tracking** -- `useAuth` hook now fires `login` and `logout` tracking events. `DashboardWidgetRenderer` fires `widget_interaction` events on card click with widget metadata.
- **Debounced Storage for Zustand Persist** -- New `debouncedStorage.ts` utility provides debounced `localStorage` and `sessionStorage` adapters for Zustand persist middleware. Batches writes with 300ms debounce to reduce main thread blocking. Single `beforeunload` listener flushes all pending writes. Applied to `authStore`, `sidebarStore`, and `workspaceStore`.
- **Lazy Recharts Exports** -- `chartConstants.ts` now exports lazy-loaded `CartesianGrid`, `Tooltip`, `XAxis`, and `YAxis` components for React 19 compatibility, preventing infinite render loops with direct recharts imports.
- **Scheduler Constants** -- Added `TOKEN_CLEANUP_INTERVAL_HOURS` (6) and `METRICS_COLLECTION_INTERVAL_MINUTES` (5) to scheduler constants for use by derived applications.

### Fixed

- **Local Storage Adapter Path Resolution** -- Replaced unreliable `process.cwd()` with `import.meta.url`-based `__dirname` resolution in `localAdapter.ts`, ensuring correct upload directory resolution regardless of the working directory the process is started from.
- **dbHelpers Export Ordering** -- Moved `export type { PaginatedResult }` to bottom of file alongside value exports, following consistent export grouping convention.
- **Business Metrics API Types** -- Fixed `byCategory` typing in `UserActivityData` from `eventCategory: string` to `eventCategory: EventCategory`. Switched to inline exports and added `TrackEventInput` interface.

### Changed

- **Vite Chunk Size Warning Limit** -- Increased `chunkSizeWarningLimit` from default 500 to 600 in `vite.config.ts` to accommodate recharts bundle size.
- **Gitignore** -- Added `data/uploads/` to `.gitignore`.

## [2.5.4] - 2026-02-21

### Added

- **UI Density Setting** -- Restored and fully wired end-to-end density preference (compact / comfortable / relaxed). CSS custom properties (`--density-spacing`, `--density-padding-y`, `--density-font-size`) applied via `data-density` attribute on `<html>`. Consumed by DataTable rows, sidebar/topbar nav links, and body font size. Zustand layout store persists selection with v1→v2 migration. Backend stores density in user UI settings JSON.

### Fixed

- **Vite Build Warning for `'use no memo'`** -- Moved React Compiler `'use no memo'` directive from module level to inside the `HealthTimeline` function body, eliminating the Rollup bundling warning about module-level directives.
- **Rogue Folder Detection for Plurals** -- Added `'backups'` to `check-application.ts` restricted folder names alongside `'backup'`, catching `backend/backups` as a rogue directory.
- **Backup Directory Location** -- Changed default backup location from `./backups` (relative to backend CWD, creating rogue `backend/backups/`) to `../data/backups` (project root `data/backups/`), consistent with the architectural rule that all data lives in the root `data/` directory.

## [2.5.3] - 2026-02-20

### Fixed

- **Bug Report Path Resolution** -- `bugs.ts` projectRoot was resolving two levels up from `routes/` instead of three, causing `data/bugs.json` writes to target `backend/data/` instead of the project-root `data/` directory.

### Improved

- **Crawl Test Bug Report Submission** -- Rewrote the `--bug` flag test to use React-compatible controlled component input (native value setter + input event dispatch) instead of Puppeteer `.type()`. Detects success/error toast states instead of relying on dialog close heuristic. Clearer error reporting on failure.
- **data/ Directory Tracking** -- Removed blanket `/data/` gitignore entry. Database files (`*.db`, `*.db-journal`, `*.db-shm`, `*.db-wal`) and `.seeded` remain ignored. `data/bugs.json` is now tracked in git, shipping as an empty template file.

## [2.5.2] - 2026-02-20

### Security

- **SMTP Password Masked in API** -- `GET /settings/smtp/config` now returns `'***'` instead of the decrypted plaintext password. The `PUT` endpoint ignores the masked value to prevent accidental overwrite.
- **Swagger/OpenAPI Docs Dev-Only** -- Swagger UI and OpenAPI JSON (`/api/v1/docs`) are now only mounted in development mode. Production environments no longer expose API documentation.
- **Bug Report Route Guards** -- Replaced inline auth checks in `bugs.ts` with proper `beforeHandle` guards (`requireAuth` for POST, `requireRole('ADMIN')` for GET). Fixed TypeBox `metadata` from `t.Any()` to `t.Record(t.String(), t.Unknown())`.
- **Pino Log Redaction** -- Added redaction paths for `password`, `token`, `secret`, `apiKey`, `authorization`, `refreshToken`, `accessToken` (and `*.` nested variants) to all pino logger instances.
- **WebSocket Per-IP Rate Limit Fix** -- Replaced `crypto.randomUUID()` fallback in `getClientIp()` with a shared `'unknown'` bucket, ensuring per-IP connection limits are properly enforced for direct connections without proxy headers.
- **bunfig.toml env=false** -- Added `env = false` to `backend/bunfig.toml` to explicitly disable Bun's automatic `.env` file loading, enforcing JSON-only configuration.

### Fixed

- **Workspace Circular Dependency** -- Extracted `getDefaultWorkspaceId()` from `workspaceCrud.ts` into new `workspaceHelpers.ts`, breaking the circular import cycle between `workspaceCrud.ts` and `workspaceMemberService.ts`. Removed backward-compatibility re-exports from `workspaceCrud.ts`.
- **Checkbox Barrel + Radix Import** -- Added `Checkbox` to the UI barrel export (`index.ts`). Changed import from `radix-ui` barrel to scoped `@radix-ui/react-checkbox` package, matching all other shadcn/ui components.
- **Demo Accounts Error Shape** -- Replaced hand-crafted error object in `GET /auth/demo-accounts` with `forbiddenError()` utility for consistent error response shape.
- **Duplicate Notification Invalidation** -- Removed duplicate `unreadCount` query invalidation from `useNotificationSocket` that caused a race condition with `useHeader`'s optimistic updates.

### Dependencies

- `@radix-ui/react-checkbox` 1.3.3 (new, replaces `radix-ui` barrel import for checkbox)

## [2.5.1] - 2026-02-20

### Added

- **Bug Reporting System** -- New end-to-end bug reporting feature. Users can submit bug reports via a dialog button in the navigation bar (both sidebar Header and TopBar layouts). Reports include a description, optional email, and automatic metadata capture (browser info, screen size, timezone, theme, URL). Backend stores reports as JSON in `data/bugs.json` with status tracking. Admin/SYSOP endpoint to retrieve all reports. Controlled by `app.bug_report_enabled` feature flag.
- **Textarea UI Component** -- New shadcn/ui-style `Textarea` component with forwarded ref support, added to the component barrel file.

### Changed

- **Optimistic UI for Settings Toggles** -- ApplicationTab and NotificationSettingsTab now use per-toggle optimistic state for instant visual feedback, with automatic rollback on mutation errors.
- **Settings HTTP Caching Removed** -- Changed settings endpoints (`GET /settings`, `GET /settings/:key`, `GET /settings/app/features`) from `MEDIUM` (5 min cache) to `NO_CACHE` since settings are mutable on the same page.

### Improved

- **Crawl Test Reliability** -- Switch element testing now matches by `id` attribute first (most reliable) before falling back to index. Switch state verification uses `waitForFunction` instead of fixed sleep. Added stale-element recovery that reloads the page and re-discovers elements when buttons become detached. New `navigateWithRetry` handles transient `net::ERR_ABORTED` errors. Added `--bug` flag for automated bug report submission testing.
- **Application Consistency Checks** -- New `findRogueFolders` validation enforces that `data/` and `backup/` directories only exist at project root, not inside `backend/` or `frontend/`.
- **LoginPage Test** -- Reads app name from `backend/src/config/defaults.json` instead of hardcoding.

### Dependencies

- `lucide-react` ^0.564.0 → ^0.575.0
- `tailwind-merge` ^3.4.1 → ^3.5.0
- `@tailwindcss/vite` 4.1.18 → 4.2.0
- `tailwindcss` 4 → 4.2.0
- `@types/node` 25.2.3 → 25.3.0
- `rollup-plugin-visualizer` ^6.0.5 → ^6.0.8
- `eslint-plugin-jsdoc` 62.5.5 → 62.7.0
- `eslint-plugin-perfectionist` 5.5.0 → 5.6.0
- `puppeteer` 24.37.3 → 24.37.5

## [2.5.0] - 2026-02-17

### Breaking

- **Density Preference Removed** -- The `density` user UI setting (`comfortable`/`compact`/`relaxed`) has been removed. Users now configure `layoutMode` (sidebar/topbar) and `containerWidth` (centered/full-width) instead.

### Security

- **JWT/Cookie Expiry Alignment** -- Aligned `jwtExpiresIn` (24h → 15m) and `cookieMaxAge` (86400000 → 900000) in config, example, and documentation. Shorter-lived access tokens enforce refresh-based session continuity.

### Added

- **Layout Mode Selection** -- Users can switch between sidebar navigation and a new horizontal top-bar navigation via the Preferences tab. Layout choice is persisted in `layoutStore` with localStorage persistence. Admins configure the default layout mode via app feature flags.
- **App Color Themes** -- Five color themes (Default/Indigo, Ocean, Forest, Sunset, Rose) selectable from Preferences. Themes override `--primary`, `--primary-foreground`, and `--ring` CSS variables using OKLCH color values for both light and dark modes.
- **Container Width Setting** -- Users can choose between `centered` (max-w-7xl) and `full-width` content layout, persisted per user.
- **TopBar Component** -- New `TopBar` layout component renders horizontal navigation with app name, nav links, workspace switcher, notification bell, and user menu. Nav links collapse behind the mobile hamburger drawer below `md` breakpoint.
- **App Feature Flags API** -- New `GET /settings/app/features` endpoint returns app-wide feature flags (workspacesEnabled, filesEnabled, defaultLayoutMode). Available to all authenticated users, cached for 5 minutes. Admin-configurable via the Application settings tab.
- **Admin Notification Defaults** -- Admin-configurable default notification preferences (email, push, security, system, marketing) that apply to new users via the settings table.
- **Username Availability Check** -- New `GET /users/check-username/:username` endpoint with debounced live-check integrated into the PersonalInfoTab profile form. Inline status hints (checking, available, taken, invalid).
- **useFormatters Hook** -- New hook returns `formatDate`, `formatTime`, and `formatTimestamp` functions bound to the user's display preferences (timezone, dateFormat, timeFormat) via `Intl.DateTimeFormat`.
- **useAppFeatures Hook** -- New hook wraps TanStack Query for consuming feature flag data from the settings API.
- **Inter Font** -- Added Inter as the primary UI font via Google Fonts CDN with `font-feature-settings: 'cv11', 'ss01'` and antialiased rendering.
- **SettingsToggleRow Component** -- New shared component for consistent toggle-row presentation in settings pages (DRY extraction).
- **UserFormFields Component** -- Extracted shared form fields from `CreateUserDialog` and `EditUserDialog` (DRY extraction).
- **healthStatusUtils** -- Extracted health status helper functions from health check UI components (DRY extraction).
- **useSettingsHooks** -- Extracted shared settings query and mutation hooks from `ApplicationTab` (DRY extraction).
- **Notifications Sidebar Link** -- Added Notifications to the sidebar navigation items in `navConfig.tsx`.

### Changed

- **Navigation Restructured** -- Sidebar nav renamed: "Dashboard" → "Home", "Dashboards" → "Custom Dashboards". Profile link removed from sidebar; Account and Preferences links added to UserMenu and MobileNav bottom section.
- **Theme Toggle Relocated** -- Theme toggle (light/dark/system) moved from the Header component to a submenu inside the UserMenu dropdown. Header is now simpler with just notifications and user menu.
- **MobileNav Redesigned** -- Mobile drawer now includes a user section at the bottom with Account link, Preferences link, theme mode toggle, and sign-out button.
- **AppShell Dual Layout** -- `AppShellContent` conditionally renders either sidebar+header or topbar layout based on the user's `layoutMode` store value. Both layouts share the same overlays (CommandPalette, ShortcutsHelp).
- **ApplicationTab Redesigned** -- Admin settings page redesigned as a feature flags panel with toggle switches for workspaces, files, notification channels, and default layout mode selector.
- **PreferencesTab Expanded** -- Added app theme picker (color swatches), navigation mode picker (sidebar/topbar), and container width picker (centered/full-width). Sidebar settings card conditionally shown only in sidebar layout mode.
- **PersonalInfoTab Enhanced** -- Username field now includes live availability checking with debounced API calls and inline status indicators (spinner, checkmark, X). Submit button disabled when username is taken, checking, or invalid.
- **Default Color Palette** -- Updated from neutral gray to indigo-tinted OKLCH values. Primary color is now `oklch(0.488 0.243 264)` (indigo) in light mode and `oklch(0.707 0.165 254)` in dark mode. Ring color matches primary.
- **Default App Theme** -- Changed from `zinc` to `default` (indigo).
- **Keyboard Shortcuts** -- `g n` (Go to Notifications) replaced with `g a` (Go to Account); `g h` renamed description to "Go to Home".
- **Notification Preference Defaults** -- New user notification preferences are now sourced from admin-configured settings table values instead of hardcoded defaults.
- **CSS Enhancements** -- Added `scrollbar-gutter: stable` on html, `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` on body, `--font-sans` custom property with Inter font stack.

### Removed

- **density User Preference** -- Removed `density` field (`comfortable`/`compact`/`relaxed`) from user UI settings schema, replaced by `layoutMode` and `containerWidth`.
- **ThemeToggle in Header** -- Standalone `ThemeToggle` button removed from Header (moved to UserMenu submenu).
- **Profile Sidebar Link** -- Profile link removed from sidebar `navConfig`; account access now via UserMenu.
- **Over-Exported OAuth Functions** -- Removed unnecessary exports from `oauthCore.ts` (hygiene cleanup).
- **Generic Variable Names** -- Renamed generic variable names across 6 files for improved readability.

### Code Quality

- **Comprehensive Audit Campaign** -- Completed 10 audit categories (SPERNAKIT, REACT_BEST_PRACTICES, FEATURE_INTEGRATION, HYGIENE, REORG, COMPLICATION, DEAD_CODE, LOGIC, SSOC, TECHDEBT) with 8 findings remediated across all scanned files.
- **DRY Extractions** -- `healthStatusUtils.tsx`, `useSettingsHooks.ts`, `UserFormFields.tsx`, and `SettingsToggleRow.tsx` extracted to eliminate code duplication.

### Documentation

- Updated CONFIGURATION.md security examples to reflect aligned `jwtExpiresIn` (15m) and `cookieMaxAge` (900000) values.
- Updated `spernakit.json.example` with aligned cookie max age.

## [2.4.0] - 2026-02-16

### Breaking

- **Dynamic Environment Variable Names** -- Secret injection environment variables are now derived from the app slug (`{SLUG_UPPER}_JWT_SECRET`, etc.) instead of hardcoded `SPERNAKIT_*` prefixes. Downstream apps using Docker/Kubernetes secret injection must update their env var names to match their app slug. See DEPLOYMENT.md for the new naming convention.

### Security

- **JWT Expiry Default Reduced** -- Default `jwtExpiresIn` changed from `24h` to `15m`, enforcing shorter-lived access tokens with refresh-based session continuity.

### Added

- **Health Check Result Caching** -- `runAllChecks()` now caches results for 15 seconds, avoiding redundant I/O from frequent dashboard and health endpoint polling.
- **GaugeCard Shared Component** -- Extracted `GaugeCard` from `DashboardPage` to `frontend/src/components/shared/GaugeCard.tsx` for reuse across dashboard and monitoring pages.
- **Email Validation Utility** -- New `frontend/src/lib/validation.ts` with `isValidEmail()` function, replacing inline regex in `RegisterPage`.
- **Graceful Shutdown Handler** -- Backend now handles SIGTERM/SIGINT signals by stopping the scheduler before exit, preventing incomplete scheduled operations.
- **OpenAPI Version from package.json** -- Swagger documentation now reads the API version from `backend/package.json` instead of a hardcoded `'0.1.0'` string.
- **Docker Image Version Tag** -- `docker-compose.production.yml` now supports `APP_VERSION` env var for image tags (defaults to `latest`).
- **Screenshots Smoke Mode** -- New `smoke:screenshots` script and `screenshots` mode in `smoke.json` for automated page screenshot capture via crawltest.

### Changed

- **Recharts Direct Imports** -- Removed all `lazy(() => import('recharts')...)` wrappers and `Suspense` fallbacks from chart components (BarChartWidget, LineChartWidget, MetricChart, HealthTimeline, chartConstants). Recharts components are now imported directly, simplifying the component tree and eliminating unnecessary loading skeletons.
- **Debounced Storage Removed** -- Deleted `frontend/src/lib/debouncedStorage.ts` and replaced all Zustand store persist storage with Zustand's built-in `createJSONStorage(() => localStorage/sessionStorage)`. The debounce layer added complexity without measurable benefit for the small payloads being persisted.
- **useHealthChecks Decomposed** -- Monolithic `useHealthChecks` hook split into 5 focused hooks: `useHealthConfig`, `useHealthDetails`, `useHealthHistory`, `useWebVitals`, and `useHealthMetrics`, improving code organization and enabling independent data fetching.
- **MembersDialog Props Consolidated** -- `MembersDialog` props simplified: separate `bulkAddIsPending`/`bulkRemoveIsPending` merged into `bulkIsPending: { add, remove }`; `userIdToAdd`/`roleToAdd`/`onUpdateRole` replaced with `addMemberForm`/`onUpdateAddMemberForm(form)` pattern.
- **Origin Validation Extracted** -- `isOriginAllowed` extracted from `cors.ts` and `ws.ts` into shared `backend/src/utils/originValidation.ts`, eliminating code duplication.
- **Batch Database Operations** -- `runAndStoreChecks` and `storeWebVitals` now use batch `db.insert().values(array)` instead of per-row inserts. `bulkUpdateUserRoles` wraps updates in a transaction with `eq()` instead of `inArray([id])`.
- **Dashboard Server Cache Removed** -- Removed in-memory dashboard response cache (`DashboardCacheEntry`, `dashboardCache` map). Caching is now handled at the HTTP layer (Cache-Control) and client layer (TanStack Query).
- **Auth /me Username Source** -- `/auth/me` now returns `dbUser.username` (fresh from database) instead of `authUser.username` (from JWT claim), ensuring profile updates are reflected immediately.
- **Security Header Constants** -- Extracted `CORS_MAX_AGE_SECONDS` and `HSTS_MAX_AGE_SECONDS` as named constants replacing inline magic numbers.
- **HealthTimeline Uses Shared Hook** -- `HealthTimeline` component now imports `useContainerWidth` from the shared hooks module instead of defining its own local copy.

### Removed

- **debouncedStorage Module** -- `frontend/src/lib/debouncedStorage.ts` deleted (replaced by Zustand built-in storage).
- **Unused broadcast() Function** -- Removed unscoped `broadcast()` from `ws-broadcast.ts`; only role-scoped `broadcastToAdmins` remains.
- **Unused assertRoleHierarchy** -- Removed from role guard (never called).
- **Unused Constants** -- Removed `DASHBOARD_CACHE_TTL_MS`, `TOKEN_CLEANUP_INTERVAL_HOURS`, and `METRICS_COLLECTION_INTERVAL_MINUTES` from scheduler constants.
- **Unused ForgotPasswordRequest Type** -- Removed from frontend auth API types.
- **Dashboard Cache Infrastructure** -- Removed `DashboardCacheEntry` interface and `dashboardCache` Map from system-dashboard route.

### Documentation

- Updated DEPLOYMENT.md environment variable documentation to reflect slug-derived naming convention with concrete examples.
- Updated SECURITY.md password reset token storage to document SHA-256 hashing (no longer plaintext storage).

## [2.3.0] - 2026-02-16

### Added

- **Role-Based Navigation Filtering** -- Sidebar, MobileNav, and CommandPalette now filter navigation items by the current user's role, hiding pages the user cannot access. Centralized nav configuration extracted to `navConfig.tsx`.
- **Crawler Anonymous Mode** -- `crawltest.ts` now supports anonymous mode and seed route configuration for testing unauthenticated page access.
- **usePagination Hook** -- New shared hook eliminates duplicated pagination state logic across list pages.
- **useContainerWidth Hook** -- New shared hook using `ResizeObserver` + `requestAnimationFrame` replaces recharts `ResponsiveContainer` to fix React 19 infinite render loops.
- **useAuthorization Hook** -- New hook for role-based permission checks in frontend components.
- **TypeBox Domain Schemas** -- New `backend/src/schemas/domain.ts` provides shared TypeBox schemas that propagate domain types to route handlers.
- **StatCard Component** -- New shared component for consistent metric card presentation.
- **TableSkeleton Component** -- New shared loading skeleton for data tables.
- **Download Utility** -- New `frontend/src/lib/download.ts` extracts reusable file download logic.
- **Role Hierarchy Helpers** -- Shared helpers eliminate duplicated permission check logic across backend services.
- **setAuthCookies Helper** -- Extracted duplicated cookie-setting logic from auth routes into reusable utility.
- **createRetentionCleanupTask Helper** -- Extracted repetitive batch cleanup closures into reusable scheduler helper.

### Security

- **WebSocket Security Hardening** -- Config-driven origin validation, role-based broadcast filtering, and proper connection cleanup for WebSocket connections.
- **maxLength Constraints** -- Added string length limits to all route string inputs to prevent oversized payloads.
- **Workspace-Scoped File Operations** -- File operations now require `X-Workspace-Id` header for non-SYSOP users.
- **Workspace Member Authorization** -- Workspace member operations now require workspace-scoped ADMIN role.
- **Path Traversal Protection** -- S3 storage adapter validates file paths to prevent directory traversal attacks.
- **Baseline CSP** -- Always emits Content Security Policy headers even when `strictCsp` is disabled.
- **JSON Settings Validation** -- `JSON.parse()` settings validated with Zod schemas instead of unsafe type casts.
- **TypeBox Enum Validation** -- Role and notification type route parameters use TypeBox enum validation.
- **OAuth Security Fixes** -- Resolved error reflection vulnerability and username collision risk in OAuth flows.
- **Login Error Differentiation** -- Login now returns differentiated error codes for locked vs expired accounts.
- **Password Age Skip** -- `minPasswordAge` check correctly skipped when user has `requiresPasswordChange` flag.
- **Type-Safe Form Data** -- Replaced unsafe `formData.get() as string` with type-safe extraction helper.

### Changed

- **Comprehensive Audit Campaign** -- Completed 10 audit categories (HYGIENE, SECURITY, SSOC, REORG, COMPLICATION, DEAD_CODE, LOGIC, TECHDEBT, FEATURE_INTEGRATION, REACT_BEST_PRACTICES, SPERNAKIT) with 119 findings validated and remediated across 219 files (+6,772 / -3,419 lines).
- **BusinessMetricsPage Decomposition** -- Monolithic page split into `DashboardStatsSection`, `EventSummarySection`, and `UserActivitySection` focused components.
- **WebSocket Module Extraction** -- `useWebSocket` decomposed from monolithic hook into `hooks/websocket/` module with `WebSocketManager` singleton, dispatcher, constants, types, and utilities.
- **API Keys Page Decomposition** -- API keys UI extracted from monolithic tab into `pages/profile/api-keys/` subdirectory with focused card, dialog, and utility components.
- **Email Settings Decomposition** -- Email settings extracted to `pages/settings/email/` subdirectory with `EmailConfigForm`, `EmailTestForm`, and `useEmailSettings` hook.
- **AuthenticationTab Form Extraction** -- Repetitive form handling split into `AccountLockoutSection` and `PasswordPolicySection` components.
- **initializeConfig Complexity Reduction** -- Cyclomatic complexity reduced from ~14 to ~5 via helper extraction.
- **login() Complexity Reduction** -- Cyclomatic complexity reduced from ~11 to ~3 via control flow simplification.
- **OAuth Code Deduplication** -- Extracted duplicated OAuth token exchange and profile mapping into shared helper functions.
- **ApiClient Method Deduplication** -- Merged duplicated HTTP request methods in the frontend API client.
- **Audit Plugin Extraction** -- Helper functions extracted from audit plugin for improved readability.
- **Auth Routes Refactoring** -- `auth-register.ts` refactored to use service layer instead of direct Drizzle calls; `auth.ts` migrated to use `apiClient` instead of raw fetch.
- **Notification Optimizations** -- Consolidated 3 notification statistics queries into single GROUP BY; `useNotificationSocket` uses targeted query invalidation instead of broad prefix match.
- **Dashboard Stats Consolidation** -- Consolidated 3 dashboard stats queries into single GROUP BY query.
- **Scoped Query Invalidation** -- Workspace switch now uses scoped query invalidation instead of full cache clear.
- **Eliminated N+1 Queries** -- Fixed N+1 query patterns in bulk user and workspace operations.
- **chartUtils.tsx → ChartWrapper.tsx** -- File renamed to match its primary export.
- **ResponsiveContainer Replacement** -- All remaining `ResponsiveContainer` usages replaced with `useContainerWidth` hook.
- **React Refs for DOM Access** -- LoginPage demo fill now uses React refs instead of `document.getElementById`.
- **Error Toast Cleanup** -- Removed redundant error toasts from mutation `onError` handlers (handled globally by `apiClient`).
- **Error Handling Refactoring** -- `showErrorToast` dual-switch replaced with lookup map pattern; `UniqueConstraintError` replaces catch-all 409 error handling.
- **Auth Store Profile Merge** -- Profile updates now merge with existing auth store data instead of overwriting.
- **Memoized Audit Columns** -- `useAuditColumns` hook memoizes column definitions for the audit logs table.
- **Time Constants** -- Replaced inline time arithmetic with `MS_PER_DAY`/`MS_PER_HOUR` constants.
- **Chart Deduplication** -- Deduplicated `formatTime` and `CHART_MARGIN` across chart components.
- **CommandPalette Static Routes** -- Extracted to module-level constant.
- **deepMerge Simplification** -- Simplified with `isPlainObject` type guard.
- **Centralized Config Patterns** -- `{} as never` Zod pattern centralized in `configSchema.ts`; `ROLES` constant deduplicated across 3 frontend files.

### Removed

- **~40 Unused Facade Re-exports** -- Removed from 8 backend service files.
- **22 Unused Type Exports** -- Removed from frontend API modules.
- **Unused POST /business-metrics/track Endpoint** -- Dead endpoint removed.
- **Unused WS_ERROR_CODES** -- Removed from error code constants.
- **Shared Components Barrel File** -- Removed `frontend/src/components/shared/index.ts` (unused exports).
- **Non-null Assertions** -- Replaced with explicit null checks in database query results throughout backend.
- **Unsafe Type Assertions** -- Replaced untyped `Record` casts in logger and audit plugins; replaced `as never` casts with proper typing; replaced unsafe dashboard import casts with runtime validation.

### Fixed

- **Render-Phase setState** -- Fixed in `ApplicationTab` (eliminated `setState` during render).
- **Notification Statistics Invalidation** -- Notification statistics query now invalidated after mutations.
- **File Download UX** -- Extracted download utility and added loading state to `FilesPage`.
- **Backup Path Disclosure** -- Fixed information leakage in backup error responses.
- **Workspace Slug Conflict** -- Fixed slug uniqueness validation in workspace creation.
- **Stale Alerts N+1** -- Fixed N+1 query pattern in `cleanupStaleAlerts`.
- **Auth Plugin Type Guard** -- Added type guard for API key store access.
- **Overloaded paginatedResponse** -- Added function overloads for proper type safety.
- **refetch → invalidateQueries** -- Replaced direct `refetch()` calls with `invalidateQueries()` in workspace and file hooks.

### Documentation

- Documented workspace member hard-delete design decision.
- Documented implicit '@' detection heuristic dependency in login.
- Added codebase analysis report from comprehensive audit campaign.

### Dependencies

- `elysia` 1.4.24 → 1.4.25
- `@types/nodemailer` 7.0.9 → 7.0.10
- `lucide-react` ^0.563.0 → ^0.564.0
- `tailwind-merge` ^3.4.0 → ^3.4.1
- `jsdom` ^28.0.0 → ^28.1.0
- `eslint-plugin-jsdoc` 62.5.4 → 62.5.5
- `puppeteer` 24.37.2 → 24.37.3

## [2.2.2] - 2026-02-14

### Changed

- **Fixed Demo Passwords** -- Seed accounts now use fixed passwords matching the documented `{role}123` convention (e.g., `sysop123`, `admin123`) instead of randomly generated passwords. Removed `getOrGenerateCredentials` in favor of simpler `getCredentials` that returns passwords directly from user templates. The `generateSecurePassword` utility remains available for downstream use.
- **Seed Accounts Skip Forced Password Change** -- Seed accounts are now created with `requiresPasswordChange: false`, removing the mandatory password change on first login for development and demo environments. The password change guard infrastructure remains intact for downstream apps to use.
- **Health Check Single-Run Guard Removed** -- `runAndStoreSingleCheck` no longer checks `config.enabled[checkType]` before executing, as check type enablement is validated upstream by callers.
- **Supertest Pipeline Start** -- The `supertest` npm script now begins with `smoke:reset` instead of `smoke:qc`, ensuring a clean state before running the full validation chain.

## [2.2.1] - 2026-02-14

### Added

- **Password Strength Indicator** -- New `PasswordStrengthIndicator` shared component evaluates password length, character diversity (lowercase, uppercase, digits, symbols), and displays a color-coded strength bar with label (Weak/Fair/Good/Strong). Integrated into the Change Password form on the profile page.
- **Sidebar Version Display** -- Sidebar now shows the application version (e.g., `v2.2.1`) when expanded, injected at build time via Vite `__APP_VERSION__` define from `package.json`.
- **Coverage Tooling** -- Added `@vitest/coverage-v8` as a frontend dev dependency for test coverage reporting via `bun run test:coverage:frontend`.

### Fixed

- **Null-Safe Dashboard Widgets** -- `GaugeWidget` and `StatCardWidget` now use nullish coalescing (`?? 0`, `?? 'Unknown'`) when reading metric values, preventing crashes when dashboard data fields are undefined.
- **CopyButton Timer Leak** -- `ApiKeysTab` `CopyButton` now stores the `setTimeout` handle in a ref and clears it on unmount, preventing a state update on an unmounted component.
- **Duplicate getDashboard Call** -- Removed redundant `getDashboard` call inside the transaction block of `dashboardCrud.updateDashboard`; the final call after the block already covers both paths.
- **PersonalInfoTab Render-Phase setState** -- Refactored `PersonalInfoTab` into separate `ProfileForm` and `PasswordForm` sub-components, eliminating the render-phase `setState` anti-pattern flagged during audit. `ProfileForm` receives user data as props and initializes state directly.

### Changed

- **Alert Notification Retry** -- Moved `sendAlertWithRetry` from `healthChecks.ts` into `alertNotificationService.ts` with per-channel retry tracking. The function now returns `AlertNotificationResult[]` instead of a boolean, and health check callers receive granular per-channel success/failure feedback via `.then()` instead of fire-and-forget `.catch()`.
- **User Type Definitions** -- `userCrud.ts` now exports named interfaces `UserPublic`, `UserAuthStatus`, and `UserRefreshInfo` with explicit concrete types instead of `Pick`/inline return types, improving type clarity for auth verification and token refresh flows.
- **Notification Metadata** -- `notificationCrud.ts` `CreateInput` now accepts an optional `metadata` field (`Record<string, unknown> | null`) for attaching structured data to notifications.
- **Reduced Notification Exports** -- `notificationPreferenceService.ts` no longer exports `ensurePreferencesSeeded` and `getDefaultPreferences`; these are internal implementation details.
- **Vite Chunk Splitting** -- Separated `radix-ui` and `zustand` into their own chunks (previously bundled with `react-vendor`), improving cache granularity and reducing main vendor chunk size.
- **Health Check Metrics Memoization** -- `useHealthChecks` hook now memoizes `cpuData` and `memoryData` arrays with `useMemo` keyed on `metricsData?.data`, preventing unnecessary recomputation on every render.
- **Test Utils: userEvent** -- `renderWithProviders` now returns a pre-configured `userEvent` instance (`user`), replacing the `fireEvent` pattern in example tests. Tests use `await user.click()` instead of `fireEvent.click()` for more realistic interaction simulation.
- **Migration Script Polish** -- `scripts/migrate.ts` now uses emoji status indicators throughout console output for clarity and consistency.
- **Demo Credential Warning** -- `configLoader.ts` now logs security warnings when `testing.crawlLoginEmail` or `testing.crawlLoginPassword` use demo values in non-development environments.
- **Secure Secret Generator** -- Added `generateSecureSecret()` utility to `encryption.ts` for generating cryptographically secure random strings.
- **Test Schema Update** -- `test-db.ts` health check alerts schema now includes `acknowledged_at` and `acknowledged_by` columns, matching the production schema.
- **WebhookPayload Type** -- `alertNotificationService.ts` inlines the `WebhookPayload` return type on `buildWebhookPayload` instead of exporting a named interface, reducing the public API surface.
- **Feature Spec Updates** -- Updated feature.json specs for drizzle-migrations-and-seed, example-test-patterns, notification-crud-api, and user-management to reflect current implementation details.

## [2.2.0] - 2026-02-11

### Added

- **User Self-Registration** -- Public `POST /api/auth/register` endpoint with password strength validation, duplicate detection, and automatic default workspace membership. Frontend `RegisterPage` with React 19 `useActionState` pattern, client-side validation, and "Sign up" / "Sign in" cross-links between Login and Register pages. New `/register` public route in `routes.tsx`.
- **Seed Account Password Change Enforcement** -- Seed/demo accounts now have `requiresPasswordChange = true` in the database. A new `passwordChangeGuard` Elysia plugin blocks all authenticated API requests (except `/auth/me`, `/users/me/password`, `/auth/logout`, `/auth/refresh`) with `AUTH_PASSWORD_CHANGE_REQUIRED` error until the user sets a new password. Frontend `ProtectedRoute` detects the flag and redirects to a dedicated `ForcePasswordChangePage` at `/change-password`.
- **Explicit Function Return Type Lint Rule** -- Added `@typescript-eslint/explicit-function-return-type` as a warn-level ESLint rule (with `allowExpressions`, `allowTypedFunctionExpressions`, `allowHigherOrderFunctions`, `allowDirectConstAssertionInArrowFunctions` enabled). Resolved all warnings across backend services by adding return type annotations.

### Changed

- **Database Schema** -- Added `requires_password_change` boolean column to `users` table (default `false`), with migration `20260212023646_cold_mandarin.sql`.
- **Seed Data** -- Seed user records now set `requiresPasswordChange: true` for all default accounts.
- **Error Codes** -- Added `AUTH_PASSWORD_CHANGE_REQUIRED` to `AUTH_ERROR_CODES` constant.
- **OpenAPI Response Helpers** -- Added explicit return type annotations to `notFoundExample`, `badRequestExample`, `conflictExample`, `dataExample`, and `paginatedExample` in `responseExamples.ts`; introduced `OpenApiResponseObject` interface.
- **Service Return Types** -- Added explicit return type annotations to functions in `apiKeyService`, `dashboardExportService`, `dashboardTemplateService`, `businessMetricsService`, `alertNotificationService`, `notificationCrud`, `notificationPreferenceService`, `userCrud`, and `dbHelpers` (exported `PaginatedResult` type).
- **Config Defaults** -- Expanded compact JSON in `defaults.json` for consistency; increased `crawlMaxDepth` from 3 to 6 in testing config.

## [2.1.0] - 2026-02-11

### Added

- **Targeted Crawl Testing** -- `crawltest.ts` now supports `--page <route>` to test a single page (skipping route discovery), `--start-from <route>` to discover all routes but only test those matching a prefix, and `--404` to verify the 404 page renders without error boundaries.
- **Seed Module Extraction** -- Seed logic extracted from monolithic `seed.ts` into `backend/src/db/seed/` module with separate files for types, constants, users, and workspaces, improving reusability for downstream apps.
- **Config Defaults Expansion** -- Added default configuration sections for `alerting` (email, webhook, in-app), `dashboards` (enabled, maxPerUser, sharing), `logging` (file rotation, level), and `retention` (per-table retention days).
- **Docker Config Schema** -- Added `docker.appdataRoot` and `docker.backupsRoot` to config schema and defaults, allowing Docker volume paths to be configured rather than hardcoded.
- **Smoke Log File Support** -- `smoke.json` steps now support a `logFile` property; `smoke.ts` tees stdout/stderr to the specified log file while preserving console output, replacing shell-level `Tee-Object` piping.

### Fixed

- **SMTP Hardcoded App Name** -- SMTP test email routes now use `getConfig().app.name` instead of hardcoding "Spernakit v2" in subject lines and body text.
- **Demo Service Config Key** -- `demoService.ts` now references `crawlLoginEmail`/`crawlLoginPassword` instead of the removed `checkPageEmail`/`checkPagePassword`.
- **CORS Default Origin** -- Restored `http://localhost:3330` to `cors.frontendDevOrigins` defaults, fixing dev-mode CORS after v2.0.3 cleared the array.

### Changed

- **crawltest Consolidation** -- Removed `check-page.ts` (minimal Puppeteer smoke test) and renamed `crawl-and-test.ts` to `crawltest.ts`. All page validation is now handled by the crawler. Renamed npm scripts: `crawl-test` → `crawltest`, `crawl-test:preview` → `crawltest:preview`. Removed `check-page-dev` and `check-page-preview` scripts.
- **Testing Config Key Rename** -- Renamed `testing.checkPageEmail`/`testing.checkPagePassword` to `testing.crawlLoginEmail`/`testing.crawlLoginPassword` across config schemas, defaults, example config, and all consuming scripts.
- **Docker Compose Production** -- Removed hardcoded defaults from `docker-compose.production.yml`; all values (`APP_SLUG`, `FRONTEND_PORT`, `BACKEND_PORT`, `APPDATA_ROOT`, `BACKUPS_ROOT`) are now required env vars, set by `smoke.ts` from app config.
- **Docker Compose Dev** -- Config volume changed from read-only (`:ro`) to read-write; logging block repositioned after healthcheck.
- **Smoke Runner Env Export** -- `smoke.ts` now exports `APP_SLUG`, `FRONTEND_PORT`, `BACKEND_PORT`, `APPDATA_ROOT`, and `BACKUPS_ROOT` as environment variables (with explicit `env: { ...process.env }` in `Bun.spawn`) so docker compose commands inherit config-driven values.
- **App Description Update** -- Default `app.description` changed from "Self-Hosted Admin Application Template" to "Self-Hosted Multi-User Application Template".
- **AGENTS.md Removed** -- Deleted `AGENTS.md` from repo root; content consolidated into parent-level `CLAUDE.md`.

### Documentation

- Updated DEVELOPMENT.md, TESTING.md, STACK.md, GETTING_STARTED.md, TROUBLESHOOTING.md, CONFIGURATION.md, and scripts/readme.md to reflect `crawltest` rename, new CLI options, and removal of `check-page` scripts.
- Updated `smoke.md` mode descriptions and step lists for crawltest consolidation.
- Updated CHANGELOG-v1.md and CHANGELOG.md historical references from `crawl-and-test.ts` to `crawltest.ts`.

### Dependencies

- `elysia` 1.4.23 → 1.4.24
- `@tanstack/react-query` 5.90.20 → 5.90.21
- `@types/bun` 1.3.8 → 1.3.9
- `@types/node` 25.2.2 → 25.2.3
- `@types/react` 19.2.13 → 19.2.14
- `@vitejs/plugin-react` 5.1.3 → 5.1.4

## [2.0.4] - 2026-02-09

### Added

- **Supertest Script** -- Added `bun run supertest` as a full validation chain that runs `smoke:qc && smoke:dev && smoke:docker-local && smoke:docker-prod` sequentially, stopping on first failure.

### Fixed

- **Lucide Aliased Imports** -- The `lucideDirectImports` Vite plugin now correctly handles aliased imports (`import { Server as ServerIcon } from 'lucide-react'`), preserving the local alias in the generated direct import.
- **Docker Port Defaults** -- `docker/start.sh` no longer overrides `BACKEND_PORT`/`FRONTEND_PORT` with hardcoded defaults, allowing dynamic port configuration from the config file to take effect.
- **Sidebar Nav Overflow** -- Added `overflow-y-auto` to sidebar navigation, preventing nav items from overflowing when many items are present.

### Changed

- **Config Example Enhancements** -- Updated `spernakit.json.example` with database maintenance options (backup scheduling, integrity checks, vacuum), descriptive `PRODUCTION_CHANGE_REQUIRED-*` security placeholders, `image/svg+xml` in allowed upload MIME types, and refined crawl testing defaults.
- **Prettier Ignore** -- Excluded `config/*.json.example` from Prettier formatting to preserve intentional formatting choices.

### Documentation

- Fixed `docs/template/advanced/DEVELOPMENT.md` path references to `docs/template/DEVELOPMENT.md` across AGENTS.md, backend/README.md, and frontend/README.md.
- Added `supertest` documentation to TESTING.md and DEVELOPMENT.md with step-by-step descriptions of each validation stage.

## [2.0.3] - 2026-02-09

### Fixed

- **Recharts Infinite Render Loops** -- Replaced `ResponsiveContainer` with a custom `useContainerWidth` hook using `ResizeObserver` + `requestAnimationFrame` in MetricChart and HealthTimeline, fixing infinite render loops with React 19 + StrictMode + React Compiler.
- **Recharts Cell Deprecation Crash** -- Removed deprecated `Cell` component from HealthTimeline (recharts v3); per-bar colors now use the `fill` property in data points directly, eliminating infinite `setState` loops in `Bar.componentDidUpdate`.
- **Health Config Mutation Flicker** -- Added optimistic updates with rollback to `useHealthChecks` `updateConfigMutation`, preventing UI flicker on health settings toggles.
- **Health Metrics Dependency Array** -- Fixed `useMemo` dependency in `useHealthChecks` to use `metricsData?.data` instead of the full query object, preventing unnecessary recomputation.
- **User Settings Double-Serialization** -- Fixed `updateUserUiSettings` passing `JSON.stringify(params)` as body (double-encoding); now passes the object directly for `apiClient` to serialize.
- **CORS Frontend Origin** -- `configLoader` now auto-adds `server.frontendUrl` to `cors.frontendDevOrigins`, ensuring CORS allows requests from the configured frontend without hardcoding ports. Default `frontendDevOrigins` changed from `["http://localhost:3330"]` to `[]`.
- **Auth Test Fragility** -- Test helpers and auth tests now read cookie names from config (`getConfig().security`) via a new `getCookieNames()` helper instead of hardcoding `spernakit_auth`/`spernakit_refresh`.
- **Web Vitals Console Type** -- `check-page.ts` and `crawltest.ts` now capture Web Vitals from both `console.log` and `console.debug` messages (Vite dev mode emits as debug).

### Changed

- **MetricChart Memoization** -- Wrapped `MetricChart` and `HealthTimeline` in `React.memo`; memoized `domain`, `tickFormatter`, and tooltip content to prevent unnecessary re-renders under `'use no memo'` directive.
- **Removed chartUtils `'use no memo'`** -- The directive was unnecessary in `chartUtils.tsx` since it only contains wrapper components, not recharts consumers.
- **Vite Build-Time Constants** -- Frontend branding (`__APP_NAME__`, `__APP_SLUG__`) now injected via Vite `define` from `defaults.json`, replacing hardcoded references in Sidebar, MobileNav, storageKeys, and correlationId. Added `vite-env.d.ts` type declarations.
- **Docker Config Discovery** -- `docker/start.sh` now reads the app slug from `defaults.json` dynamically to resolve the config file path, instead of hardcoding `spernakit.json`.
- **Dockerfile Copy Fix** -- Added `scripts/load-json-config.ts` to the Docker COPY layer alongside `migrate.ts`.
- **Setup Script Simplification** -- Removed ~30 hardcoded regex replacements from `setup.ts` (cookie names, storage keys, sidebar branding, smoke ports) that are now config-driven or Vite-injected. Setup now reads `spernakit_version` from `package.json` for version tracking.
- **crawltest Rewrite** -- Complete rewrite of the site crawler: multi-pass route discovery via link scraping, per-route content assertions (min length, heading, error page detection), interactive element testing (buttons, switches, selects, dialog triggers), skip patterns for destructive actions, optional page screenshots, and test dashboard lifecycle management.
- **Smoke Port Tokenization** -- `smoke.json` now uses `{{FRONTEND_PORT}}`/`{{BACKEND_PORT}}` tokens substituted at runtime from app config, removing hardcoded port references. Added `--screenshot-pages` pass-through flag.
- **Seed Script Comment** -- Updated seed script docstring to reflect domain seed data.

### Dependencies

- `elysia` 1.4.22 → 1.4.23
- `pino` 10.3.0 → 10.3.1
- `drizzle-kit` 0.31.8 → 0.31.9
- `eslint-plugin-unused-imports` 4.3.0 → 4.4.1
- `typescript-eslint` 8.54.0 → 8.55.0

## [2.0.2] - 2026-02-09

### Fixed

- **Dashboard Widget Crashes** -- Added null-safe checks on `dashboardData.metrics` in GaugeWidget and StatCardWidget, preventing crashes when dashboard data is not yet loaded.
- **Chart Empty Data Crashes** -- ChartWrapper now returns early with a "No data available" message instead of passing empty arrays to recharts, which caused rendering exceptions.
- **Dashboard Data Defaults** -- `useWidgetData` now provides sensible default values when dashboard query data is undefined, eliminating undefined-property access errors.
- **SMTP API Client Consistency** -- Migrated `frontend/src/api/smtp.ts` from raw `fetch()` to the shared `apiClient`, ensuring CSRF protection, token refresh, request deduplication, and error handling are applied to all SMTP API calls.
- **Smoke Script Import** -- Fixed import extension from `.js` to `.ts` for `smoke-cache` in `scripts/smoke.ts`.

### Changed

- **WebSocket Singleton Manager** -- Refactored `useWebSocket` from hook-internal refs to a `WebSocketManager` singleton class, preventing duplicate WebSocket connections across React re-renders and strict-mode double-mounts.
- **React Compiler Opt-Out for Charts** -- Added `'use no memo'` directives to all recharts-consuming components (BarChartWidget, LineChartWidget, MetricChart, HealthTimeline, chartConstants, chartUtils) to prevent the React Compiler from breaking recharts' internal ref handling.
- **Chart Render Performance** -- Extracted inline object literals (margins, tick styles, radii, domains, active dot config) to module-level constants across all chart components, eliminating unnecessary re-renders from unstable references.
- **Database Config Defaults** -- Added default configuration for database backup (24h interval, 30-day retention), integrity checks (quick mode, 6h interval), and vacuum (24h interval) in `defaults.json`.

## [2.0.1] - 2026-02-08

### Security

- **OAuth Token Encryption** -- AES-256-GCM encryption for OAuth access and refresh tokens at rest, preventing token exposure if the database is compromised. Each record uses a random salt and IV.
- **PKCE for OAuth Providers** -- Proof Key for Code Exchange (S256) implemented for GitHub, Google, and Microsoft OAuth flows to prevent authorization code interception attacks.
- **Production Secret Validation** -- Config validation now enforces entropy, minimum length (32 chars), and unique character ratio for all security secrets in production mode. Placeholder format updated to `PRODUCTION_CHANGE_REQUIRED-*`.

### Added

- **Auto-Generated Secure Keys** -- First-run setup automatically generates cryptographically secure values for `jwtSecret`, `jwtRefreshSecret`, `encryptionKey`, `cookieSecret`, and `applicationApiKey`.
- **Dynamic App Slug Resolution** -- App slug is now derived from `defaults.json` or the config directory structure, replacing hardcoded references in database paths, cookie names, and Docker configs. Enables multi-instance deployments.
- **Dynamic Branding in Setup** -- Setup script substitutes the app name into `docker-compose`, backend SMTP settings, and frontend navigation components.
- **Configurable Docker Deployment** -- GitHub Container Registry (`ghcr.io`) support. Container names, ports, and volume paths configurable via environment variables. Bind mounts with configurable `APPDATA_ROOT` and `BACKUPS_ROOT` replace named volumes.
- **Package Metadata** -- Added author, repository, homepage, and license fields to backend and frontend `package.json`. Engines now include Node >= 22.0.0.

### Changed

- **Custom Transactional Migration System** -- Replaced drizzle-kit migrations with a custom migration script supporting proper transaction handling. Docker entrypoint updated to use the new migration command with automatic seeding.
- **Standardized API Response Handling** -- All API calls now use a consistent `DataResponse` wrapper type, accessing `response.data` instead of raw responses.
- **ESLint 10 Upgrade** -- Updated ESLint to v10 with `eslint-plugin-perfectionist` replacing `simple-import-sort` and `sort-keys-fix` for consistent alphabetical sorting of imports, object/interface properties, function parameters, JSX props, and type unions.
- **Dynamic Vite Dev Server Ports** -- Dev server ports now read from backend `defaults.json` instead of hardcoded values.
- **Health Check Endpoints** -- Docker health checks use `127.0.0.1` instead of `localhost` for reliability.

### Fixed

- **Test Setup Reference** -- Removed non-existent `happy-dom.ts` preload from `bunfig.toml`, keeping existing `setup.ts`.
- **Outdated Migration Docs** -- Fixed Prisma references in `smoke.md` to correctly reference Drizzle.
- **Seed Script Logging** -- Replaced `console.error()` with `logDatabase()` for consistent structured logging.
- **lucide-react Build** -- Excluded `lucide-react` from Vite `optimizeDeps` to resolve frontend build issues.

### Documentation

- Comprehensive API reference covering OAuth, API keys, workspaces, dashboards, files, tasks, business metrics, health checks, backup, and SMTP.
- CSRF token handling specification added to API standards.
- Workspace-level RBAC documentation added to RBAC guide.
- Migration workflow docs now distinguish development (`db:push`) from production (`db:migrate`).
- Scripts documentation updated for process management (`start.ts`, `stop.ts`), log clearing, and smoke test caching.
- Updated Docker commands to `docker compose` syntax throughout.

## [2.0.0] - 2026-02-07

Complete rewrite of the Spernakit application template. See [MIGRATION_V1_TO_V2.md](MIGRATION_V1_TO_V2.md) for a full mapping of v1 concepts to v2 equivalents.

### Highlights

- **Backend Framework** -- Express replaced by Elysia with plugin-based middleware architecture
- **Database** -- Prisma ORM replaced by Drizzle ORM with TypeScript-native schema definitions
- **Frontend UI** -- DaisyUI replaced by shadcn/ui component library
- **CSS Framework** -- Tailwind CSS v3 upgraded to Tailwind CSS v4 with CSS-based configuration
- **Logging** -- Winston replaced by Pino structured logger
- **HTTP Client** -- Axios replaced by native fetch with typed `apiClient`
- **Forms** -- Manual `useState` patterns replaced by react-hook-form
- **Toasts** -- react-hot-toast replaced by sonner
- **Controllers** -- Removed entirely; logic moved to route handlers + service layer
- **Guards** -- New authorization guard system extracted from middleware
- **Storage** -- New file storage adapter layer (local + S3)
- **Config** -- Environment variables replaced by JSON configuration via `configLoader`

---

For v1 changelog history (1.0.0 through 1.8.0), see [CHANGELOG-v1.md](CHANGELOG-v1.md).
