# Spernakit - Domain Context

Spernakit v3 is a self-hosted, multi-user admin application **template** built with Bun-native
tooling (Elysia, Drizzle ORM, React 19), designed for downstream apps to extend without
fork-and-diverge pain. This file is the canonical glossary of the project's shared vocabulary,
key entities, and relationships. Findings or code that contradict this glossary should be
reconsidered. For authoritative architecture and rules, defer to `docs/template/STACK.md`,
`docs/template/DEVELOPMENT.md`, and `.aidd/spec.md`.

## Key Entities

These map to database tables (see `backend/src/db/schema/`; PostgreSQL mirror in `schema-pg/`).

- **User** (`users`) — Core identity: credentials, profile, global `role`, soft-delete and
  account-lockout state. Includes `requiresPasswordChange` and `csrfToken`.
- **Workspace** (`workspaces`) — Multi-tenancy unit. Has an `ownerId`, a `slug`, and at most one
  active `isDefault` workspace (enforced by a partial unique index).
- **WorkspaceMember** (`workspace_members`) — Join record linking a User to a Workspace with a
  per-workspace `role`. Hard-deleted on revocation (membership is a relationship, not data).
- **Notification** (`notifications`) — Per-user message with read/unread state; pushed in real
  time over WebSocket. Per-user prefs live in `user_notification_preferences`.
- **AuditLog** (`audit_logs`) — Append-only record of actor, action, target, and metadata for
  security-relevant operations.
- **ApiKey** (`api_keys`) — Scoped programmatic credential with request-signing support; replay
  protection via `api_key_nonces`.
- **FileUpload** (`file_uploads`) — Metadata for uploaded files; bytes stored via the storage
  abstraction (local filesystem or S3).
- **ScheduledTask** — Cron-driven job. Config in `scheduled_task_configs`, run history in
  `scheduled_task_executions`.
- **Setting** (`settings`) — Runtime-editable key/value config stored in the database (distinct
  from static JSON config).
- **Dashboard** — Custom dashboards (`dashboard_configs`) composed of widgets
  (`dashboard_widgets`).
- **HealthCheck** — Health monitoring: result logs (`health_check_logs`) and alert lifecycle
  records (`health_check_alerts`).
- **BusinessEvent** (`business_events`) — Analytics/metrics event tracking; system resource
  samples live in `system_metrics`.
- **BugReport** (`bug_reports`) — In-app user-submitted bug reports (ADMIN+ to list).
- **MfaSetting** (`mfa_settings`) — Per-user TOTP MFA enrollment and recovery codes.
- **OAuthAccount** (`oauth_accounts`) — Linked external SSO identity (Google, GitHub, Microsoft).
- **Supporting auth tables** — `token_blacklist`, `password_history`, `email_change_tokens`,
  `pkce_verifiers`, `rate_limit_entries`.

## Shared Vocabulary

- **5-tier RBAC** — Hierarchical roles: SYSOP (5) > ADMIN (4) > MANAGER (3) > OPERATOR (2) >
  VIEWER (1). Higher roles inherit lower permissions.
- **ROLE_HIERARCHY** — The numeric role map in `shared/src/roles.ts`; authorization is numeric
  comparison via `hasMinimumRole(userRole, requiredRole)`.
- **SYSOP bypass** — SYSOP (level 5) has cross-workspace access and bypasses workspace isolation.
- **Workspace isolation** — Non-SYSOP users only see/act on data scoped to their member
  workspaces; enforced by the `workspaceAccess` guard and `workspace` plugin.
- **WORKSPACE_ROLES** — Per-workspace member role enum (in `spernakit-shared`), separate from the
  global User `role`.
- **shared/ zero-runtime-deps** — The `spernakit-shared` workspace (`shared/src/`) holds canonical
  types and pure functions only (`ErrorCode`, `UserRole`, `ROLE_HIERARCHY`, response envelopes);
  `sideEffects: false`, no runtime dependencies. Consumed by both backend and frontend.
- **response envelope** — Standard API shapes from `shared/src/apiTypes.ts`: `DataResponse<T>`
  (`{ data }`), `PaginatedResponse<T>` (`{ data, page, limit, total }`), `SuccessResponse`
  (`{ data: null }`), and `ErrorResponse`.
- **ErrorCode** — Canonical machine-readable error code (`shared/src/errorCodes.ts`); category
  prefixes AUTH__, VALIDATION__, RESOURCE__, RATE__, SERVER_*. Returned in `ErrorResponse.code`.
- **soft delete** — Recoverable deletion via `is_deleted` / `deleted_at` / `deleted_by` columns
  on applicable tables. WorkspaceMember is the deliberate exception (hard delete).
- **requiresPasswordChange** — Per-user flag forcing a password change on next login; enforced by
  the `passwordChangeGuard` plugin.
- **token blacklist** — Database-backed JWT revocation (`token_blacklist` table) for logout and
  forced session invalidation.
- **AppShell** — The multi-mode frontend layout shell (`components/layout/AppShell.tsx`):
  collapsible sidebar, horizontal top-bar, or a super-theme shell.
- **super-theme** — A shell that replaces the entire AppShell chrome with a distinct UI paradigm
  (`default`, `terminal`, `bbs`) while keeping page content unchanged; CSS overrides under
  `[data-super-theme]` selectors.
- **facade + subdirectory service pattern** — Complex backend domains live in
  `services/{domain}/` subdirectories behind a top-level facade file (e.g. `emailService.ts`).
- **autoMigrate / autoSeed** — On startup, SQLite applies pending Drizzle migrations
  (`db/autoMigrate.ts`) and seeds default accounts when the users table is empty
  (`db/autoSeed.ts`). PostgreSQL requires manual migration management.
- **smoke:qc** — The required quality gate (`bun run smoke:qc`): drift/config/schema checks,
  typecheck, lint, build, API type contract, format, and dependency versions.
- **downstream / derived apps** — Applications scaffolded from this template (your derived
  apps); tracked in `spernakit.psd1`.
- **template** — Spernakit itself; the source from which derived apps are upgraded and synced.
- **template drift** — Divergence (structural or behavioral) between a derived app and the current
  template.
- **JSON-only config** — No `.env` files (`bunfig.toml` sets `env = false`); static config in
  `config/{slug}.json`, validated with Zod and deep-merged with `defaults.json`.

## Key Relationships

- User ↔ Workspace is many-to-many through **WorkspaceMember** (`workspace_members`), with a
  per-membership role distinct from the user's global role.
- Each Workspace has exactly one owner User (`workspaces.ownerId`, `onDelete: restrict`); at most
  one Workspace may be the active default.
- Deleting a User cascades to their WorkspaceMember rows; deleting a Workspace cascades to its
  members. Audit/creator FK references use `onDelete: set null`.
- Authorization is a numeric comparison against **ROLE_HIERARCHY**; SYSOP (5) bypasses workspace
  isolation, all others are workspace-scoped.
- The **spernakit-shared** package is the single source of canonical types/constants consumed by
  both backend and frontend, eliminating type drift. Frontend never imports from the backend
  workspace; the OpenAPI spec at `/api/v1/docs/json` is the API contract source of truth.
- Notification, Dashboard, ApiKey, FileUpload, AuditLog, and MfaSetting all reference User; many
  operational entities (Notification, Dashboard) are additionally scoped by Workspace.
