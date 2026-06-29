# Spernakit v3

Self-hosted admin application template built from scratch with Bun-native tooling.

> **v3.13.0 LTS.** Patch-only maintenance per [docs/template/LTS.md](docs/template/LTS.md).
> The v3.13 line accepts qualifying fixes, documentation corrections, security work, and
> dance-blocking template drift fixes. New feature work belongs in the next-line backlog.

## Overview

Spernakit v3 is a full-stack self-hosted admin application template for building
Spernakit-derived apps. It provides authentication, RBAC, multi-tenancy via workspaces,
audit logging, real-time notifications, file uploads, scheduled tasks, health monitoring,
and a comprehensive admin UI.

Built with Elysia, Drizzle ORM, React 19, Vite 8, shadcn/ui, TanStack Query, Zustand,
Tailwind CSS 4, SQLite/PostgreSQL, and Bun.

## Source of Truth

This README is the consolidated entry point for the Spernakit template and its local
ecosystem. The detailed rules remain in the template docs:

| Document          | Location                                                     | Purpose                                                                                |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Technical stack   | [docs/template/STACK.md](docs/template/STACK.md)             | Canonical architecture, stack, commands, services, config, and verification reference  |
| Development guide | [docs/template/DEVELOPMENT.md](docs/template/DEVELOPMENT.md) | Coding style, backend/frontend patterns, database rules, UI/UX guidance, and workflows |
| LTS policy        | [docs/template/LTS.md](docs/template/LTS.md)                 | Patch-only rules for the v3.13 LTS branch                                              |
| Audit framework   | `../aidd/audits/SPERNAKIT.md`                                | Checklist-based audit framework for template drift and feature utilization             |
| App registry      | [spernakit.psd1.example](spernakit.psd1.example)             | Fleet ports, app versions, and `spernakit_version` tracking (copy to `spernakit.psd1`) |

When this README conflicts with `STACK.md`, `DEVELOPMENT.md`, or `LTS.md`, treat those
template docs as authoritative and update this README.

## Features

### Authentication and Security

- JWT authentication with HTTP-only cookies and automatic token refresh
- OAuth/SSO integration for Google, GitHub, and Microsoft with account linking
- 5-tier RBAC hierarchy: SYSOP, ADMIN, MANAGER, OPERATOR, VIEWER
- API key authentication with scoped permissions and request signing support
- Multi-factor authentication (TOTP) with an enrollment wizard and regenerable recovery codes
- Account lockout, password reset, password history, expiry, and minimum age controls
- Configurable CSRF protection, strict CSP, security headers, and IP-based rate limiting
- Token revocation through a database-backed JWT blacklist

### User and Workspace Management

- Full user CRUD with bulk operations, soft delete, and profile management
- Multi-tenancy through workspaces and workspace member management
- Workspace-scoped data isolation with SYSOP cross-workspace access
- Workspace switcher with persistent active workspace selection

### Dashboards and Analytics

- Custom dashboards with drag-and-drop widget layout
- Dashboard sharing through tokenized public links
- Dashboard export and template import
- Business metrics and analytics pages
- Chart widgets, stat cards, and system resource dashboards

### Notifications

- Native WebSocket real-time notifications
- Notification CRUD with read/unread tracking and bulk actions
- Admin broadcast messaging to all users or selected roles
- Per-user notification preferences and unread badge counts

### System Administration

- Health checks for database, memory, filesystem, and system resources
- Health alerts with acknowledge and resolve lifecycle
- System metrics collection with retention policies
- Cron-based scheduled task runner with execution history
- Searchable audit trail
- Database backup, restore, and optional backup encryption with key rotation and re-encryption of existing backups
- Database admin suite: schema explorer, ERD diagram, data viewer, and read-only SQL sandbox with safe mode
- Guided onboarding checklist for first-run setup with auto-detected step completion
- Web Vitals collection and server-side storage

### File Management

