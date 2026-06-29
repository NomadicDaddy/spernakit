# Changelog

All notable changes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.13.0] - 2026-06-29

### Added

- **Dashboard activity and alerts panels** - the admin overview now surfaces a Recent Activity
  panel (the latest audit-log entries, loaded with global scope for SYSOPs) and an Active Alerts
  panel (unresolved health-check alerts, styled by severity), both rendered for ADMIN and above
  beneath the existing metrics and historical-trend sections.
- **Stat-card sparklines and direction-aware trends** - stat cards can now render an inline
  sparkline of a recent series alongside a trend indicator whose arrow tracks the real direction
  while its color reflects whether the movement is good, so rising resource-utilization metrics
  (CPU, memory) read as a warning; CPU and memory history is wired into the dashboard's system
  metric cards.
- **Page-header breadcrumbs** - the shared page-header primitive gained an optional, accessible
  breadcrumb trail (navigable parent links with the current page marked via `aria-current`), now
  shown on the Workspace Settings page.

## [3.12.0] - 2026-06-28

### Added

- **Automated ASSERT-010 database-location guard** - local SQLite/PostgreSQL database files
  are now verified to live under the project-root `data/` directory: startup refuses to open
  an out-of-tree SQLite database and a new `check:db-location` gate (wired into `smoke:qc` and
  CI) fails the build on any violation, replacing the previous policy-only assertion.
- **Database-level enum CHECK constraints** - every enum/status column (user role, API-key
  scope, MFA method, scheduled-task status, bug-report kind/status, OAuth provider) now carries
  a named CHECK constraint in both the SQLite and PostgreSQL dialects, so out-of-domain values
  are rejected at the database layer instead of only by the ORM.
- **Docker runtime CI gate** - CI now boots the containerized app and runs the
  crawltest/compression runtime path that previously never executed; image publishing is
  blocked when the runtime crawl fails.
- **Security-infrastructure drift enforcement** - `check:drift` now hard-fails in derived apps
  when security-critical template files (the auth route, security config schema, and
  `create-api-app`) are gutted or removed, while advisory infrastructure drift remains a
  non-failing warning and intentional divergence can be acknowledged via `.templateoverrides`.
- **PowerShell tooling parity** - added PowerShell equivalents of the shell tooling (`init.ps1`,
  `run.ps1`, `reset.ps1`, `sync.ps1`, `changes.ps1`) and the `spernakit.psd1` module manifest so
  the template can be scaffolded and operated natively on Windows.

### Changed

- **Database-admin panel gating** - the database-admin kill-switch (`databaseAdmin.enabled`) is
  now surfaced in the redacted runtime-config snapshot and consumed by the Settings > Database
  tab, which conditionally renders the panel with loading/disabled states when the feature is
  off; panel authorization was raised from ADMIN to SYSOP.
- **LTS line rebranded to v3.11** - version references, baseline snapshots, policy documents,
  ADRs, and surface-guard scripts now reflect v3.11.0 as the current LTS tag, with
  successor-line language generalized and ADR-010 marked superseded by the current LTS policy.
- **README restructure** - rewrote and expanded the README around a source-of-truth reference
  table.

### Security

- **Account-lockout denial-of-service fix** - token refresh is now decoupled from account
  lockout: refresh tokens issued before a lock keep rotating, so an attacker can no longer end a
  victim's already-authenticated session by tripping the lock with bad-password attempts
  (sessions are still revoked on reuse detection, account deletion, and password change). The
  default lockout threshold was raised to the per-account rate limit plus one so the rate
  limiter absorbs a bad-password flood before the hard lock trips, while new-login lockout
  continues to protect password logins.

## [3.11.0] - 2026-06-27

### Added

- **Settings runtime configuration overview** - SYSOP users can now inspect a read-only,
  redacted snapshot of the effective startup configuration from Settings and the command
  palette without exposing secrets or creating a second configuration source of truth.
- **Notification retention policy endpoint** - ADMIN users can now view the active
  deleted-notification retention window from server configuration instead of relying on
  hardcoded Settings copy.
- **Tracked product-decision blockers** - added remediation records for account-lockout
  denial-of-service mitigation, security-infrastructure drift enforcement, and canonical
  `affectedFiles` metadata policy so the unresolved decisions are visible in the roadmap.

### Changed

- **Authentication settings parity** - Settings > Authentication now exposes
  self-registration and password history depth controls end to end, including typed API
  payloads, dirty-state tracking, and dedicated UI sections.
- **System Health settings parity** - the health configuration UI now covers alert
  enablement, alert severity threshold, disk free-space thresholds, the disk check toggle,
  and client-side threshold validation before optimistic updates are sent.
- **Dependency baseline refresh** - refreshed pinned backend, frontend, and tooling
  packages across the workspace, including Elysia, PostgreSQL, Nodemailer, Radix UI,
  TanStack Query/Virtual, React Router, Recharts, Vite, ESLint, Prettier, Knip, Puppeteer,
  and TypeScript-ESLint.
- **Generated artifact cleanup** - removed generated feature audit report output and stale
  migration-history data from the tracked tree.
- **Release policy note** - this release documents already-landed changes as an explicitly
  approved exception to the v3.8 LTS patch-only policy.

### Fixed

- **Live password-policy validation** - password forms now read the active
  `requireSpecialCharacter` flag from the public registration-status endpoint so client
  validation matches the server policy while retaining a strict fallback during loading.
- **Notification retention display** - removed the unsupported "read notifications are kept
  for 90 days" claim and replaced the deleted-notification value with config-backed
  read-only display.

## [3.10.0] - 2026-06-11

### Added

- **`feat(a11y)` screen-reader announcements for SPA navigation** — new `useRouteAnnouncement` hook updates `document.title` and moves focus to the `#main-content` landmark on every route change (skipping initial load to preserve autofocus); all three layout shells' main regions are now programmatically focusable, the notification bell announces unread-count increases via a polite live region, virtualized tables expose `aria-rowcount`/`aria-rowindex` and row/cell roles, and the reset-password form wires field errors with `aria-describedby`/`aria-invalid`.

- **`feat(admindb)` database-admin kill-switch, off by default** — new `databaseAdmin.enabled` config option (default `false`); every database-admin route returns 404 unless the operator explicitly opts in per environment. The admin panel also refuses writes to append-only system tables (`audit_logs`, `scheduled_task_executions`) and validates JSON columns before writes.

- **`feat(db)` migration tamper detection and integrity verification** — migrations record a SHA-256 hash of their SQL at apply time; startup warns when a previously applied file's content changed (never re-runs) and rejects unknown journal hashes, forcing manual reconciliation. Table-rebuild migrations toggle foreign keys outside the transaction and verify `PRAGMA foreign_key_check` before commit, rolling back on violations.

- **`feat(files)` orphaned-upload sweep** — a scheduler task removes local-storage files older than 24 hours with no matching `file_uploads` row (leftovers from crashed uploads), batch-limited and reported to the audit log; cleanup hard-deletes rows only after the blob delete is confirmed so failures retry instead of orphaning blobs.

- **`feat(qc)` LTS lockfile freeze guard** — new `check:lockfile-frozen` verifies `bun.lock` against a SHA-256 baseline in `docs/lts-baseline/` (intentional bumps via `LTS_LOCKFILE_BUMP=1`), and `reset-packages` now preserves the lockfile with `--frozen-lockfile`.

- **`feat(qc)` bundle budget tracking** — `verify-minification.ts` rewritten around live asset scanning with per-bundle maximum sizes tracked in `scripts/bundle-budget.json` (`--update-budget` for intentional growth), and `verify-compression.ts` gains a `--mode` flag that warns in dev but hard-fails in docker modes.

- **`feat(shared)` single source of truth for password policy** — `shared/src/passwordPolicy.ts` exports the complexity rules and validator consumed by backend validation and every frontend password form (register, reset, profile, create-user, strength indicator).

- **`feat(core)` graceful shutdown drain budget and root error handler** — shutdown drains in-flight HTTP requests within a budget before WebSocket/scheduler teardown, and paths outside the `/api/v1` chain get a root-level 404/error handler.

- **`docs(template)` v3.8 → v3.9 migration guide** — new `MIGRATION_V38_TO_V39.md` covering the 300-line gate, module decompositions, stricter TypeScript options, and the Node 24 / Bun 1.3.14 platform floor.

### Changed

- **`refactor(frontend)` query lifecycle hygiene** — QueryClient configuration extracted to `lib/queryClient.ts` with global error toasts fired from cache handlers after retries complete (mutations with their own `onError` suppress the global toast); `ErrorBoundary` integrates `QueryErrorResetBoundary` so retry clears cached query errors; switching workspaces cancels in-flight workspace-scoped queries so stale `X-Workspace-ID` responses cannot land.

- **`chore(runtime)` Bun 1.3.14 across CI and Docker** — workflow and both Dockerfile stages bumped with updated image digests; `supervisord` `stopwaitsecs` raised to 20s so the app's 15s graceful-shutdown budget completes before SIGKILL.

- **`chore(qc)` stricter quality gates** — `check-dependency-versions` enforces exact pins across all workspaces including `overrides`/`resolutions` (esbuild pinned `0.25.12`); `check-destructive-confirmation` uses windowed matching on concrete confirm primitives; `check-process-env` catches bracket access, `Bun.env`, and `.tsx` files; `check-template-drift` gains a `DRIFT_REQUIRED=1` override and non-failing infrastructure-drift warnings; `check-docs` joins `smoke:qc`; `reset-database` refuses `NODE_ENV=production` and requires `--force` when user rows exist.

- **`feat(health)` readiness cache split** — `/health/ready` uses a 5-second cache TTL so orchestrators detect database outages quickly while liveness `/health` keeps 60s; readiness deliberately stays 200 on degraded memory/disk to avoid routing thrash.

- **`refactor(db)` postgres dialect fails explicitly** — `db/index.ts` throws an unsupported-at-runtime error for the postgres dialect instead of mis-casting `NodePgDatabase` to the SQLite type (false-green).

- **`docs(template)` reference docs realigned with current behavior** — API key scopes/role capping and the newline-delimited signature payload, MFA verify and readiness endpoints in the API reference, new `alerting`/`logging`/`retention`/`dashboards`/`databaseAdmin` configuration sections, RBAC matrix corrected to actual enforcement (user CRUD is ADMIN+), and security-finding resolution notes in `SECURITY.md` and the internal audit reports.

### Fixed

- **`fix(backup)` WAL-safe snapshots and restore connection handling** — pre-migration and restore snapshots use `wal_checkpoint(TRUNCATE)` + `VACUUM INTO` for single-file consistency; restore closes both the main and read-only admin connections before replacing the database file and removes `-wal`/`-shm` sidecars; backup filename timestamps parse as UTC (fixes retention age math on non-UTC servers); retention always keeps the N newest.

- **`fix(files)` atomic local-storage writes** — uploads write to a UUID-suffixed temp file and rename, so a crash mid-write no longer leaves partial blobs at the final key.

- **`fix(email)` fire-and-forget senders never throw** — `sendEmail`, `sendEmailWithRetry`, and `sendAlertWithRetry` catch and log all failures (including config-load errors and retry exhaustion) instead of crashing the process with unhandled rejections.

- **`fix(oauth)` 10-second timeouts on provider calls** — token exchange, profile fetch, email list, and the settings-page connectivity test all abort after 10s instead of hanging on slow or unreachable providers.

- **`fix(core)` concurrent-request duration tracking** — request start times moved to a `WeakMap` keyed by the request object, so concurrent requests no longer corrupt each other's logged durations.

- **`fix(scripts)` Windows process kill** — replaced the nonexistent `sleep` binary with `Bun.sleepSync` and aligned the graceful-kill window with the app's shutdown budget.

- **`fix(scripts)` config backup pruning** — `generate-keys` keeps only the newest 3 `*.json.backup.*` files so rotated secrets stop accumulating on disk; backups are also dockerignored.

### Security

- **`fix(security)` API keys can no longer out-rank their owner** — the effective role is capped at the owner's current role at validation time, creation rejects scopes above the target user's role, and validation rejects keys whose owner is locked out or soft-deleted. The HMAC signature payload is newline-delimited (`timestamp\nmethod\npath\nbody`) to eliminate ambiguous payload boundaries, CSRF validation skips header-authenticated API-key requests, and audit entries from API-key requests are attributed to the key's owner.

- **`fix(security)` uniform login failures** — every login failure mode (bad credentials, expired password, locked or deleted account) returns `AUTH_INVALID_CREDENTIALS`, and the timing-normalization dummy hash is generated with the configured bcrypt cost, closing account-enumeration and timing signals.

- **`fix(security)` MFA challenge tokens via URL fragment** — OAuth MFA redirects carry the token in the fragment (`#mfaToken=...`) so it never reaches server logs; the verify page falls back to the query parameter for one release.

- **`fix(security)` impersonation hardening** — stopping impersonation re-validates that the original impersonator still holds SYSOP, and access-token revocation receives Unix seconds (was milliseconds), fixing the revocation window.

- **`fix(security)` proxy header trust requires a trusted peer** — `X-Forwarded-For`/`X-Real-IP` are honored only when the direct socket peer is itself a trusted proxy, so direct clients cannot spoof their IP when `trustProxy` is enabled.

- **`fix(security)` rate-limit eviction hardening** — the in-memory store evicts expired entries first, then non-throttled entries, then oldest, so attackers cannot evict their own throttled bucket by churning fresh keys.

- **`fix(security)` WebSocket fail-closed subscribe and live per-IP counts** — per-IP connection limits derive from the live tracked-connections map (no drift on aborted connections) and subscribe rejects when no tracked connection exists.

- **`fix(security)` session hygiene on logout and user deletion** — logout clears the query cache and resets per-user UI preference stores so the next user sees nothing of the previous session; soft-deleting a user refuses while they own workspaces and revokes their refresh-token hash and CSRF token; password-reset rate limiting no longer logs the email address.

- **`feat(security)` backup encryption key enforcement** — `security.backupEncryptionKey` (minimum 64 chars) joins secret validation, is generated by `generate-keys` and the Docker bootstrap, and `security.mfaPrivateKey` joins the secrets policy; placeholder detection now uses explicit markers; `schemaVersion` is removed from the unauthenticated `/health` response.

## [3.9.0] - 2026-06-10

### Added

- **`feat(qc)` enforced 300-line max-lines gate** — new `scripts/check-max-lines.ts` runs in `smoke:qc` (`check:max-lines`) and in the CI quality job, failing the build if any tracked `.ts`/`.tsx` source file under `backend/src`, `frontend/src`, `shared/src`, or `scripts` exceeds 300 lines. Hard ceiling, no grandfather list: every previously-oversized file was split below the threshold in the same change. `docs/template/DEVELOPMENT.md` updated to document the enforced rule, replacing the advisory guideline and removing the orchestration-only page-component exemption (which no component used).

### Changed

- **`refactor(scripts)` single-command crash recovery for `bun run start`** — `start.ts` no longer unlinks stale `backend.pid` itself; it invokes `stop.ts` with a `--from-start` flag, which cleans up stale backend and frontend PID files and treats a stale PID with no live process as the normal recoverable case, so one `bun run start` recovers from a silent crash.

- **`chore(tsconfig)` stricter compiler options across the workspace** — `erasableSyntaxOnly` and `noUncheckedSideEffectImports` enabled in all workspace tsconfig files, with `verbatimModuleSyntax` added to the backend and scripts configs.

- **`chore(deps)` dependency bumps across the workspace** — lru-cache, nodemailer, @tanstack/react-query, @tanstack/react-virtual, lucide-react, react-router-dom, web-vitals, zustand, vite, eslint, eslint-plugin-jsdoc, knip, puppeteer, and typescript-eslint to latest patch/minor versions, plus follow-up frontend and root dev-dependency bumps.

- **`refactor(scripts)` 18 oversized scripts split below the 300-line gate, entrypoints preserved** — `migrate.ts` (1062→106) extracted into `scripts/lib/migrate/`; `template-shared.ts` (806→41) became a pure re-export facade over `scripts/lib/template/`; `smoke-cache.ts` (663→216) and `smoke.ts` (530→207) extracted into `scripts/lib/smoke-cache/` + `scripts/lib/smoke/`; `setup.ts`/`start.ts`/`stop.ts` extracted into `scripts/lib/setup/` + `scripts/lib/process/`; `crawltest.ts` and satellites gained `crawltest-{bugreport,crawler,elements,events,session,visit}.ts`; `check-application.ts`, `validate-api-types.ts`, `load-json-config.ts`, `optimize-images.ts`, and `codemod-barrel-imports.ts` extracted into matching `scripts/lib/` modules; `scripts/spernakit-browser/{daemon,snapshot,actions}.ts` split into five sibling submodules. All CLI flags, export surfaces, and entrypoint paths unchanged; smoke-cache dependency globs updated to track the new `scripts/lib/` paths.

- **`refactor(core)` four app-source modules split below the 300-line gate** — `backend/src/services/user/userCrud.ts` (340→257, extended `userCrudHelpers.ts`), `frontend/src/lib/websocket/manager.ts` (329→277, new `reconnect.ts` with `ReconnectScheduler`), `backend/src/routes/dashboards/templates-import.ts` (321→230, new `templates-import.helpers.ts`), `backend/src/services/backup/backupRestore.ts` (313→199, new `backupRestoreHelpers.ts`). Export surfaces unchanged; no importers touched.

### Fixed

- **`fix(scripts)` LTS surface guard skips scaffolded apps** — `check:lts-surface` now exits gracefully with a skip message when `docs/lts-baseline/` is absent instead of ENOENT-failing `smoke:qc` in freshly scaffolded apps, which have no LTS contract.

## [3.8.2] - 2026-05-27

### Added

- **`docs(admindb)` Integrated Database Administration Suite design specification** — `docs/template/ADMIN_DB.md` lands as the canonical design doc for the SYSOP/ADMIN-facing database admin subsystem (schema introspection, paginated data viewer, read-only SQL sandbox, safe-mode toggle). Covers the existing `admindb-*` feature group (introspection service, API routes, schema explorer, data viewer, SQL sandbox) end-to-end so the implementation has a single source of truth for future evolution.

- **`docs(aidd)` backfilled feature blueprints for shipped capabilities** — `.aidd/features/audit-logs/feature.json` and `.aidd/features/dashboard-import-export/feature.json` were added by the feature-coverage audit on 2026-05-27 so the feature catalog matches the implementation surface. Both subsystems shipped before v3.8.0 but never had dedicated blueprints; the new files reverse-engineer full acceptance specs from the current code and are slotted into the v2.0 milestone in `.aidd/roadmap.json`.

### Changed

- **`chore(deps)` exact `only-allow` manifest pins** — root, backend, and frontend package manifests now declare `only-allow` as exact `1.2.2` so the v3.8 LTS dependency guard passes without changing the frozen lockfile.

- **`chore(tooling)` track `.aidd/status.md` and exempt `VERSION` from prettier** — `.aidd/status.md` removed from `.gitignore` and `.prettierignore` so it can be committed as a tracked artifact; `VERSION` added to `.prettierignore` so a future plain-text version file would not be reformatted.

- **`chore(scripts)` check-docs ignores `.claude/`** — `scripts/check-docs.ts` now skips the `.claude` directory alongside `.aidd`, `.git`, and the other agent/build folders, so harness configuration files no longer surface in documentation hygiene scans.

### Fixed

