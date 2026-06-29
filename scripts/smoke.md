# Release Smoke Test Script

This document describes how to use `scripts/smoke.ts` wrapper to run the main smoke test chains.

The script centralizes all commands you previously ran by hand (page checks, auth-reset UI checks, crawl tests, application-specific tests, and docker-based flows) and enforces consistent exit codes and logging.

## Script Overview

- **Location**: `scripts/smoke.ts`
- **Runtime**: Bun (executes TypeScript natively)
- **Default mode**: `dev`
- **Behavior**:
    - Prints a high-level banner: `Don't Panic. Running smoke tests for mode: <mode>`
    - Ensures that `logs/` directory exists
    - Runs each step via `runCommand()`, which:
        - Executes the command as a subprocess
        - Checks the exit code
        - Exits the script immediately on the first non-zero code
        - Prints clear `[OK]` / `[FAIL]` / `[CACHED]` messages

## CLI Flags

| Flag             | Short | Description                                      |
| ---------------- | ----- | ------------------------------------------------ |
| `--mode <mode>`  | `-m`  | Mode to run (default: `dev`)                     |
| `--force`        | `-f`  | Bypass cache, run all steps (qc mode only)       |
| `--cache-status` |       | Show cache status without running (qc mode only) |

## Configuration: `scripts/smoke.json`

The wrapper reads its steps from `scripts/smoke.json` with the following structure:

```json
{
	"modes": {
		"<mode>": {
			"steps": [{ "command": "...", "description": "..." }]
		}
	}
}
```

Currently defined modes:

- `dev` – full dev smoke (crawl test)
- `preview` – preview smoke (auth reset UI, crawl)
- `docker-local` – docker dev stack smoke
- `docker-prod` – docker prod stack smoke
- `qc` – check-only quality checks: drift, typecheck, lint, build, api-types, format check, deps
- `screenshots` – dev smoke with screenshot capture
- `reset` – full package reset, QC, and Docker rebuild without publishing

Each step maps directly to a `command` plus a human-readable `description` used in log output.

## Supported Modes

### 1. Dev

Runs the main dev smoke flow against existing (non-docker) dev servers.

Command:

```bash
bun run smoke:dev
# or directly:
bun scripts/smoke.ts --mode dev
```

Steps (in order):

1. `bun run stop`
    - Stop any running processes.
2. `bun scripts/clear-logs.ts`
    - Clear logs.
3. `bun run start`
    - Start services in background.
4. `bun scripts/wait-for-http.ts --url http://localhost:{{BACKEND_PORT}}/api/v1/health --timeoutMs 30000`
    - Wait for backend to be ready.
5. `bun scripts/wait-for-http.ts --url http://localhost:{{FRONTEND_PORT}} --timeoutMs 30000`
    - Wait for frontend to be ready.
6. `bun scripts/crawltest.ts --mode dev`
    - Crawl test (dev); logs to `logs/crawltest.log`.
7. `bun run stop`
    - Stop services.

If any step fails (exit code != 0), the script stops and returns that code.

### 2. Preview

Targets the preview environment endpoints.

Command:

```bash
bun run smoke:preview
# or directly:
bun scripts/smoke.ts --mode preview
```

Steps (in order):

1. `bun run check-auth-reset-ui-preview`
    - Auth reset UI check against preview.
2. `bun scripts/crawltest.ts --mode preview`
    - Crawl test targeting preview.

### 3. Docker Local

Builds and runs the local docker stack, then smoke-tests it using the crawl test.

Command:

```bash
bun run smoke:docker-local
# or directly:
bun scripts/smoke.ts --mode docker-local
```

Steps (in order):

1. `bun scripts/reset-database.ts`
    - Reset database for clean Docker state.
2. `bun run docker:up`
    - Docker up (local).
3. `bun scripts/wait-for-http.ts --url http://localhost:{{FRONTEND_PORT}}/api/v1/health --timeoutMs 60000`
    - Wait for docker-local stack to be ready.
4. `bun scripts/crawltest.ts --mode docker-local`
    - Crawl test (docker-local); logs to `logs/crawltest-docker-local.log`.
5. `bun run docker:down`
    - Docker down (local).

### 4. QC (typecheck, lint, format, build)

Runs the core check-only quality gate chain (check:drift → check-application → typecheck → lint → build → check:api-types → format:check → check-deps). It does not rewrite source files. Use `bun run qc:fix` when you explicitly want lint and formatting repairs before validation.

Command:

```bash
bun run smoke:qc
# or directly:
bun scripts/smoke.ts --mode qc
```

Steps (in order):

1. `bun run check:drift`
    - Template drift check.
2. `bun run check-application`
    - Validates application configuration and checks for unauthorized database files.
3. `bun run typecheck`
    - Runs TypeScript type checking across backend, frontend, and scripts.
4. `bun run lint`
    - Runs ESLint across backend, frontend, and scripts.
5. `bun run build`
    - Builds backend and frontend (including database location sanity check).
6. `bun run check:api-types`
    - API type contract validation.
7. `bun run format:check`
    - Verifies repo formatting with Prettier.
8. `bun run check-deps`
    - Verifies critical dependencies are pinned to exact versions (no `^` or `~` prefixes).

#### Caching

The QC mode includes intelligent caching to skip unchanged steps. After each step passes, a hash of all relevant source files is stored in `scripts/smoke-cache.json`. On subsequent runs, if files haven't changed since the last successful run, the step is skipped and shows `[CACHED]`.

**Cache behavior:**

- Only applies to `qc` mode (other modes always run all steps)
- Steps that previously failed are always re-run
- If build outputs (`frontend/dist/`) are missing, the build step runs regardless of cache
- Cache is invalidated when any tracked file changes (source, config, or lock files)

