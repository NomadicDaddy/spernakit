# Release Smoke Test Script

This document describes how to use `scripts/smoke.ts` wrapper to run the main smoke test chains.

The script runs page checks, auth-reset UI checks, crawl tests, application-specific tests,
and Docker-based flows with consistent exit codes and logging.

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
        - Aggregates independent QC failures; lifecycle modes stop on the first non-zero code
        - Prints clear `[OK]` / `[FAIL]` / `[CACHED]` messages

## CLI Flags

| Flag             | Short | Description                                      |
| ---------------- | ----- | ------------------------------------------------ |
| `--mode <mode>`  | `-m`  | Mode to run (default: `dev`)                     |
| `--force`        | `-f`  | Bypass cache, run all steps (qc mode only)       |
| `--fast`         |       | Run the cached inner-loop subset (qc mode only)  |
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

- `dev` - full dev smoke (crawl test)
- `preview` - preview smoke (auth reset UI, crawl)
- `docker-local` - docker dev stack smoke
- `docker-prod` - docker prod stack smoke
- `qc` - check-only quality checks: drift, typecheck, lint, build, api-types, format check, deps
- `screenshots` - dev smoke with screenshot capture
- `reset` - full package reset, QC, and Docker rebuild without publishing

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
    - Crawl test (dev).
7. `bun run verify-compression --mode dev`
    - Verify gzip compression on backend responses (warn-only in dev).
8. `bun run stop`
    - Stop services.

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
    - Check auth reset UI (preview).
2. `bun scripts/crawltest.ts --mode preview`
    - Crawl test (preview).

### 3. Docker Local

Builds and runs the local docker stack, then smoke-tests it using the crawl test.

Command:

```bash
bun run smoke:docker-local
# or directly:
bun scripts/smoke.ts --mode docker-local
```

Steps (in order):

1. `bun run docker:up:test`
    - Docker up (local build, TST mounts under APPDATA_ROOT).
2. `bun scripts/wait-for-http.ts --url http://localhost:{{FRONTEND_PORT}}/api/v1/health --timeoutMs 60000 --container {{APP_SLUG}}-dev`
    - Wait for docker-local stack to be ready.
3. `bun scripts/crawltest.ts --mode docker-local`
    - Crawl test (docker-local).
4. `bun run verify-compression --mode docker-local`
    - Verify gzip compression on backend responses (required).
5. `bun run docker:down:test`
    - Docker down (local).

### 4. QC (typecheck, lint, format, build)

Runs the check-only quality gate chain listed below (the authoritative list is `scripts/smoke.json` mode `qc`; this document is generated from it). It does not rewrite source files. Use `bun run qc:fix` when you explicitly want lint and formatting repairs before validation.

Command:

```bash
bun run smoke:qc
# fast inner-loop checks only:
bun run smoke:qc:fast
# or directly:
bun scripts/smoke.ts --mode qc
```

Steps (in order):

1. `bun run check:drift`
    - Template drift check.
2. `bun run check:fresh-release`
    - Fresh public baseline content check.
3. `bun run check:template-feature-versions`
    - Template feature ownership version markers.
4. `bun run test:template-feature-versions`
    - Template feature ownership marker regression.
5. `bun run check:config`
    - Config invariants check.
6. `bun run check:schema-drift`
    - Config schema artifact drift check.
7. `bun run config:validate`
    - Config schema validation (defaults + example + instance).
8. `bun run test:config-preflight`
    - Production config preflight rejects placeholder secrets without disclosing values.
9. `bun run test:wait-for-http`
    - Docker readiness failures print bounded container log diagnostics.
10. `bun run check:db-location`
    - Database location guard (ASSERT-010: DB files only under data/).
11. `bun run check:no-inline-references`
    - Inline .references() ban (ASSERT-012).
12. `bun run check:secrets-shape`
    - Secrets file shape parity.
13. `bun run check:leak-guard`
    - Leak-guard hook self-test (synthetic fixtures).
14. `bun run check:licenses`
    - Third-party license inventory matches the installed graph.
15. `bun run licenses:sync-core:check`
    - License core copies in sibling repositories match Spernakit (when present).
16. `bun run test:fleet-manifest`
    - Fleet manifest validator regression self-test.
17. `bun run test:fleet-manifest-sync`
    - Fleet manifest writer regression self-test.
18. `bun run check:fleet-manifest`
    - Fleet manifest matches packages and runtime configs.
19. `bun run check:image-publication`
    - Template image publication guard.
20. `bun run check:process-env`
    - Process environment access check.
21. `bun run check:max-lines`
    - 300-line max-lines gate.
22. `bun run test:vendored-browser-gates`
    - Vendored browser tool stays exempt from project-owned source gates.
