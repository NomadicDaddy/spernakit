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
- `screenshots` - production frontend capture with release evidence
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

1. `bun run test:auth-reset-ui-preview`
    - Test auth reset UI (preview).
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
3. `bun run check:feature-id-directory`
    - Feature id matches its directory.
4. `bun run check:template-feature-versions`
    - Template feature ownership version markers.
5. `bun run test:template-feature-versions`
    - Template feature ownership marker regression.
6. `bun run check:template-features`
    - Template feature records match the template.
7. `bun run test:template-features`
    - Template feature sync regression.
8. `bun run check:config`
    - Config invariants check.
9. `bun run check:schema-drift`
    - Config schema artifact drift check.
10. `bun run config:validate`
    - Config schema validation (defaults + example + instance).
11. `bun run test:config-preflight`
    - Production config preflight rejects placeholder secrets without disclosing values.
12. `bun run test:secrets-file`
    - Split-secrets loader resolves dot-paths and fails fast on dangling *Ref fields.
13. `bun run test:retention-zero`
    - retention.*Days = 0 keeps rows forever against a real database; positive windows still purge.
14. `bun run test:impersonation-audit`
    - Impersonated mutations persist userId + impersonatedBy; kill-switch blocks start but not stop.
15. `bun run test:page-size-options`
    - The rows-per-page controls offer one shared list of sizes, and the size in force is always on it.
16. `bun run test:memory-health-thresholds`
    - The memory health check answers to its configured thresholds on this runtime rather than reporting healthy whatever the process is using.
17. `bun run test:metrics-history-window`
    - Metrics history returns points spanning the range that was asked for rather than the newest hundred minutes of it.
18. `bun run test:workspace-role-predicate`
    - hasWorkspaceRole decides the workspace-role question without side effects, and requireWorkspaceRole never disagrees with it.
19. `bun run test:upload-validation`
    - Binary uploads skip the text line-length check, text formats keep it, and the request-body ceiling leaves room above storage.maxFileSize.
20. `bun run test:error-log-wiring`
    - Application errors reach logs/<name>.error.log in every logging mode, redacted the same way, while the main log keeps every level.
21. `bun run test:onboarding-password-step`
    - The onboarding checklist reports the sysop password change from the database rather than affirming it, with the first-login toggle off and on.
22. `bun run test:audit-outcome-filter`
    - A failed sign-in is filterable by outcome, carries its status on the row, and names the account it tried to use.
23. `bun run test:auth-before-validation`
    - A caller the route would reject is answered 401 or 403 before the body is validated, the rejection says nothing about the schema, public routes still return 400, and no route guards from beforeHandle.
24. `bun run test:auth-rate-limit-state`
    - Settings reports the pre-boot rateLimit.authEnabled kill-switch alongside the editable auth rate limit switch, so the page cannot say requests are throttled while they go through, and the plugin and the settings API decide that from one shared rule.
25. `bun run test:public-route-surface`
    - Every route the application registers refuses an anonymous caller unless it is listed as public with a reason, and the list carries no entry that is stale or already guarded.
26. `bun run test:bug-report-supersede`
    - A corrected bug report can name the one that replaced it, both reports read the link back, the default inbox stops counting the superseded one as open work, and a link that is circular, self-referential, or points at nothing is refused.
27. `bun run test:bug-report-whitespace`
    - A bug report whose description is empty once trimmed is refused rather than stored, every field the service trims is trimmed before the schema sees it, and a description opening with a blank line still gets a title.
28. `bun run test:dashboard-not-found`
    - A deleted dashboard renders the page not-found state with a route back, is not retried, and the error boundary still renders readable text for errors that are genuinely unexpected.
29. `bun run test:dashboard-share-revoke`
    - A dashboard share link can be revoked, answers like an unknown token afterwards, rotates on the next share, and is cleared when the dashboard is deleted.
30. `bun run test:view-transition-abort`
    - Navigating again before a view transition has finished raises nothing, a transition that failed for another reason is still reported, a navigation that ran no transition is untouched, and the crawl is not taught to ignore the message.