- **`fix(scripts)` pass essential Windows native env vars to spawned children** — `scripts/start.ts` and `scripts/smoke.ts` `CHILD_ENV_KEYS` allowlist now includes `COMSPEC`, `LOCALAPPDATA`, `PATHEXT`, `PROGRAMDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `PSMODULEPATH`, `SYSTEMDRIVE`, `SYSTEMROOT`, `TEMP`, `TMP`, and `WINDIR`. Without these the v3.8.1 environment restriction prevented PowerShell-launched child processes from resolving native binaries (`.cmd`/`.bat` extension matching, `where.exe` lookups, temp-file creation) on Windows hosts.

## [3.8.1] - 2026-05-20

### Added

- **`feat(devtools)` `sb file-upload` command** — `scripts/sb.ts` and the spernakit-browser daemon gained a `file-upload <@eN|selector> <path...>` action. Resolves Puppeteer's `ElementHandle.uploadFile` against either a snapshot ref or a raw selector (file inputs are usually hidden), validates the target is `<input type="file">`, and fires the `change` event React listeners depend on so dropzone components register the upload without further interaction.

### Changed

- **`refactor(images)` migrate image processing from sharp to Bun.Image** — `backend/src/services/imageService.ts` now uses the built-in `Bun.Image` API for thumbnail generation (`fit: inside, withoutEnlargement`, WebP quality 80) and `scripts/optimize-images.ts` does the same for WebP conversion and responsive variants. Removes `sharp` from root devDependencies and backend optionalDependencies; the dynamic-import availability probe is gone and `generateThumbnail` simply returns `null` on encode/decode failure.

- **`chore(runtime)` bump engines to Node `>=24.0.0 <25.0.0`, Bun `>=1.3.14`** — root, backend, frontend, and shared `package.json` engines aligned; `.nvmrc` bumped 22 → 24; `packageManager` pinned to `bun@1.3.14`.

- **`chore(install)` enforce bun via `preinstall: only-allow bun`** — added to root, backend, and frontend `package.json` so accidental `npm install` / `yarn install` fail fast.

- **`refactor(core)` split four oversized backend modules below the 300-line threshold** — `backend/src/utils/errorResponse.ts` extracted into `errorResponseBuilders.ts` + `errorTypes.ts`; `backend/src/services/notification/alertNotificationService.ts` split into `alertCooldown.ts`, `alertEmailNotification.ts`, `alertInAppNotification.ts`, `alertFormatting.ts`, `alertRetry.ts`; `backend/src/plugins/auth.ts` extracted into `authRequest.ts` + `authTokens.ts`; `backend/src/db/migrate/runner.ts` extracted into `discovery.ts`, `execution.ts`, `schemaVersion.ts`. Public entrypoints preserved.

- **`chore(devops)` restrict child process environments** — `scripts/start.ts` and `scripts/smoke.ts` no longer spread full `process.env` into spawned children; they build a minimal allowlisted runtime/config environment instead.

- **`chore(tooling)` canonicalize config schema drift comparison** — `scripts/check-config-schema-drift.ts` now recursively sorts JSON keys before comparing committed `config/config-schema.json` against the Zod-generated schema, so formatter-driven key reordering no longer trips the drift check. The committed schema is re-emitted in canonical order.

- **`chore(deps)` frontend bumps** — react/react-dom/react-is 19.2.6, react-router-dom 7.15.1, zustand 5.0.13, vite 8.0.13, @vitejs/plugin-react 6.0.2, @tanstack/react-query 5.100.11, @tanstack/react-virtual 3.13.25, tailwindcss + @tailwindcss/vite 4.3.0, lucide-react 1.16.0, tailwind-merge 3.6.0, @types/node 25.9.1, @types/react 19.2.15.

- **`chore(deps)` backend bumps** — lru-cache 11.5.0, pg 8.21.0.

- **`chore(deps)` tooling bumps** — typescript-eslint 8.59.4, eslint 10.4.0, eslint-plugin-jsdoc 63.0.0, knip 6.14.1, puppeteer 25.0.4, @types/bun 1.3.14.

### Fixed

- **`fix(dashboard)` SYSOP global stats load with no active workspace** — dashboard query gate no longer blocks SYSOP users when `activeWorkspaceId` is null, so `/dashboard` renders the global `/system/dashboard` payload instead of falling back to zero-state values.

- **`fix(dashboards)` shared dashboards isolated from private metric data** — `allowPrivateData` threaded through the widget renderer and all widget components; shared dashboards skip private metric queries and render `No data` instead of zero-filled placeholders when metrics are unavailable.

- **`fix(dashboard)` keyboard-accessible widget reorder in edit mode** — custom dashboard widgets gained Move left/right/up/down buttons that work without a pointer drag, satisfying the accessible-reorder a11y audit while preserving the existing drag handle.

- **`fix(layout)` remove stray recharts measurement span from DOM** — a MutationObserver removes the `recharts_measurement_span` element recharts inserts into `document.body`, eliminating a standalone `0%` text node that surfaced on authenticated pages outside dashboard content.

- **`fix(websocket)` stop reconnect spam against unreachable backend** — reconnect attempts gated behind backend health and liveness polling; visible-tab and online retry signals only reopen the socket after health succeeds; a visible-tab heartbeat probe closes and retries stale-open sockets after backend restarts.

- **`fix(websocket)` quiet native failed-handshake warnings** — added a backend health preflight before opening browser WebSockets and deferred subscriber-driven disconnects so React StrictMode mount/unmount/remount cycles no longer cancel an in-flight connection.

- **`fix(auth)` gate notification queries on verified session** — a volatile verified-session flag now prevents persisted auth UI state from triggering header notification queries before `/auth/me` confirms the cookie-backed session, fixing the 401 burst on first load after a stale session.

- **`fix(auth)` report forgot-password email validity on submit** — empty and malformed email inputs now trigger native validity reporting instead of silently submitting.

- **`fix(auth)` demo account buttons submit the login form** — clicking a demo account now fills credentials and submits the form via `requestSubmit()`, matching the documented one-click behavior; manual credential submission still works.

- **`fix(auth)` singularize password policy day labels** — `1 day` vs `N days` for password expiry and minimum password age descriptions.

- **`fix(auth)` remove unconditional MFA verify autofocus** — MFA authenticator-code and recovery-code inputs no longer steal focus on mount, so mobile keyboards stay closed until the user taps a field.

- **`fix(email)` SMTP test form field names + email autocomplete** — recipient/subject/message gained browser-friendly `name` attributes; the recipient field uses `autocomplete="email"` while the controlled submit payload is preserved.

- **`fix(notifications)` clear loaded empty subtitle** — the notifications page subtitle reserves `Loading...` for the active loading state and shows `0 total notifications` only after an empty result has loaded.

- **`fix(layout)` TabLayout class order** — utility-class ordering normalized for `prettier-plugin-tailwindcss`.

### Security

- **`fix(security)` workspace membership guards on header-selected reads** — audit log reads, notification statistics/unread counts/read-all, and system dashboard aggregate reads now validate workspace membership before honoring the `X-Workspace-ID` header. Non-members receive 403; existing ADMIN/OPERATOR gates and SYSOP cross-workspace reads with no header are preserved.

- **`fix(security)` workspace membership guards on dashboard writes** — dashboard create, import, and from-template writes validate workspace membership before consuming `X-Workspace-ID`. Non-member operators receive 403; SYSOP global dashboard creation with no header is preserved.

## [3.8.0] - 2026-05-05 — LTS

**v3.8.0 — LTS** (terminal v3 release; patch-only going forward — see [`LTS.md`](LTS.md)).

### LTS

- **`chore(lts)` v3.8.0 designated as Long-Term Support** — LTS policy adopted (see [`LTS.md`](LTS.md) and [`adr/adr-010-v38-lts.md`](adr/adr-010-v38-lts.md)). Migration history squashed into a single baseline (pre-squash files preserved at `docs/lts-baseline/migrations-pre-squash/` for forensic reference; `isBenignDdlError` in `backend/src/db/migrate/runner.ts` lets existing v3.7.x databases pick up the squashed baseline cleanly). Full dependency pin pass — every `^`/`~` range across root, backend, and frontend `package.json` files replaced with exact versions. New guards added to `smoke:qc`: `check:lockfile-frozen` (gated by `LTS_LOCKFILE_BUMP=1` for intentional bumps), `check:lts-surface` (Zod config schema + template-manifest + process.env reads diffed against `docs/lts-baseline/`), `check:drift` promoted to hard-fail, `check:deps` runs universally. knip baseline is clean (zero unused files / deps / exports). Quality baselines captured under `docs/lts-baseline/` (OpenAPI snapshot, DB schema dump, dance-followups triage, pre-squash migrations).

### Changed

- **`refactor(api)` collapse 47 `.use()` calls into per-domain aggregators** — `create-api-app.ts` had 47 leaf `.use()` calls reaching into 9 domain barrels with order-sensitive registration documented inline. Each barrel now composes its own Elysia aggregator and exports just that, leaving `create-api-app` to register one `.use()` per domain. Dashboards aggregator preserves the templates-before-crud ordering invariant. Drops dead barrel re-exports surfaced by the refactor (`widgetSchema` from `dashboards/index`, `getAppFeatures`/`seedAppFeatureDefaults` from `settings/index`). `check-feature-integration.ts` now walks barrel `.use()` calls so leaf routes registered into a domain aggregator count as registered. OpenAPI spec still reports 137 endpoints; smoke:qc, smoke:dev (full crawltest), and check:feature-integration all green.

- **`refactor(dashboards)` collapse dialog booleans into discriminated union** — Both dashboard pages held 3-4 disjoint `useState` hooks for dialog visibility plus side-channel data (`deleteId`, `shareUrl`). Replaced with per-page `DialogState` unions making invariants explicit (only one dialog open at a time) and folding side-channel data into the variant that owns it. `editMode` stays a separate boolean (page mode, not dialog). Child dialog components untouched; parents pass close-only `onOpenChange`.

- **`refactor(smtp)` centralize config schema and defaults in smtpConfigService** — `smtpStatusService` had its own subset `SmtpConfigSchema`, `DEFAULT_SMTP_FIELDS`, and a hardcoded `'smtp_config'` key string — all duplicated from `smtpConfigService`. Drift risk: any field rename or default change had to land in two files. Now exports `SMTP_CONFIG_KEY`, `SmtpConfigSchema`, `DEFAULT_SMTP_CONFIG`, and the `SmtpConfig` type from `smtpConfigService`; status service derives its credentials subset via `SmtpConfigSchema.pick()` and `Pick<SmtpConfig, ...>` against `DEFAULT_SMTP_CONFIG` values.

- **`chore(tooling)` drop stale Lighthouse CI job, add knip dead-code script** — The `lighthouse:` job in `ci.yml` referenced `scripts/lighthouse.ts` and `lighthouserc*.json` — none of which exist anymore — so the job would have failed on first run. Removed the job entirely along with the `.lighthouseci/` ignore lines in `.gitignore` and `.prettierignore`. Added knip 6.11.0 as a pinned devDependency and exposed it as `bun run check:dead-code`. Baseline run is clean (exit 0, no findings).

- **`chore(tooling)` drop duplicate check-application from build, add qc:status alias** — `build` and `build:backend` each ran `check-application` defensively, causing it to fire three times per `smoke:qc` (once standalone, once via build, once via build:backend). Every workflow that needs the check (qc, dev, dev:backend, dev:quick) already invokes it directly. Also surfaces the `--cache-status` flag as `bun run qc:status` so cache visibility isn't gated on knowing the underlying smoke.ts flag exists.

- **`chore(deps)` bump typescript-eslint to 8.59.2** — Picks up the matching plugin/scope-manager/type-utils/types/utils/visitor-keys versions in `bun.lock`.

- **`chore` broaden destructive-confirmation scope + extend smoke-cache deps** — `check-destructive-confirmation.ts`: dropped ±80 line window in favor of whole-file scope. Long page components with end-of-file modals were false-positiving when the destructive handler sat near the top and the `ConfirmAlertDialog` rendered far below. Renamed `hasScopedConfirmationEvidence` to `hasConfirmationEvidence` to match the new semantics. `smoke-cache.ts`: expanded cached step dependencies (PACKAGE_GLOBS, CONFIG_JSON_GLOBS, prettier collector, directoryGlobs, `.git` exclude) so cache hits/misses track `package.json`, `bun.lock`, and `config/*.json` edits accurately.

- **`chore` post-v3.7.2 housekeeping** — Expanded smoke-cache step dependencies to cover the full v3.7.2 QC pipeline (`check:api-types`, `check:config`, `check:destructive-confirmation`, `check:feature-integration`, `check:process-env`, `check:schema-drift`, `check:schema-parity`, `check:secrets-shape`, `config:validate`, `format:check`, `lint:fix`). Gitignored `upgrade-review/` output directory. Fixed `template-manifest.json`: removed stale `settings-smtp.ts` (renamed), added `og-image.svg` and `config/example.json` (genuinely per-app). Bumped nodemailer 8.0.5 → 8.0.7, zod 4.3.6 → 4.4.3, eslint 10.2.1 → 10.3.0, globals 17.5.0 → 17.6.0, @tanstack/react-query 5.100.1 → 5.100.9.

### Fixed

- **`fix(crawltest)` retry on blank dashboard / post-recycle degradation** — Two resilience patches for a symptom seen in acme-monitor where the Vite dev proxy briefly serves blank or chrome-only responses after heavy admin-page interaction. After post-recycle login lands on `/dashboard`, verify the page actually rendered content (>50 chars) and retry up to 3x with 2s/4s/6s backoff instead of trusting a single `waitForContent`. In the degraded-page recovery ladder, add one more rung: if the page is still degraded _after_ a browser recycle and re-navigate, wait 3s and reload once more before giving up.

- **`fix` sync all config/\*.json files to docker test mount** — `ensureDockerTestDirs()` previously hardcoded `{slug}.json` + `{slug}.secrets.json`, leaving supplemental configs (e.g., a derived app's `squad-doctrine.json`) behind on docker-prod container start. Now walks `config/` and copies every `*.json` (excluding the `example.json` template artifact). The main `{slug}.json` still gets the rate-limiter flip applied.

## [3.7.2] - 2026-05-04

### Changed

- **`feat(tooling)` make QC check-only** — `bun run smoke:qc` no longer mutates files; the prior pipeline was running `lint:fix` and `format` (write) which made the gate doubled as an in-line cleanup pass. QC now runs `lint` (check-only) and `format:check`, separating verification from formatting. Adds `scripts/template-sync-plan.ts` for surfacing template drift without applying it. Docs across STACK/TESTING/DEVELOPMENT/CUSTOMIZATION/DEPLOYMENT/GETTING_STARTED/TROUBLESHOOTING/WHY_V3 updated to match.

- **`refactor(settings)` split backup key rotation section** — `AuthenticationTab` exceeded the 300-line audit threshold; extracted the backup encryption key rotation card, confirmation dialog, mutation state, and rotation toasts into `BackupKeyRotationSection`. AuthenticationTab now focuses on auth-security settings fetch/update orchestration and section composition.

- **`refactor(notifications)` decompose alert retry loop** — `sendAlertWithRetry` retry result aggregation, retry-success logging, retry-scheduled logging, and final-failure logging extracted into named helpers. Per-attempt result recording, succeeded-channel skipping, linear `BASE_DELAY_MS * attempt` delay, and all log message strings preserved verbatim.

- **`refactor(users)` decompose update mutator** — Username/email uniqueness checks, partial update payload assembly, and existing-row lookup extracted from `updateUser` into named helpers. Existing `UniqueConstraintError` messages, email-verification reset on email change, return shape, and cache delete-then-set sequencing preserved.

- **`refactor(oauth)` decompose live provider config resolver** — `resolveLiveProviderConfig` split into shared `OAuthProviderConfig` construction plus separate DB-stored and file-config resolver helpers. DB-stored provider precedence, encrypted secret decryption behavior, Microsoft tenant fallback, and the existing decryption-failure log message preserved.

- **`refactor(backup)` decompose re-encryption orchestrator** — Replaced repeated dynamic `node:fs` imports with static imports in the backup encryption service. Per-file backup re-encryption and temporary-file cleanup extracted into named helpers; temp paths, log messages, counters, and return shape preserved.

- **`refactor(backup)` decompose restore orchestrator** — `performRestore` reduced under the feature's 90-line body target by extracting restore-session invalidation and emergency rollback handling into top-level named helpers. Warning strings, log messages, cleanup timing, and response shapes preserved.

### Fixed

- **`fix(rate-limit)` honor backend setting for route limits** — Per-route rate-limit stores were instantiating local `Map`s, bypassing `config.rateLimit.backend` (which selects between memory and database stores). Added `checkRouteLimit` so route-local limit stores honor the configured backend; replaced the MFA attempt `Map` with the shared rate-limit store and database-backed reset path. Removed the conflicting Zod default for `rateLimit.backend`.

- **`fix(health)` decouple alert notifications from checks** — Health alert notification delivery now runs after synchronous alert-row creation instead of blocking manual or scheduled health-check responses. Alert creation failure logging and existing notification dispatch error logging preserved.

- **`fix(onboarding)` preserve transaction atomicity** — Onboarding service was performing database writes outside the surrounding transaction in some paths; tightened scope so the full sequence commits or rolls back as a unit.

- **`fix(storage)` guard browser storage providers** — `frontend/src/lib/debouncedStorage.ts` now guards against missing/quota-exceeded `localStorage`/`sessionStorage` rather than allowing the app shell to crash on unavailable storage.

- **`fix(auth)` fail closed on missing MFA keys** — Login, MFA verification, and OAuth handlers now reject (with explicit error responses) when the MFA encryption key is unavailable, rather than allowing silent fallbacks. Adds `configValidator-secrets-checks.ts` to surface missing secrets at config-load time. Docker `start.sh` updated to align.

- **`fix(audit)` finalize backend audit cleanup** — Multiple audit-tagged cleanup items folded back into their owning features, removing transitional `audit-*` markers in feature.json files.

- **`fix(db)` make service SQL dialect-portable** — Service-layer SQL had SQLite-only patterns leaking into shared paths; rewritten with dialect-portable SQL so PostgreSQL paths exercise the same code.

- **`fix(db)` align PKCE verifier state index** — Index definition for the PKCE state table was missing the discriminator column, causing slow lookups under concurrent OAuth starts.

- **`fix(notifications)` centralize preference defaults** — Notification preference defaults were duplicated across the user creation path and the preference-fetch path; consolidated into a single source of truth.

- **`fix(oauth)` quiet repeat workspace membership logs** — Workspace membership resolution during OAuth was logging once per attempt; throttled to surface only state changes.

- **`fix(websocket)` guard subscriber warning in production** — A "no subscriber" warning was firing in production environments where transient disconnects are expected; gated to dev-only.

- **`fix(websocket)` log wildcard handler errors in dev** — Wildcard subscriber handler errors were swallowed silently; surfaced in dev logs to aid debugging.

- **`fix(core)` centralize loopback detection** — `127.0.0.1`/`::1`/`localhost` checks were duplicated across plugins; consolidated into a single helper.

- **`fix(database-admin)` route postgres errors through service facade** — Postgres-specific error handling was leaking into routes; routed through the existing service facade so PostgreSQL- and SQLite-mode behavior stays consistent.

- **`fix(ui)` persist admin view state in URLs** — Admin tab/filter selections were lost on refresh; now serialized into the URL so deep-links and back/forward navigation preserve state.

- **`fix(a11y)` announce MFA setup errors** — MFA setup error messages were not announced to assistive tech; added `aria-live` region.

- **`fix(a11y)` label command search inputs** — Command palette and dialog search inputs lacked `<label>` association; resolved.

- **`fix(workspaces)` label branding color hex input** — Branding color hex input field was missing its `<label>` association.

- **`fix(docker)` pin bun base image digest** — Both `oven/bun:1.3.10-alpine` Dockerfile stages pinned to verified OCI index digest. Added the Bun base image digest refresh workflow to `docs/template/DEPLOYMENT.md`.

- **`fix(config)` remove env example workflow** — Removed the committed root `.env.example`; moved the Docker Compose variable example into `docs/template/DEPLOYMENT.md` as `compose.vars`. `deploy:local-prod` now writes `compose.vars` and runs Docker Compose with `--env-file compose.vars`. Removed the `.env.example` exception from `check-application` so future committed root `.env*` files fail the quality gate.

### Performance

- **`perf(auth)` parallelize password-history bcrypt comparisons** — Sequential bcrypt comparisons over the bounded recent-hash set replaced with concurrent verification. Existing password-history depth short-circuit, query limit, and validation order preserved.

### Security

- **`fix(security)` remove vulnerable lighthouse CI dependency** — Removed unpatched `@lhci/cli` and the LHCI-only Lighthouse scripts/configuration that pulled vulnerable `tmp` and `uuid` transitive dependencies. Cleaned the stale knip dependency ignore. `bun audit` now reports no advisories.

### Audit

- Completed full audit cycle across SPERNAKIT, REACT_BEST_PRACTICES (3 passes), COMPOSITION_PATTERNS (2 passes), WEB_DESIGN_GUIDELINES (2 passes), FEATURE_INTEGRATION, HYGIENE (5 passes), SECURITY (2 passes), REORG, COMPLICATION (3 passes), DEAD_CODE (4 passes), LOGIC (2 passes), TECHDEBT, SCHEMA_CONSTRAINTS, DATA_ARCHITECTURE, and ASSERTIONS. Resolved findings folded back into their owning features; transitional audit-report files removed from `.aidd/audit-reports/`.

## [3.7.1] - 2026-05-01

### Fixed

- **`fix(api-keys)` bound per-user API key lists** - `GET /api/v1/users/:id/api-keys` now applies the configured `apiKeys.maxPerUser` limit through the API key service, keeping the response size pinned even if pathological data accumulates.

## [3.7.0] - 2026-04-30

### Changed

- **`chore(vite)` add `__BACKEND_PORT__` build-time define** — `vite.config.ts` exposes the resolved backend port to source code via a `JSON.stringify(backendPort)` define; declared in `frontend/src/vite-env.d.ts`. Consumed by the dev-only direct WebSocket connection (see `fix(dev)` below) and available for future dev-mode helpers that need the backend port without re-parsing config in the browser.

- **`refactor(email)` decompose `emailService` into facade + subdirectory** — `emailService.ts` had grown to 284 lines accumulating inline HTML templates alongside SMTP transport. Split into `services/email/{emailTypes,smtpTransport,emailTemplates}.ts` with the entry point reduced to a 15-line facade matching the dashboardService / oauthService pattern. All existing import paths continue to resolve through the facade with no consumer edits.

- **`refactor(audit)` extract shared `sendEmailWithRetry` and `useTokenVerification`** — The retry-with-backoff wrapper around `sendEmail` was duplicated inline in `routes/auth/password-reset.ts` and `routes/users/profile.ts`; extracted to `backend/src/utils/emailRetry.ts`. The token-verification effect (mount-time GET, redirect on 410, error toast) was duplicated across `ConfirmEmailChangePage.tsx` and `VerifyEmailPage.tsx`; extracted to `frontend/src/pages/auth/useTokenVerification.ts`. Both pages reduced to ~30 lines.

- **`refactor(api-keys)` move duplicate-name lookup into service layer** — Route handler was performing an explicit `SELECT … WHERE name = ?` before the insert to surface the friendly 409 message. Moved into `apiKeyManagement.ts` so the route stays thin and the service owns its own uniqueness contract.

- **`refactor(guards)` extract `validateAuthAndWorkspace` preamble helper** — The "load user, load workspace, verify membership, hydrate context" preamble was inline at the top of every workspace-scoped route's `beforeHandle`. Extracted to a single helper to deduplicate.

- **`refactor(settings/auth)` extract bool/num helpers from `formValues` triple-fallback** — `formValues` was repeating `value ?? defaults?.field ?? FALLBACK` ladders across 12 fields. Replaced with `boolValue(key)` / `numValue(key)` helpers reading from a single resolution chain.

- **`refactor(settings/users)` co-locate `UserStatusBadge` and `useUserColumns`** — Both were under generic shared paths (`components/shared/`, `hooks/`) but only consumed by `pages/settings/users/`. Moved into the page directory.

- **`refactor(smoke)` use `process.execPath` rewrite for Windows shell selection** — Smoke runner previously probed `bun --version` via pwsh to verify shell availability. Replaced with a `process.execPath`-based rewrite that resolves the bun binary directly without spawning a probe process.

### Fixed

- **`fix(layout)` session-check gate before WebSocket hooks mount** — `AppShell` was rendering `AppShellContent` (which fires `useWebSocket` / `useNotificationSocket` / `useCrudSocket`) as soon as `isAuthenticated` was true in the auth store, even when the underlying session cookie was stale or expired. Result: repeated WS connection attempts before `ProtectedRoute` (further inside the tree) could reject. AppShell now runs a `checkSession` query gated by `isAuthenticated` and renders a spinner until it resolves. Shares cache key with `ProtectedRoute`'s existing session-check (`['session-check']`), so TanStack Query dedupes to one network call.

- **`fix(dev)` direct WS connection in dev to skip Vite proxy noise** — `lib/websocket/utils.ts` previously routed the WebSocket through Vite's `/ws` proxy in all modes. During dev-server restart cycles the proxy logged repeated `ECONNABORTED` errors. Switched to direct backend connection (`ws://localhost:${__BACKEND_PORT__}/ws`) when `import.meta.env.DEV` is true; production behavior (use `window.location.host`) unchanged.

- **`fix(template)` direct remediations from dance B-direct cluster** — Two clusters surfaced during the v3.5.0 → v3.6.0 dance B1 tester sweep: (1) `frontend/vite.config.ts` was listing 6 transitive dependencies under `optimizeDeps.include` which Bun nests under `react-grid-layout` and aren't resolvable by bare name (Vite logged "Failed to resolve dependency" on every dev start in 4/6 apps); kept only `react-grid-layout` itself. (2) Five `feature.json` files had raw TAB characters embedded inside spec string values (RFC 8259 forbids); a derived app's parser rejected them as "Unterminated string" on every project sync. Both fixed at the template source.

- **`fix(dashboards)` bound `listDashboards` SELECT with `config.dashboards.maxPerUser`** — Query was unbounded — pathological data could return arbitrarily many rows. Now applies `LIMIT config.dashboards.maxPerUser` so the response size is config-pinned.

- **`fix(database-admin|dashboards|mfa|workspaces|email|auth)` typed errors instead of substring matching** — Several services were comparing `err.message === 'NOT_FOUND'` or substring-matching error strings. Switched to typed error classes (`PostgreSqlNotSupportedError`, `DashboardSharingDisabledError`, `UniqueConstraintError`) and `SERVICE_ERRORS` constants (`TOKEN_INVALID`, `SMTP_NOT_CONFIGURED`). Removes the magic-string surface where a stray rename could silently break error mapping.

- **`fix(settings/auth)` normalize heading hierarchy on Authentication tab** — Section headings were skipping levels (`<h2>` then `<h4>` with no intervening `<h3>`), failing axe heading-order. Renormalized to a strict 1→2→3 hierarchy.

- **`fix(smoke)` verify bun resolves via pwsh before selecting it as smoke runner shell** — On Windows, the smoke runner could pick pwsh as the shell even when bun wasn't on its PATH (different from the Git Bash session that launched it). Now probes resolution first and falls back to bash when pwsh can't find bun.

### Security

- **`fix(security)` `Referrer-Policy: no-referrer`** — Both `securityHeaders` plugin and `docker/nginx.conf` were emitting `strict-origin-when-cross-origin`. Spec for `elysia-app-bootstrap` already required `no-referrer`; aligned implementation to spec. Resolves audit finding `audit-security-1777451035-referrer-policy-not-no-referrer`.

### Removed

- **`chore(vite)` drop unused `classnames` from chunk-grouping condition** — `frontend/vite.config.ts` was routing a `classnames`-named module into a vendor chunk, but the package isn't a dependency anywhere in the frontend (zero callers; not in `package.json`). The condition was a leftover from a prior refactor.

- **`chore(workspaces|dashboards)` drop dead re-exports** — `WorkspaceBranding` / `WorkspaceMemberRole` re-exports in workspaces and `DashboardHeaderFrameProps` re-export in dashboards had no remaining callers after the v3.5.0/v3.6.0 reorganization.

### Audit

- **All 25 `audit-*` features now complete** — Final round of audit-driven remediations closed out the catalog (techdebt, data-architecture, schema-constraints, assertions). 23 features were already complete at the start of this cycle; the remaining 2 (`emailservice-flat-file-structure`, `auth-token-page-duplication`) were resolved by the email-facade refactor and shared `useTokenVerification` extraction. Audit-finding spec files folded back into their parent template features, removing scaffolding from `.aidd/features/`.

## [3.6.0] - 2026-04-29

### Added

- **`feat(oauth)` database-backed PKCE verifier storage** — OAuth PKCE code verifiers were previously held in an in-process `Map`, which lost state across worker restarts and made horizontal scaling unsafe. New `pkce_verifiers` table (SQLite + PostgreSQL via `db/schema/pkceVerifiers.ts` + `db/schema-pg/pkceVerifiers.ts`) persists verifiers with TTL and is reaped on a scheduled task. OAuth start/callback handlers read/write through the new `pkceStore` service.

- **`feat(deploy)` deploy:local-prod helper** — New `bun run deploy:local-prod` script wraps a self-hosted production lane: builds the `:{version}` image, brings up `docker-compose.production.yml` against the operator's `APPDATA_ROOT`, and runs the standard health-wait. Documented in `docs/template/DEPLOYMENT.md` alongside the existing GHCR-pull-based path.

- **`feat(deploy)` isolated test data root + STG bootstrap opt-in** — `smoke:docker-local` now mounts `${APPDATA_ROOT}/${APP_SLUG}/{data,config,logs,backups}` via the new `docker-compose.test.yml` overlay, mirroring production layout so test runs don't clobber DEV's working `data/`. New `cors.inheritFrontendUrl` config flag (off by default) lets STG run with `NODE_ENV=production` without manually duplicating `server.frontendUrl` into `cors.allowedOrigins`; `docker/start.sh` consumes a one-shot `.stg-bootstrap` marker on first container start. Real production should set `allowedOrigins` explicitly and leave the flag off.

- **`feat(perf)` audit-driven performance batch** — Scheduler-side improvements landed as one feature: batched token blacklist cleanup (single delete per tick instead of per-token), cache-first user settings reads (Zustand persist before hitting `/users/me/settings`), parallel OAuth provider config decryption, and single-query username dedup for workspace member resolution.

- **`audit(devops)` `check:process-env` and `check:destructive-confirmation` CI gates** — Two new pre-`build` checks. `check:process-env` flags any direct `process.env` reads outside the config loader (config is the only sanctioned env consumer). `check:destructive-confirmation` greps for unguarded `DELETE`/`DROP`/`TRUNCATE` SQL or destructive route handlers missing the `confirm: 'yes'` body schema.

- **`audit(devops)` pre-commit hook documented in README** — `.githooks/pre-commit` runs `format:check`, `lint`, and `typecheck` advisorily on staged files. Wiring (`prepare` script setting `core.hooksPath`) is now called out in README.md so cloners know what runs on commit.

- **`audit(deployment)` Traefik example hardened** — `docs/template/deployment/traefik.example.yml` now matches production-grade security directives (HSTS preload, OCSP stapling, TLS 1.3-only cipher list) the canonical nginx example already used. Removes the documentation drift between operator-supplied reverse-proxy templates.

### Changed

- **`refactor(reorg)` services and handlers decomposed under 300-line guideline** — `mfaService.ts` split into `services/auth/mfa/{mfaSetup,mfaVerification,mfaTokens,mfaLifecycle,mfaTypes}.ts` with a re-exporting facade. `users/handlers.ts` split into `handlers-crud.ts` + `handlers-admin.ts`. New helper modules: `services/notification/notificationMutations.ts`, `services/user/userCrudHelpers.ts`, `services/workspace/workspaceMemberBulk.ts`. Subdirectory imports redirected through facade files to keep import surface stable.

- **`refactor(db)` drizzle migrations squashed into single baseline** — Replaces 9 historical migration files with one consolidated `20260427214052_fast_killraven.sql` baseline. Existing deployments continue to apply incremental migrations on top via `_journal.json`; fresh installs apply the baseline plus any post-baseline changes.

- **`refactor(config)` named `MS_PER_*` constants replace opaque ms defaults** — `60_000`/`3_600_000` literals across config defaults swapped for `MS_PER_MINUTE`/`MS_PER_HOUR` etc. from a new `backend/src/constants/time.ts`. Pure readability — no behavioral change.

- **`refactor(dashboards)` DashboardHeader split into view/edit variants** — `DashboardHeader.tsx` decomposed into `DashboardViewHeader.tsx`, `DashboardEditHeader.tsx`, and `DashboardHeaderFrame.tsx` (shared chrome). Each variant manages its own state, removing the prior conditional-rendering branch. `useChartData` and `useWidgetData` hooks moved out of the file's sibling directory in the same pass.

- **`refactor(hooks)` flatten `hooks/files/` single-file subdirectory** — `hooks/files/useFileColumns.tsx` promoted to `hooks/useFileColumns.tsx`. Other column hooks under `hooks/notifications/` and `hooks/settings/` similarly relocated to flatter layout.

- **`refactor(services)` break 3 backend circular dependencies** — Direct submodule imports replace cyclic facade reaches in three services. The facades remain canonical for external consumers; only intra-service calls were rewired.

- **`refactor(schema-explorer)` drop manual `useMemo` where React Compiler handles memoization** — Several `useMemo(() => …, [deps])` blocks in schema-explorer pages removed; the React Compiler pass already memoizes them and the manual hooks fought its dependency analysis.

- **`audit(data-architecture)` shared enum batch** — `WORKSPACE_ROLES`, `NOTIFICATION_TYPES`, and the duplicate `AssignableRole` type collapsed into single source-of-truth exports in `spernakit-shared`. Drops the redundant `idx_mfa_settings_user_id` (covered by composite index). Suppresses duplicate liveness polling when WebSocket is connected.

- **`audit(techdebt)` shared `paginatedQuery` helper consumed by file queries** — File-listing queries were duplicating the offset/limit/order math; switched to the existing shared helper.

- **`perf(bundle)` split react-vendor into core/routing/tanstack chunks** — `react-vendor` was loading React + Router + TanStack Query as a single ~140KB chunk. Now three smaller chunks (`react-core`, `react-routing`, `react-tanstack`) so route-level code-splitting can defer the routing/query chunks where appropriate.

- **`perf(lighthouse)` mobile FCP/LCP budgets retuned to CWV thresholds** — Tightened where measurements showed headroom, relaxed where the previous value was unrealistic. Net result is budgets that fail on real regressions instead of noise.

- **`ci` pinned action SHAs bumped to Node.js 24 native versions** — All third-party GitHub Actions repinned to versions that natively run on Node 24, removing the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` workaround on those steps.

### Fixed

- **`fix(scripts)` `verify-compression` falls back to nginx-proxied path** — `scripts/verify-compression.ts` previously hit `server.backendUrl` (port 3331) directly. In `smoke:docker-prod` mode only the nginx-fronted port 3330 is exposed, so the test threw `ECONNREFUSED` after a clean `smoke:reset` (it had been silently passing on prior bumps because a leftover `bun run dev:backend` happened to bind 3331). Script now probes the direct backend URL first; on connection failure falls back to `${frontendUrl}/api/v1/health`, which works in all three modes (`dev`, `docker-local`, `docker-prod`). Removes a brittle hidden dependency on local dev state.

- **`fix(schema)` SYSTEM_METRIC_TYPES enum constraint** — `system_metrics.metricType` had no DB-level enum constraint, so a typo in any caller silently inserted invalid metric types that broke aggregation queries downstream. Added `SYSTEM_METRIC_TYPES` shared constant + `CHECK` constraint on the column (both dialects).

- **`fix(schema)` composite unique index on `api_keys (createdBy, keyName)`** — Prevents two API keys with the same name within the same user. Adds a friendly `409 Conflict` error path on duplicate-name creation; bare DB constraint violation no longer leaks to the client.

- **`fix(security)` workspace access guards verify role from fresh DB lookup** — `workspaceAccess` guard had been trusting role from the JWT payload, which could be stale if the user's workspace role was demoted mid-session. Switched to `requireRoleFresh` semantics: a single read against `workspace_members` per request authoritatively resolves the current role.

- **`fix(react)` narrow `useEffect` dependencies in layout/workspace hooks** — `useLayoutEffects` and `useWorkspace` were depending on whole-object refs that changed every render, triggering wasted work in React Compiler-aware code paths. Narrowed to the primitive fields that actually drive the effect.

- **`fix(deployment)` remove duplicate nginx security headers and fix `X-Forwarded-Proto`** — Two security headers were emitted both by nginx and by the backend, with conflicting values when terminating TLS at a separate reverse proxy. Backend now emits headers; nginx removes its duplicates. `X-Forwarded-Proto` is honored when set by an upstream proxy.

- **`fix(ssoc)` extract `parseTimeRangeToHours` from `pages/` to shared `lib/timeRange.ts`** — Time-range parsing was duplicated across 4 pages; moved to `lib/` and consumed via barrel.

- **`fix(a11y)` `translate="no"` on technical code elements** — Browser auto-translate was garbling code blocks, JSON snippets, and command-line examples in the docs/onboarding flow. Added `translate="no"` to all `<code>`, `<pre>`, and `<kbd>` elements that contain machine-meaningful text.

- **`fix(ux)` actionable next steps in vague error toasts** — A handful of error toasts read "Something went wrong" with no path forward. Each now names the next step (retry, contact admin, check logs, etc.) tailored to the failing operation.

- **`fix(techdebt)` magic strings replaced with `SERVICE_ERRORS` constants** — Removes string-literal comparisons like `err.message === 'NOT_FOUND'` in service-layer code. The shared `SERVICE_ERRORS` enum is now the single source.

- **`fix(ci)` commit generated `config-schema.json` so drift check has artifact** — `check:schema-drift` was failing on fresh checkouts because the artifact was gitignored. Now committed under `config/config-schema.json` and regenerated by `config:validate`.

### Security

- **`audit(logic)` `requiresPasswordChange` set before token generation in admin reset** — Race window between issuing reset token and flipping the `must_change_password` flag could let a user log in with the temporary credential without being forced into the change flow. Now flag is written first, in the same transaction as the token row.

- **`audit(logic)` email change token consumption wrapped in transaction on collision path** — Concurrent email-change confirmations could double-consume the same token. Token consume + email update + audit log entry now run in a single transaction with `SELECT ... FOR UPDATE` (PG) / immediate-mode write (SQLite).

- **`audit(logic)` reject and log on CSRF origin resolution failure** — When the `Origin` header was unparseable, the CSRF plugin was permitting the request. Now rejects with `403` and logs a structured event with the offending header.

- **`audit(logic)` debug logging for JWT and MFA challenge verify failures** — Previously these failed silently, which made operator triage of "why can't I log in" reports impossible. Each verify failure now emits a `debug`-level structured log with the failure class (signature, expiry, audience, etc.) — never the token contents.

- **`audit(assertions)` 20 invariants stale-check refresh** — Stale references in `.aidd/assertions.md` retired; check-count line in the assertions doc now matches the harness output. No new findings beyond the corrections.

### Removed

- **`refactor(oauth)` retire in-memory PKCE provider index** — `services/oauth/providers/index.ts` deleted; provider lookup now goes through the per-provider files directly. The barrel was the last consumer of the in-memory PKCE map and is no longer needed after the DB-backed PKCE switchover.

- **`chore(audit)` consolidate audit findings into template features** — 60 individual audit-finding directories under `.aidd/features/` consolidated into 40 template feature files. Removes scaffolding noise from the active feature catalog without losing any open work item.

## [3.5.0] - 2026-04-26

### Added

- **`feat(layout)` scroll-trap invariant in AppShell and shells** — Spec item #24 documents the dual flex/grid min-size trap that silently breaks `<main>` overflow on tall pages, and the required class tokens are now applied across all three layout variants. AppShell SidebarLayout adds `grid-rows-1` on the grid container and `min-h-0` on the inner flex column wrapping `<Header />` + `<main>`. BbsShell and TerminalShell add `min-h-0` on `<main>`. Verified at 1440x900 on `/settings`: `<main>` scrolls internally and the AppShell grid clips zero pixels.

### Fixed

- **`fix(dashboards)` harden SharedDashboardPage against tester snapshot-timing false positives** — The dance tester sweep filed a "blank page" bug against `/dashboards/shared/:token` in acme-monitor, but the saved screenshot showed the page rendering correctly. Root cause was a HeadlessChrome timing race — the harness snapshotted before React Query resolved and React committed. Hardened the shared-dashboard render path so this class of false positive cannot recur: explicit `isError` branch (never silent-fail), never-null widgets in loading/empty states, and harness-friendly wait-for selectors.

- **`fix(metrics)` resolve disk usage data dir relative to project root** — `getDiskUsagePercent()` in `metricsHelpers.ts` called `resolve(dbPath, '..')` on a relative `dbPath`, which yielded `backend/data` instead of `data/` when the backend ran from the `backend/` cwd. This violated the architectural "data must live at app root" rule and caused a WARN every metrics tick. Mirrored the resolution pattern already used in `healthCheckRunners.ts` (`getDataDirectory`) and `seed.ts`: derive `metricsProjectRoot` from `import.meta.url` and resolve `dbPath` against it. Surfaced via dance fleet tester sweep (6/6 derived apps reported the warning).

### Removed

- **`chore` lifecycle out 2026-04-25 audit and remediation** — The SharedDashboard remediation landed as `8ad184c0`; removed the now-superseded remediation feature and its companion 2026-04-25 SECURITY audit report.

## [3.4.0] - 2026-04-25

### Added

- **Brotli compression in nginx** — `docker/nginx.conf` enables `brotli on` and `brotli_static on` via the new `nginx-mod-http-brotli` Alpine package. Modern browsers prefer `br` over `gzip` (~15-20% smaller on text). Pre-compressed `.br` siblings emitted by `vite-plugin-compression2` are served directly via `brotli_static`. Brotli `comp_level 5` for on-the-fly responses. Module load uses absolute `/usr/lib/nginx/modules/` path because `docker-compose.production.yml` mounts a tmpfs over `/var/lib/nginx` that shadows the package's symlinked module copies.

- **Graceful JWT and backup-encryption-key rotation** — Two backend rotation endpoints under `/api/v1/settings/auth-security/`. JWT key rotation seeds previous-public-key envs (`JWT_ACCESS_PUBLIC_PREVIOUS`, `JWT_REFRESH_PUBLIC_PREVIOUS`) so existing tokens stay valid through the rotation grace window. Backup encryption key rotation re-encrypts all backups on disk under the new key in a transactional batch, only writing the new key after every backup succeeds. Frontend lands a Settings → Authentication "Re-encrypt backups under current key" button and a key-rotation flow with explicit operator confirmation.

- **`feat(db)` at-most-one-active-default workspace** — Partial unique index on `workspaces` enforces `(user_id) WHERE is_default = 1` on SQLite and `WHERE is_default = true` on PostgreSQL. Replaces the prior all-application-level enforcement that allowed race-window double-defaults. Drizzle migration emits dialect-specific partial-index DDL.

- **OAuth end-to-end test plan skeleton** — `docs/testing/oauth-end-to-end.md` documents the matrix of OAuth provider flows (Google, GitHub, Microsoft) covered by manual smoke testing. No automation yet — captures the test plan ahead of the eventual scripted version.

- **`feat(crawltest)` `<img>` dimension CLS guard** — Crawler now flags images missing both `width` and `height` attrs as CLS-risk findings, surfacing layout shift sources before they hit users. Reported in the crawltest JSON under a new `cls-guard` section.

- **`feat(tooling)` canonical skeleton import path enforcement** — `bun run smoke:qc` adds a guard that fails when `frontend/src/lib/skeleton.ts` is bypassed in favor of inline skeleton-element JSX. Keeps the design-system entry point single-sourced.

- **`feat(auth)` MFA setup re-auth + deferred backup codes** — Enabling MFA now requires a fresh password challenge (re-auth window: 5 min). Backup recovery codes are issued only after the first successful TOTP verify, eliminating the "got the codes but never finished setup" footgun.

- **`feat(security)` cross-origin isolation headers + scope fix** — `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` lands template-wide via `securityHeaders` plugin. Plugin scope previously no-op'd on the public route group; fixed to apply globally.

- **`feat(security)` step-up + out-of-band confirmation for email change** — Changing primary email now requires both a fresh password challenge and a one-time confirmation token sent to the _current_ email. Resolves account-takeover via session hijack on email change. New `email_change_tokens` table.

- **`audit(security)` SECURITY audit refresh** — Comprehensive SECURITY audit completed; zero open findings remain in `.aidd/audit-reports/SECURITY-*`. Same for COMPOSITION_PATTERNS, REACT_BEST_PRACTICES, and SPERNAKIT v3.4 audits — all four at score 100/100.

- **`scripts/docker-image.ts` dual-tag build/push helper** — New helper that builds and pushes the container image with both the floating `:latest` tag and the explicit `:{package.version}` tag. Required because `docker-compose.production.yml` interpolates `APP_VERSION` (no `:latest` fallback by design). Image name derived from `pkg.name` so the script is portable across all derived apps. Replaces the inline `docker compose build` / `docker compose push` invocations in `package.json`'s `docker:image:*` scripts.

- **`scripts/lib/crypto-keys.ts` shared module** — `loadCryptoKeysFromEnv()` extracted out of `scripts/load-json-config.ts` so other scripts (notably the new rotation helpers) can reuse the env-injection logic. Pure, no side effects.

- **CI: dependabot + trivy + JS-actions pin** — `.github/dependabot.yml` lands with weekly schedules for npm, docker, and github-actions. `docker-publish` workflow gains a `trivy` image scan step and `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env to keep pinned JS actions on Node 24.

- **CI: Lighthouse CI collect+assert wired** — `.github/workflows/` adds Lighthouse CI runs that collect per-form-factor reports (mobile + desktop) and assert against perf budgets. Reports archived as workflow artifacts.

- **CI: timeout + concurrency group on docker publish** — `docker-publish.yml` gains `timeout-minutes: 30` and a `concurrency` group so concurrent pushes to the same ref cancel the older run.

- **CI: CODEOWNERS for template-contract paths** — `.github/CODEOWNERS` requires owner review on `scripts/template-manifest.json`, `docs/template/`, and `.aidd/spec.md` changes. Template contract paths now have a guardrail against drive-by edits.

- **CI: release workflow + semver tags** — Docker publish gates on quality (`smoke:qc`) and emits both `:latest` and semver tags (`:3.4.0`, `:3.4`, `:3`). Release workflow scaffolds the GitHub Release on tag push.

- **`docs(deployment)` DEPLOYMENT.md compose/TLS/rollback overhaul** — `docs/template/DEPLOYMENT.md` rewritten with explicit `docker compose --env-file` usage, TLS termination guidance (Caddy / nginx examples), and a documented rollback procedure that uses the explicit `:{version}` image tag.

- **`docs(assertions)` `.aidd/assertions.md`** — 20 invariants across 5 categories (config, schema, routing, auth, observability) authored as machine-checkable assertions. Pulled into the audit harness as the canonical contract surface.

- **`chore(devex)` advisory pre-commit hook** — `.githooks/pre-commit` runs `format`, `lint`, and `typecheck` advisorily (warn-only) on staged files. Wired via `package.json` `prepare` script which sets `core.hooksPath`.

### Changed

- **`scripts/smoke.ts` exports APP_VERSION from package.json** — `loadConfig()` now reads `package.json` and sets `process.env.APP_VERSION` if not already set, so `docker compose` interpolation succeeds against `docker-compose.production.yml` (which intentionally has no `:latest` fallback). Required for the dance pipeline's `smoke:docker-prod` mode to compose-up the locally-built image without operators having to tag-and-push manually.

- **Foreign keys named via `foreignKey()` helper** — All FKs across both schema dialects switched from inline `references()` to the named-FK form: `foreignKey({ columns: [...], foreignColumns: [...], name: 'fk_{table}_{ref}' })`. Improves migration diff readability and gives constraints stable names across SQLite/Postgres.

- **`refactor(scripts)` migrate.ts split into named phase helpers** — `runAutoMigrations()` decomposed into `phaseLockAcquire`, `phaseDriftCheck`, `phaseApply`, `phaseHistoryWrite` as named exported helpers. `applyMigration` separately split out, fake perf telemetry removed.

- **`refactor(dashboards)` DashboardHeader split into view/edit variants** — `DashboardHeader.tsx` decomposed into `DashboardHeaderView.tsx` and `DashboardHeaderEdit.tsx` so each variant handles its own state. Removes the prior conditional-rendering branch.

- **`refactor(auth)` mfa imports route through authService facade** — Mfa route handlers now import via the `authService` facade rather than reaching directly into `mfaService`. Aligns with the existing services-facade pattern. Also: mfa route OpenAPI docs extracted into `mfa.docs.ts`.

- **`refactor(shared)` cross-boundary enums promoted to `spernakit-shared`** — `WorkspaceMemberRole`, `ApiKeyScope`, `NotificationType` (and the phase-2 cross-boundary enum batch) moved into `shared/`. Frontend and backend both import from `spernakit-shared` now.

- **`refactor(frontend)` co-locate single-feature column hooks** — `useFileColumns`, `useNotificationColumns`, `useUserColumns` etc. moved next to their consuming pages. Removes the `frontend/src/hooks/columns/` umbrella that had only single-consumer hooks.

- **`refactor(frontend)` NotFoundPage moved to `pages/errors/`** — Domain subdirectory created.

- **`refactor(scheduler)` StatusIcon extracted** — Moved to its own file under `frontend/src/pages/settings/scheduled-tasks/`.

- **`refactor(mfa)` magic HTTP status numbers replaced with `HTTP_STATUS` constants** — Mfa route handlers use the shared constants table.

- **`refactor(config)` `withEmptyDefault` adopted on 12 nested Zod sub-schemas** — Eliminates the boilerplate `.default({})` pattern; all 12 sub-schemas now use the helper.

- **`refactor(config)` rate-limit warning helpers deduped** — `configValidator-server.ts` collapses the three near-duplicate warning helpers into a single parameterized helper.

- **`perf(frontend)` precompressed gzip + brotli artifacts** — Vite emits `.gz` siblings alongside `.br`; nginx serves both via `gzip_static` and `brotli_static`. Modern browsers get brotli; older clients get gzip. No on-the-fly compression overhead at request time.

- **`perf(frontend)` useAuth wildcard import → named imports** — Reduces bundle size and improves tree-shaking.

- **`perf(workspaces)` bulk member delete batches role lookup** — Was N+1; now single `IN(...)` query.

- **`perf(users)` bulk role updates grouped by target role** — Was per-user; now grouped.

- **`docs(template)` smoke:qc pipeline + `api/types/` path** — `docs/template/STACK.md` and `DEVELOPMENT.md` updated to reflect the canonical pipeline order and the `frontend/src/api/types/` directory (vs the prior `types.ts` file).

### Fixed

- **Brotli module load path on tmpfs-mounted runtime** — `docker/nginx.conf` switched the `load_module` directives from the relative `modules/...` form to absolute `/usr/lib/nginx/modules/...` because `docker-compose.production.yml` mounts a tmpfs over `/var/lib/nginx` (read-only-rootfs hardening) which shadows the package's symlinked module copies under `/var/lib/nginx/modules/`. Surfaced when supertest crash-looped on `nginx: [emerg] dlopen() ... failed (No such file or directory)`. Caught by the dance pipeline before propagating to derived apps.

- **`Dockerfile` missing `scripts/lib/` COPY** — Production stage previously COPY'd only `scripts/migrate.ts` and `scripts/load-json-config.ts`, but the latter now imports `./lib/crypto-keys.ts` (extracted in this version's refactor batch). Container migration step crash-looped on `Cannot find module './lib/crypto-keys.ts'`. Added `COPY scripts/lib/ scripts/lib/` after the existing scripts COPY.

- **`scripts/crawltest.ts` rotate-backup-key 400 exclusion** — The new `/settings/auth-security/rotate-backup-key` endpoint correctly returns 400 when `backupEncryptionKeyPrevious` is not staged (intentional UX — operator must seed the previous key first). Crawltest treats all 4xx as failures by default; added a URL+status exclusion so the intentional non-2xx doesn't trip the gate.

- **Per-connection WS revalidation timer for idle connections** — WS plugin previously revalidated only on message receipt; long-idle connections could outlive their token. Now a per-connection timer revalidates at the token's `exp` boundary regardless of message activity.

- **Production startup gated when postgres dialect lacks SSL** — Backend now refuses to start in production when `db.dialect === 'postgres'` and `db.ssl !== true` (or no CA configured). Prevents accidental cleartext connections to managed Postgres.

- **Scheduler `runMissedTasks` invalid-cron skips logged** — Previously silent; now logged at warn level with the offending cron expression and task id.

- **Admin-DB SQL sandbox blocks `TRUNCATE`, `GRANT`, `REVOKE`** — Added to `BLOCKED_KEYWORDS` alongside the existing `DROP`, `ALTER`, etc.

- **Caddy example dropped permissive CSP and legacy `X-XSS-Protection`** — `docs/template/deployment/Caddyfile.example` aligned with the strict CSP shipped by the backend's `securityHeaders` plugin.

- **`assertSafeIdentifier` guard added to schemaIntrospection iteration sites** — Prevents identifier injection through table/column names returned by the introspection helpers.

- **MFA QR `dangerouslySetInnerHTML` replaced with `<img>` dataURL** — `qrcode` library's SVG-string output replaced with PNG dataURL via dynamic import. Drops `dangerouslySetInnerHTML` from the MFA setup dialog.

- **MFA challenge JWT pins audience + issuer on sign and verify** — Was previously sign-only; verify now enforces both claims.

- **MFA recovery-code TOCTOU race closed** — Recovery code consume path wraps the read+invalidate in a transaction with a re-read guard against double-consume.

- **OAuth token exchange consumes DB-stored provider settings** — Previously read from the in-memory config snapshot at startup; runtime updates to OAuth provider client secrets now take effect without a restart.

- **OAuth/backup catch branches log instead of swallow** — Previously silent; now logged at warn level with context.

- **Schema-version + disk-usage silent catches logged** — Same fix; observability sink now sees the failures.

- **Multi-line config fields promoted to `Textarea`; SQL sandbox label fixed** — `frontend/src/pages/settings/application/...` configuration form fields with multi-line values render as `Textarea`. SQL sandbox section label corrected.

- **Dashboard widget + workspace-settings query keys scoped to active workspace** — Was previously global; switching workspaces now correctly invalidates the per-workspace caches.

- **Pino file transport rotated to cap `/app/logs` growth** — Rotating file stream replaces the prior unbounded sink.

- **Nginx SPA fallback `Cache-Control: no-cache`** — `index.html` revalidates on every navigation so content-hashed asset references never go stale after a deploy. Hashed `/assets/` files keep their 1y immutable policy.

- **`theme-color` meta follows light/dark mode** — `frontend/src/main.tsx` updates the meta on `prefers-color-scheme` change so mobile browser chrome matches the active theme.

- **APP_VERSION required in production compose (no `:latest` fallback)** — `docker-compose.production.yml` removed the `:latest` fallback on the image tag interpolation. Forces explicit version pinning, enables clean rollback via image tag swap.

### Removed

- **6 unused exports flagged by knip** — Various `frontend/src/` and `backend/src/` exports with zero call sites removed.

- **`dashboardConfigs.isDefault` column** — Vestigial; no consumer. Drizzle migration drops the column.

## [3.3.1] - 2026-04-22

### Fixed

- **Router role guards aligned with nav minRole on role-gated pages** — `frontend/src/routes.tsx` now wraps `/onboarding` in `ProtectedRoute requiredRole=ADMIN`, and both `/analytics` and `/files` in `ProtectedRoute requiredRole=OPERATOR`, matching the sidebar `minRole` registrations. Previously these routes were navigable by any authenticated user because the router had no role gate, even though the nav hid the links from lower-tier roles — a guard/nav mismatch flagged during the April role-guard audit. Resolves `remediation-20260422-route-guards-nav-parity`.

### Changed

- **Internal: `.aidd/app_spec.txt` → `.aidd/spec.md`** — Spec migrated from XML-tagged format to pure markdown for readability and diffability. No content change beyond format. `.aidd/project-structure.md` updated to reference the new filename.

- **Internal: `.aidd/status.md` marked 100% complete** — All audit remediations landed in 3.3.0 accounted for; audit backlog cleared. Three stale audit reports removed (`DATA_ARCHITECTURE-2026-04-21.md`, `SPERNAKIT-2025-04-20.md`, `WEB_DESIGN_GUIDELINES-2025-06-22.md`) — each superseded by the 3.3.0 resolutions.

## [3.3.0] - 2026-04-22

### Added

- **Bug reports migrated from `data/bugs.json` to database** — New `bug_reports` table lands in both SQLite (`backend/src/db/schema/bugReports.ts`) and PostgreSQL (`backend/src/db/schema-pg/bugReports.ts`) variants; dual-schema parity enforced. FK to `users.id` with `onDelete: set null` (preserve report history when users are deleted), indexed on `user_id`, `status`, and `created_at`. `bugReportService` rewritten to use Drizzle: `submit()` inserts, `list()` uses the canonical `paginatedQuery()` helper ordered by `createdAt DESC`. Title auto-derived from the description's first line (max 80 chars, word-boundary truncation). `GET /bugs` now returns the flat `paginatedResponse` envelope to match every other paginated route group, dropping the prior double-nested shape. Frontend `BugReport` type updated (`id: string → number`, `+ title`, `+ userId`); `listBugs()` return shape and `BugsTab` updated to consume the flat envelope. New drizzle migration `20260421200158_cooing_falcon.sql` creates the table. `data/bugs.json` deleted — no migration of legacy entries (dev-only data, template-reset workflow). Resolves `audit-data-architecture-1776791801-bug-reports-json-file`.

- **`rateLimit.authEnabled` production-gate validator** — New `configValidator-server-checks.ts` + `configValidator-server.ts` (wired via `configValidator.ts`) fails startup in production when `rateLimit.authEnabled` is `false`. The default auth rate-limit hardcap remains in place regardless, but the explicit `enabled: false` override — intended for dev tester runs — should never reach production. Matches the existing `rateLimit.enabled` production-gate pattern. Resolves `audit-security-1776790047-dev-rate-limit-default-off`.

- **Typed `WsCrudEvent` payloads** — Backend WS CRUD broadcasts (`wsBroadcast.ts`) now accept the shared `WsCrudEvent` type from `spernakit-shared` instead of loose `entity + action` string pairs. All CRUD route groups (`dashboards/crud`, `files/handlers`, `health/alerts-config`, `settings/general`, `users/handlers`, `workspaces/crud`, `workspaces/members-crud`) updated to emit the typed shape. Resolves `audit-feature-integration-1776788999-ws-crud-events-not-shared`.

- **Bounded `migration-history.json`** — `scripts/migrate.ts` now caps the history file at 3 entries per tag and 200 entries total, trimming oldest entries on write. Prevents unbounded growth from long-running dev environments. Resolves `audit-data-architecture-1776791802-migration-history-unbounded-growth`.

### Changed

- **Frontend lint cleanup** — `frontend/src/lib/tableExport.ts` narrows `String(unknown)` calls via `typeof` guards to satisfy `@typescript-eslint/no-base-to-string`. Removed redundant type casts flagged by lint:fix autofix in `useDashboards.ts`, `useSyncUiSettings.ts`, `AuthenticationTab.tsx`, and `layoutStore.ts`. Removed unused `UpdateUserInput` import in `UsersTab.tsx`. No behavior change.

- **Web design guidelines polish** — `min-w-0` on file-column truncate span (`useFileColumns.tsx`) for correct flex truncation; `text-balance` on `PageHeader` h1 for balanced multi-line headings; U+2026 single-character ellipsis in `OAuthProvidersSection` loading state (replacing three ASCII dots). Resolves three `audit-web-design-guidelines-*` findings.

- **Template docs refresh** — `docs/template/DEVELOPMENT.md`, `.aidd/project-structure.md`, `.aidd/app_spec.txt`, and `backend/README.md` updated to reflect the actual guard list (2 guards, not 3) and 20 config sections (stale `healthCheckCleanup`/`docker`/`scheduler` sections removed from doc listings). No code change. Resolves `audit-spernakit-1776783670-project-structure-doc-drift` and `audit-spernakit-1776783671-app-spec-config-sections-drift`.

- **Dependency bumps** — `puppeteer` 24.41.0 → 24.42.0, `typescript-eslint` 8.58.0 → 8.59.0.

### Removed

- **`data/bugs.json`** — Replaced by the `bug_reports` database table. The bug-report submit API is unchanged from the frontend's perspective; the file-based store is no longer written or read.

- **Unused formatter exports** — `formatDate`/`formatDateTime` in `frontend/src/lib/formatters.ts` had no call sites; removed. Resolves `audit-hygiene-1776789420-unused-formatters-exports`.

- **Unused `stopMfaCleanup` export** — `backend/src/routes/auth/mfa-rate-limit.ts` removed the unused cleanup shutdown export. Resolves `audit-hygiene-1776789421-unused-stop-mfa-cleanup`.

## [3.2.1] - 2026-04-20

### Fixed

- **`/settings/bugs` admin table crash on legacy bug entries** — `frontend/src/pages/settings/bugs/BugsTab.tsx` reporter accessor used a non-null cast on `row.metadata`, throwing `TypeError: Cannot read properties of undefined (reading 'reportedBy')` for legacy entries that pre-date the `metadata.reportedBy` field. Discovered fleet-wide during the sv3.2.0 spernakit-tester sweep (3 of 7 apps affected — anywhere old crawltest bug entries persisted). Fix: optional-chain the metadata read.

- **`bugReportService.readBugReports` silently destroyed legacy-shape `data/bugs.json`** — when the file was in the older top-level-array shape (no `bugs`/`lastUpdated` wrapper), `parsed.bugs.map(...)` threw, the catch branch returned an empty result, and the next write call persisted the empty wrapper — _erasing every entry in the file_. Discovered during the a derived app tester re-run, which lost 2 hand-restored bug entries before the issue was caught. Fix: detect the array shape and normalize in memory, never let the catch path overwrite live data.

- **Drizzle migration runner silently ignored on-disk `.sql` files not registered in `_journal.json`** — during sv3.2.0 propagation, the new `mfa_settings` migration `.sql` file was copied to derived apps but `_journal.json` was not updated. The runner walks `journal.entries` (not the directory listing) and reported "No pending migrations" while the table never got created — every login 500'd on the missing table. Fix: add a startup drift check in `backend/src/db/migrate/runner.ts` that fails loudly when orphaned `.sql` files exist on disk without journal entries, instructing the operator to either delete the file or register it.

- **`scripts/setup.ts` instance config inherited production-safe `rateLimit.enabled: true` from defaults** — derived apps post-`spernakit_reset.ps1` shipped `config/{slug}.json` with rate-limit hot, which immediately blocks `spernakit-tester` (per the skill's section 0a pre-check) and trips 429s during crawltest's rapid-fire navigation. `defaults.json` itself stays production-safe (the invariant in `check-config-invariants.ts` enforces that), but `setup.ts` now overrides `rateLimit.enabled` and `rateLimit.authEnabled` to `false` when generating the dev instance file.

- **Command palette omitted `Profile: Security` route** — added in 3.2.0 alongside the MFA frontend but missed in the palette registry. Now listed alongside the other three `Profile: *` entries with a Shield icon.

## [3.2.0] - 2026-04-20

### Added

- **TOTP-based MFA (backend + frontend)** — Complete two-factor-authentication feature, end-to-end. Backend: `backend/src/services/auth/mfaService.ts` (setup, verify, disable, regenerateRecoveryCodes, issueMfaChallengeToken, verifyMfaChallengeToken), `backend/src/services/auth/mfaHelpers.ts` (TOTP validation + recovery-code generation), `backend/src/routes/auth/mfa.ts` (status, setup, verify-setup, verify, verify-recovery, disable, recovery-codes — seven endpoints), `backend/src/routes/auth/mfa-helpers.ts` (post-MFA token issuance), `backend/src/routes/auth/mfa-rate-limit.ts` (per-user sliding-window attempt tracking), `backend/src/db/schema/mfaSettings.ts` (SQLite) + `backend/src/db/schema-pg/mfaSettings.ts` (PostgreSQL variant — schema parity enforced). New drizzle migration creates the `mfa_settings` table. `backend/src/routes/auth/login.ts` now gates cookies behind a challenge token when MFA is enabled, with a safe-fallback branch that logs a warning and bypasses the gate if `mfaPrivateKey` is unset (prevents operator lockout during mid-deployment states). Frontend: `frontend/src/api/mfa.ts` (typed client for all seven endpoints), `frontend/src/pages/auth/MfaVerifyPage.tsx` (challenge screen with TOTP + recovery-code toggle), `frontend/src/pages/profile/MfaSetupDialog.tsx` (QR-code enrollment via `qrcode` lib, inline backup codes, one-step verify), `frontend/src/pages/profile/SecurityTab.tsx` (status / enable / disable / regenerate, with server-configured hint when keys are unset). `frontend/src/api/auth.ts` `login()` returns a discriminated union `{ kind: 'success' | 'mfa' }`; `frontend/src/hooks/useAuth.ts` adds `completeMfaLogin()`; `frontend/src/pages/auth/LoginPage.tsx` navigates to `/mfa-verify` when a challenge is issued. Protected route `/profile/security` + public route `/mfa-verify` registered in `frontend/src/routes.tsx`; `ProfileLayout` gains a Security tab. `shared/src/errorCodes.ts` adds `AUTH_MFA_NOT_CONFIGURED`. `scripts/generate-keys.ts` now generates a third EC P-256 key pair for MFA alongside the JWT access + refresh pairs. Zod `securitySchema` gains `mfaChallengeExpiresIn` (default `'5m'`), `mfaPrivateKey` (default `''`), `mfaPublicKey` (default `''`) — empty-by-default so the MFA gate is opt-in via `bun run generate-keys`. New backend dep: `otpauth@9.5.0`. New frontend deps: `qrcode@1.5.4`, `@types/qrcode@1.5.6`.

- **Config drift guards (three new quality-gate checks)** — Harden the config pipeline against the class of drift discovered in the April config audit. `scripts/check-config-schema-drift.ts` regenerates the JSON schema from Zod in-memory and fails if the committed `config/config-schema.json` is stale — would have caught the March/April sv3.1.16-era stale-schema drift automatically. `scripts/validate-config.ts` extended to validate three files (`backend/src/config/defaults.json`, `config/example.json`, `config/{slug}.json`) against `appConfigSchema`, not just the live instance — catches missing required fields + constraint violations (e.g. the 61-char `encryptionKey` placeholder that failed the schema's `min(64)`). `scripts/check-secrets-shape.ts` compares `config/{slug}.secrets.json` and `config/{slug}.secrets.json.example` for nested-key-structure parity — catches the `interpreter.openai` ↔ `interpreter.zai` class of silent divergence. All three wired into `scripts/smoke.json` `qc` mode and exposed as `bun run check:schema-drift`, `bun run config:validate`, `bun run check:secrets-shape`.

### Fixed

- **Config drift audit (spernakit template + all six derived apps)** — Resolved the April config-file discrepancy sweep: added `testing.crawlSeedRoutes: []` to defaults.json, example.json, and spernakit.json (schema required it but JSON files were missing it); extended the `security.encryptionKey` placeholder from 61 to 68 characters so it satisfies the Zod `min(64)` constraint while still matching the secrets-placeholder regex. Template-only fix; derived apps pick up the change via template sync.

### Changed

- **`docs/template/STACK.md` — Configuration System section** — Documents the inline-vs-split secrets pattern. Inline (default, used by spernakit + most derived apps) keeps app-internal crypto material (`jwtPrivateKey`, `cookieSecret`, `encryptionKey`, `applicationApiKey`) in `config/{slug}.json`. Split (optional, currently only a derived app) factors operator-provided third-party credentials into `config/{slug}.secrets.json` with a sealed-namespace load + `*Ref` indirection + typed `getSecret()` accessor. Lays out the four decision criteria for choosing split: third-party lifecycle, operator-owned, optional feature, provider-expansion growth.

## [3.1.33] - 2026-04-19

### Fixed

- **`snapshot.ts` truncation logic** — `scripts/spernakit-browser/snapshot.ts` output truncation corrected so large DOM/console snapshots no longer silently lose trailing content before being written to the snapshot file.

### Changed

- **Dependency bumps** — `typescript` 6.0.2 → 6.0.3 (root + backend + frontend), `@tanstack/react-query` 5.99.0 → 5.99.2.

### Removed

- **Stale audit reports purged** — `.aidd/audit-reports/LOGIC-2026-04-17.md` and `TECHDEBT-2026-04-17.md` removed; superseded by later audit runs and already-resolved backlog.

## [3.1.32] - 2026-04-19

### Added

- **`docker/wait-and-start-nginx.sh` readiness wrapper** — New supervisord-invoked shell script that polls `/api/v1/health` (configurable via `BACKEND_READINESS_TIMEOUT`, default 60s) before `exec nginx`. Prevents the docker-prod race where nginx accepts proxy traffic during the backend's auto-migrate/seed window and produces 500 cascades on the first crawl. Wired via `docker/supervisord.conf` (nginx command now routes through the wrapper). `Dockerfile` copies + chmods the script. Ported from family-hub's remediation-20260416-docker-prod-backend-500-instability.
- **`TabLayout` horizontally-scrollable strip with gradient fade indicators** — `frontend/src/components/layout/TabLayout.tsx` now renders a scroll-overflow container with leading/trailing gradient fades driven by `scrollLeft`, a `ResizeObserver` for recomputing indicator visibility on width changes, and `scrollIntoView({ inline: 'center' })` on active-tab change. Replaces the prior `md:flex-wrap` behavior that broke when tab count or label length grew. Paired `.scrollbar-none` utility added to `frontend/src/tailwind.css`. Ported from a derived app's TabLayout pattern, now informally relied on by taskboard's CardModal v2.

### Changed

- **Per-mutation `getSafeErrorMessage` on profile forms** — `frontend/src/pages/profile/ProfileForm.tsx` + `PasswordForm.tsx` mutations now surface server 400 validation errors via `toast.error(getSafeErrorMessage(err, fallback))` instead of a generic copy. `ProfileForm` additionally gains app-level email validation (`noValidate`, `validateEmail`, inline `emailError` with `aria-invalid` + `aria-live`, disabled Save while invalid). `frontend/src/api/errorHandling.ts` documents why HTTP 400 is intentionally omitted from `STATUS_MESSAGES` (per-call onError handlers own validation messaging). Backend `backend/src/routes/users/profile.ts` now tags wrong-current-password rejections with `AUTH_ERROR_CODES.AUTH_INVALID_CREDENTIALS` so the frontend's error-code mapping produces a specific toast. Ported from companion-app's remediation-20260418-profile-email-native-validation-silent-fail.
- **`docker/start.sh` DB path derived from `APP_SLUG`** — DB backup path default is now `/app/data/${APP_SLUG}.db` instead of a hardcoded `spernakit.db`. Every derived app's container now targets the correct DB filename without needing a per-app `start.sh` override. Ported from family-hub.
- **`healthCheckRunners.ts` Bun runtime detection** — `memoryHeapCheck` replaces the prior `heapUsed <= heapTotal` ratio test (unreliable on Bun/JSC due to lazy committed working-set growth) with an explicit `typeof globalThis.Bun !== 'undefined'` check. Bun processes now report heap healthy based on the runtime rather than a sampling-dependent ratio. Ported from a derived app.
- **`useBackendLiveness` reachability = any successful HTTP response** — `frontend/src/hooks/useBackendLiveness.ts` no longer gates on `status in ('healthy','degraded')`. The backend-down banner surfaces transport failure (no response), not the server's own health opinion. A backend answering `unhealthy` is still reachable; the banner should only appear when the client literally can't reach the server. Ported from a derived app.

## [3.1.31] - 2026-04-19

### Fixed

- **Command palette exposed `Settings: Backup` to ADMIN** — `frontend/src/components/layout/CommandPalette.tsx` SUB_ROUTES entry `Settings: Backup` had `minRole: 'ADMIN'` while `SettingsLayout.tsx` requires SYSOP for the Backup tab. Result: ADMIN users saw the palette affordance but got redirected on click. Narrowed the palette entry to SYSOP to match the SettingsLayout gate. Extended the `command-palette/feature.json` spec enumeration to include Backup alongside Authentication and Email in the SYSOP-only contract.
- **Share Dashboard dialog URL auto-selects on focus** — `frontend/src/pages/dashboards/ShareDashboardDialog.tsx` now auto-selects the full URL on focus, carries a `title` tooltip showing the complete URL, and renders the URL in `font-mono`. The underlying token was always 64 chars; the dialog's input field was visually clipping the 104-char URL to ~54px width, so testers (and their automation) perceived truncation and copied a prefix that 404'd.
- **Smoke-test dev-mode crawl no longer trips rate limiter** — `scripts/smoke.ts` now disables `rateLimit.enabled` / `authEnabled` in `config/{slug}.json` in-place before running `smoke:dev` or `smoke:screenshots` crawl steps, with a `.pre-crawl-bak` sidecar backup for crash recovery. Restore runs via `try/finally` + exit/signal handlers. Docker-prod already had this (in-container), but dev-mode crawl had no equivalent and hit the 600 req/15min general limiter reliably on late pages like `/files`, cascading into 9+ "insufficient content" failures. `writeRateLimitDisable` helper is now shared between the two code paths; `recoverDevRateLimitBackup` at smoke startup cleans up orphan backups from previous crashed runs.

## [3.1.30] - 2026-04-18

### Fixed

- **Mobile viewport blank content area** — `frontend/src/components/layout/AppShell.tsx` `SidebarLayout` previously used `grid-cols-[0_1fr]` at base with `md:grid-cols-[4rem_1fr]` / `md:grid-cols-[15rem_1fr]` at tablet+. The sidebar wrapper's `hidden md:flex` (display: none at mobile) dropped it out of grid flow entirely, so the main content div landed in the 0-width first track and pages rendered blank despite the DOM being populated. Replaced mobile with a single-track `grid-cols-1` while preserving md+ animation. Surfaced during 2026-04-18 dogfood; affected 4 apps simultaneously.
- **Workspaces list Owner column displayed raw user ID** — `backend/src/services/workspace/workspaceCrud.ts` `list()`/`getById()`/`create()` now LEFT JOIN `users` on `workspaces.owner_id` and surface `ownerUsername: string | null`. `backend/src/routes/workspaces/crud.docs.ts` OpenAPI examples updated. Frontend `Workspace` type + `WorkspaceList.tsx` Owner cell render the username with `ownerId`/"You" fallback.
- **`CreateUserDialog` missing inline validation feedback** — `frontend/src/pages/settings/users/CreateUserDialog.tsx` + `UserFormFields.tsx` now use a touched-field map with pure validator helpers; errors surface on blur or submit attempt with `aria-describedby`/`aria-invalid` wiring and persistent helper text. The v3.1.29 disabled-until-valid gate stays, but users now see _why_ the Create button is disabled.
- **`RegisterPage` silent rejection of invalid submissions** — Replaced HTML5-only `required`/`pattern` validation with application-level validation inside `useActionState`. Per-field inline errors render with `text-destructive text-sm` and `aria-invalid`/`aria-describedby`; `noValidate` added so the native HTML5 UI never short-circuits. The top-level `AuthFormError` preserves network/API error display.
- **`useWorkspace` reconciliation overwrote stored id during transient empty queries** — `frontend/src/hooks/useWorkspace.ts` reconciliation effect now early-returns while `workspaces.length === 0` (transient empty) and when the stored id is still present in the loaded list. It only writes the default fallback when there's genuinely no selection or the stored id is no longer accessible. Fixes workspace switcher resetting to Default after navigation.

### Infrastructure

- **`Dockerfile` skips puppeteer Chrome download** — Added `ENV PUPPETEER_SKIP_DOWNLOAD=true` before `RUN bun install --frozen-lockfile` in the `base-builder` stage. Puppeteer is a dev-only dependency used by `scripts/crawltest.ts` outside the container; skipping its Chrome postinstall fetch avoids flaky `storage.googleapis.com` failures during `docker build`. Derived apps propagate the same fix.

## [3.1.29] - 2026-04-18

### Added

- **Settings → OAuth/SSO Test Connection wired end-to-end** — `backend/src/routes/settings/oauth.ts` exposes a `POST /settings/oauth/:provider/test-connection` endpoint that performs a live credential probe against the configured OAuth provider. Frontend `OAuthSettingsTab` button now invokes the endpoint and surfaces success/failure via sonner toasts instead of the previous no-op placeholder.

### Changed

- **`autoMigrate` split into focused `migrate/` modules** — Extracted `backend/src/db/migrate/{backup,idempotency,journal,runner,validate}.ts` sibling files from the monolithic orchestrator. `autoMigrate.ts` remains as the public entry point; the submodules are each ≤265 lines and test in isolation.
- **OpenAPI route detail blocks extracted** to `*.docs.ts` sidecar files — `backend/src/routes/{dashboards,users,workspaces}/crud.docs.ts` (new) hold the verbose OpenAPI schema descriptions that previously inflated the route handlers. Route files now import the doc blocks, trimming ~400 lines from the primary route modules without changing behavior or the generated spec.
- **`ManageMembersDialog` decomposed** into `AddMemberFormRow`, `BulkMemberActions`, `MemberList`, and `UserPicker` sibling files under `frontend/src/pages/workspaces/`. Parent dialog now only composes; each child is independently reusable and under the 200-line ceiling.
- **Frontend timestamp rendering consolidated** through the shared `useFormatters()` hook — audited pages dropped ad-hoc `date-fns` imports and `new Date(...).toLocaleString()` calls in favor of the single formatting entry point, ensuring locale-consistent rendering app-wide.
- **Sidebar animation driven by `grid-template-columns`** instead of the prior `width` + `margin-left` pair in `components/layout/AppShell.tsx`. Eliminates the reflow jank at the sidebar collapse/expand boundary, and `prefers-reduced-motion` now cleanly disables the single grid transition.
- **`oauthService` facade** exposes provider-settings through a single service surface — `backend/src/services/oauthService/index.ts` re-exports the narrow public API (`listProviders`, `updateProviderSettings`, `testProviderConnection`); route files consume the facade rather than reaching into submodules.
- **`passwordChangeGuard` routes through `userService` facade** — `backend/src/plugins/passwordChangeGuard.ts` now invokes `userService.isPasswordChangeRequired()` rather than importing from internal submodules directly, flattening a plugin-internal dependency chain flagged by the `HYGIENE` audit.
- **`UserStatusBadge` relocated** from `frontend/src/components/shared/UserStatusBadge.tsx` to `frontend/src/pages/settings/users/UserStatusBadge.tsx` — SSOC audit: it was only consumed by the settings/users page, not by any shared component.
- **Redundant `frontend/src/api/types.ts` barrel shim removed** — the shim re-exported from `frontend/src/api/types/index.ts`; consumers now import from the canonical `types/` directory directly.
- **`handleLogout` nested conditionals flattened** in `frontend/src/pages/auth/` — early returns replace the prior nested if/else ladder for each logout code path (expired, forced, user-initiated).
- **OAuth provider settings loader flattened** — `backend/src/services/oauthService/loader.ts` now fetches provider config in a single DB round-trip rather than iterating per-provider.
- **Drizzle schema note** on `file_uploads` soft-delete — schema file adds an inline comment documenting the soft-delete semantics and the unique-interaction invariant between `(workspace_id, user_id, file_hash)`.

### Performance

- **`notifications.markAllAsRead` batched UPDATE** — `backend/src/routes/notifications/` now issues a single `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL` rather than fetching unread IDs and updating per-row. Drops the operation from O(N) round-trips to O(1) for the common "mark all read" action.
- **Rate-limit expired-entry cleanup batched** — `backend/src/services/rateLimitService.ts` deletes expired rate-limit rows in 1000-row batches rather than one unbounded DELETE, matching the `health_logs` cleanup pattern from v3.1.28.
- **`business-metrics` GET endpoints cached 5 min** — `backend/src/routes/metrics/business.ts` wraps aggregation queries in a 5-minute in-memory cache keyed by workspace + time-window. Dashboard tiles no longer re-aggregate on every poll.
- **`file_uploads` compound index** — `idx_file_uploads_is_deleted_deleted_at` added on `(is_deleted, deleted_at)` to support the purger's `WHERE is_deleted = 1 AND deleted_at < ?` query path.

### Fixed

- **Explicit `width`/`height` on logo `<img>` tags** — `components/shared/AppLogo.tsx` and `components/layout/SidebarHeader.tsx` set intrinsic dimensions, eliminating CLS when the logo loads after initial paint.
- **Password reset email `.catch()` added** — `backend/src/routes/auth/password-reset.ts` now attaches a `.catch(logError)` to the fire-and-forget email send, so a transient SMTP failure logs the error instead of surfacing as an unhandled promise rejection in pino.
- **`health` page barrel** dropped redundant external hook re-exports that were never consumed outside the page directory.
- **Create User submit disabled until fields validate** — `frontend/src/pages/settings/users/CreateUserDialog.tsx` now disables the submit button when any required field fails its Zod-less native validation, matching the behavior of other forms on the page.

### Audited (clean sweep)

Completed 14 audits closing the v3.1.28 audit suite with all findings resolved or consolidated into parent feature specs: re-runs of `SPERNAKIT`, `REACT_BEST_PRACTICES`, `COMPOSITION_PATTERNS`, `WEB_DESIGN_GUIDELINES`, `FEATURE_INTEGRATION`, `HYGIENE`, `SECURITY`, `REORG`, `SSOC`, `COMPLICATION`, `DEAD_CODE`, `LOGIC`, `TECHDEBT`, `SCHEMA_CONSTRAINTS`, `DATA_ARCHITECTURE`. Roadmap + status tracking synced to 111/111 features complete.

## [3.1.28] - 2026-04-17

### Fixed

- **Atomic login failed-attempt counter and lockout** — `backend/src/routes/auth/login.ts` now increments `failed_login_attempts` and applies the lockout timestamp inside a single `db.transaction()`, so concurrent failed login requests can no longer race past the lockout threshold. Previously two near-simultaneous bad-password attempts could both read `failed_login_attempts = N-1`, each increment to `N`, and neither trigger the lockout at `N+1`.
- **Password strength validated before history** in `changeUserPassword` — `backend/src/services/users/userService.ts` reorders validation so the new password is checked against the configured strength policy before `verifyPasswordHistory()` runs. Prevents wasting the history lookup (and leaking timing signal) on passwords that can never satisfy the policy.
- **Password-change guard circular dependency broken** — `backend/src/utils/passwordChangeCache.ts` (new) holds the session-scoped "must change password" flag, replacing the prior `authPlugin ↔ passwordChangeGuard` import cycle flagged by `HYGIENE` audit.
- **`file_uploads` composite index renamed** to `idx_file_uploads_workspace_user_uploaded_at` to match the `idx_{table}_{columns}` convention (was `idx_user_workspace_uploaded_at`).
- **Manual health cleanup batched** — `backend/src/services/healthService.ts` now deletes stale `health_logs` and expired `health_alerts` in bounded batches (1000 rows each) rather than a single unbounded `DELETE`, preventing DB lock-holding on large tables.
- **Shared GPU-accelerated `Spinner`** — `frontend/src/components/ui/spinner.tsx` is now the single loading indicator; seven page/component call sites (`ForcePasswordChangePage`, `LoginPage`, `RegisterPage`, `ResetPasswordPage`, `ResetPasswordConfirmPage`, `UsernameHint`, `useFileColumns`) dropped ad-hoc `animate-spin` `<div>`s.
- **`transition-all` replaced with explicit properties** on `components/ui/tabs.tsx` `TabsTrigger` — avoids animating every changing CSS property (including layout) and its known jank at tab boundaries.
- **Unicode ellipsis (`…`)** in loading labels across auth/settings forms for consistent typography.
- **TopBar nav overflow at 1440px** — `components/layout/TopBar.tsx` trims spacing so the workspace selector, search, and action pills fit without wrapping.
- **Stale login error cleared** when demo account buttons are clicked — `components/auth/DemoAccountButtons.tsx` resets the error before submit so users don't see a prior failure overlayed with the new attempt.
- **3 unused exports removed** flagged by knip: `generateApiKeySignature` sibling export and two `apiKeySignatureService` re-exports no longer used anywhere.

### Changed

- **`adminResetUserPassword` extracted** into `backend/src/routes/users/adminResetUserPassword.ts` sibling module — the parent users route file previously exceeded the 30-line handler threshold.
- **`WorkspaceSettingsPage` tabs split** into `WorkspaceGeneralTab`, `WorkspaceBrandingTab`, and `WorkspaceDashboardTab` sibling files (`frontend/src/pages/workspaces/`). Parent page shrank from ~800 lines to ~400 and now only composes the three tab contents.
- **`workspaces` PUT/DELETE handlers** promoted to named functions (`updateWorkspace`, `deleteWorkspace`) in `backend/src/routes/workspaces/workspaces.ts` — same 30-line handler-extraction convention as other route groups.
- **`apiKeySignatureService` exports narrowed** to only what `apiKey` guard and the CLI actually consume. Removed unused re-exports.
- **`FileUpload` relocated** from `frontend/src/pages/files/FileUpload.tsx` to `frontend/src/components/shared/FileUpload.tsx` — SSOC audit: it's consumed by pages outside `files/` (workspace logo upload, profile avatar) so it belongs in `components/shared/`.
- **Manual memoization dropped** where React Compiler handles it — removed `useMemo`/`useCallback`/`React.memo` wrappers from components whose deps and render cost the compiler already optimizes. Specific sites listed in the audit-complication feature spec.

### Audited (clean sweep)

Completed 14 audits closing the full v3.1.27 audit suite (all findings resolved or moved to parent feature specs): `SPERNAKIT`, `REACT_BEST_PRACTICES`, `COMPOSITION_PATTERNS`, `WEB_DESIGN_GUIDELINES`, `FEATURE_INTEGRATION`, `HYGIENE`, `SECURITY` (0 issues), `REORG`, `SSOC`, `COMPLICATION`, `DEAD_CODE`, `LOGIC`, `TECHDEBT` (0 new issues), `SCHEMA_CONSTRAINTS`, `DATA_ARCHITECTURE`. 14 audit-finding feature directories consolidated into their parent feature specs; status tracking now reports 93/93 features passing.

## [3.1.27] - 2026-04-16

### Changed

- **Feature spec naming convention consolidated** — Renamed 12 `feature-20260414-*` directories to clean descriptive slugs (e.g. `admin-password-reset`, `auth-rate-limit-toggle-ui`, `command-palette-launcher`). Removed deleted audit finding and example-test-patterns specs. Added 11 new platform feature specs and updated `workspace-crud-api` spec.
- **Wider centered container** — Increased `AppShell` centered layout max-width from `max-w-7xl` (1280px) to `max-w-[95rem]` (1520px), giving content-dense pages more breathing room on wide monitors.

### Fixed

- **Rate limiting disabled during docker-prod crawl tests** — `ensureDockerProdDirs()` now patches the copied config to set `rateLimit.enabled` and `rateLimit.authEnabled` to `false` before the Docker container starts. Prevents rapid-fire crawltest navigation from triggering 429 cascades in derived apps whose config ships with rate limiting enabled. The override only affects the test container.

## [3.1.26] - 2026-04-15

### Added

- **Per-workspace settings, branding, and dashboard customization UI** — `backend/src/routes/workspaces/settings.ts` adds GET/PATCH endpoints for workspace-level settings (branding color, logo URL, custom dashboard title, welcome message). Frontend `WorkspaceSettingsPage` exposes these fields inside the existing Settings area, scoped to ADMIN+. Workspace branding is read by the dashboard shell to optionally override the default app name and accent.
- **OAuth/SSO provider toggle UI and management API** — `backend/src/routes/settings/oauth.ts` adds CRUD endpoints for OAuth provider configurations (enable/disable, client ID/secret, scopes). `frontend/src/pages/settings/OAuthSettingsTab.tsx` provides a SYSOP-only tab listing configured providers with enable toggles and an add/edit dialog. Extends `backend/src/db/schema/oauthProviders.ts`.
- **SYSOP impersonation with stop-impersonating banner** — `backend/src/routes/users/impersonation.ts` adds `POST /users/:id/impersonate` and `POST /auth/stop-impersonating` endpoints (SYSOP-only). Session stores `impersonatedBy` when active. `frontend/src/components/layout/ImpersonationBanner.tsx` renders a sticky top banner showing the impersonated user's name with a "Stop Impersonating" button; the banner is hidden in normal sessions.
- **Admin password reset endpoint and UI** — `backend/src/routes/users/adminPasswordReset.ts` adds `POST /users/:id/reset-password` (ADMIN+), generating a secure temporary password via `encryption.generateSecureSecret` and setting `requiresPasswordChange: true`. `frontend/src/pages/settings/users/AdminPasswordResetDialog.tsx` invokes the endpoint from the user management table's action menu, displaying the generated temporary password for the admin to relay.
- **Searchable user picker in Manage Members dialog** — `frontend/src/pages/workspaces/ManageMembersDialog.tsx` replaces the plain user dropdown with a searchable combobox backed by a debounced `GET /users?search=` query. Supports keyboard navigation; already-added members are excluded from results.
- **Reset Onboarding visible while checklist is in progress** — `frontend/src/pages/onboarding/OnboardingChecklist.tsx` now shows the "Reset Onboarding" button whenever at least one step is complete and the checklist is not yet fully finished, rather than only after full completion. Lets users who partially completed onboarding restart without needing to finish.
- **SQL Sandbox Safe Mode toggle** — `frontend/src/pages/database-admin/SqlSandboxPage.tsx` adds a Safe Mode toggle that restricts the sandbox to `SELECT`-only queries, blocking any statement beginning with `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, or `REPLACE`. The restriction is enforced client-side before submission; the backend's own read-replica guard remains unchanged.
- **Visible command palette launcher in header** — `frontend/src/components/layout/Header.tsx` adds a `⌘K` pill button beside the search area that opens the command palette (`useCommandPalette().open()`). Supplements the existing keyboard shortcut with a discoverable click target for mouse-only users.
- **SYSOP-configurable auth rate limit toggle** — `backend/src/routes/settings/security.ts` exposes a new `PATCH /settings/security` field `authRateLimitEnabled` writable by SYSOP. Frontend `SecuritySettingsTab` adds a toggle card for "Auth Rate Limiting" (default ON) alongside the existing security toggles. Delegates to `rateLimit.authEnabled` in config at runtime via the existing `isAuthRateLimitBypassed()` helper.
- **`plugins/clientIp.ts` — WeakMap bridge for accurate audit IP capture** — New `backend/src/plugins/clientIp.ts` registered first in the Elysia plugin chain. Its `onRequest` hook calls `captureClientIp(server, request)`, storing the socket IP in a `WeakMap<Request, string>` while `server` is still in scope. `getClientIp(request)` checks the WeakMap cache before falling back to the live `server.requestIP()` call. Fixes `ip_address='0.0.0.0'` written to all `audit_logs` rows — root cause was `server.requestIP(request)` returning `null` in `onAfterResponse` because Bun closes the socket before that lifecycle hook fires.

### Changed

- **Custom dashboards scoped to active workspace** — `backend/src/routes/dashboards/crud.ts` filters dashboard list and ownership checks by `workspaceId` (derived from the session's active workspace). `frontend/src/pages/dashboards/DashboardListPage.tsx` passes `workspaceId` in the query; switching workspaces via the workspace selector now shows only that workspace's dashboards. Shared dashboard tokens remain workspace-agnostic.
- **`apiKey` plugin folded into `authPlugin`** — `backend/src/plugins/authPlugin.ts` absorbs the former `backend/src/plugins/apiKey.ts`. The combined plugin resolves both session cookies and `Authorization: Bearer <apiKey>` in a single `derive` pass, eliminating the double-registration pattern and the duplicate `user` derivation ordering hazard. `create-api-app.ts` registration updated; `apiKey.ts` removed.

### Fixed

- **Database admin: `tableName` regex widened to accept digit-containing identifiers** — `backend/src/routes/database-admin/index.ts` updated the `tableName` validation pattern from `^[a-zA-Z_][a-zA-Z0-9_]*$` to also accept leading underscores followed by digits (e.g. `_v2_sessions`, `log2024`). Previously tables whose names contained leading-digit segments after an underscore were rejected with a 400 before the query ran.
- **Client IP capture** — See `plugins/clientIp.ts` entry under Added; audit logs now record the real socket IP instead of `0.0.0.0`.

### Audited (clean sweep)

Completed 14 audits closing the full v3.1.26 audit suite with all findings resolved: `SPERNAKIT`, `REACT_BEST_PRACTICES`, `COMPOSITION_PATTERNS`, `WEB_DESIGN_GUIDELINES`, `FEATURE_INTEGRATION`, `HYGIENE`, `SECURITY`, `REORG`, `SSOC`, `COMPLICATION`, `DEAD_CODE`, `LOGIC`, `TECHDEBT`, `SCHEMA_CONSTRAINTS`, `DATA_ARCHITECTURE`. Feature tracking reports 92/92 features passing (100% complete).

## [3.1.25] - 2026-04-14

### Added

- **`dbHelpers.checkEntityExists` + `softDeleteEntity`** — `backend/src/utils/dbHelpers.ts` adds two generic soft-delete helpers backported from `acme-monitor/backend/src/utils/dbHelpers.ts`. Both are generic over `IdType extends number | string` so apps using either numeric (default spernakit core) or string primary keys can share the same helper. `checkEntityExists(table, id)` returns the row when `isDeleted = false` or `null`; `softDeleteEntity(table, id, deletedBy)` stamps `isDeleted = true`, `deletedAt = now`, `deletedBy`. Both assume the standard spernakit soft-delete column set (`id`, `isDeleted`, `deletedAt`, `deletedBy`). New imports: `and`, `eq` from `drizzle-orm`, `SQLiteTable` type, `getDb` from `../db/index.ts`.
- **`originValidation.isBackendSameOrigin`** — `backend/src/utils/originValidation.ts` adds an `isBackendSameOrigin(origin, config)` helper that accepts the Origin header when it matches the backend's own listen address (host + port). This unblocks single-port deployments where a reverse proxy or the app itself serves the frontend from the same origin as the API, so the browser's Origin header matches the backend port rather than the statically configured `frontendUrl`. Backported from `sketch-game/backend/src/utils/originValidation.ts`. Accepted hosts: `localhost`, `127.0.0.1`, and `config.server.host` (unless `0.0.0.0`). New module-scope constant `ORIGIN_HOST_PORT_PATTERN`.
- **`encryption.generateSecureSecret(length)`** — `backend/src/utils/encryption.ts` adds a public `generateSecureSecret(length = 32)` helper that returns a hex-encoded cryptographically random string (2×length characters). Uses `crypto.getRandomValues`. Useful for webhook secrets, short-lived API tokens, invitation codes, or any random identifier that must be unpredictable. Backported from `taskboard/backend/src/utils/encryption.ts`.
- **`validation.requireRouteId` + `optionalRouteId`** — `backend/src/utils/validation.ts` adds two route-parameter helpers that wrap the existing `parseId()`. `requireRouteId(value, name)` throws `Invalid or missing ${name}` if the param is absent or not a positive integer, returning `number` on success. `optionalRouteId(value, name)` returns `undefined` for absent params, throws `Invalid ${name}` only for present-but-invalid values, returning `number | undefined` on success. Lets route handlers collapse the `parseId` → branch → 400-throw dance into one call. Backported from `taskboard/backend/src/utils/validation.ts`.

### Changed

- **`originValidation.isOriginAllowed` — frontend-URL check promoted above dev-mode branches** — The `origin === config.server.frontendUrl` comparison now runs immediately after the `allowNoOrigin` short-circuit and the new `isBackendSameOrigin()` check, BEFORE the `frontendDevOrigins` / `allowedOrigins` / dev-localhost / `trustProxy` branches. Production deployments with a correctly configured `frontendUrl` no longer need to also list the same URL in `cors.allowedOrigins` to pass. Previously the equality check sat near the end of the function, so mis-ordered configuration could cause a same-origin request to fall all the way through and get rejected.
- **`originValidation.isOriginAllowed` — structured rejection warn log** — Rejected origins now produce a `logger.warn({ category: 'security', origin, frontendUrl, allowedOrigins }, 'CORS: origin rejected')` entry before returning `false`. Previously the only log emission was the `trustProxy + empty allowedOrigins` warning, so CORS failures in production were silent and near-impossible to debug from log output alone. Both backported from sketch-game.
- **`useContainerWidth` — ResizeObserver callback batched via `requestAnimationFrame`** — `frontend/src/hooks/useContainerWidth.ts` replaces the `startTransition(() => setWidth(...))` batching pattern with a `requestAnimationFrame`-based `schedule()` helper that collapses multiple observer callbacks within the same frame into a single state update and cancels the pending rAF on cleanup. Required because recharts v3 under React 19 + StrictMode + React Compiler re-measures its container inside the same render phase, re-triggering the ResizeObserver and causing an infinite `setState` loop with `startTransition`. rAF breaks the cycle by yielding to the browser between the observer notification and the state commit. Backported from `taskboard/frontend/src/hooks/useContainerWidth.ts`. Four active template consumers benefit immediately: `ChartWrapper`, `CustomDashboardPage`, `MetricChart`, `HealthTimeline`.

### Rejected backport candidates (documented for future reference)

- **`frontend/src/api/requestHelpers.ts` `buildQueryParams` signature change** — The companion-app derivative flipped the return type from `Record<string, string> | undefined` to always-`Record<string, string>` (empty object when no params). All five spernakit API modules (`audit.ts`, `users.ts`, `notifications.ts`, `files.ts`, `databaseAdmin.ts`) actively depend on the `| undefined` return to drive conditional spread into the `params` option of `apiClient.get()`. Backporting the donor version would force rewriting every call site for no behavioral benefit — the template contract is strictly cleaner. Companion-app's local divergence should be reconciled or documented via `.templateoverrides` in that app.
- **`DuplicatePendingAssignmentError → HTTP 409` pattern from family-hub** — Would require adding a new generic error class (`DuplicateError` / `HttpConflictError`) to a new `backend/src/utils/errors.ts`. No core template service currently throws duplicate-pending errors, so the class would land without an immediate consumer. Deferred until a template feature needs 409 semantics.

## [3.1.24] - 2026-04-14

### Added

- **`rateLimit.authEnabled` toggle** — `backend/src/config/configSchemas/rateLimit.ts` adds a dedicated `authEnabled: boolean` (default `true`) so auth-endpoint throttling can be flipped independently of the general `rateLimit.enabled` flag. `authRateLimitPlugin` consults a new `isAuthRateLimitBypassed()` helper in `plugins/rateLimit/helpers.ts`. Lets dev disable login lockouts during scripted multi-role test runs while production keeps auth limits on, and unblocks SYSOPs needing to flip the toggle without disabling all request throttling. `config/example.json` updated.
- **`useAuthorization().isOperator()`** — `frontend/src/hooks/useAuthorization.ts` exposes a new `isOperator()` helper (`hasMinRole('OPERATOR')`) so dashboard/list pages can hide mutate-only UI from VIEWER accounts without ad-hoc role string comparisons.
- **Auth security toggle test scenarios** — `.aidd/testing-scenarios.md` adds two new `/spernakit-tester` scenarios covering the `rateLimit.authEnabled` flip and the "Require Password Change on First Login" flow (toggle ON vs OFF). Existing scenarios for Onboarding, forgot-password, Edit User, and VIEWER-RBAC tightened to specify exact end-to-end steps and expected hidden controls.

### Changed

- **Dashboard CRUD requires OPERATOR** — `backend/src/routes/dashboards/crud.ts` and `routes/dashboards/templates-import.ts` upgraded create/update/delete/import handlers from `requireAuth` to `requireRoleFresh('OPERATOR')`. VIEWER accounts can still GET dashboards; only OPERATOR+ can mutate. Frontend `DashboardListPage`, `DashboardCard`, `DashboardGrid`, `DashboardHeader`, and `CustomDashboardPage` thread a `canMutate` prop derived from `isOperator()` so the New/Import/Template/Edit/Delete/Add Widget controls are hidden for VIEWERs (rather than failing on submit), and empty-state copy adapts ("No dashboards have been shared with you yet." vs the create-from-scratch nudge).
- **Dashboard route registration order** — `backend/src/create-api-app.ts` registers `dashboardTemplatesRoutes` BEFORE `dashboardCrudRoutes` so the literal `/dashboards/shared/:token` and `/dashboards/templates` routes match before Elysia falls through to the numeric `/dashboards/:id` matcher. Inline comment added.
- **Dev seed honors password-change toggle** — `backend/src/db/seed/users.ts` reads `getAuthSettings().requirePasswordChange` instead of hard-coding `requiresPasswordChange: true`. When the "Require Password Change on First Login" toggle is OFF (default), seed users land directly on `/dashboard`; when ON, the historical secure-by-default policy is preserved. `resetDevSeedPasswords()` mirrors the same logic, clearing the flag only when the toggle is OFF so admins who already cleared it for their account aren't re-armed on every dev restart. The historical "INTENTIONAL: ...settled policy" comment block was rewritten to document the new toggle-driven behavior.
- **`withEmptyDefault()` switched to `prefault`** — `backend/src/config/configSchema.ts` replaces `schema.optional().transform((v) => schema.parse(v ?? {}))` with `schema.prefault({} as never)`. Zod 4 `toJSONSchema()` cannot represent transforms, so the previous pattern crashed `bun run config:schema` with `Transforms cannot be represented in JSON Schema`. `prefault` substitutes `{}` BEFORE parsing, which still triggers each sub-schema's field-level defaults but is fully representable in JSON Schema, so config-schema regeneration works again.
- **`EditUserDialog` form hydration** — `frontend/src/pages/settings/users/EditUserDialog.tsx` now seeds the form by tracking the last-hydrated user id in component state and re-syncing during render whenever the dialog opens for a different user. Replaces a previously-empty initial form (admins were seeing blank username/email/role fields when opening the dialog from the users table) without introducing a `useEffect(setState)` cascade that the `react-hooks/set-state-in-effect` rule flags. `UsersTab.tsx` `onUpdate` now passes a per-call `onSuccess` to close the dialog after a successful edit, mirroring the create-user pattern.

### Fixed

- **CSRF exemption for password-reset endpoints** — `backend/src/plugins/csrf.ts` adds `/api/v1/auth/forgot-password` and `/api/v1/auth/reset-password` to `CSRF_EXEMPT_PATHS`. Both endpoints are anonymous by design and cannot satisfy a session-bound CSRF token; they fall through to `validateUnauthenticatedOrigin()` for protection. Previously the forgot-password form failed with 403 on first submit from a logged-out browser.

### Docs

- **`backend/src/db/seed/users.ts` comment overhaul** — Replaced the obsolete "settled policy" comment with a longer explanation of the new toggle-driven behavior, including the v3.1.24 bug-history reference.

## [3.1.23] - 2026-04-13

### Fixed

- **CI: vite build `--configLoader native`** — `frontend/package.json` dropped the `--configLoader native` flag from the `build` and `dev` scripts. The flag forced Vite to use Node's native ESM loader, which cannot parse `vite.config.ts` without a TypeScript loader hook — a silent break that only surfaced in CI (Node environment) while local runs under Bun masked the issue. Default bundle loader (esbuild) works in both runtimes.
- **CI: Node 20 deprecation warning** — `.github/workflows/ci.yml` sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` in the workflow env to opt into Node 24 for SHA-pinned actions (`actions/checkout@v4`, `oven-sh/setup-bun@v2`) ahead of the June 2026 forced upgrade. Silences the runner warning without changing the pins.

### Fixed — template remediation backports (from /spernakit-tester findings)

- **Create User dialog auto-close** — `UsersTab.tsx` now passes a per-call `onSuccess` to `createMutation.mutate` that closes the dialog. Mirrors the shared-hook `stdCallbacks` pattern without moving dialog state into the hook.
- **Add Widget dialog auto-close** — `useDashboardWidgets.ts` gained an optional `onAddWidgetSuccess` callback; `CustomDashboardPage.tsx` wires it to `setAddWidgetOpen(false)`; the existing `setNewWidget` reset is now inside the success branch so failed submissions preserve user input.
- **Force-password-change escape hatch** — `ForcePasswordChangePage.tsx` gained a Sign-out button (inside `CardContent`, `variant="ghost"`) that calls `useAuth().logout()` — the canonical `authApi.logout()` + `clearUser()` composite that invalidates the server session. Previously the page was a dead-end trap with no way out.
- **Schedule interval display format** — `frontend/src/lib/formatters.ts` gained `formatScheduleExpression(value)` that cascades `ms → s → m → h → d` when divisible. `TaskRow.tsx` renders the formatted value in the non-editing display path. Examples: `168h` → `7d`, `60000ms` → `1m`. Cron patterns and unknown formats pass through unchanged.
- **Create User form validation feedback** — `CreateUserDialog.tsx` + `UserFormFields.tsx` now surface per-field inline errors with `aria-invalid`/`aria-describedby` wiring. New optional props `emailError?: string` / `usernameError?: string` on `UserFormFields` use conditional-spread to stay compatible with `exactOptionalPropertyTypes: true`. `handleSubmit` validates against `USERNAME_MIN_LENGTH`/`PASSWORD_MIN_LENGTH`/`isValidEmail` from `@/lib/validation` and returns early without invoking `onCreate` on failure. `EditUserDialog` continues to compile by omitting the optional props.
- **Audit plugin global scope** — `backend/src/plugins/audit.ts` uses `.onAfterResponse({ as: 'global' }, handler)` so the hook propagates to child Elysia instances registered via `.use()`. Without the scope modifier, routes bundled into `routePlugins` never triggered the audit handler, silently dropping mutation log entries across infrastructure routes in derived apps.

## [3.1.22] - 2026-04-13

### Changed

- **Dependency bumps** — `lru-cache` 11.3.3 → 11.3.5, `@tanstack/react-query` 5.97.0 → 5.99.0, `react-router-dom` 7.14.0 → 7.14.1, `globals` 17.4.0 → 17.5.0, `typescript-eslint` 8.58.1 → 8.58.2.

### Added

- **Testing scenarios** — Added `.aidd/testing-scenarios.md` with 20 curated `/spernakit-tester` scenarios covering dashboards, RBAC roles (SYSOP/ADMIN/MANAGER/OPERATOR/VIEWER), API keys, OAuth/SSO, theme preferences, scheduled tasks, and the database explorer.

## [3.1.21] - 2026-04-13

### Added

- **`.templateoverrides` enforcement in drift checker** — `scripts/check-template-drift.ts` now honors the per-app `.templateoverrides` file (DELETED/SKIP/KEEP entries with optional inline reasons) that was orphaned when the auto-apply tool was removed in v3.1.18. New `loadTemplateOverrides(repoRoot)` helper in `template-shared.ts` parses the file; new `applyTemplateOverrides(results, overrides)` post-processor converts drifted SKIP/KEEP and missing DELETED entries to `suppressed` status. Suppressed files no longer count toward the "needs attention" total and appear under a dedicated `Suppressed (per .templateoverrides)` section.

## [3.1.20] - 2026-04-13

### Fixed

- **Auth: CSRF token availability on force-password-change page** — Ensured the CSRF token is fetched before render so the change-password form on the forced-rotation flow can submit without a 403.
- **Workspaces: create dialog auto-close** — `CreateWorkspaceDialog` no longer auto-closes mid-typing when an unrelated state update fires.

## [3.1.19] - 2026-04-12

### Fixed

- **Auth: cold-start session redirect** — `tokenRefresh.ts` now distinguishes genuine session expiry (user was authenticated, refresh failed → `/login?expired=1`) from cold-start anonymous 401 (never had a session → plain `/login`). Prevents confusing "session expired" message on first visit.
- **Data architecture: dashboard widget cap** — Dashboard create/update enforces `MAX_WIDGETS_PER_DASHBOARD = 100`; widget query uses `.limit()` to prevent unbounded results.
- **Data architecture: workspace member cap** — Workspace member query capped at `MAX_WORKSPACE_MEMBERS = 500` to prevent runaway result sets.
- **Security: committed secrets gate** — `check-application.ts` now verifies tracked config files (`defaults.json`, `config/example.json`) contain only placeholder values for secret-backed keys; fails the QC pipeline if real secrets are committed.
- **Code quality: string setting parser** — Extracted `parseStringSetting` helper in `app-features.ts`, replacing two duplicate inline parse-and-fallback blocks for layout mode and super-theme.
- **Code quality: register rollback** — Registration rollback now uses `hardDeleteUserForRollback` (encapsulated in `userCrud.ts`) instead of inline `db.delete()` with direct schema import.
- **Code quality: UserStatusBadge relocation** — Moved from `pages/settings/users/` to `components/shared/` for cross-page reuse.
- **Code quality: workspace roles constant** — Extracted `WORKSPACE_ROLES` to `pages/workspaces/constants.ts`, eliminating duplicate array literals in `ManageMemberRow` and `ManageMembersDialog`.
- **Forms: HTML required attributes** — Password change, email test, and broadcast dialog forms now use `required` attribute on inputs, replacing JavaScript-only disabled-button validation.
- **Deprecation cleanup** — Removed `isLoaded` from `useAppFeatures` (deprecated in v3.1.17 in favour of `isAvailable`).
- **Migration cleanup** — Removed dead migration `20260411000000_index_drift_fix.sql` and cleaned migration history.
- **Template manifest** — Added 18 newly recognized infrastructure files to `template-manifest.json`.
- **Crawltest: bug report selector** — Updated bug report button selector to use substring match (`*=`) for the renamed `aria-label` ("Report a bug or request a feature").

### Audited (clean sweep)

Completed 15 audits closing the full v3.1.18 audit suite with all findings resolved: `SPERNAKIT`, `REACT_BEST_PRACTICES`, `COMPOSITION_PATTERNS`, `WEB_DESIGN_GUIDELINES`, `FEATURE_INTEGRATION`, `HYGIENE`, `SECURITY`, `REORG`, `SSOC`, `COMPLICATION`, `DEAD_CODE`, `LOGIC`, `TECHDEBT`, `SCHEMA_CONSTRAINTS`, `DATA_ARCHITECTURE`.

## [3.1.18] - 2026-04-10

### Removed

- **`scripts/template-upgrade.ts` auto-apply tool** — The auto-apply tool silently clobbered domain-extended template files in apps without `.templateoverrides` coverage. During the 2026-04-10 sv3.1.17 propagation, a single `--apply` run on a derived app stripped `routeDetail` from `responseExamples.ts`, `seedBuiltInRecipes` from `seed/index.ts`, and 6+ fields from app-specific stores/components, cascading into 10+ typecheck errors unrelated to the intended template changes. The 5% efficiency gain over manual cherry-pick was not worth the instability and recovery cost.
- **`template:upgrade` script entry** — Removed from `package.json` in spernakit and all 6 derived apps.
- **Auto-mode documentation** — Stripped from `docs/template/DEVELOPMENT.md`, `TESTING.md`, `MIGRATION_V2_TO_V3.md`, `WHY_V3.md`, and `scripts/readme.md`.
- **Auto-mode sub-phases** — Removed Phases 5a / 6a / 7a / 7-auto and the mode-selection table from the `/template-upgrade` slash command. Phase 7 is now a single manual cherry-pick path.

### Changed

- **`/template-upgrade` slash command** — Single manual cherry-pick path. Phase 7 reorganized into 7a (pure files), 7b (branded files), 7c (infrastructure + silent extension files), 7d (backport detection), 7e (verification cadence).
- **Drift detection** — `scripts/check-template-drift.ts`, `scripts/template-shared.ts`, and `scripts/template-manifest.json` are unchanged and remain the source of truth for sync status.

## [3.1.17] - 2026-04-10

### Added

- **Bug vs feature-request toggle** — `BugReportButton` dialog now has a two-tab `Tabs` control ("Bug" / "Feature Request") that routes submissions through a new `kind: 'bug' | 'feature'` field end-to-end. Dialog title, icon, description, placeholder copy, and success toast adapt to the active tab. Admin `BugsTab` gained a `Kind` column with color-coded badge. The `/bug2feature` skill now partitions entries by kind and emits `remediation-*` feature.json for bugs and `feature-*` feature.json for feature requests with acceptance-criteria specs.
- **Phase 4 theme overhaul** — Default theme shifted from indigo to teal-violet; `APP_THEMES` expanded to six entries (Default, Ocean, Forest, Sunset, Rose, Monochrome) with updated OKLCH preview swatches and matching `.theme-*` classes in `tailwind.css`.
- **New shared components** — `EmptyState`, `PageHeader`, and `Spinner` extracted to `frontend/src/components/shared/` for reuse across pages.
- **shadcn/ui Tabs** — Added `@radix-ui/react-tabs` dependency and `frontend/src/components/ui/tabs.tsx` primitive.
- **Schema parity gate** — New `bun run check:schema-parity` script verifies structural parity between SQLite and PostgreSQL Drizzle schemas; wired into the smoke:qc pipeline.
- **Feature integration gate** — New `bun run check-feature-integration` script verifies route registration and page reachability for every declared feature; wired into smoke:qc.
- **Pre-migration backup + rollback** — `autoMigrate` now writes a `*.pre-migrate.bak` snapshot and validates the post-migration database; rolls back automatically if validation fails.

### Changed

- **AppShell layout refactor** — Replaced procedural `if/else` layout selection with declarative layout components; shared `HeaderBarActions` and `useLayoutActions` extracted so header wiring is no longer duplicated.
- **Route handler extraction** — All inline Elysia handlers >30 lines extracted as named functions in their route files (preserves Elysia type chain).
- **Seed orchestration** — Shared seeding logic consolidated into `backend/src/db/seed/orchestration.ts`.
- **Service facades** — Legacy barrel indirection removed from service facades; co-located `UserStatusBadge` with its consumer.
- **Confirm dialogs** — Duplicate in-page confirm dialogs replaced with shared `ConfirmAlertDialog`.
- **Auth form contract** — Login/registration forms now use typed state/actions interfaces instead of stringly-keyed lookups.
- **App feature flags** — Dual-authority eliminated from runtime feature flag settings; single source of truth restored.
- **Stored language preference** — User's stored language preference is now wired into `Intl` formatters (relative time, number, date), replacing hardcoded locale.
- **CRUD error toasts** — Error toasts now include next-step guidance instead of raw error text.
- **Auth placeholders** — Login/registration input placeholders rewritten from label-repeating to example-oriented copy.
- **Header notification cadence** — Interval polling replaced with focus-triggered refresh to reduce idle-tab load.

### Fixed

- **Security: test credentials** — Crawl-test credentials removed from source-controlled `config/*.json.example` defaults.
- **Security: logger redaction** — Added pino redact paths for sensitive fields; closed disclosure vector in error logs.
- **Security: CSRF persistence** — Removed `csrfToken` from `sessionStorage` persistence (spernakit handles it in-memory via headers).
- **Data architecture: workspace list** — Added pagination to the unbounded workspace list query.
- **Data architecture: notification broadcast** — Broadcast target query now batches via pagination instead of loading all users at once.
- **Performance: business metrics event summary** — Added server-side cap to prevent unbounded result sets.
- **Performance: health alert hot path** — Compound indexes added for the most frequent health alert queries.
- **Schema constraints** — `NOT NULL`, `default()`, and explicit foreign keys added across all Drizzle schema files; missing indexes added on `api_key_nonces(expires_at)`, `business_events(event_name)`, `scheduled_tasks(next_run_at)`, and `token_blacklist(expires_at)`.
- **Database: index parity** — Fixed schema-migration index drift; added migration error logging; synced workspace index parity between SQLite and PG schemas.
- **Scheduler: interval parsing** — `parseInterval` now rejects unrecognized formats instead of silently defaulting.
- **Rate limit: retryAfter floor** — `retryAfter` clamped to `>= 1` second so clients never receive a zero delay.
- **OAuth: workspace assignment** — Failed default workspace assignment is now logged at error level.
- **Onboarding: seed user count** — Replaced hardcoded seed user count with a derived constant.
- **Hooks: barrel cleanup** — Removed unused frontend hook subdirectory barrel files; added remaining barrels where needed.
- **Accessibility: navigation buttons** — Layout navigation buttons converted to semantic `<Link>` elements.
- **Accessibility: aria-labels** — Missing aria-labels added across layout and auth components; back buttons converted to semantic links.
- **i18n: relative time** — `Intl.RelativeTimeFormat` replaces ad-hoc time formatting in CRUD lists and notifications.
- **UI: ASCII ellipses** — User-facing copy now uses Unicode ellipsis (`…`) instead of three dots.

### Audited (clean sweep)

Completed audits closing the full v3.1.17 audit suite with all findings resolved: `SPERNAKIT`, `REACT_BEST_PRACTICES`, `COMPOSITION_PATTERNS`, `WEB_DESIGN_GUIDELINES`, `FEATURE_INTEGRATION`, `HYGIENE`, `SECURITY`, `REORG`, `SSOC`, `COMPLICATION`, `DEAD_CODE`, `LOGIC`, `TECHDEBT`, `SCHEMA_CONSTRAINTS`, `DATA_ARCHITECTURE`. Feature tracking reports 130/130 features passing.

## [3.1.16] - 2026-04-07

### Security

- **Audit trail coverage expanded** — Added audit logging for notification broadcasts, onboarding complete/reset, settings updates (general, auth-security, SMTP), user CRUD (create, update, delete, unlock), workspace CRUD (create, update, delete), and workspace member operations (add, remove, role change)
- **Onboarding reset hardened** — Onboarding status now tracks reset timestamps so `hasAdditionalUsers` only counts users created after the last reset, preventing stale completion state from carrying over

### Fixed

- **Rate-limit blank page** — Shared dashboard route exempted from global API limiter with dedicated per-route limiter (30 req/60s per IP); prevents 429 retry cascade that locked out all endpoints for the session
- **ErrorBoundary context-aware messages** — ErrorBoundary now shows user-friendly messages for 429 (rate limit) and 5xx (server error) instead of raw error text
- **Notification auth resilience** — Header notification queries use targeted retry that skips auth errors (handled by fetchWithRefresh) but retries transient 5xx/network failures; prevents wasted retry loops during session expiry
- **AppShell layout stability** — Infrastructure queries (app-features, workspaces, formatters, UI settings, profile) set `throwOnError: false` so transient failures don't crash the layout shell; `useAppFeatures.isLoaded` returns true on error to render with defaults
- **Broadcast notification cache invalidation** — Broadcast dialog now invalidates notification queries after send so the bell icon updates immediately
- **429 client retry logic** — Added 429 to retryable status codes in retryHandler with Retry-After header support; disabled TanStack Query retries on 429 to prevent stacking retries on top of fetch-level backoff

### Changed

- **CORS allowed headers expanded** — Added `X-Session-ID` and `X-Workspace-ID` to CORS allowed headers for request correlation
- **Rate-limit policy ADR updated** — `adr-009-rate-limit-policy.md` updated with shared dashboard exemption rationale and dedicated protection details
- **Audit file reorganized** — Moved `docs/audits/` to `docs/internal/audits/` for clearer separation of template vs internal docs
- **Prettier ignore updated** — Added `.aidd/iterations/` to `.prettierignore`

## [3.1.15] - 2026-04-06

### Security

- **Registration compensating transaction** — If post-registration setup (workspace assignment, email verification) fails, the partially-created user is now hard-deleted to prevent orphaned accounts
- **Validation constants centralized** — Extracted `EMAIL_MAX_LENGTH`, `PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`, `USERNAME_MIN_LENGTH`, `USERNAME_MAX_LENGTH`, and `USERNAME_PATTERN` from magic numbers scattered across auth routes into `backend/src/constants/validation.ts`
- **Origin validation hardened** — Stricter origin checks in `originValidation.ts` with normalized URL comparison
- **Schema constraints tightened** — Added `NOT NULL` constraints, explicit `default()` values, and foreign key declarations across all 13 Drizzle schema files; added missing indexes on `api_key_nonces(expires_at)`, `business_events(event_name)`, `scheduled_tasks(next_run_at)`, and `token_blacklist(expires_at)`

### Fixed

- **Dashboard memory metric** — Fixed incorrect memory usage calculation in dashboard widget
- **Notification/audit workspace filters** — Fixed workspace-scoped queries for notifications and audit logs not filtering by active workspace
- **authStore CSRF persistence** — Fixed CSRF token not being persisted across page refreshes in authStore
- **Admin route guard** — Fixed missing auth guard on admin-only route
- **Dev seed reset** — Fixed seed script not properly resetting `requiresPasswordChange` for crawl user

### Performance

- **Dashboard INP optimized** — Reduced Interaction-to-Next-Paint on dashboard page through handler extraction and reduced re-renders
- **Settings application/backup LCP** — Improved Largest Contentful Paint on application settings and backup tabs by reducing synchronous work

### Changed

- **14 comprehensive audits completed** — Ran and resolved findings from SPERNAKIT, REACT_BEST_PRACTICES, COMPOSITION_PATTERNS, WEB_DESIGN_GUIDELINES, FEATURE_INTEGRATION, HYGIENE, SECURITY, REORG, SSOC, COMPLICATION, DEAD_CODE, LOGIC, TECHDEBT, SCHEMA_CONSTRAINTS, and DATA_ARCHITECTURE audits
- **Service decomposition** — Split `apiKeyService.ts` into `api-key/apiKeyGeneration.ts` + `api-key/apiKeyManagement.ts` facade; split `settingsService.ts` into `settings/settingsQueries.ts` + `settings/settingsMutations.ts` facade; split `smtpService.ts` into `smtp/smtpConfigService.ts` + `smtp/smtpStatusService.ts` facade
- **WebSocket CRUD broadcast system** — Added `shared/src/wsCrudEvents.ts` (typed event constants), `backend/src/services/websocket/wsBroadcast.ts` (`broadcastCrudToUser`/`broadcastCrudToWorkspace`), and `frontend/src/hooks/useCrudSocket.ts` (auto-invalidation of TanStack Query caches on CRUD events)
- **WebSocket max-payload constant** — Extracted `WS_MAX_PAYLOAD_BYTES` into `backend/src/constants/websocket.ts` with startup validation against runtime config
- **API timeout constant** — Added `shared/src/apiDefaults.ts` with `DEFAULT_API_TIMEOUT_MS` as single source of truth for frontend fetch timeout
- **Component colocation** — Moved `FormInputDialog`, `FileUpload`, `CopyButton`, and `SettingsToggleRow` from `components/shared/` to their sole consumer directories
- **OAuth callback handler extraction** — Extracted `processOAuthCallbackResult` from inline OAuth callback logic for readability
- **Handler extraction across routes** — Extracted handlers >30 lines in user CRUD, profile, file, dashboard, workspace, and settings routes
- **Workspace management page enhanced** — Improved `WorkspaceManagementPage` and `ManageMembersDialog` with better layout, error handling, and permission controls
- **Notifications page improved** — Reworked `NotificationsPage` with better filtering, pagination, and workspace-scoped queries
- **Onboarding page refined** — Streamlined `OnboardingPage` layout and step progression
- **Accessibility improvements** — Added `aria-live` regions to error messages across auth forms; fixed circular dependency in `AuthStatusMessage`
- **check-config-invariants expanded** — Enhanced config invariant script with additional validation rules
- **Crawltest analysis script** — Added `scripts/crawltest-analyze.ts` for surfacing non-good Web Vitals ratings and slowest pages from crawltest logs
- **Web Vitals measurement fix** — Changed LCP/FCP to use default `reportAllChanges: false` (only CLS/INP use `reportAllChanges: true`) for accurate ratings in crawltest

### Database

- **Schema-wide constraint audit** — All 13 schema files reviewed and tightened: added missing indexes, explicit `NOT NULL` where implicit, `default()` for timestamp columns, and consistent foreign key declarations using inline `.references()` instead of standalone `foreignKey()`

## [3.1.14] - 2026-04-04

### Security

- **Rate-limit auth exemption policy formalized** — Added `adr-009-rate-limit-policy.md` codifying which `/auth/*` prefixes are exempt from the global limiter and why, with reconsider-triggers. `rateLimitPlugin.ts` JSDoc cross-references the ADR. The exempt list had flipped four times in 12 days without a written policy
- **Config-invariant drift guard** — Added `scripts/check-config-invariants.ts` (new `check:config` npm script, wired into the `qc` pipeline) that fails if `rateLimit.enabled` is not `true` in `backend/src/config/defaults.json`. Catches silent regressions from local dev toggles accidentally committed in version-bump commits

### Changed

- **Service barrel standardization** — Removed `services/auth/index.ts` and `services/notification/index.ts` subdirectory barrels. The root-level `xxxService.ts` facade is the single public entry point for each service. Added `sendAlertWithRetry` to the `notificationService.ts` facade; redirected 3 cross-subdirectory consumers (backup, health, scheduler) to import through the facade
- **Documented no-barrel service rule** — `DEVELOPMENT.md` now states new service subdirectories MUST NOT introduce an `index.ts` barrel; legacy barrels in older services (`backup/`, `dashboard/`, `scheduler/`, `file/`, `health/`) are candidates for removal when touched
- **Documented hook organization rule** — `STACK.md` now states hooks live under `frontend/src/hooks/` (never colocated under `pages/*/hooks/`), flat unless a domain has 3+ related hooks
- **Seed user policy comment** — Added inline comment in `backend/src/db/seed/users.ts` documenting the settled `requiresPasswordChange=true` + `emailVerified=true` policy for seeded accounts (flip-flopped 4+ times in git history)

### Removed

- **Unit test infrastructure retired** — Removed Vitest, @testing-library, jsdom, bun:test setup, and all unit test files. Crawltest is now the sole verification path. Updated `TESTING.md`, `bunfig.toml` files, ESLint configs, `.gitignore`, and `smoke-cache.ts` step dependencies accordingly

### Infrastructure

- **diff-sync skill guardrail** — Added Category E ("App-Specific Utility Extensions — DO NOT PROPAGATE") to the `spernakit-diff-sync` skill so backend-only utilities from derived apps are no longer backported into the template where they'd be removed by knip. Names specific utilities (`generateSecureSecret`, `requireRouteId`, etc.) that caused 14 oscillations in 18 days

## [3.1.13] - 2026-04-04

### Security

- **Rate limit headers exposed** — Added `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` response headers to rate limit plugins so clients can monitor their quota
- **Email burst rate limiting** — Added per-recipient rate limiting in `smtpService` to prevent unbounded email bursts

### Fixed

- **Password expiry null bypass** — Fixed password expiry check when `passwordChangedAt` is null, preventing incorrectly bypassing forced password change
- **Workspace query key scoping** — Added `activeWorkspaceId` to all workspace-scoped TanStack Query keys, preventing stale cross-workspace data after switching

### Changed

- **Shell nav deduplication** — Extracted shared `ShellNavBase` component from `BbsNav` and `TerminalNav`, eliminating 80+ lines of duplicated navigation logic
- **Members route deduplication** — Consolidated duplicated member-count and permission logic in workspace members routes
- **File handlers refactored** — Deduplicated file upload/download helper logic in `file-helpers.ts` and `handlers.ts`
- **Widget creator factory** — Replaced 6 individual widget creator boilerplate functions with a single configurable factory in `dashboardTemplateService`
- **Formatter exports cleaned** — Removed 7 unused exports from `formatters.ts`
- **Theme icon ternary simplified** — Replaced nested ternary in `UserMenu` theme icon with object lookup
- **DataViewerToolbar simplified** — Removed redundant `canMutate` prop (derived internally)
- **Route imports use service facades** — Backend route files now import through service facade modules instead of reaching into subdirectories
- **LRU cache for auth queries** — Added `LRUCache` to `userAuthQueries` for frequently-accessed user lookups
- **Preconnect resource hint** — Added `<link rel="preconnect">` for the API endpoint in `App.tsx`
- **Unused dependency removed** — Removed `better-sqlite3` from backend dependencies (codebase uses `bun:sqlite` exclusively)

### Database

- **Composite indexes** — Added composite indexes on `dashboard_configs(dashboard_id, position)` and `workspaces(is_default)` for query performance
- **Audit trails expanded** — Added audit logging for health check cleanup, notification broadcast, and scheduler config update operations

### Accessibility

- **Icon button aria-labels** — Added `aria-label` to icon-only buttons (delete in DataViewerTable, drag handles)
- **Drag handle semantics** — Converted drag handle `div` elements to accessible `button` elements
- **Decorative icons aria-hidden** — Added `aria-hidden="true"` to decorative icons across 8 components
- **Form label associations** — Added `htmlFor`/`id` associations to form labels missing explicit binding
- **Error message guidance** — Added actionable next-step text to error toast messages
- **Loading ellipsis** — Replaced ASCII `...` with proper Unicode ellipsis `…` in loading indicators
- **Autocomplete attributes** — Added `autocomplete="off"` to non-authentication form inputs
- **Inline edit accessibility** — Added `aria-label` and `autoComplete` to DataViewerTable inline editing inputs

### Infrastructure

- **Duplicate endpoint removed** — Removed redundant `POST /settings/email/test` endpoint (consolidated into single handler)
- **Gitignore updated** — Added `data/*.bak` pattern for backup file exclusion

## [3.1.12] - 2026-03-31

### Changed

- **Dev dependency pinning** — Pinned all 18 root `devDependencies` from `"latest"` to exact versions, eliminating non-deterministic installs; deduplicated `typescript-eslint` transitive dependencies in lockfile
- **Migration consolidation** — Merged `scheduled_task_configs` table creation and 3 composite indexes (`idx_users_email_is_deleted`, `idx_users_username_is_deleted`, `idx_workspaces_slug_is_deleted`) into the base migration; removed redundant incremental migration `20260320152337_chief_mastermind.sql`
- **Settings export** — Added `seedAppFeatureDefaults` to the `settings/index.ts` barrel export
- **WebSocket auth logging** — Removed noisy error-level log for expected missing `WsContext` shape (returns safe default instead)
- **Token refresh resilience** — Added defensive handling in `tokenRefresh.ts`
- **Debounced storage refactor** — Simplified `debouncedStorage.ts` implementation
- **Formatter expansion** — Extended `formatters.ts` with additional formatting utilities
- **Compression verifier** — Fixed script references in `verify-compression.ts`
- **Knip config update** — Updated `knip.json` configuration for accurate dead-code detection
- **Stale audit reports removed** — Deleted 6 outdated audit/review reports from `docs/audits/`
- **Environment example** — Added new entries to `.env.example`

## [3.1.11] - 2026-03-30

### Security

- **Rate limiting enabled by default** — Changed `rateLimit.enabled` from `false` to `true` in config defaults; auth GET endpoints removed from rate limit exemption list
- **CSRF protection on logout** — Removed `/api/v1/auth/logout` from CSRF-exempt paths; authenticated logout requests now require CSRF token validation
- **Password reset token URL stripping** — Reset password and email verification pages now capture tokens via `useState` on mount, then strip them from the URL with `history.replaceState()` to reduce exposure in browser history and Referer headers
- **Referrer-Policy hardened** — Upgraded global `Referrer-Policy` from `strict-origin-when-cross-origin` to `no-referrer`
- **Health check parameter validation** — Added `pattern: '^[a-z][a-z0-9_-]*$'` to health check `checkName` path parameter
- **API key secret data isolation** — Split `ApiKeyData` into `ApiKeyInfo` (excludes secret) and `ApiKeyValidationData` (with secret); `generateApiKey()` strips secret before returning, guard strips secret from context
- **Baseline CSP coverage** — Added `img-src`, `connect-src`, `font-src`, `worker-src`, and `frame-src` directives to baseline CSP policy
- **Frontend settings route guards** — Added `<ProtectedRoute requiredRole="SYSOP" />` wrappers for `/settings/backup` and `/settings/database` routes
- **Plugin/guard direct DB access removed** — `csrf.ts`, `passwordChangeGuard.ts`, `role.ts`, and `workspaceAccess.ts` now call service methods instead of direct database queries

### Fixed

- **Dashboard rename now works** — `handleRename` in `useDashboardWidgets.ts` now accepts and forwards the `name` parameter from `RenameDashboardDialog`
- **Workspace ID reset on logout** — `authStore.logout()` now clears the active workspace ID to prevent cross-user workspace data leaks
- **Dashboard layout stability** — `useDashboardLayout.ts` compares by `dashboard?.id` instead of object reference, preventing layout reset on TanStack Query background refetches
- **OAuth not blocked by password expiry** — Removed `isPasswordExpired` checks from `oauth-helpers.ts` and `refresh.ts` to prevent OAuth and token refresh lockout loops
- **Workspace creation error feedback** — `closeDialog()` now fires only on mutation success (via `onSuccess` callback); failed creation keeps the dialog open with error toast visible
- **Workspace create dialog form reset** — `CreateWorkspaceDialog` resets form state when the dialog closes
- **Onboarding Security Settings link** — Quick Start "Security Settings" card now hidden for non-SYSOP users (the target page requires SYSOP access)
- **Health config threshold validation** — PUT handler for health check thresholds now returns HTTP 400 with message instead of unhandled 500 on validation errors
- **Workspace membership check on modify** — `checkTargetModifiable` returns 404 when target user is not a workspace member, instead of silently allowing the action
- **Dashboard import JSON parse** — `parseImportFile` now wraps `JSON.parse` in try-catch with specific "Invalid JSON file" toast
- **Gauge widget percent suffix** — Gauge widget now only shows `%` suffix for percentage metrics (`cpu_usage`, `memory_usage`); counts display without suffix
- **User settings JSON parse safety** — `getDefaultUserUiSettings` now wraps `JSON.parse` in try-catch with pino logger warning
- **Auto-migrate JSON parse safety** — `autoMigrate.ts` `JSON.parse` of `_journal.json` now wrapped in try-catch with contextual error message
- **Auth settings unsaved changes** — `handleFieldChange` now removes override entries when value matches server value, preventing false dirty state after toggle-and-restore

### Changed

- **Onboarding transactions** — `completeOnboarding` and `resetOnboarding` now wrap multi-step mutations in `db.transaction()`
- **Seed defaults at startup** — `seedDefaults(ALL_SETTING_DEFAULTS)` moved from per-request `getAppFeatures()` to a one-time `seedAppFeatureDefaults()` call at app startup
- **Workspace-agnostic query keys expanded** — Added 8 keys (`app-features`, `demo-accounts`, `notification-preferences`, `oauth-providers`, `registration-status`, `session-check`, `smtp-config`, `user-ui-settings`) to workspace-agnostic list
- **Rate limit cleanup via scheduler** — Rate limit entry cleanup moved from plugin interval to `rate-limit-cleanup` scheduled task with 1-minute interval
- **Composite indexes for soft-delete queries** — Added 5 composite indexes across SQLite and PostgreSQL schemas for `(key, is_deleted)`, `(email, is_deleted)`, `(username, is_deleted)`, `(slug, is_deleted)`, `(workspace_id, is_deleted)`
- **Audit logging for non-HTTP mutations** — Added `logAudit()` calls to `cleanupFiles.ts` and `cleanupAuth.ts` for system-initiated permanent data mutations
- **Formatter cache optimization** — `useFormatters.ts` now uses module-level `Map` caches for `Intl.DateTimeFormat` instances
- **Web vitals common headers** — `flushBuffer` now includes `X-Request-ID`, `X-Session-ID`, and `X-Workspace-ID` headers
- **Error message extraction utility** — Added `extractErrorMessage(err, fallback)` to `errorResponse.ts`; 6 route files updated to use it instead of inline patterns
- **IP validation deduplication** — Removed duplicate `isPrivateIpv4` from config validator; imported shared `isBlockedIpv4` from `urlValidator.ts`
- **npm references replaced** — Replaced 3 `npm run` references with `bun run` in `verify-compression.ts`

### Architecture

- **Service facades** — Created facade files for `websocketService`, `backupService`, `fileService`, `healthService`, `databaseAdminService`; consumers import through facades instead of reaching into subdirectories
- **Unused barrel files removed** — Deleted 5 unused `index.ts` barrel files from `services/metrics/`, `oauth/`, `user/`, `websocket/`, `workspace/`
- **Members dialog split** — Split dual-mode `MembersDialog` + `MemberRow` into explicit `ViewMembersDialog`/`ViewMemberRow` (read-only) and `ManageMembersDialog`/`ManageMemberRow` (management)
- **SQL sandbox split** — Split `SqlSandboxPanel.tsx` into `SqlSandboxPanel.tsx` (query input) and `SqlResultsTable.tsx` (results + virtual scrolling)
- **AppShellContent simplified** — Consolidated triple-duplicated TooltipProvider/SkipLink wrapper into a single return with layout selection via `let layout` variable
- **Shell context hook extracted** — Created `useShellContext` hook to share 12 lines of duplicated hook calls between `BbsShell` and `TerminalShell`
- **Component colocation** — Moved `WorkspaceFormFields` from `components/shared/` to `pages/workspaces/`; moved `DashboardCardSkeleton` from `components/shared/skeletons/` to `pages/dashboards/`
- **Password form dirty deduplication** — Extracted `updateDirty()` helper to replace 3 duplicated inline dirty-state computations
- **useMemo removed** — Removed sole `useMemo` usage (React Compiler handles memoization automatically)
- **Unsafe type casts replaced** — `crud.ts` `toWidgetInputs` uses explicit field mapping instead of `unknown[]`; `wsAuth.ts` uses `isWsContext` type guard with shape validation
- **Circular dependency fixed** — Moved `ValidationIssue` interface definition to break circular import between config validator modules
- **Chart skeleton reuse** — Replaced inline `ChartSuspenseFallback` in `HealthMetricsSection.tsx` with `<ChartSkeleton />` from shared skeletons

### Accessibility

- **Password strength aria-live** — Added `aria-live="polite"` to `PasswordStrengthIndicator` root element
- **Decorative icons aria-hidden** — Added `aria-hidden="true"` to `PanelLeft`/`PanelTop` in `LayoutDefaultsSection` and `Shield` in `EmailConfigForm`
- **Touch manipulation** — Added global CSS `touch-action: manipulation` for all interactive elements
- **Heading text-wrap balance** — Added global CSS `text-wrap: balance` for all headings
- **Tabular-nums for data tables** — Added global CSS `font-variant-numeric: tabular-nums` for all tables
- **Unsaved changes warning** — Wired `useUnsavedChanges` into `AuthenticationTab` and `EmailTab` for form dirty state tracking
- **Heading hierarchy fixes** — Fixed heading levels in `WorkspaceList`, `FilesPage`, and `BusinessMetricsPage` empty states
- **Form control labels** — Added `aria-label` to unlabeled switches and selects; added `htmlFor`/`id` linkage to `AddWidgetDialog` form controls
- **Input mobile optimization** — Added `inputMode="numeric"` to number inputs and `spellCheck={false}` to hostname fields
- **Bugs tab pagination** — Added `useUrlFilters(20)` pagination to `BugsTab`

### Tooling

- **spernakit-browser (sb)** — New Puppeteer-based browser automation CLI at `scripts/sb.ts` with daemon mode, session management, DOM snapshots, screenshots, and interactive element detection

## [3.1.10] - 2026-03-29

### Security

- **OAuth password expiry enforcement** — OAuth callback now checks `isPasswordExpired()` via `validateAccountStatus()`, closing a bypass where OAuth logins skipped the expiry gate enforced by local login and token refresh
- **READFILE blocked in DB admin** — Added `READFILE` to the query executor's blocked keywords array, preventing potential file reads via SQL in the admin query sandbox
- **Notification HTML escaping** — Replaced bypassable regex-based HTML stripping (`/<[^>]*>/g`) with `escapeHtml()` for broadcast notification title and message fields

### Changed

- **Comprehensive multi-category audit** — Executed 12 audit categories (spernakit, security, logic, techdebt, dead-code, schema-constraints, feature-integration, ssoc, reorg, web-design-guidelines, composition-patterns, react-best-practices) with 21 findings remediated and 2 set to monitoring
- **Dashboard CRUD transactions** — `createDashboard`, `updateDashboard`, and `deleteDashboard` now wrap multi-step mutations in `db.transaction()` for atomicity
- **Bug report service extraction** — Extracted ~100 lines of file I/O and business logic from the bugs route into a dedicated `bugReportService.ts`
- **Rate limit store shutdown safety** — Added `.unref()` to `createRateLimitStore()` cleanup intervals so unregistered stores don't block process exit
- **ESM \_\_dirname derivation** — `schedulerMaintenanceExecutor.ts` now derives `__dirname` via `import.meta.url` instead of using the bare Node.js global
- **Import extensions fixed** — Changed 4 `.js` import extensions to `.ts` in `smtpService.ts` and `encryption.ts`
- **PostgreSQL schema cleanup** — Removed 3 redundant indexes on unique columns (`tokenBlacklist`, `rateLimitEntries`, `workspaces`); replaced inline `.references()` with explicit `foreignKey()` on `apiKeys.createdBy`
- **Dashboard widget onClick removed** — Removed non-interactive `onClick` handler from `DashboardWidgetRenderer` Card wrapper and `onInteraction` prop from `DashboardGrid`
- **useFileColumns relocated** — Moved `hooks/useFileColumns.tsx` to `hooks/files/useFileColumns.tsx` per domain organization convention
- **Service barrel files** — Added missing `index.ts` barrel files for `metrics/`, `oauth/`, `user/`, `websocket/`, `workspace/` service subdirectories

### Accessibility

- **Decorative icons** — Added `aria-hidden="true"` to 30+ decorative Lucide icons across DashboardPage, OnboardingPage, FilesPage, SecurityHealthSection, widgetHelpers, AlertListWidget, healthStatusUtils, DashboardGrid, and sonner toast icons
- **Search input labels** — Added `aria-label` to search/filter inputs in AuditLogsTab and SchemaExplorerPanel
- **Switch control labels** — Added `aria-label` to Toggle switches in TaskRow and DataViewerToolbar; added `Label`/`htmlFor` association for HealthConfigSection switches

### Removed

- **Unused LogCategory constants** — Removed 8 unused constants: `AUDIT`, `EMAIL`, `FILE`, `HEALTH`, `METRICS`, `NOTIFICATION`, `OAUTH`, `WEBSOCKET`

## [3.1.9] - 2026-03-28

### Changed

- **CSP font-src allows data: URIs** — Added `data:` to `font-src` directive in strict CSP policy to accommodate Recharts library which embeds fonts as data URIs; resolves CSP violations on dashboard pages with charts
- **Crawltest data: URI filtering** — Network error handler now skips `data:` URI request failures; console error handler ignores CSP violations for `data:font/` resources. Prevents false-positive test failures from legitimate inline font usage

### Dependencies

- `@napi-rs/wasm-runtime` 1.1.1 → 1.1.2
- `@sinclair/typebox` 0.34.48 → 0.34.49
- `bare-os` 3.8.0 → 3.8.2
- `baseline-browser-mapping` 2.10.11 → 2.10.12

## [3.1.8] - 2026-03-27

### Changed

- **Dashboard viewer-role gating** — `DashboardPage` proactively checks `hasMinRole('OPERATOR')` before fetching data; VIEWER users see a permission message instead of triggering 403 errors. WebSocket subscription and queries are gated by `enabled` flag.
- **AppShell tablet viewport fix** — Added `min-w-0` to the main content flex container to prevent flex child overflow at the `md` breakpoint on tablet viewports
- **Browser click strategy: dual CDP+synthetic** — `spernakit-browser/actions.ts` now fires CDP `page.mouse.click()` first (fastest path for simple pages), then falls back to synthetic DOM event sequence for Radix UI components. Replaces previous synthetic-only approach which was overly conservative.

## [3.1.7] - 2026-03-26

### Added

- **NavSeparator support** — `navConfig.tsx` introduces `NavSeparator` interface (with `type: 'separator'`), `NavEntry` union type, and `navEntries` array; derived apps can add separators between nav groups while template-managed layout components consume the filtered `navItems` list
- **`formatElapsed()` utility** — `lib/formatters.ts` computes elapsed time between two ISO timestamps (or since start if no end), formatting as human-readable duration
- **`formatRelativeTime()` utility** — `lib/formatters.ts` returns relative time strings (e.g. "2 hours ago", "3 days ago", "just now")
- **`AUTH_PASSWORD_CHANGE_REQUIRED` error code** — Frontend `errorHandling.ts` now handles this code with a dedicated toast and duplicate-prevention guard for concurrent 403 responses
- **Accessibility: SheetDescription** — `BbsNav` and `TerminalNav` shell components now include sr-only `SheetDescription` for screen reader compliance
- **Accessibility: DialogDescription** — `CreateRowDialog`, `CreateWorkspaceDialog`, and `EditWorkspaceDialog` now include sr-only `DialogDescription`

### Changed

- **`requiresPasswordChange` in login response** — Backend login route and `authLogin` service now return `requiresPasswordChange` flag; `ProtectedRoute` and `AppShell` redirect before loading state resolves for immediate enforcement
- **Bug report query invalidation** — `Header` and `TopBar` now invalidate `['bugs']` query key after successful bug report submission
- **GitHub OAuth icon inlined** — `OAuthProviderButtons` replaces lucide `Github` import with inline SVG, fixing breakage from lucide-react v1.x icon rename
- **NavItem type discriminant** — `NavItem` gains `type?: never` property to enable discriminated union with `NavSeparator`
- **Browser click strategy** — `spernakit-browser/actions.ts` click handler now dispatches synthetic DOM event sequence (pointerdown → mousedown → pointerup → mouseup → click → focus) for Radix UI compatibility; DOM `.click()` limited to `<a>` elements only to prevent double-toggling of Dialog/Popover/Sheet triggers
- **TSConfig cleanup** — Removed redundant `baseUrl` from `frontend/tsconfig.json` and `frontend/tsconfig.app.json`
- **Config example** — `crawlLoginPassword` changed from `CHANGE_ME` to `CHANGE_ME_BEFORE_DEPLOY`

### Dependencies

- `@tanstack/react-query` 5.95.0 → 5.95.2
- `eslint-plugin-jsdoc` 62.8.0 → 62.8.1
- `lucide-react` 0.577.0 → 1.7.0
- `nodemailer` 8.0.3 → 8.0.4
- `react-grid-layout` 2.2.2 → 2.2.3
- `react-router-dom` 7.13.1 → 7.13.2
- `recharts` 3.7.0 → 3.8.1
- `vite` 8.0.1 → 8.0.3
- `vitest` 4.1.0 → 4.1.2
- `web-vitals` 5.1.0 → 5.2.0

## [3.1.6] - 2026-03-24

### Changed

- **Rate limit default disabled** — `rateLimit.enabled` default changed from `true` to `false` in `defaults.json`; rate limiting remains configurable but is now opt-in rather than on by default
- **WebSocket reconnection throttle** — `useNotificationSocket` now throttles `invalidateQueries` calls to at most once per 30 seconds on reconnect, preventing 429 cascade when the WebSocket rapidly reconnects
- **Crawltest error page detection** — Error boundary detection refined to match exact `<h2>Something went wrong</h2>` text instead of broad regex that could false-positive on pages containing "error" in normal content
- **Crawltest WebSocket noise suppression** — "send was called before connect" errors during rapid crawl navigation are now silently ignored instead of being logged as page errors

### Dependencies

- `typescript` 5.9.3 → 6.0.2
- `typescript-eslint` 8.57.1 → 8.57.2

## [3.1.5] - 2026-03-23

### Changed

- **Crawltest bug report resilience** — Bug report test now resets layout defaults (sidebar mode + default theme) via direct SQLite before testing, preventing failures when interactive crawl mutates settings (e.g. BBS super-theme hiding the bug button); navigation simplified with retry-on-reload logic
- **Crawltest pre-login screenshots** — Register page is now screenshotted before login, restoring full unauthenticated page coverage
- **Crawltest success criteria relaxed** — Console warnings no longer fail the crawl; only errors, network failures, failed clicks, and content failures determine pass/fail
- **Crawl login password default** — `crawlLoginPassword` default changed from empty string to `sysop123` to match seeded credentials out of the box

## [3.1.4] - 2026-03-23

### Added

- **StatCard variants and trends** — `StatCard` now supports `success`, `warning`, and `destructive` visual variants with gradient backgrounds and icon highlights; new `trend` prop renders directional indicators (TrendingUp/TrendingDown/Minus) with color-coded percentage labels
- **Formatter utilities** — `formatFixed()` (locale-aware `toFixed` replacement), `formatDurationSeconds()`, `formatNumber()` (integer with grouping separators), `formatCurrency()`, and `formatCurrencyDetailed()` added to `lib/formatters.ts` with cached `Intl.NumberFormat` instances
- **Dark-mode scrollbar** — Custom webkit scrollbar styling for dark theme (narrow track, rounded thumb)
- **CSS utility classes** — `glow-primary`, `glow-success`, `glow-warning`, `glow-destructive` box-shadow utilities; `text-gradient-primary` gradient text; `card-frosted` frosted glass card effect
- **MFA error codes** — `AUTH_MFA_ALREADY_ENABLED`, `AUTH_MFA_INVALID_CODE`, `AUTH_MFA_TOKEN_INVALID` added to shared error codes
- **Crawltest degraded page recovery** — Automatic reload and browser recycle when CDP-degraded pages are detected (sidebar absent with sparse content)
- **Crawltest rate limit flushing** — Periodic DB-level rate limit entry clearing during discovery and browser recycle to prevent crawler self-throttling

### Changed

- **Rate limit plugin** — Health check (`/api/v1/health`) and docs (`/api/v1/docs`) endpoints now exempt from rate limiting
- **TanStack Query 429 handling** — Rate-limited (429) responses no longer trigger automatic query retries, preventing retry storms during rate limit windows
- **useWorkspace setState fix** — Workspace ID persistence moved from inline render to `useEffect` to prevent React setState-during-render warnings
- **Crawltest navigation tracking** — Browser recycle threshold now tracks actual navigation count (including sub-tab visits) instead of route index
- **Crawltest tab detection** — Sub-tab screenshots now only detect button-based tab switchers; NavLink tabs (rendered as `<a>` tags) are already crawled as separate routes
- **Crawltest content detection** — `waitForContent` improved with skeleton element detection and reduced timeout from 10s to 5s
- **Crawltest lazy tab discovery** — Discovery phase re-scrapes after 2s delay when React.lazy chunks haven't loaded yet
- **Config example** — `crawlLoginPassword` changed from actual password to `CHANGE_ME` placeholder

### Dependencies

- `@types/bun` 1.3.10 → 1.3.11
- `@types/pg` 8.16.0 → 8.20.0
- `eslint` 10.0.3 → 10.1.0
- `puppeteer` 24.39.1 → 24.40.0

### Removed

- Cleaned up 12 stale audit report files from `.aidd/audit-reports/`

## [3.1.3] - 2026-03-22

### Added

- **`routeDetail()` helper** — `responseExamples.ts` builds complete OpenAPI detail objects (summary, description, responses with 401/500 and success) for route definitions; auto-detects array vs object for paginated/data envelope
- **`buildQueryParams` widened** — `requestHelpers.ts` now accepts `boolean | number | string` values (non-strings converted via `String()`), backward-compatible
- **`toastMutationError()` helper** — `errorHandling.ts` displays actionable error toasts for TanStack Query mutation `onError` callbacks; surfaces server error message when available
- **Soft-delete utilities** — `dbHelpers.ts` adds `buildSoftDeleteCondition()`, `checkEntityExists()`, and `softDeleteEntity()` for generic CRUD soft-delete patterns
- **`generateSecureSecret()` utility** — `encryption.ts` generates cryptographically secure hex secrets of configurable byte length
- **`requireRouteId()` / `optionalRouteId()`** — `validation.ts` route parameter helpers that throw on invalid input (required) or return undefined for absent params (optional)
- **`formatCurrency()` formatter** — `useFormatters.ts` hook now includes currency formatting via `Intl.NumberFormat` with USD style

### Changed

- **Frontend lib target** — `tsconfig.app.json` bumped from ES2022 to ES2023 (enables `Array.findLast`, `Array.findLastIndex`, etc.)

## [3.1.2] - 2026-03-22

### Added

- **`useUrlFilters` hook** — Combines URL-synced pagination with URL search parameter filters; `setFilter` updates a URL param and resets pagination to page 1
- **`stdCallbacks` mutation helper** — `lib/mutationHelpers.ts` builds standard `onError`/`onSuccess` callbacks for `useMutation` (toast + query invalidation); adopted by `useDataViewerMutations`, `useEmailSettings`, `useHealthChecks`, and `useUsers`
- **`isValidUserRole` type guard** — New function in `shared/roles.ts` for runtime role string validation with type narrowing
- **Webhook URL SSRF validation** — `configValidator-server.ts` now blocks `localhost`, `127.0.0.1`, `::1`, link-local, and non-HTTP schemes in alerting webhook URLs
- **Backup restore auto-rollback** — Failed restore operations now automatically attempt rollback from the emergency backup and reinitialize the database connection
- **`HTTP_STATUS.FORBIDDEN` constant** — Added to `httpStatus.ts` for consistent 403 usage
- **`RATE_LIMIT_EXCEEDED` error code** — Added to shared `errorCodes.ts`

### Changed

- **OAuth route handlers extracted** — Split `oauth.ts` from 437 lines to 110-line orchestrator + 316-line `oauth-handlers.ts` with dedicated handler functions
- **Workspace route helpers extracted** — Common workspace lookup, role-assignment, and self-removal checks moved to `workspace-helpers.ts`; `members-crud.ts` reduced from duplicated inline logic
- **DataTable decomposed** — Extracted `useDataTableConfig` hook (table state + configuration), `VirtualTableBody` component (virtualized rendering), and shared `types.ts`; `DataTable.tsx` reduced from 396 to 272 lines
- **ApplicationTab decomposed** — Extracted `FeatureFlagsSection`, `LayoutDefaultsSection`, and `SuperThemeSection` as standalone components
- **Backend auth utils reorganized** — Moved `authHelpers.ts`, `passwordGenerator.ts`, `passwordValidation.ts`, and `tokenBlacklist.ts` into `utils/auth/` subdirectory
- **`databaseAdmin` service renamed** — Renamed directory from `services/databaseAdmin/` to `services/database-admin/` for naming consistency; `rawClient.ts` rewritten with proper dialect guard and read-only connection management
- **`UserStatusBadge` relocated** — Moved from `pages/settings/users/` to `components/shared/` for reuse
- **CSRF plugin hardened** — Auth-exempt endpoints (login, register, logout, refresh) now enforce origin validation instead of bypassing CSRF entirely; all API-key-authenticated requests exempt from CSRF (headers are not cookie-attached)
- **Password reset transactional** — Password history recording and password update now wrapped in a database transaction for atomicity; token revocation uses `DEFAULT_REFRESH_TTL_MS` constant
- **Nginx WebSocket security headers** — Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS headers to WebSocket proxy block
- **Traefik dashboard auth** — Added `basicauth` middleware to Traefik dashboard with placeholder credential; `X-XSS-Protection` header updated from `1; mode=block` to `0` (deprecated header)
- **Scheduler lifecycle hardened** — Task registration validates cron expressions early; task-not-found errors now log at warn level
- **Config validator expanded** — Server-side validator now checks webhook URLs for SSRF risk, validates alerting channel configuration, and cross-checks bcrypt round settings

### Fixed

- **Dead code removal** — Removed unused `routeDetail` helper from `responseExamples.ts`; removed duplicate `WidgetType`/`MetricType` type definitions from PG dashboard schema; removed unused re-exports from `authService.ts`, `oauthService.ts`, `notificationService.ts`, `workspaceService.ts`, `schedulerService.ts`, `userService.ts`; deleted unused `VirtualList.tsx` (superseded by DataTable virtualization); removed unused widget barrel exports
- **Unused `@tanstack/react-virtual` dependency** — Removed from `frontend/package.json` (virtualization now fully encapsulated in DataTable)
- **API key guard error response** — Uses `RATE_LIMIT_EXCEEDED` error code instead of generic error for rate limit responses
- **Role validation tightened** — Backend routes use `isValidUserRole` type guard; `useAuthorization` hook uses strict role-level comparison
- **Encryption utility cleanup** — Removed unused cipher/decipher buffer helper from `encryption.ts`
- **Validation utility cleanup** — Removed unused string sanitization helpers from `validation.ts`
- **Frontend type cleanup** — Removed unused `requiresPasswordChange` field from auth types; cleaned up unused barrel exports from settings pages

### Refactored

- **HealthConfigSection simplified** — Reduced from complex nested form to streamlined component using extracted mutation helpers
- **NotificationsPage** — Adopted `useUrlFilters` hook for URL-synced search and pagination
- **AuditLogsTab** — Adopted `useUrlFilters` hook
- **UsersTab** — Adopted `useUrlFilters` hook and `stdCallbacks` pattern
- **Profile forms** — `ProfileForm` and `PasswordForm` simplified with consistent error handling and form state management
- **BbsNav** — Replaced inline ternary chains with lookup maps for menu numbering
- **CommandPalette** — Replaced nested ternary with lookup map for icon resolution
- **DashboardPage** — Simplified widget data flow and removed unused state
- **useWorkspaces / useWorkspace** — Simplified with extracted helpers and consistent mutation patterns
- **useSyncUiSettings** — Reduced complexity with cleaner effect dependencies

## [3.1.1] - 2026-03-21

### Added

- **Virtual scroll component** — Shared `VirtualList` component using `@tanstack/react-virtual` with sticky header and padding-based row virtualization; SQL Sandbox results auto-virtualize above 100 rows
- **Test infrastructure** — Backend smoke test (`bun:test`) for health endpoint and frontend smoke test (`Vitest`) for login page rendering; test setup files for both workspaces
- **Security.txt endpoint** — `/.well-known/security.txt` route per RFC 9116
- **Chart theme CSS variables** — `--chart-1` through `--chart-5` custom properties for light/dark mode chart colors

### Changed

- **API client refactored** — Split monolithic `client.ts` (427 lines) into focused modules: `apiError.ts`, `retryHandler.ts`, `tokenRefresh.ts`; client.ts reduced to 199-line orchestrator
- **URL-synced data table filters** — Audit logs (`?search=`), Users (`?search=`, `?role=`), and Database tab (`?panel=`, `?table=`) now sync filter/sort state to URL params for bookmarkable, shareable views
- **HealthTimeline chart colors** — Replaced hardcoded hex colors with CSS variable references for theme consistency
- **Command palette** — Replaced nested ternary chains with lookup maps for readability
- **HealthStatusWidget** — Replaced nested ternary with lookup map
- **Docker port normalization** — Fixed `normalizeBranding()` to handle `127.0.0.1:HOST:CONTAINER` triple-port format and slug/name overlap when `name === slug`

### Fixed

- **Accessibility** — Added `aria-hidden="true"` to 60+ decorative icons across 27 components; added `aria-label` to unlabeled form controls; made ERD `TableNode` keyboard-accessible (`role`, `tabIndex`, `onKeyDown`)
- **Focus styles** — Added `focus-visible` ring styles to sidebar, mobile nav, and auth footer links
- **Form attributes** — Added `spellCheck={false}` to email/username inputs; `autoComplete="off"` to admin and SMTP forms
- **Alert dialog overflow** — Added `max-h-[85vh] overflow-y-auto overscroll-contain` to `AlertDialogContent`
- **Dashboard widget removal** — Added `ConfirmAlertDialog` to DashboardGrid widget removal action
- **Date formatting** — Updated `lib/formatters.ts` date functions to accept optional locale parameter for i18n consistency
- **Division-by-zero guards** — Added guards in `checkDiskSpace` and `collectSnapshot` metric calculations
- **Dark mode FOIT** — Added `color-scheme` meta tag to `index.html` for instant dark mode background
- **Dead code cleanup** — Removed commented-out code in `setup.ts`; deleted unused `VirtualList.tsx` (replaced by @tanstack/react-virtual version)

## [3.1.0] - 2026-03-20

### Added

- **Super-Theme system** — Application-wide UI paradigm setting that replaces the entire AppShell chrome while keeping page content unchanged; three built-in themes: Default (standard modern web), Terminal (CLI-in-browser with JetBrains Mono), and BBS (retro BBS aesthetic with VT323 and scanline effects)
- **Terminal shell** — Full-screen monospace layout with command-line breadcrumb (`user@app:~/path $`), inline text navigation, and status bar footer; lazy-loaded with code-split CSS
- **BBS shell** — Retro BBS layout with ASCII art header, numbered menu navigation (`[1] HOME [2] SETTINGS`), box-drawing character borders via `BbsFrame`, and scanline overlay; keyboard number shortcuts for quick navigation
- **Super-theme CSS overrides** — `[data-super-theme]` CSS custom property overrides for both Terminal and BBS themes, ensuring all existing shadcn/ui components automatically inherit the aesthetic without component swaps
- **Super-theme as app feature** — `superTheme` added to `AppFeaturesDefaults` (shared), `APP_FEATURES_KEYS` (backend), and `AppFeatures` (frontend API); stored as `app.super_theme` in settings table with strict enum validation (`default | terminal | bbs`)
- **Super-theme admin picker** — Card-based visual picker with icons in the admin Application settings tab, following the existing `defaultLayoutMode` pattern with optimistic UI updates
- **Conditional user preferences** — User Preferences tab conditionally shows/hides Theme, Layout, and Display sections based on the active super-theme's `applicableSettings` (non-default super-themes hide irrelevant settings)
- **Font packages** — Added `@fontsource/jetbrains-mono` and `@fontsource/vt323` as frontend dependencies (code-split with their respective shell components)

## [3.0.6] - 2026-03-20

### Added

- **Task scheduler admin API** — New `PATCH /api/v1/tasks/:name` endpoint allows admins to update scheduled task configurations (cron expression, enabled state) at runtime without restart; changes persist via new `scheduledTaskConfigs` database table
- **Scheduler config persistence** — Added `scheduledTaskConfigs` table (SQLite + PostgreSQL) to store admin-managed overrides for task schedules with proper indexing
- **Scheduler service facade** — New `schedulerService.ts` facade simplifies scheduler imports for external consumers
- **Notifications feature flag** — Added `notificationsEnabled` app feature flag to control Notifications visibility in navigation
- **Spernakit Browser automation** — New `scripts/spernakit-browser/` module with daemon, actions, screenshots, snapshots, and wait utilities for headless browser automation of spernakit apps
- **Browser shortcut script** — New `scripts/sb.ts` CLI entry point for spernakit-browser commands
- **Configuration schema expansion** — Added database backup (encryption, compression, retention), integrity checks, VACUUM scheduling, OAuth provider config, role definitions, and S3 storage adapter to `config.json` schema

### Changed

- **Scheduled Tasks UI** — Enhanced `ScheduledTasksTab` with inline editing for cron expressions and enabled/disabled toggles, immediate apply without restart
- **Health monitoring UI** — Improved `CheckCard`, `HealthHistorySection`, and `HealthStatusSection` components with refined status display and history rendering
- **API response standardization** — Simplified success response format to `data`-only; pagination fields at top level alongside `data`
- **API endpoint renames** — `PUT /notifications/bulk-read` → `PUT /notifications/read-all`; `DELETE /users/bulk` → `POST /users/bulk-delete`; notification filter `isRead` → `readStatus`
- **API documentation accuracy** — Removed documented-but-unimplemented endpoints (User Security Management, Role Management); corrected CSRF (HMAC-based) and API Key (HMAC-SHA256) documentation
- **Navigation config** — Updated `navConfig.tsx` to respect `notificationsEnabled` feature flag
- **App features API** — Added `notificationsEnabled` to feature flags endpoint and frontend API client
- **Setup script** — Enhanced `scripts/setup.ts` with additional setup steps
- **Smoke test config** — Updated `smoke.json` with revised test parameters; crawl depth increased from 3 to 6
- **Bun version requirement** — Updated minimum from 1.3.6+ to 1.3.10+

### Fixed

- **Memory usage display** — Removed erroneous `Math.min()` capping on dashboard memory stat that prevented display of actual values

### Documentation

- **Comprehensive doc refresh** — Updated 25+ documentation files across API reference, architecture, deployment, development, security, settings, testing, troubleshooting, ADRs, and READMEs to reflect current implementation state
- **Configuration guide expansion** — Added detailed documentation for database backup, OAuth, storage, health check, and scheduler configuration sections
- **Frontend patterns** — Updated code examples to reflect current shadcn/ui, Zustand, apiClient, and hook patterns

## [3.0.5] - 2026-03-19

### Changed

- **URL-synced page filters** — BusinessMetricsPage and NotificationsPage now persist filter state (days, read status, notification type) in URL search params, enabling shareable/bookmarkable filtered views
- **Onboarding reset confirmation** — Added `ConfirmAlertDialog` to the onboarding reset button to prevent accidental progress wipe
- **HealthTimeline lazy-loaded** — Wrapped `HealthTimeline` chart component in `React.lazy()` + `Suspense` for code-splitting; reduces initial bundle for the system health settings page
- **HealthTimeline locale-aware timestamps** — Replaced inline `toLocaleTimeString` with `useFormatters().formatTime` hook for consistent locale formatting

### Fixed

- **Memory usage overflow** — Clamped `memoryUsage` metric to 100% max in both `metricsCollectionService` (backend) and `DashboardPage` (frontend) to prevent progress bars rendering >100%
- **Dialog/Sheet scroll bleed** — Added `overscroll-contain` to `dialog.tsx` and `sheet.tsx` to prevent background page scrolling while modal overlays are open
- **Template port normalization** — `normalizeBranding()` in `template-shared.ts` now handles `falls back to NNNN` Dockerfile comment patterns

### Security

- **Password reset timing leak** — Changed password reset email dispatch from `await` to fire-and-forget (`void`) to eliminate timing side-channel that could reveal whether an email address exists in the system

### Audit

- Completed SPERNAKIT audit — clean pass
- Completed REACT_BEST_PRACTICES audit — 3 findings (URL state sync, lazy loading, locale formatting), all resolved
- Completed COMPOSITION_PATTERNS audit — clean pass
- Completed WEB_DESIGN_GUIDELINES audit — 3 findings (overscroll containment, reset confirmation, memory overflow), all resolved

## [3.0.4] - 2026-03-18

### Changed

- **Rate limit dev bypass** — Added `isRateLimitBypassed()` helper to `rateLimit.ts` plugin that automatically skips all request rate limiting when `nodeEnv === 'development'` or `rateLimit.enabled === false`. Applied to `rateLimitPlugin`, `authRateLimitPlugin`, and all route-level rate limiters (register, password-reset, verify-email, OAuth callback, shared dashboard). Fixes development lockout caused by database-backed rate limits persisting through server restarts.

### Fixed

- **authRateLimitPlugin missing enabled check** — The auth rate limit plugin never checked `config.rateLimit.enabled`, enforcing auth rate limits even when rate limiting was explicitly disabled in config. Now respects the `isRateLimitBypassed()` check alongside the general plugin.

## [3.0.3] - 2026-03-18

### Added

- **Safe area CSS utilities** — Added `@layer utilities` with `safe-area-inset`, `pb-safe`, and `touch-manipulation` classes for mobile viewport handling

### Changed

- **Route module decomposition** — Extracted monolithic `routes.tsx` into three focused modules: `routes/LazyPage.tsx` (Suspense wrapper + skeleton fallback), `routes/lazyPages.ts` (all lazy page imports via `lazyNamed` helper), and `routes/preload.ts` (route preloading logic)
- **CSS layer ordering** — Moved `prefers-reduced-motion` media query before `@layer base` for proper cascade order

## [3.0.2] - 2026-03-18

### Added

- **useUnsavedChanges hook** — `frontend/src/hooks/useUnsavedChanges.ts` warns users before navigating away with unsaved form changes (browser `beforeunload` + React Router blocker)
- **useTheme hook** — `frontend/src/hooks/useTheme.ts` syncs theme-color meta tag for mobile browser chrome and manages color-scheme CSS property
- **Config server validator** — `backend/src/config/configValidator-server.ts` validates port ranges and host values at startup
- **Tailwind focus-visible ring utilities** — Custom CSS properties for consistent focus-visible ring styling across interactive elements

### Changed

- **usePagination enhanced** — Added optional `syncToUrl` parameter for URL-synced pagination state, enabling shareable/bookmarkable paginated views
- **ProtectedRoute simplified** — Reduced complexity by removing redundant auth checks already handled by route guards
- **HealthMetricsSection refactored** — Improved chart layout and responsive behavior
- **MembersDialog refactored** — Workspace member management dialog restructured for better UX and accessibility
- **WorkspaceManagementPage improved** — Enhanced workspace list with better member count display and action layout
- **DashboardCard accessibility** — Improved keyboard navigation and screen reader support for dashboard cards
- **OnboardingPage alignment** — Fixed content misalignment in onboarding checklist layout
- **App features route refactored** — `backend/src/routes/settings/app-features.ts` restructured for clarity
- **RBAC documentation restructured** — `docs/template/RBAC.md` reorganized for clarity and reduced duplication

### Fixed

- **Skip link styling** — Fixed skip-to-content link visibility and positioning
- **Zod v4 compatibility** — Updated config schema to use Zod v4 API (`z.int()` → `z.number().int()`)
- **Onboarding content misalignment** — Fixed layout spacing in onboarding page

### Security

- **Array input validation** — Added `.maxItems()` constraints on array inputs in OAuth, notifications, users, and workspace routes to prevent resource exhaustion
- **Backup restore hardening** — Improved path validation in backup restore service
- **Nginx CSP headers** — Updated Content-Security-Policy and Permissions-Policy headers in nginx config
- **Rate limit route hardening** — Improved WebSocket rate limit handling
- **File validation patterns** — Extended blocked file extension list

### Accessibility

- **Focus ring consistency** — Button, progress, switch, dialog, sheet, and select components updated with consistent `ring-ring/50` focus-visible styling
- **Sidebar ARIA labels** — Added descriptive aria-labels to sidebar navigation
- **Password strength indicator** — Added aria-live region and screen reader descriptions
- **Column header improvements** — Added sort indicators and accessibility attributes to data table columns across files, notifications, audit logs, and users
- **CopyButton and FileUpload** — Improved ARIA attributes and keyboard interaction
- **Dashboard header and share dialog** — Enhanced accessibility for dashboard management actions
- **VerifyEmailPage** — Added proper heading hierarchy and status messaging
- **CreateUserDialog** — Added missing form field labels

### Dependencies

- Updated frontend and backend dependencies to latest patch versions

### Audit

- **5 audit passes completed** — SPERNAKIT, REACT_BEST_PRACTICES, COMPOSITION_PATTERNS, WEB_DESIGN_GUIDELINES, SECURITY
- **27 audit findings resolved** across 5 batches (security hardening, React patterns, accessibility, UX/i18n, consistency)
- **Completed audit feature findings removed** — Cleared resolved `.aidd/features/` entries

## [3.0.1] - 2026-03-17

### Added

- **FileUpload drag-and-drop component** — `frontend/src/components/shared/FileUpload.tsx` with drag/drop zone, file type filtering, and size validation
- **VirtualList component** — `frontend/src/components/shared/VirtualList.tsx` for virtualized scrolling of large lists
- **File columns hook** — `frontend/src/hooks/files/useFileColumns.tsx` extracted from FilesPage for reuse
- **Rate limit constants** — `backend/src/constants/rateLimit.ts` with endpoint-specific rate limit definitions
- **Validation utilities** — `frontend/src/lib/validation.ts` for frontend input validation
- **APP_FEATURES_DEFAULTS in shared workspace** — `shared/src/appFeatures.ts` consolidating feature defaults from backend
- **v2→v3 Migration Guide** — `docs/template/MIGRATION_V2_TO_V3.md` with step-by-step upgrade path
- **WHY_V3 rationale document** — `docs/template/WHY_V3.md` explaining v3 design decisions
- **v2 changelog archive** — `docs/template/CHANGELOG-v2.md`
- **Audit reports** — 13 comprehensive audit reports in `.aidd/audit-reports/`

### Changed

- **Layout component reorganization** — CommandPalette, ShortcutsHelp, SkipLink moved from `components/shared/` to `components/layout/`; demoAccount.ts moved from `pages/auth/` to `lib/`
- **JWT payload reduced** — Username removed from JWT token; user info resolved from database on each request
- **CSRF exempt matching hardened** — Switched from `endsWith()` string matching to exact-path `Set` lookup
- **Rate limiting on by default** — `config.rateLimit.enabled` defaults to `true`; password-reset endpoint gets dedicated rate limit
- **Config validators consolidated** — Predicate pattern simplified across `configValidator-secrets.ts` and `configValidator-server.ts`
- **Route handler deduplication** — Extracted shared patterns across 9 backend route files
- **User resolution consolidated** — Eliminated redundant user lookups across auth and route handlers
- **Complexity reduction** — 4 modules refactored (health alert service, scheduler registry, S3 adapter, auto-migrate)
- **DataViewerTable refactored** — Improved component structure and column handling
- **FilesPage uses useFileColumns hook** — Extracted column definitions for reuse
- **Demo accounts blocked on LAN** — Demo account login restricted in non-testing environments
- **Explicit FK naming convention** — All 13 Drizzle schema files use `fk_{table}_{referenced}` naming pattern
- **14 unused exports removed** — Dead export cleanup across backend and frontend
- **Schema files updated** — Consistent index/FK naming across all SQLite and PostgreSQL schemas

### Removed

- **Deprecation plugin** — `backend/src/plugins/deprecation.ts` and `backend/src/constants/deprecation.ts` removed (unused infrastructure)
- **Unused validation/health constants** — Removed unused entries from `validation.ts` and `health.ts`
- **Audit feature findings** — Cleared completed audit-generated feature.json files

### Security

- **Bug reports mutex** — File I/O uses mutex to prevent TOCTOU race conditions
- **Auth plugin** — Removed redundant `jwt.decode()` call (already decoded by Elysia)
- **Backup API path stripping** — Filesystem paths removed from backup list API responses
- **OAuth maxLength** — Input length constraints added to OAuth callback parameters

### Documentation

- **6 ADRs updated** — adr-001 through adr-008 updated for v3 architecture
- **5 architecture docs updated** — Backend, frontend, database, deployment, system architecture
- **API reference updated** — Reflects v3 endpoint changes
- **Security docs updated** — JWT and CSRF hardening documented
- **RBAC docs updated** — Role system documentation refreshed
- **Configuration docs updated** — Config validation and schema generation documented
- **Troubleshooting docs updated** — New entries for v3-specific issues

### Audit

- **13 audit passes completed** — SPERNAKIT, REACT_BEST_PRACTICES, FEATURE_INTEGRATION, HYGIENE, SECURITY, REORG, SSOC, COMPLICATION, DEAD_CODE, LOGIC, TECHDEBT, SCHEMA_CONSTRAINTS, COMPOSITION_PATTERNS

### Feature Specs

- **80 feature specs updated** — Version bumps and accuracy improvements for v3.0.0
- **Audit feature findings removed** — Cleared completed findings from `.aidd/features/`

## [3.0.0] - 2026-03-17

### Added

- **Shared workspace (`spernakit-shared`)** — Canonical type contract with `ErrorCode` (39 error codes), `UserRole`, `ROLE_HIERARCHY`, `hasMinimumRole`, `validateUserRole`, `DataResponse`, `PaginatedResponse`, `ErrorResponse` shared between backend and frontend via Bun workspace protocol; eliminates type drift between workspaces (v3 item #1)
- **OpenAPI spec vs frontend type validation** — `bun run check:api-types` validates enum/union type consistency between backend TypeBox schemas and frontend type definitions at build time using Elysia's `.handle()` for spec extraction without starting a server; wired into `smoke:qc` pipeline (v3 item #5)
- **Config schema validation tooling** — `bun run config:validate` runs full config pipeline (load, merge, env-var injection, Zod validation, security checks) without starting server; `bun run config:schema` generates `config/config-schema.json` for VS Code autocomplete; `configUtils.ts` extracted for shared config loading logic (v3 item #3)
- **API client 5xx retry** — Frontend HTTP client retries transient 5xx errors with exponential backoff and configurable retry count (v3 item #4)
- **Automated template upgrade script** — `scripts/template-upgrade.ts` auto-applies pure/branded file updates from template, generates diffs for infrastructure files; supports `--dry-run` (default), `--apply`, `--version`, `--json` flags; requires clean git working tree for apply mode; updates `spernakit_version` after successful upgrade
- **Template shared utilities** — Extracted shared utilities from `check-template-drift.ts` into `scripts/template-shared.ts` for reuse by both drift detection and upgrade scripts
- **Barrel import codemod** — `scripts/codemod-barrel-imports.ts` for automated migration from barrel imports to direct file imports

### Changed

- **UI component direct imports** — Eliminated `frontend/src/components/ui/index.ts` barrel file; all 22 shadcn/ui components imported directly from their source files across 56+ frontend files (v3 item #2)
- **OAuth callback rate limiting** — Rate limit check on OAuth callback now respects `config.rateLimit.enabled` flag, consistent with other rate-limited endpoints
- **Frontend metadata simplified** — `index.html` meta tags, Open Graph, Twitter Card, and structured data descriptions shortened to "Self-Hosted Multi-User Application Template"
- **`lazyNamed` type constraint relaxed** — Generic bound changed from `Record<string, ComponentType>` to `Record<string, unknown>` for broader compatibility
- **Setup script cleanup** — Removed redundant `githubMeta` assignment from sub-workspace `package.json` updates

### Removed

- **UI component barrel file** — `frontend/src/components/ui/index.ts` deleted in favor of direct imports

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