23. `bun run check-application`
    - Application check.
24. `bun run check:destructive-confirmation`
    - Destructive mutation confirmation check.
25. `bun run verify-mutation-denylist`
    - Database-admin mutation-denylist assertion (api_keys, audit_logs, token_blacklist, users).
26. `bun run check-docs`
    - Documentation consistency check.
27. `bun run check:smoke-docs`
    - Smoke runbook matches scripts/smoke.json.
28. `bun run typecheck`
    - Typecheck.
29. `bun run lint`
    - Lint.
30. `bun run build`
    - Build.
31. `bun run verify-minification`
    - Verify bundle minification and total size budget.
32. `bun run check:critical-path`
    - Verify critical-path size, React runtime placement, and no preload waterfall.
33. `bun run check:api-types`
    - API type contract validation.
34. `bun run check:feature-integration`
    - Feature integration check.
35. `bun run test:feature-integration`
    - Feature integration rejects unmounted flat route modules.
36. `bun run check:schema-parity`
    - SQLite/PG schema parity check.
37. `bun run test:backup-compression`
    - Backup decompression guard rejects high-ratio archives and cleans up.
38. `bun run test:bundle-budget`
    - Bundle budget stays app-owned and is only enforced with matching provenance.
39. `bun run test:crawl-credentials`
    - Crawl login resolves from the seed account and never from a tracked config file.
40. `bun run test:critical-path-budget`
    - Critical-path budget stays app-owned and regenerates both recorded limits.
41. `bun run test:lost-lines`
    - Upgrade audit reports app-authored lines the template copy deleted.
42. `bun run test:override-deltas`
    - Override report names the template content each .templateoverrides entry withholds.
43. `bun run test:reset-packages`
    - Package reset preserves dependencies when the frozen-install preflight fails.
44. `bun run test:scaffolded-hooks`
    - Scaffolded pre-push hook replays refs through both release guards.
45. `bun run test:template-drift`
    - Drift reports build-critical structural lines and files removed by the template.
46. `bun run format:check`
    - Format check.
47. `bun run test:aidd-format`
    - aidd metadata format gate self-test (synthetic fixtures).
48. `bun run check:aidd-format`
    - Tracked .aidd metadata matches the repository Prettier shape.
49. `bun run check-deps`
    - Check dependency versions.
50. `bun run check:dead-code`
    - Dead code detection (knip).

### 5. Docker Prod

Builds the production image locally, verifies its license notices, then runs the production docker-compose stack and crawl-tests it. Nothing is pulled from or pushed to a registry: Spernakit builds container images as local verification artifacts only (see `licenses/CONTAINER-DISTRIBUTION.md`).

Command:

```bash
bun run smoke:docker-prod
# or directly:
bun scripts/smoke.ts --mode docker-prod
```

Steps (in order):

1. `bun run config:validate -- --node-env production`
    - Preflight production config and placeholder secrets.
2. `bun run docker:image:build`
    - Build the production image.
3. `bun run check:image-licenses`
    - License notices present in the built image; base-image inventory current.
4. `bun scripts/reset-database.ts --force`
    - Reset database for clean Docker state.
5. `docker compose -f docker-compose.production.yml up -d`
    - docker compose up (prod).
6. `bun scripts/wait-for-http.ts --url http://localhost:{{FRONTEND_PORT}}/api/v1/health --timeoutMs 60000 --container {{APP_SLUG}}`
    - Wait for docker-prod stack to be ready.
7. `bun scripts/crawltest.ts --mode docker-prod`
    - Crawl test (docker-prod).
8. `bun run verify-compression --mode docker-prod`
    - Verify gzip compression on backend responses (required).
9. `docker compose -f docker-compose.production.yml down`
    - docker compose down (prod).

### 6. Reset

Performs a complete package reset and rebuild, including local Docker image verification. Spernakit does not provide an image publication command.

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
3. `bun scripts/reset-database.ts --force`
    - Reset database.
4. `bun run reset-packages`
    - Reset packages.
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
    - Crawl test with screenshots.
7. `bun run stop`
    - Stop services.

## Exit Codes and Logs

- The wrapper exits with code **0** only if **all** steps in the selected mode succeed.
- On the first failing step, the wrapper prints a `[FAIL]` line with the step description and exit code, then exits with that code.
- Key logs to inspect:
    - `logs/crawltest.log` - crawl tests (dev)
    - `logs/crawltest-preview.log` - crawl tests (preview)
    - `logs/crawltest-docker-local.log` - crawl tests (docker-local)
    - `logs/crawltest-docker-prod.log` - crawl tests (docker-prod)

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
