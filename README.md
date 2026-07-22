# Spernakit v3.28.2

Self-hosted admin application template built from scratch with Bun-native tooling.

Spernakit v3.28.2 is the current template baseline. Changes must follow the architecture rules in the
template docs, stay wired end to end, and pass the quality gates before they are treated as
complete.

## Overview

Spernakit v3.28.2 is a full-stack self-hosted admin application template for building
Spernakit-derived apps. It provides authentication, RBAC, multi-tenancy via workspaces,
audit logging, real-time notifications, file uploads, scheduled tasks, health monitoring,
and an admin UI covering all of it.

Built with Elysia, Drizzle ORM, React 19, Vite 8, shadcn/ui, TanStack Query, Zustand,
Tailwind CSS 4, SQLite/PostgreSQL, and Bun.

## Source of Truth

This README is the consolidated entry point for the Spernakit template and its local
ecosystem. The detailed rules remain in the template docs:

| Document          | Location                                                     | Purpose                                                                                |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Technical stack   | [docs/template/STACK.md](docs/template/STACK.md)             | Canonical architecture, stack, commands, services, config, and verification reference  |
| Development guide | [docs/template/DEVELOPMENT.md](docs/template/DEVELOPMENT.md) | Coding style, backend/frontend patterns, database rules, UI/UX guidance, and workflows |
| Audit framework   | `../aidd/audits/SPERNAKIT.md`                                | Checklist-based audit framework for template drift and feature utilization             |
| App registry      | [spernakit.psd1.example](spernakit.psd1.example)             | Fleet ports, app versions, and `spernakit_version` tracking (copy to `spernakit.psd1`) |

When this README conflicts with `STACK.md` or `DEVELOPMENT.md`, treat those template docs as
authoritative and update this README.

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
- Interval-based scheduled task runner with execution history
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
- Runtime settings for SMTP, auth security policy, feature flags, and user UI preferences
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

# Build and inspect the standalone local verification image
bun run docker:image:build
bun run check:image-licenses
```

Spernakit's image commands are local verification only. The template has no registry login,
push command, package-write permission, or image-publishing workflow. Derived projects make any
distribution decision explicitly under their own registry and license policy.

## Code Quality

`bun run smoke:qc` is the required full quality gate. Its canonical step list is defined
by `scripts/smoke.json` mode `qc`; do not duplicate that list in this README when updating
the pipeline.

```bash
# Full check-only quality gate
bun run smoke:qc

# Cached inner-loop gate: max-lines, typecheck, format, and lint
bun run smoke:qc:fast

# Repair lint and format drift, then run the check-only quality gate
bun run qc:fix

# Show cached, pending, and intentionally uncacheable QC steps
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

## Using Spernakit as a Template

Run `bun run setup` after cloning to choose the app name, slug, and ports. Setup updates the
template-owned configuration and creates the local instance config under `config/`. The local
backend binds to `127.0.0.1` by default so development credentials are not exposed to the local
network.

The development seed includes accounts for each RBAC role. Their credentials and the first-login
flow are documented in [Getting Started](docs/template/GETTING_STARTED.md#default-users).
They are only for local testing. Production startup rejects the demo credentials and placeholder
security keys.

For several derived apps, [spernakit.psd1.example](spernakit.psd1.example) can be copied to the
gitignored `spernakit.psd1` fleet registry. It records local ports and template versions without
publishing the private app roster.

## Optional aidd Integration

[aidd](https://github.com/NomadicDaddy/aidd) can manage Spernakit feature work, audits, and
verification runs. It is optional and maintained as a separate project. Apps using it keep their
product contract and work records under `.aidd/`; Spernakit itself does not require aidd to build,
run, or deploy.

## Browser Verification

[scripts/crawltest.ts](scripts/crawltest.ts) drives Puppeteer directly to crawl every discoverable
route, capturing console output, page errors, and failed requests per page. It is the repository's
primary runtime verification path and runs in CI. The normal entry point is the route-focused crawl
command documented under [Code Quality](#code-quality).

The interactive `sb` browser CLI that previously lived here has moved to its own project,
[spernakit-browser](https://github.com/NomadicDaddy/spernakit-browser). It was never part of the
crawl path, and nothing in the template imported it.

## License

MIT

Third-party dependency licenses are summarized in [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md).
The production npm closure is permissively licensed. MPL-2.0 `lightningcss` remains build-time
only and is absent from the local verification image. That image does contain Bun's LGPL-linked
components and GPL/LGPL Alpine packages, documented in `licenses/` and verified against the built
artifact. Spernakit does not publish the image; derived projects that choose to do so must follow
[the container distribution guidance](./licenses/CONTAINER-DISTRIBUTION.md).