**Cache commands:**

```bash
# Normal run (uses cache)
bun run smoke:qc

# Bypass cache, run all steps
bun run smoke:qc --force

# Show what would run without executing
bun run smoke:qc --cache-status

# Same thing via shorthand
bun run qc:status
```

**Example cached output:**

```
==> Application check
    [CACHED] Unchanged since 2026-02-03T10:30:00Z (534ms)

==> Typecheck
    [CACHED] Unchanged since 2026-02-03T10:30:06Z (6324ms)
```

**Example cache status output:**

```
Cache Status:
────────────────────────────────────────────────────────────────────
✓ check-application    CACHED     Unchanged since 2026-02-03T10:30:00Z
✓ typecheck            CACHED     Unchanged since 2026-02-03T10:30:06Z
○ lint                 PENDING    Files changed
○ build                PENDING    Outputs missing
✓ format               CACHED     Unchanged since 2026-02-03T10:30:35Z
────────────────────────────────────────────────────────────────────
```

### 5. Docker Prod

Pulls and runs the production docker-compose stack, then runs the crawl test against it.

Command:

```bash
bun run smoke:docker-prod
# or directly:
bun scripts/smoke.ts --mode docker-prod
```

Steps (in order):

1. `bun scripts/reset-database.ts`
    - Reset database for clean Docker state.
2. `docker compose -f docker-compose.production.yml pull --ignore-pull-failures`
    - docker compose pull (prod, skips local-only images).
3. `docker compose -f docker-compose.production.yml up -d`
    - docker compose up (prod).
4. `bun scripts/wait-for-http.ts --url http://localhost:{{FRONTEND_PORT}}/api/v1/health --timeoutMs 60000`
    - Wait for docker-prod stack to be ready.
5. `bun scripts/crawltest.ts --mode docker-prod`
    - Crawl test (docker-prod); logs to `logs/crawltest-docker-prod.log`.
6. `docker compose -f docker-compose.production.yml down`
    - docker compose down (prod).

### 6. Reset

Performs a complete package reset and rebuild, including Docker image building. It does not push images; use `bun run release:publish` for explicit publication.

Command:

```bash
bun run smoke:reset
# or directly:
bun scripts/smoke.ts --mode reset
```

Steps (in order):

1. `bun run stop`
    - Stop any running processes.
2. `bun scripts/clear-logs.ts`
    - Clear logs.
3. `bun scripts/reset-database.ts`
    - Reset database.
4. `bun run reset-packages`
    - Reset packages (removes node_modules, dist, lock files and reinstalls).
5. `bun run --cwd backend db:migrate && bun run --cwd backend db:seed`
    - Setup database (migrate schema + seed).
6. `bun run smoke:qc`
    - Smoke test QC.
7. `bun run docker:build && bun run docker:image:build`
    - Docker build (local and prod).

### 7. Screenshots

Runs the dev smoke flow with screenshot capture enabled for all pages.

Command:

```bash
bun run smoke:screenshots
# or directly:
bun scripts/smoke.ts --mode screenshots
```

Steps (in order):

1. `bun run stop`
    - Stop any running processes.
2. `bun scripts/clear-logs.ts`
    - Clear logs.
3. `bun run start`
    - Start services in background.
4. `bun scripts/wait-for-http.ts --url http://localhost:{{BACKEND_PORT}}/api/v1/health --timeoutMs 30000`
    - Wait for backend to be ready.
5. `bun scripts/wait-for-http.ts --url http://localhost:{{FRONTEND_PORT}} --timeoutMs 30000`
    - Wait for frontend to be ready.
6. `bun scripts/crawltest.ts --mode dev --screenshot-pages --404 --bug`
    - Crawl test with screenshots; logs to `logs/crawltest-screenshots.log`.
7. `bun run stop`
    - Stop services.

## Exit Codes and Logs

- The wrapper exits with code **0** only if **all** steps in the selected mode succeed.
- On the first failing step, the wrapper prints a `[FAIL]` line with the step description and exit code, then exits with that code.
- Key logs to inspect:
    - `logs/crawltest.log` – crawl tests (dev)
    - `logs/crawltest-preview.log` – crawl tests (preview)
    - `logs/crawltest-docker-local.log` – crawl tests (docker-local)
    - `logs/crawltest-docker-prod.log` – crawl tests (docker-prod)

Use this script and doc as the canonical way to run release smoke tests across dev, preview, docker-local, docker-prod, qc, and reset modes.

## Available bun Scripts

The following bun scripts are available in `package.json`:

| Script                       | Description                                                          |
| ---------------------------- | -------------------------------------------------------------------- |
| `bun run smoke:dev`          | Run dev smoke tests                                                  |
| `bun run smoke:preview`      | Run preview smoke tests                                              |
| `bun run smoke:docker-local` | Run docker local smoke tests                                         |
| `bun run smoke:docker-prod`  | Run docker prod smoke tests                                          |
| `bun run smoke:qc`           | Run check-only quality checks (typecheck, lint, format check, build) |
| `bun run smoke:reset`        | Full package reset and rebuild without publishing                    |
| `bun run smoke:screenshots`  | Dev crawltest with screenshot capture                                |

## Related Scripts

| Script                        | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `bun run reset-packages`      | Remove node_modules, dist, lock files and reinstall |
| `bun run clear-logs`          | Clear log and PID files from logs/ directory        |
| `bun run db:migrate`          | Run pending Drizzle migrations                      |
| `bun run db:migrate:status`   | Show migration status                               |
| `bun run db:migrate:baseline` | Mark migrations as applied (for existing databases) |