31. `bun run test:dialog-focus-return`
    - A dialog dismissed after being opened from a data-table row actions menu puts focus back on that row's menu button rather than on the document body, because the origin an overlay is handed is resolved to something that is still on the page once the menu has closed.
32. `bun run test:dialog-form-survival`
    - A dialog form is put back to its starting state when it opens and at no other time, so a submission the server refuses leaves every field as it was and a dialog the parent closes on success opens empty next time.
33. `bun run test:step-up-password-message`
    - A form that asks an already signed-in user for their current password says that the current password is wrong when it is, from every surface that asks for one, and answers with a status that does not send the client off to refresh the session or sign the user out.
34. `bun run test:username-parity`
    - The browser refuses exactly the usernames the API refuses, because the rule lives once in the shared policy and nothing under frontend or backend keeps its own copy of the allowed characters or builds its own verdict out of the shared bounds.
35. `bun run test:render-phase-sync`
    - A component that adjusts state during render compares against a sentinel nothing else writes, so a form seeded from the record it was opened for still holds what the user typed.
36. `bun run test:bad-request-recovery`
    - A read the API refuses as malformed is not retried and does not replace the page it came from, so a stale filter in the address leaves the table, the search box and the actions usable and says what happened.
37. `bun run test:workspace-header-contract`
    - A request that names no workspace is refused with one status and one message on every route, the caller's role is settled before the header is read, a workspace a SYSOP names scopes the listing rather than being discarded, a workspace that does not exist is answered 404 on every listing that reads the header rather than an empty page on some of them, and no route reads the header without authorizing it or words the header's messages itself.
38. `bun run test:workspace-subresource-existence`
    - A workspace sub-resource answers 404 for a name that points at nothing, whether that is a workspace a soft delete left members behind in or a user id no account carries, while a non-member still hears the same status either way, a real duplicate member still conflicts and an existing workspace answers as before.
39. `bun run test:wait-for-http`
    - Docker readiness failures print bounded container log diagnostics.
40. `bun run check:db-location`
    - Database location guard (ASSERT-010: DB files only under data/).
41. `bun run check:no-inline-references`
    - Inline .references() ban (ASSERT-012).
42. `bun run check:secrets-shape`
    - Secrets file shape parity.
43. `bun run check:leak-guard`
    - Leak-guard hook self-test (synthetic fixtures).
44. `bun run check:licenses`
    - Third-party license inventory matches the installed graph.
45. `bun run test:shared-core-write`
    - Shared-core write path regression self-test (synthetic fleet).
46. `bun run check:shared-core`
    - Shared-core files in sibling repositories match their owning repository (when present).
47. `bun run test:fleet-manifest`
    - Fleet manifest validator regression self-test.
48. `bun run test:fleet-manifest-sync`
    - Fleet manifest writer regression self-test.
49. `bun run check:fleet-manifest`
    - Fleet manifest matches packages and runtime configs.
50. `bun run check:image-publication`
    - Template image publication guard.
51. `bun run check:process-env`
    - Process environment access check.
52. `bun run check:env-spread`
    - Child processes receive only the environment they need.
53. `bun run check:git-window-hide`
    - Direct Git subprocesses hide their Windows console window.
54. `bun run check:audit-artifact-hygiene`
    - No audit report claims a date that has not happened yet.
55. `bun run check:max-lines`
    - 300-line max-lines gate.
56. `bun run check:script-targets`
    - Every package.json script resolves to a real file and task.
57. `bun run test:gate-conventions`
    - Gate conventions meta-gate regression self-test.
58. `bun run check:gate-conventions`
    - Every gate follows docs/reference/gate-conventions.md.
59. `bun run check-application`
    - Application check.
60. `bun run test:destructive-comments`
    - Destructive-confirmation reads code not prose (comment stripping and waiver honouring).
61. `bun run test:destructive-evidence`
    - Destructive-confirmation evidence resolver assertion (window and one-level handler hop).
