# Spernakit Changelog

This changelog defines the public Spernakit baseline. Future entries will describe changes from
this release.

## [3.28.2] - 2026-07-21

### Application foundation

- Bun-first TypeScript monorepo with shared, backend, and frontend workspaces.
- React and Vite frontend with responsive navigation, reusable UI primitives, theming, command
  palette support, keyboard shortcuts, and accessible interaction patterns.
- Elysia backend with typed request validation, consistent response envelopes, OpenAPI support,
  structured logging, compression, and health endpoints.
- SQLite and PostgreSQL schema implementations kept aligned by a blocking parity check.
- JSON configuration with generated schemas, environment overrides, secret separation, and
  startup validation.

### Authentication and authorization

- Cookie-based JWT sessions with refresh rotation, token revocation, and configurable timeouts.
- Password login, password reset, account lockout, session management, and optional OAuth
  providers.
- Five-tier role-based access control for system, administration, management, operator, and
  viewer responsibilities.
- API key management with scoped permissions and auditable use.
- CSRF, CORS, content security policy, request-size, rate-limit, and mutation protections.

### Product capabilities

- User, profile, team, and role administration.
- Dashboards, metrics, reports, saved filters, and export workflows.
- Real-time notifications with user preferences and WebSocket delivery.
- File upload, download, metadata, validation, and storage management.
- Application, email, OAuth, security, and operational settings.
- Database administration tools with protected mutation paths and audit logging.

### Operations and quality

- Local and production Docker workflows with explicit image-publication and license guards.
- Deterministic Bun dependency installation with exact template pins and lockfile validation.
- Blocking checks for configuration, schema parity, API contracts, feature wiring, documentation,
  dependency policy, formatting, linting, type safety, dead code, build output, and critical-path
  budgets.
- Template drift classification for pure, branded, infrastructure, and security-infrastructure
  files.
- Cross-platform setup and initialization scripts that create a branded derived application,
  initialize its database, generate required artifacts, run the quality gate, and create its
  initial commit.

### Template lifecycle

- This release is the minimum supported source for template synchronization.
- `bun run template:sync-plan -- --app ../<app>` produces a read-only review packet for a derived
  application.
- Releases without a predecessor use this complete baseline as their release notes. Future
  releases use conventional-commit ranges and resolvable comparison links.
