# Spernakit Scripts Manual

## Table of Contents

- [Quick Reference](#quick-reference)
- [Common Configuration](#common-configuration)
- [Scripts](#scripts)
    - [`check-application.ts`](#check-applicationts)
    - [`check-dependency-versions.ts`](#check-dependency-versionsts)
    - [`setup.ts`](#setupts)
    - [`load-json-config.ts`](#load-json-configts)
    - [`dev-with-logs.ts`](#dev-with-logsts)
    - [`start.ts`](#startts)
    - [`stop.ts`](#stopts)
    - [`clear-logs.ts`](#clear-logsts)
    - [`crawltest.ts`](#crawltestts)
    - [`smoke.ts` / `smoke.json` / `smoke.md`](#smokets--smokejson--smokemd)
    - [`smoke-cache.ts` / `smoke-cache.json`](#smoke-cachets--smoke-cachejson)
    - [`test-auth-reset-api.ts`](#test-auth-reset-apits)
    - [`test-auth-reset-ui.ts`](#test-auth-reset-uits)
    - [`migrate.ts`](#migratets)
    - [`generate-keys.ts`](#generate-keysts)
    - [`wait-for-http.ts`](#wait-for-httpts)
    - [`verify-compression.ts`](#verify-compressionts)
    - [`verify-minification.ts`](#verify-minificationts)
    - [`optimize-images.ts`](#optimize-imagests)
    - [`reset-packages.ts`](#reset-packagests)
    - [`tsconfig.json`](#tsconfigjson)

## Quick Reference

| Goal                                             | Recommended command                                   | Script file                               |
| ------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------- |
| Validate repo identity/config/Docker consistency | `bun run check-application`                           | `scripts/check-application.ts`            |
| Check critical dependencies are pinned           | `bun run check-deps`                                  | `scripts/check-dependency-versions.ts`    |
| Initialize or re-template a derived app repo     | `bun run setup`                                       | `scripts/setup.ts`                        |
| Run check-only local quality chain (mode-based)  | `bun run smoke:qc`                                    | `scripts/smoke.ts` + `scripts/smoke.json` |
| Repair lint/format drift, then validate          | `bun run qc:fix`                                      | `package.json` + `scripts/smoke.json`     |
| Start dev servers with logs                      | `bun run dev`                                         | `scripts/dev-with-logs.ts`                |
| Start services in background                     | `bun run start`                                       | `scripts/start.ts`                        |
| Stop running services                            | `bun run stop`                                        | `scripts/stop.ts`                         |
| Clear log files                                  | `bun scripts/clear-logs.ts`                           | `scripts/clear-logs.ts`                   |
| Crawl the app to catch errors                    | `bun run crawltest`                                   | `scripts/crawltest.ts`                    |
| Crawl the preview build                          | `bun run crawltest:preview`                           | `scripts/crawltest.ts`                    |
| Test password-reset API error paths              | `bun run check-auth-reset-api`                        | `scripts/test-auth-reset-api.ts`          |
| Test auth/reset UI (dev)                         | `bun run check-auth-reset-ui-dev`                     | `scripts/test-auth-reset-ui.ts`           |
| Test auth/reset UI (preview)                     | `bun run check-auth-reset-ui-preview`                 | `scripts/test-auth-reset-ui.ts`           |
| Run database migrations                          | `bun run db:migrate`                                  | `scripts/migrate.ts`                      |
| Show migration status                            | `bun run db:migrate:status`                           | `scripts/migrate.ts`                      |
| Generate new secure keys in config JSON          | `bun run generate-keys`                               | `scripts/generate-keys.ts`                |
| Verify compression behavior                      | `bun run verify-compression`                          | `scripts/verify-compression.ts`           |
| Analyze bundle minification (static comparison)  | `bun run verify-minification`                         | `scripts/verify-minification.ts`          |
| Optimize frontend images                         | `bun run optimize-images`                             | `scripts/optimize-images.ts`              |
| Reset packages (destructive)                     | `bun run reset-packages`                              | `scripts/reset-packages.ts`               |
| Template drift check                             | `bun run check:drift`                                 | `scripts/check-template-drift.ts`         |
| API type contract validation                     | `bun run check:api-types`                             | `scripts/validate-api-types.ts`           |
| Validate config against schema                   | `bun run config:validate`                             | `scripts/validate-config.ts`              |
| Generate JSON schema for editor intellisense     | `bun run config:schema`                               | `scripts/generate-config-schema.ts`       |
| Dev crawltest with screenshot capture            | `bun run smoke:screenshots`                           | `scripts/smoke.ts` + `scripts/smoke.json` |
| Generate read-only template sync packet          | `bun run template:sync-plan -- --app ../acme-monitor` | `scripts/template-sync-plan.ts`           |

## Common Configuration

Most scripts load configuration from `config/<slug>.json` (via `scripts/load-json-config.ts`). The slug is resolved in this order:

1. `VITE_APP_SLUG` or `APP_SLUG` environment variable
2. `backend/src/config/defaults.json` → `app.slug`

If you run scripts in a derived application repo, ensure:

- `backend/src/config/defaults.json` exists and has the correct `app.slug`
- `config/<slug>.json` exists (or allow scripts to auto-create it when supported)

## Scripts

### `check-application.ts`

- **Purpose**
    - Validates that the repo is internally consistent (config, package.json identity fields, ports, Docker files, README expectations, etc.).
    - Intended to be a strict guardrail for derived applications.
- **Run**
    - `bun run check-application`
    - `bun scripts/check-application.ts --verbose`

### `check-dependency-versions.ts`

- **Purpose**
    - Checks that critical dependencies are pinned to exact versions (no `^` or `~` prefixes).
    - Prevents surprise breaking changes from `bun update` pulling in incompatible versions of core dependencies.
    - Validates backend dependencies (elysia, drizzle-orm, jsonwebtoken, zod, pino, etc.) and frontend dependencies (react, react-router-dom, @tanstack/react-query, zustand, vite, etc.).
- **Run**
    - `bun run check-deps`
    - `bun scripts/check-dependency-versions.ts`

### `setup.ts`

- **Purpose**
    - Writes/updates identity fields and ports across the repo based on prompts and/or CLI args.
    - Generates a fresh `config/<slug>.json` with security keys when needed.
    - Ends by running `check-application`.
- **Run**
    - `bun run setup`
    - `bun run setup --slug myapp --name "My App" --description "..." --frontend-port 3330 --backend-port 3331 --version "1.0.0"`

### `load-json-config.ts`

- **Purpose**
    - Shared helper for scripts: loads `config/<slug>.json` and populates `process.env`.
    - Supports auto-creation from `backend/src/config/defaults.json` when the JSON config is missing (for local dev ergonomics).
- **Used by**
    - `dev-with-logs.ts`, `crawltest.ts`, `smoke.ts`, `generate-keys.ts`, `verify-compression.ts`, `test-auth-reset-*`, `start.ts`, `stop.ts`, and others.

### `dev-with-logs.ts`

- **Purpose**
    - Starts backend and frontend dev servers and writes rotating logs into `./logs/`.
    - Calls `loadJsonConfig()` to ensure the child processes have the correct env.
- **Run**
    - `bun run dev` (this script is called by the `dev` script)
    - `bun scripts/dev-with-logs.ts`

### `start.ts`

- **Purpose**
    - Starts both backend and frontend servers as detached background processes.
    - Output is redirected to rotating log files in the `/logs` directory.
    - PID files are written for reliable process management by `stop.ts`.
    - Automatically stops existing processes before starting new ones.
- **Run**
    - `bun run start` (runs check-application before starting)
    - `bun scripts/start.ts --check` (explicit check flag)
    - `bun scripts/start.ts` (skip check-application)

### `stop.ts`

- **Purpose**
    - Stops running spernakit processes by:
        1. Reading PID files from `logs/` directory (written by `start.ts`)
        2. Falling back to port-based detection if PID files are missing
        3. Running `docker-compose down` if Docker containers are running
    - Supports stopping both services, or just backend or frontend individually.
- **Run**
    - `bun run stop` (stop both backend and frontend)
    - `bun run stop:backend` (stop backend only)
    - `bun run stop:frontend` (stop frontend only)
    - `bun scripts/stop.ts --backend` (stop backend only)
    - `bun scripts/stop.ts --frontend` (stop frontend only)

### `clear-logs.ts`

- **Purpose**
    - Removes all `.log` and `.pid` files from the `logs/` directory.
    - Used by smoke:dev to ensure a clean slate before starting services.
- **Run**
    - `bun scripts/clear-logs.ts`

### `crawltest.ts`

- **Purpose**
    - A more comprehensive crawler-based test that traverses and interacts with the application.
    - Designed to catch console errors, network failures, and navigation issues.
- **Run**
    - `bun run crawltest`
    - `bun run crawltest:preview`
- **Options**
    - `--mode <mode>` — Set environment (dev, preview, docker-local, docker-prod). Default: `dev`
    - `--screenshot-pages [dir]` — Capture full-page screenshots. Optional custom directory (default: `screenshots`)
    - `--page <route>` — Test a single page/route only, skipping route discovery (e.g. `--page /settings/audit-logs`)
    - `--start-from <route>` — Discover all routes but only test those whose path starts with the given prefix (e.g. `--start-from /settings`)
    - `--404` — After all other routes, test a deliberate bad URL to verify the 404 page renders without errors. Captures a screenshot if `--screenshot-pages` is enabled
    - Note: `--page` and `--start-from` cannot be used together
- **Environment overrides**
    - `CRAWL_MAX_DEPTH` (default: 3)
    - `CRAWL_TIMEOUT` (default: 30000)

### `smoke.ts` / `smoke.json` / `smoke.md`

- **Purpose**
    - Mode-driven smoke runner that executes a chain of commands described in `scripts/smoke.json`.
    - `scripts/smoke.md` documents the modes and intent.
    - `qc` mode is check-only. It uses `lint` and `format:check`; it does not rewrite the working tree.
- **Run**
    - `bun run smoke:dev`
    - `bun run smoke:preview`
    - `bun run smoke:docker-local`
    - `bun run smoke:docker-prod`
    - `bun run smoke:qc`
    - `bun run smoke:reset`
    - `bun run qc:fix` when you explicitly want lint and formatting repairs before `smoke:qc`

### `smoke-cache.ts` / `smoke-cache.json`

- **Purpose**
    - Smoke test caching system for spernakit.
    - Provides fast change detection to skip unchanged QC steps by tracking file hashes and execution results.
    - Stores cache in `scripts/smoke-cache.json`.
    - Supports caching for: `build`, `check-application`, `check-deps`, `format`, `lint`, `typecheck`.
- **Used by**
    - `smoke.ts` for intelligent step skipping during quality checks.

### `test-auth-reset-api.ts`

- **Purpose**
    - Lightweight HTTP checks for password reset endpoints against an already-running backend.
    - Focuses on validation/error paths (does not require SMTP).
- **Run**
    - `bun run check-auth-reset-api`

### `test-auth-reset-ui.ts`

- **Purpose**
    - Focused Puppeteer UI checks for auth + password reset UX flows.
    - Complements `crawltest.ts`.
- **Run**
    - `bun run check-auth-reset-ui-dev`
    - `bun run check-auth-reset-ui-preview`

### `migrate.ts`

- **Purpose**
    - Database migration script for Spernakit v3.
    - Manages Drizzle Kit migrations with support for:
        - Running pending migrations
        - Baseline marking for existing databases
        - Migration status reporting
    - Only supports SQLite (PostgreSQL uses `bunx drizzle-kit migrate` or `bunx drizzle-kit push`).
- **Run**
    - `bun run db:migrate` - Run pending migrations
    - `bun run db:migrate:status` - Show migration status
    - `bun run db:migrate:baseline` - Mark initial migration as applied (for existing dbs)
    - `bun scripts/migrate.ts --help` - Show help message
- **Important Notes**
    - Never use `db:push` in production
    - Always generate migrations after schema changes
    - Test migrations in staging before production
    - Back up database before migrating

### `generate-keys.ts`

- **Purpose**
    - Generates cryptographically secure keys and updates the JSON config.
- **Run**
    - `bun run generate-keys`

### `wait-for-http.ts`

- **Purpose**
    - Simple readiness probe that polls an HTTP endpoint until it returns `2xx`.
- **Run**
    - `bun scripts/wait-for-http.ts --url http://localhost:{port}/health --timeoutMs 60000 --intervalMs 1000`

### `verify-compression.ts`

- **Purpose**
    - Verifies backend API and frontend artifacts behave as expected with compression.
- **Run**
    - `bun run verify-compression`

### `verify-minification.ts`

- **Purpose**
    - Compares bundle sizes (static comparison) to understand minification impact.
- **Run**
    - `bun run verify-minification`

### `optimize-images.ts`

- **Purpose**
    - Optimizes images in `frontend/public` (WebP conversion, compression, responsive variants).
- **Run**
    - `bun run optimize-images`
    - `bun run optimize-images:dry-run`
    - `bun run optimize-images:force`
- **Options**
    - `--quality=<1-100>` (default: 80)
    - `--sizes=<comma-separated>` (default: `320,640,1024,1280`)
    - `--force`
    - `--dry-run`

### `reset-packages.ts`

- **Purpose**
    - Removes `node_modules`, `dist`, and lock files, then reinstalls.
- **Run**
    - `bun run reset-packages`
- **Warning**
    - This is destructive to local working state (it deletes directories/files).

### `template-sync-plan.ts`

- **Purpose**
    - Generates a read-only review packet for syncing template changes into a derived app.
    - Writes pure-copy, branded-copy, infrastructure-review, infrastructure diff, blocked/app-owned, and summary artifacts under `upgrade-review/<app>/`.
    - Does not write to the target app source.
- **Run**
    - `bun run template:sync-plan -- --app ../acme-monitor`
    - `bun run template:sync-plan -- --app ../acme-monitor --from 3.7.0 --to 3.7.1`

### `tsconfig.json`

- **Purpose**
    - TypeScript config for script-level typechecking.
- **Run**
    - `bunx tsc --project scripts/tsconfig.json`
