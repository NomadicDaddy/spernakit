# Spernakit Changelog

This changelog defines the public Spernakit baseline. Future entries will describe changes from
this release.

## [3.32.1] - 2026-07-28

### Fixed

- Template drift now distinguishes build-critical branded files and prints the missing structural
  lines, so a derived-app Dockerfile cannot lose a required build instruction behind an ordinary
  branding difference.
- Docker production checks reject placeholder secrets before building an image. Readiness failures
  now report the stopped container's exit code and a bounded log tail instead of ending with only a
  timeout.
- Quality gates now find exported Elysia route modules that are not reachable from the API
  assembly, including flat files and children of unmounted barrels. Package reset also checks the
  frozen lockfile before removing installed dependencies.
- The template verifies that every template-owned feature has an introduction-version marker.
  Freshly scaffolded apps now receive the screenshot pre-push guard and its two-guard wrapper
  together.
- Copied `spernakit-browser` tools keep their separately spawned daemon visible to Knip while
  remaining subject to the same 300-line source limit as the rest of the repository.

## [3.32.0] - 2026-07-28

### Added

- `bun run check:override-deltas -- --target-version <version>` reads every `.templateoverrides`
  entry and prints the lines the target template version has that the app does not, beside the
  reason the entry's author recorded. A `SKIP` or `KEEP` tells drift detection to stop asking about
  a path, so from that point the template's own later changes to the file were invisible and every
  gate stayed green. Entries that withhold nothing are named as obsolete, and an entry that cannot
  be compared exits non-zero regardless of flags.
- `bun run audit:lost-lines -- --app-dir <path>` checks an upgrade commit for app-authored lines
  the template copy deleted. Drift detection asks whether the app still matches what the template
  ships; this asks the inverse question an upgrade actually raises. A dropped navigation entry
  typechecks, lints, builds, and serves, so one derived app lost twenty of them during the
  2026-07-27 upgrade round with nothing to show for it. Lines that some template revision once
  shipped are the stale content the upgrade exists to replace, so only lines no revision ever had
  are reported.
- `bun run check:drift -- --target-version <version>` now reports files the template removed that a
  derived app still carries, and Template Upgrade runs it as step 3, ahead of the copy pass. A path
  the template dropped simply stopped being enumerated, so an app carrying the dead module looked
  clean through every upgrade. `.templateoverrides`' `DELETED` action existed but was only ever a
  declaration an operator wrote by hand; it now suppresses a detected path and prints its recorded
  reason. `docs/template/DEVELOPMENT.md` gained a Retained Template Deletions section.
- `bun run fleet-manifest:sync` restates every `spernakit.psd1` entry from the app's tracked
  `package.json` and its runtime `config/<slug>.json`, rewriting only the scalar values that moved.
  It refuses the whole write when any app directory is missing, any `package.json` is unreadable,
  or any entry has no config file to verify it against.
- `bun run check:aidd-format` and `bun run format:aidd` format-check `.aidd/` metadata. Both
  `.prettierignore` and, since Prettier 3, `.gitignore` are default ignore paths, and both exclude
  `/.aidd/`, so a targeted `prettier --check` at that glob matched zero files and reported success.
  Derived apps track `.aidd`, so unformatted metadata reached their history and every later diff on
  it was churn. The gate skips when `.aidd` is absent or the root `.gitignore` excludes it, and
  fails rather than passes when it enumerates nothing.

### Changed

- `scripts/bundle-budget.json` and `scripts/critical-path-budget.json` are app-owned generated
  state rather than template files. Both are excluded from drift detection and both stay in the
  init copy set, so a new app still starts from the template's committed numbers. The bundle budget
  now records the app slug it was measured from and is enforced only when that slug matches the
  running app, skipping with a regenerate instruction otherwise. The critical-path budget carries
  no slug and is enforced everywhere.
- Crawl login credentials resolve from the seeded account instead of
  `backend/src/config/defaults.json`. That file is tracked, so it could never hold a real
  credential and had always shipped `testing.crawlLoginEmail` and `testing.crawlLoginPassword`
  blank; every derived app hand-filled them and two pinned the whole file as an override to keep
  doing so. The seed and the crawl now read the same named lookup, and production is excluded on
  both ends because a production seed gives that account a random password. The anonymous-crawl
  fallback is gone: an unauthenticated crawl does not fail loudly, it reports a shallow public site
  that reads as a successful run. An unresolvable login exits 1 naming each unset key, before the
  screenshot directory is stamped or a browser launched.
- `bun run check:fleet-manifest` names its authoritative sources and the repair command when it
  fails.
- `bun run smoke:qc` picked up gates for backup compression, both budget files, crawl credentials,
  fleet manifest sync, lost lines, override deltas, retained template deletions, and `.aidd`
  formatting.

### Fixed

- Backup decompression removes its partial output on every failure path before rethrowing. The
  streaming zip-bomb guard aborts mid-stream, so the bytes that had already passed it were on disk
  and nothing downstream knew the path. Restore preparation now registers each temporary path
  before awaiting the operation that writes it, for decryption as well as decompression.
- `bun run check:critical-path -- --update-budget` recalculates the gzip limit alongside the brotli
  one, with the same headroom, instead of writing only brotli and carrying the old gzip ceiling
  forward. That had left the gzip leg unregenerable. A budget file recording only one limit now
  fails with a regenerate instruction rather than comparing against an undefined value.
- The pre-push screenshot guard judges a capture by the crawl's own verdict rather than by how many
  PNGs landed, since a crawl that failed on its last page left a directory that looked complete.
  The crawl stamps `crawl-result.json` before it begins and again when the report lands. A capture
  with no such file still falls back to the PNG count, so directories from earlier releases keep
  working.
- A mistyped `--target-version` on `bun run check:drift` fails instead of exiting 0. It routed
  through the skip path, and because a skip aborts the whole run, one typo also suppressed the
  ordinary drift verdict, during the upgrade where drift matters most. The recorded
  `spernakit_version` tag is an environmental precondition and still skips.
- The crawler counts `net::ERR_BLOCKED_BY_CLIENT` as a client-cancelled request alongside
  `net::ERR_ABORTED`. Neither reached a server, so neither is a network error.

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