- File upload API with local and S3 storage backends
- Drag-and-drop upload UI with progress, preview, and metadata tracking
- Image processing through Bun.Image for resize, WebP conversion, and thumbnails

### Settings and Configuration

- JSON-only static configuration with generated schema support
- Runtime settings for SMTP, auth security policy, feature flags, super-theme, and user UI
  preferences
- Application branding settings
- Split secrets file support for operator-owned third-party credentials when needed

### UI and Developer Experience

- shadcn/ui New York style component library
- Light, dark, and system theme support with CSS variable theming
- Command palette, global keyboard shortcuts, and help modal
- Mobile-responsive layouts with collapsible sidebar and topbar/sidebar modes
- Virtual scrolling for large lists
- Reusable DataTable with sorting, filtering, pagination, and row selection
- Error boundaries, styled 404 page, route-based code splitting, and skeleton fallbacks

### DevOps and Quality

- Docker deployment with nginx and supervisord in a monolithic container
- Swagger/OpenAPI docs at `/api/v1/docs` in development mode
- `bun run smoke:qc` quality gate
- Structured JSON logging with pino and file rotation
- ESLint flat config and Prettier with tabs, single quotes, and 100 character lines

## Prerequisites

- [Bun 1.3.14+](https://bun.sh) as the required package manager and runtime
- Node.js 24.x as optional compatibility tooling
- SQLite by default, with PostgreSQL support through `config.database.dialect`

## Quick Start

```bash
# Install dependencies and initialize the app
bun run setup

# For an existing checkout, install dependencies and prepare the database
bun install
bun run db:setup

# Start frontend and backend development servers
bun run dev
```

For a fresh deployment, generate unique keys before using production-like config:

```bash
bun run generate-keys
```

## Project Structure

```text
spernakit/
├── backend/          # Elysia API server, Drizzle schema, services, routes, config
├── frontend/         # React 19 + Vite SPA
├── shared/           # Shared types, constants, and pure functions
├── config/           # JSON configuration and generated schema
├── data/             # SQLite database files
├── docker/           # Docker deployment files
├── scripts/          # TypeScript utility, smoke, sync, and validation scripts
├── docs/             # Template documentation
└── spernakit.psd1.example # Fleet manifest template (copy to spernakit.psd1)
```

## Tech Stack

| Layer                       | Technology                                      |
| --------------------------- | ----------------------------------------------- |
| Runtime and package manager | Bun 1.3.14+                                     |
| Backend                     | Elysia + Drizzle ORM                            |
| Database                    | SQLite by default, PostgreSQL supported         |
| Frontend                    | React 19 + Vite 8                               |
| UI                          | Tailwind CSS 4 + shadcn/ui                      |
| Server state                | TanStack Query                                  |
| Client state                | Zustand                                         |
| Auth                        | JWT with HTTP-only cookies                      |
| WebSocket                   | Bun native WebSocket + browser native WebSocket |
| Logging                     | pino                                            |

## Configuration

Spernakit uses JSON-only configuration. General configuration lives in
`config/{slug}.json`, and Bun is configured with `env = false` in [bunfig.toml](bunfig.toml).
Do not add `.env` files.

Primary config files:

| File                                    | Purpose                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `backend/src/config/defaults.json`      | Built-in default values for every registered config section            |
| `config/example.json`                   | Example instance config                                                |
| `config/spernakit.json`                 | Local app config                                                       |
| `config/spernakit.secrets.json`         | Optional split secrets file for operator-owned third-party credentials |
| `config/spernakit.secrets.json.example` | Shape example for optional split secrets                               |
| `config/config-schema.json`             | Generated JSON schema for editor validation                            |

Run config validation without starting the server:

```bash
bun run config:validate
bun run config:schema
```

Runtime-editable settings live in the database `settings` table and are managed through
the UI or settings services. Static infrastructure settings belong in JSON config.

## Development Commands

```bash
# Start both services with log aggregation
bun run dev

# Start individual services
bun run dev:backend
bun run dev:frontend

# Build both workspaces
bun run build

# Stop local or docker development services
bun run stop
```

Database commands:

```bash
bun run db:setup
bun run db:generate
bun run db:migrate
bun run db:migrate:status
bun run --cwd backend db:studio
```

Docker commands:

```bash
bun run docker:build
bun run docker:up
docker compose logs
bun run docker:down
```

## Code Quality

`bun run smoke:qc` is the required full quality gate. Its canonical step list is defined
by `scripts/smoke.json` mode `qc`; do not duplicate that list in this README when updating
the pipeline.

```bash
# Full check-only quality gate
bun run smoke:qc

# Repair lint and format drift, then run the check-only quality gate
bun run qc:fix

# Show cached and pending QC steps
bun run qc:status

# Format code
bun run format

# Check formatting
bun run format:check

# Typecheck all workspaces and scripts
bun run typecheck
```

After UI changes, run the relevant crawl test against a running app:

```bash
bun scripts/crawltest.ts --page /settings/users
bun scripts/crawltest.ts --start-from /settings
bun scripts/crawltest.ts --404
```

Full validation chain:

```bash
bun run supertest
```

Spernakit does not use unit test frameworks such as vitest, jest, or Testing Library.
Validation is through smoke checks, crawl tests, and integration scripts.

## Pre-commit Hook

The pre-commit hook is installed by the package `prepare` script and runs fast local
checks before each commit:

- `format:check`
- `lint`
- `typecheck`

The full `bun run smoke:qc` gate still runs in CI and remains required before treating
changes as complete.

## Ecosystem Concepts

| Concept             | Description                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Derived app         | An application scaffolded from the Spernakit template (your own derived apps)                                         |
| Template drift      | Divergence between a derived app and the current template, either structural or behavioral                            |
| `feature.json`      | Structured work file under `.aidd/features/{id}/feature.json` that describes one reconstructable unit of work         |
| Feature kind        | `kind: "bug"` for defects or `kind: "feature"` for capabilities                                                       |
| Remediation feature | `remediation-{YYYYMMDD}-{slug}` feature work for proving a bug is fixed                                               |
| Base feature        | Descriptive feature slug for a complete capability; legacy `feature-{YYYYMMDD}-{slug}` IDs should be consolidated     |
| Audit finding       | `audit-{type}-{timestamp}-{slug}` feature emitted by AIDD audit modes                                                 |
| `bugs.json`         | User-reported submissions at `data/bugs.json`, ingested by bug-to-feature tooling                                     |
| Testing scenarios   | Curated end-user scenarios at `.aidd/testing-scenarios.md`                                                            |
| App registry        | [spernakit.psd1.example](spernakit.psd1.example), template for the local fleet manifest (ports, versions, sync state) |

## Environment Mapping

| Tier | Location                          | Method        | Config `nodeEnv` | Rate limit | Secrets         |
| ---- | --------------------------------- | ------------- | ---------------- | ---------- | --------------- |
| DEV  | `<workspace>/{appname}/`          | `bun run dev` | `development`    | Off        | Dev keys        |
| TST  | OS temp or `APPDATA_ROOT`         | Volume target | `development`    | Off        | Dev keys        |
| STG  | `<appdata>/staging/{appname}/`    | Volume target | `production`     | On         | Separate keys   |
| PRD  | `<appdata>/production/{appname}/` | Volume target | `production`     | On         | Production keys |

## Documentation Map

```text
STACK.md + DEVELOPMENT.md + LTS.md
            |
            v
Template rules, commands, quality gates, and architecture
            |
            v
Spernakit-derived apps + .aidd/features + fleet workflows
```

| Document        | Location                          | Purpose                                                |
| --------------- | --------------------------------- | ------------------------------------------------------ |
| README          | `README.md`                       | Consolidated Spernakit entry point and ecosystem guide |
| STACK           | `docs/template/STACK.md`          | Canonical technical reference                          |
| DEVELOPMENT     | `docs/template/DEVELOPMENT.md`    | Development best practices and conventions             |
| LTS             | `docs/template/LTS.md`            | Patch-only policy for v3.13                            |
| SPERNAKIT audit | `../aidd/audits/SPERNAKIT.md`     | Template drift and feature utilization audit           |
| Fleet manifest  | `spernakit.psd1`                  | Local registry of app ports, versions, and sync status |
| AGENTS          | `AGENTS.md` plus app-level copies | Agent instructions and workspace rules                 |

## Skills and Commands

These are local workflow capabilities used across Spernakit and derived apps. Exact
implementations live in the local `ai` command and skill catalog.

### User-Invocable Skills

| Skill                  | When to use                                  | What it does                                                                   |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| `spernakit-tester`     | End-user testing of a Spernakit app          | Runs exploratory or scripted browser testing and files bugs through the app UI |
| `testing-scenarios`    | Seeding or augmenting test scenarios         | Reads project artifacts and routes, then writes `.aidd/testing-scenarios.md`   |
| `bug2feature`          | `data/bugs.json` has new entries             | Converts reports into `remediation-*` or feature work                          |
| `doc2feature`          | Prose report should become actionable work   | Verifies claims against code and emits remediation features                    |
| `feature-review`       | Before implementing feature work             | Reviews feature specs for conflicts, vagueness, and missing detail             |
| `audit-finding-review` | After audit-generated features               | Classifies findings as keep, remove, escalate, or consolidate                  |
| `promote-remediation`  | A remediation is really net-new feature work | Converts a remediation feature to a feature entry and updates references       |
| `spernakit-diff-sync`  | Template/app improvements need comparison    | Compares and syncs specific file pairs between template and derived apps       |
| `changelog-rewrite`    | Before a release                             | Rewrites generated changelogs into human release notes                         |
| `dance`                | Ship and propagate a template release        | Runs the full template release, sync, tester, triage, verify, and tag workflow |
| `ui-parity`            | After UI rewrites or redesigns               | Compares UI versions and emits gap reports and feature work                    |
| `spernakit-apply-ui`   | Applying an external UI to an app            | Replaces app UI while preserving routes, stores, API wiring, and behavior      |
| `dogfood`              | Systematic bug hunt                          | Exploratory QA with screenshots, recordings, and repro steps                   |
| `review`               | Second opinion on a diff                     | Multi-agent review for correctness, security, quality, and stack compliance    |
| `review-doc`           | Documentation may be stale                   | Reviews docs against current application state                                 |
| `reality-check`        | Unfamiliar or suspect files                  | Verifies implementation against inferred purpose                               |
| `thorough`             | Before concluding non-trivial work           | Runs a 3-pass verification checklist                                           |
| `simplify`             | After implementation                         | Refines modified code without changing behavior                                |
| `validate-build`       | After code changes                           | Runs and fixes build validation failures                                       |
| `validate-tests`       | After code changes                           | Runs and fixes test validation failures                                        |
| `knip`                 | Dead-code sweep                              | Finds unused files, dependencies, and exports                                  |
| `rbac`                 | RBAC resource changes                        | Updates RBAC docs and role coverage                                            |

### Command Shims

| Command                | When to use                              | What it does                                                            |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `template-upgrade`     | A new Spernakit version is available     | Applies template deltas to a derived app using review-first manual sync |
| `template-refactor`    | After upgrade or accumulated drift       | Audits a derived app against the template and plans structural cleanup  |
| `update-screen-map`    | Routes or pages changed                  | Reconciles `.aidd/screen-map.md` against actual routes and page code    |
| `consolidate-features` | Remediation/audit work is complete       | Folds completed findings back into base features                        |
| `feature-review-all`   | Cross-app feature spec sweep             | Runs feature review across Spernakit-derived apps                       |
| `execute-audit`        | Run a specific audit                     | Invokes the selected AIDD audit mode                                    |
| `update-audits`        | Refresh audit catalog                    | Updates audit definitions from the AIDD source                          |
| `spernakit-bump`       | Bump a derived app to a template version | Updates `spernakit_version` and runs template upgrade workflow          |
| `hygiene`              | Periodic cleanup                         | Runs lint, format, unused export, and dead import cleanup               |
| `commit-archaeology`   | Understand history                       | Mines git history for patterns and prior decisions                      |
| `devdiary-update`      | Record recent work                       | Writes DevDiary entries based on recent project activity                |

## Browser Automation CLI

[scripts/sb.ts](scripts/sb.ts) is the Spernakit browser automation CLI used by
Spernakit testing workflows. It starts a Puppeteer-backed daemon on demand and supports
named sessions.

```bash
bun scripts/sb.ts --session <name> <command> [args...]
```

Common commands include `open`, `click`, `fill`, `snapshot`, `screenshot`, `wait`,
`console`, and `errors`.

Do not delete `scripts/sb.ts` or `scripts/spernakit-browser/` from Spernakit-derived apps.
They are the browser transport for the testing workflows.

## AIDD Workflow Reference

The local AIDD CLI (the orchestrator tool) coordinates feature completion, validation,
audits, interviews, and fleet workflows across Spernakit-derived apps.

Common commands:

| Command                                 | Purpose                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| `aidd --project-dir DIR`                | Run default feature-completion mode on a project                |
| `aidd --audit AUDIT[,AUDIT...]`         | Run one or more audits                                          |
| `aidd --audit-all`                      | Run every audit in the catalog                                  |
| `aidd --code-after-audit`               | Fix audit findings, then re-audit                               |
| `aidd --validate`                       | Verify incomplete features and promote passing work             |
| `aidd --check-features`                 | Validate every `feature.json` against the schema                |
| `aidd --todo`                           | Focus on TODO items                                             |
| `aidd --interview [FILE]`               | Process project interview questions                             |
| `aidd --feature VALUE`                  | Focus on a specific feature                                     |
| `aidd --filter-by FIELD --filter VALUE` | Restrict work by feature metadata                               |
| `aidd --milestone VALUE`                | Restrict work to a roadmap milestone                            |
| `aidd --prompt "DIRECTIVE"`             | Run with a custom directive                                     |
| `aidd --stop`                           | Ask a running AIDD instance to stop after the current iteration |
| `aidd --cli CLI`                        | Choose the coding backend                                       |
| `aidd --model MODEL`                    | Override model selection                                        |

## Typical Workflows

### Test-Driven Triage

1. Run `spernakit-tester {appname}` for exploratory or scripted browser testing.
2. Ingest reported bugs from `data/bugs.json` with `bug2feature {appname}`.
3. Run `feature-review {appname}` against generated feature work.
4. Implement fixes directly or through AIDD with a focused filter.
5. Run `aidd --validate --project-dir {app}`.
6. Consolidate completed remediation work with `consolidate-features {appname}`.
7. Run `aidd --check-features`.

### Interview-Driven Triage

1. Run `aidd --interview`.
2. Review responses into the app's `.aidd/` response review artifacts.
3. Convert confirmed prose findings with `doc2feature {appname}`.
4. Review generated remediations with `feature-review {appname}`.
5. Update assertions when product behavior changes.
6. Validate and consolidate resolved work.

### Post-Audit Cleanup

1. Run selected AIDD audits or `aidd --audit-all`.
2. Triage findings with `audit-finding-review`.
3. Clean kept findings with `feature-review`.
4. Implement fixes directly or through AIDD filters.
5. Validate with `aidd --validate`.
6. Consolidate completed findings into base features.

### Template Release and Propagation

For the template itself:

1. Test Spernakit with `spernakit-tester spernakit`.
2. Convert and remediate any tester bugs.
3. Run the required quality gate for the release.
4. Consolidate completed remediation work.
5. Bump and tag the template version when eligible under LTS policy.

For each derived app:

1. Run `template-upgrade {appname}`.
2. Use `template-refactor {appname}` only if structural drift remains.
3. Test the upgraded app.
4. Convert and remediate any app-specific bugs.
5. Run the app's quality gate.
6. Consolidate completed remediation work.
7. Commit with the synced template version noted.

## Project-Level AIDD Artifacts

Every Spernakit-derived app should maintain `.aidd/` artifacts that describe product
intent, current structure, and test expectations.

| Artifact            | Path                                            | Purpose                                                   |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| App specification   | `.aidd/spec.md`                                 | Canonical blueprint for what the app is and who it serves |
| Assertions          | `.aidd/assertions.md`                           | Behavior, data, and UX invariants the app commits to      |
| Project structure   | `.aidd/project-structure.md`                    | App-specific directory layout and module boundaries       |
| Roadmap             | `.aidd/roadmap.md` and `.aidd/roadmap.json`     | Feature plan and milestone driver                         |
| Screen map          | `.aidd/screen-map.md`                           | Route/page catalog with screen details                    |
| Interview questions | `.aidd/questions.md`                            | Prompts for interview mode                                |
| Interview responses | `.aidd/responses.md` and `.aidd/responses/*.md` | User-authored answers for review and conversion           |
| Testing scenarios   | `.aidd/testing-scenarios.md`                    | Curated end-user flows for tester workflows               |
| Feature work        | `.aidd/features/*/feature.json`                 | Reconstructable feature, remediation, and audit work      |

The roadmap and screen map drift fastest and should be reconciled after route or feature
changes. The app spec and assertions should change only when product behavior changes.

## Canonical Paths

| Path                               | Purpose                                |
| ---------------------------------- | -------------------------------------- |
| `README.md`                        | Consolidated Spernakit entry point     |
| `docs/template/STACK.md`           | Stack and architecture source of truth |
| `docs/template/DEVELOPMENT.md`     | Development practices source of truth  |
| `docs/template/LTS.md`             | v3.13 patch-only gate                  |
| `spernakit.psd1`                   | Fleet manifest                         |
| `scripts/sb.ts`                    | Browser automation CLI                 |
| `../aidd/aidd.sh`                  | AIDD CLI entry point                   |
| `../aidd/audits/SPERNAKIT.md`      | Spernakit audit framework              |
| `{app}/.aidd/features/`            | Feature work directories               |
| `{app}/.aidd/testing-scenarios.md` | Tester scenario catalog                |
| `{app}/data/bugs.json`             | User-submitted bug reports             |
| `{app}/logs/backend.log`           | Backend pino log                       |
| `{app}/logs/frontend.log`          | Frontend/Vite log                      |

## Derived Apps

Copy `spernakit.psd1.example` to `spernakit.psd1` and register your apps there. The real
`spernakit.psd1` is gitignored, so your fleet roster stays local. Each entry records the app
slug, front/back ports, version, and the `spernakit_version` it tracks. For example:

| App       | Front / Back ports | Version | `spernakit_version` | Description                                 |
| --------- | ------------------ | ------- | ------------------- | ------------------------------------------- |
| spernakit | 3330 / 3331        | 3.13.0  | Template            | Self-Hosted Multi-User Application Template |
| your-app  | 3340 / 3341        | 0.1.0   | 3.13.0              | Your Spernakit-derived application          |

`spernakit_version = "latest"` means the app is in pending-rebuild status. Its active
codebase is archived as `{slug}.old/` and has not been ported to the current template yet.

## Default Accounts

| Username | Password    | Role     |
| -------- | ----------- | -------- |
| sysop    | sysop123    | SYSOP    |
| admin    | admin123    | ADMIN    |
| manager  | manager123  | MANAGER  |
| operator | operator123 | OPERATOR |
| viewer   | viewer123   | VIEWER   |

Default users are for local development and testing. Use generated secrets and appropriate
credential policy before any production-like deployment.

## License

MIT
