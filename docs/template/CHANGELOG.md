# Spernakit Changelog

This changelog defines the public Spernakit baseline. Future entries will describe changes from
this release.

## [3.31.2] - 2026-07-27

### Fixed

- `setup` can now be re-run on an initialized project. It consumed
  `licenses/SOURCE-OFFER.template.md` and deleted it, so every later run — including every
  `reset.ps1` — threw `ENOENT` on the missing template. Once `licenses/SOURCE-OFFER.md` exists it
  belongs to the project owner, who may have filled in the legal entity and contact address, so
  setup now leaves it untouched rather than regenerating it.

## [3.31.1] - 2026-07-27

### Fixed

- Derived apps now ignore `.aidd/skills/`. The directory is materialized by the aidd runtime, so
  every derived app had added the rule by hand and then reported it as template drift forever.

## [3.31.0] - 2026-07-26

### Added

- Added a shared fleet-manifest loader, regression tests, and a PowerShell reader. Reset,
  initialization, drift classification, and QC now validate registered app versions, ports,
  package metadata, and active runtime configuration against `spernakit.psd1`.
- Split the mobile navigation into a lazy-loaded chunk so desktop sessions do not load it on the
  initial path.

### Changed

- File cleanup jobs now remove eligible files concurrently while retaining per-file failure
  reporting.
- Critical-path checks now account for Brotli and gzip output separately, verify the entry chunk's
  static imports, and enforce the restored gzip budget.

### Fixed

- Required fields in dashboard, API key, user, and workspace dialogs now expose validation errors
  when submitted empty.
- Added explicit autocomplete policies to non-authentication forms and corrected placeholder and
  action copy across authentication, files, notifications, profile, and workspace screens.
- The file upload drop zone now uses the native file input as its interactive control.
- Added an intentional touch highlight policy and protected technical identifiers from browser
  translation.
- WebSocket state checks now handle wrapped sockets consistently during connection and cleanup.

## [3.30.0] - 2026-07-26

### Changed

- Migrated the frontend router from React Router 7 to React Router 8. The `react-router-dom`
  package no longer exists upstream in v8; all 41 import sites now resolve from `react-router`
  directly, and `react-router-dom` has been dropped from `frontend/package.json`.
- `scripts/check-dependency-versions.ts` pins `react-router` in place of `react-router-dom` as a
  critical frontend dependency.
- The `react-routing` manual chunk in `frontend/vite.config.ts` no longer matches the removed
  `react-router-dom` directory.
- Updated `lucide-react` to 1.27.0 and `recharts` to 3.10.1.
- The fresh-release contract now treats the 3.29.0 public baseline as a floor rather than an exact
  pin: the package version must be at or above it, and `docs/template/CHANGELOG.md` must lead with
  the version being released, retain the baseline entry, and carry no heading that predates it.
  Previously any release after the baseline failed `bun run check:fresh-release` by construction.

### Security

- Resolves GHSA-qwww-vcr4-c8h2 (HIGH), a CSRF-protection bypass affecting React Router 7 in RSC
  mode. The container image is clean under the CI Trivy CRITICAL/HIGH gate without a suppression,
  so `.trivyignore` and its `trivyignores` wiring in the CI workflow have been removed.

## [3.29.0] - 2026-07-26

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
- ESLint flat configs, strict TypeScript settings, Prettier formatting with Tailwind class ordering,
  and Knip dead-code analysis form one source-quality contract.
- `bun run deploy` builds and starts the local production stack through the same deployment script
  used for explicit local production operations.
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
- Version tag pushes require a matching local screenshot capture with at least five PNG files before
  the tag can be published.