62. `bun run check:destructive-confirmation`
    - Destructive mutation confirmation check.
63. `bun run test:mutation-denylist`
    - Database-admin mutation-denylist assertion (api_keys, audit_logs, token_blacklist, users).
64. `bun run check:docs`
    - Documentation consistency check.
65. `bun run check:version-refs`
    - Current-state version claims in docs match package.json.
66. `bun run check:smoke-docs`
    - Smoke runbook matches scripts/smoke.json.
67. `bun run typecheck`
    - Typecheck.
68. `bun run lint`
    - Lint.
69. `bun run build`
    - Build.
70. `bun run verify-minification`
    - Verify bundle minification and total size budget.
71. `bun run check:critical-path`
    - Verify critical-path size, React runtime placement, and no preload waterfall.
72. `bun run check:api-types`
    - API type contract validation.
73. `bun run check:feature-integration`
    - Feature integration check.
74. `bun run test:feature-integration`
    - Feature integration rejects unmounted flat route modules.
75. `bun run check:schema-parity`
    - SQLite/PG schema parity check.
76. `bun run test:backup-compression`
    - Backup decompression guard rejects high-ratio archives and cleans up.
77. `bun run test:bundle-budget`
    - Bundle budget stays app-owned and is only enforced with matching provenance.
78. `bun run test:crawl-credentials`
    - Crawl login resolves from the seed account and never from a tracked config file.
79. `bun run test:critical-path-budget`
    - Critical-path budget stays app-owned and regenerates both recorded limits.
80. `bun run test:lost-lines`
    - Upgrade audit reports app-authored lines the template copy deleted.
81. `bun run test:override-deltas`
    - Override report names the template content each .templateoverrides entry withholds.
82. `bun run test:reset-packages`
    - Package reset preserves dependencies when the frozen-install preflight fails.
83. `bun run test:clear-logs`
    - Clearing logs removes this repository's own runtime and runbook output and nothing else.
84. `bun run test:scaffolded-hooks`
    - Scaffolded pre-push hook replays refs through both release guards.
85. `bun run test:template-drift`
    - Drift reports build-critical structural lines and files removed by the template.
86. `bun run format:check`
    - Format check.
87. `bun run test:aidd-format`
    - aidd metadata format gate self-test (synthetic fixtures).
88. `bun run check:aidd-format`
    - Tracked .aidd metadata matches the repository Prettier shape.
89. `bun run check-deps`
    - Check dependency versions.
90. `bun run check:dead-code`
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

Builds and serves the production frontend, then captures the full crawl at 2250×1309. Each run
keeps its images and analyzer verdict in a separate versioned run directory. Release evidence
requires a clean committed candidate and complete route coverage.

Command:

```bash
bun run smoke:screenshots
# or directly:
bun scripts/smoke.ts --mode screenshots
```

Steps (in order):

1. `bun run build:frontend`
    - Build the production release frontend.
2. `bun run stop`
    - Stop any running processes.
3. `bun scripts/clear-logs.ts`
    - Clear logs.
4. `bun scripts/start.ts --check --preview`
    - Start services with the production frontend.
5. `bun scripts/wait-for-http.ts --url http://localhost:{{BACKEND_PORT}}/api/v1/health --timeoutMs 30000`
    - Wait for backend to be ready.
6. `bun scripts/wait-for-http.ts --url http://localhost:{{FRONTEND_PORT}} --timeoutMs 30000`
    - Wait for frontend to be ready.
7. `bun scripts/crawltest.ts --mode preview --screenshot-pages --404 --bug`
    - Crawl test with screenshots.
8. `bun run stop`
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
| `bun run smoke:screenshots`  | Production frontend capture with release evidence                    |

## Related Scripts

| Script                        | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `bun run reset-packages`      | Remove node_modules, dist, lock files and reinstall |
| `bun run db:migrate`          | Run pending Drizzle migrations                      |
| `bun run db:migrate:status`   | Show migration status                               |
| `bun run db:migrate:baseline` | Mark migrations as applied (for existing databases) |
