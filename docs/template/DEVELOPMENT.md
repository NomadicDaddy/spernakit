# Developer Guide

This guide covers the development patterns, architecture, and practices for building applications with the Spernakit template.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Standards](#development-standards)
3. [Coding Style](#coding-style)
4. [Backend Development](#backend-development)
5. [Frontend Development](#frontend-development)
6. [Database Management](#database-management)
7. [Authentication & Authorization](#authentication--authorization)
8. [Development Patterns](#development-patterns)
9. [Best Practices](#best-practices)
10. [UI/UX Guidelines](#uiux-guidelines)
11. [Audit Framework](#audit-framework)
12. [Workflow Guidelines](#workflow-guidelines)

---

## Development Status - active v3 line

Spernakit v3 is the active template line. Changes may land when they follow the stack and
architecture rules, are wired end to end, and pass the required quality gates. Keep changes
scoped to the behavior being delivered and avoid future-only abstractions.

---

## Architecture Overview

Spernakit separates concerns across three layers - shared code, frontend, and backend:

### **Technology Stack**

**Frontend:**

- **React 19** with TypeScript for type safety
- **TanStack Query** for server state management
- **Zustand** for client state management
- **React Router** for client-side routing
- **Tailwind CSS + shadcn/ui** for styling
- **Vite 8** for fast development and building

**Backend:**

- **Elysia** HTTP framework on Bun runtime
- **Drizzle ORM** for type-safe database operations
- **JWT Authentication** with HTTP-only cookies
- **SQLite** (default) or **PostgreSQL** (via `config.database.dialect`)
- **Bun native WebSocket** for real-time features

### **Key Architectural Principles**

1. **Monorepo Structure**: Shared types, frontend, and backend in a single repository
2. **Type Safety**: End-to-end TypeScript for reliability
3. **Security First**: JWT authentication with role-based access control
4. **Performance**: Virtual scrolling, query optimization, lazy loading
5. **Operations**: Error handling, logging, and monitoring

---

## Development Standards

### Core Principles

- Analyze the problem space thoroughly before jumping to conclusions
- Break down solutions into small but meaningful tasks
- Consider all edge cases and potential impacts
- Process tasks with a Senior Developer mindset
- Continue working until the solution is complete and verified

### Quality Gates

- **TypeScript**: Zero tolerance for `any` types or TypeScript errors
- **Linting**: Fix ALL errors when touching a file
- **Components**: No stubs or placeholders - fully functional only
- **Optimization**: No premature optimizations - only as complex as needed

### Quality Verification Workflow

Run `bun run smoke:qc` before committing. The QC pipeline runs these steps automatically:

During implementation, `bun run smoke:qc:fast` runs the cached max-lines, typecheck, format, and
lint subset. The full gate remains required before completion.

1. `bun run check:drift` - Template drift check
2. `bun run check:config` - Config invariants check
3. `bun run check:schema-drift` - Config schema artifact drift check
4. `bun run config:validate` - Config schema validation (defaults + example + instance)
5. `bun run check:db-location` - Database location guard
6. `bun run check:secrets-shape` - Secrets file shape parity
7. `bun run check:leak-guard` - Leak-guard hook self-test
8. `bun run check:licenses` - Third-party license inventory matches the installed graph
9. `bun run check:image-publication` - Container-image publication policy (see below)
10. `bun run check:process-env` - Process environment access check
11. `bun run check:max-lines` - Source file size gate
12. `bun run check-application` - Application structure validation
13. `bun run check:destructive-confirmation` - Destructive action confirmation check
14. `bun run check:docs` - Documentation link check
15. `bun run typecheck` - Verify TypeScript types
16. `bun run lint` - ESLint rules
17. `bun run build` - Production build validation
18. `bun run check:api-types` - API type contract validation (OpenAPI spec vs frontend types)
19. `bun run check:feature-integration` - Route and page reachability (no unwired routes or orphan pages)
20. `bun run check:schema-parity` - SQLite/PG schema structural parity (no column or index drift)
21. `bun run format:check` - Prettier formatting check
22. `bun run check-deps` - Dependency version check

Additional verification commands (not part of `smoke:qc`):

- `bun run crawltest` - Full page testing (requires running services)
    - After changing a specific page: `bun scripts/crawltest.ts --page /settings/users`
    - After changing a feature section: `bun scripts/crawltest.ts --start-from /settings`
    - Verify 404 handling: `bun scripts/crawltest.ts --404`
    - Add `--screenshot-pages` to any of the above for visual capture
- `bun run supertest` - Full validation chain (reset + dev + docker-local + docker-prod + screenshots)
- `bun run qc:fix` - Repair lint/format drift, then run the check-only QC gate
- `bun run qc:status` - Show cached, pending, and intentionally uncacheable `smoke:qc` steps

### Container Image Publication

Spernakit builds container images as **local verification artifacts only** (`<slug>-test:<version>`)
and has no publication path. `bun run check:image-publication` enforces that: it fails on a push
script, a `packages: write` workflow permission, `push: true`, a registry login action, or a
registry-qualified tag. `bun scripts/docker-image.ts push` refuses to run in the template at all.

This is not fastidiousness. **Distribution is what triggers the GPL and LGPL obligations** of the
Bun runtime (which statically links JavaScriptCore) and the GPL/LGPL Alpine packages in the base
image. A project that hands an image to someone else becomes the distributor of everything inside
it. A template that distributes nothing triggers nothing, which is why it ships
`licenses/CONTAINER-DISTRIBUTION.md` (guidance) rather than a corresponding-source offer.

**A derived application may publish its image** - that is its owner's decision, and `bun run setup`
gives it the publish path. What it may not do is publish blind:

- `setup` installs `licenses/SOURCE-OFFER.md` from the template, with `<LEGAL ENTITY>` and
  `<CONTACT ADDRESS>` left as placeholders for the owner to fill in.
- In a derived app, `check:image-publication` inverts: a project that **can** publish must have a
  **completed** offer. Placeholders fail the gate, because an offer a recipient cannot act on is
  not an offer.
- `docker:image:push` requires `IMAGE_REGISTRY` (the template names no registry for you) and
  refuses to push while the offer is missing or unfilled.
- If you never publish, delete `licenses/SOURCE-OFFER.md` and the publication scripts. Nothing
  obliges an offer for software you do not distribute, and the guard then has nothing to check.

### Template Drift Detection

Derived applications inherit template-managed files from spernakit. Over time, these files can drift from the template baseline through ad-hoc edits. The drift checker compares template-managed files against the expected baseline and reports discrepancies.

**Running**: `bun run check:drift` (also runs as part of `smoke:qc`)

**File classifications** (the `pure`/`branded`/`infrastructure` lists are defined in `scripts/template-manifest.json`; the `security-infrastructure` set is defined in the drift tooling - see below):

- **Pure** - Must be byte-identical to template. Any difference is drift and **fails** the gate.
- **Branded** - Has app-specific substitutions (name, slug, ports). Normalized before comparison; residual difference fails.
- **Infrastructure** - Expected to have domain extensions. Reported as an informational **WARNING only** (never fails).
- **Security-infrastructure** - Security-critical template files (auth routes, security config schema, `create-api-app`). Unlike advisory infrastructure, their drift **or removal fails `check:drift` in derived apps**, so a gutted or emptied auth route cannot pass the gate silently. This runs during normal `smoke:qc` - no `DRIFT_REQUIRED=1` opt-in needed. The set is the `SECURITY_INFRASTRUCTURE_FILES` constant in `scripts/lib/template/classify.ts` (and takes precedence over a file's `infrastructure` listing). It lives in the checker rather than the manifest so the security gate can harden without reclassifying the template manifest.

**Acknowledging an intentional security-infrastructure change**: If a derived app genuinely must diverge from the template's security baseline, record the change in that app's `.templateoverrides` (a `SKIP` or `KEEP` entry with a reason). The file then reports as `suppressed` instead of failing - the divergence stays explicit and auditable rather than silently green. (`DRIFT_REQUIRED=1` is unrelated: it only turns precondition _skips_, e.g. a missing template repo, into failures for dance runs.)

**Maintaining the manifest**: When adding, removing, or reclassifying template-managed files in spernakit, update `scripts/template-manifest.json` in the same commit. To mark a new file security-critical, add it to `SECURITY_INFRASTRUCTURE_FILES` in `scripts/lib/template/classify.ts` (not the manifest). The `/spernakit-bump` workflow includes this as a checklist item.

### Feature Integration Check

When adding a new backend route plugin or frontend page, the feature integration check ensures it is actually wired into the app. It catches two classes of drift:

- **Backend**: A route plugin exported from `backend/src/routes/` that is not `.use()`'d in `create-api-app.ts`.
- **Frontend**: A `*Page.tsx` component under `frontend/src/pages/` that is not imported in `frontend/src/routes/lazyPages.ts`.

**Running**: `bun run check:feature-integration` (also runs as part of `smoke:qc` and CI)

**When to run**: Feature authors should run this after adding a new route file or page component. It is enforced automatically by `smoke:qc` and the CI quality job.

### Schema Parity Check

Spernakit maintains parallel Drizzle schema definitions - SQLite (`backend/src/db/schema/`) and PostgreSQL (`backend/src/db/schema-pg/`). The parity check ensures both dialects define the same columns and indexes, preventing silent drift when one is updated without the other.

**Running**: `bun run check:schema-parity` (also runs as part of `smoke:qc` and CI)

**When to run**: After modifying any schema file in either `schema/` or `schema-pg/`. Always update both dialects in the same commit.

### Template Upgrade

Derived apps sync template changes using a manual cherry-pick workflow driven by the
`/template-upgrade` slash command. Automatic application is unsupported because it can overwrite
domain extensions. Drift detection (`bun run check:drift`) is the source of truth for sync status,
and `bun run template:sync-plan -- --app ../<app>` generates a read-only review packet. The source
version must be v3.29.0 or later. Apps without that baseline must be initialized from the current
template instead of using the sync workflow.

**Steps** (for each derived app):

1. `bun run template:sync-plan -- --app ../{app} --from {source} --to {target}` - generate `upgrade-review/{app}/` review artifacts
2. From the app: `bun run check:override-deltas -- --target-version {target}` - read what each `.templateoverrides` entry is holding back at the target before any file is copied, because the copy pass never touches those paths. See [Override Delta Report](#override-delta-report).
3. From the app: `bun run check:drift -- --target-version {target}` - list the files `v{target}` no longer ships that the app still carries. Ordinary drift cannot see these, and the sync packet only names what changed between `{source}` and `{target}`, so a file dropped in an _earlier_ upgrade and never removed appears in neither. See [Retained Template Deletions](#retained-template-deletions).
4. For each **added** file: `cp` from spernakit to the app
5. For each **deleted** file - from step 3's report and the sync packet both: diff the app's copy against `v{source}`; delete if it matches, ask the user if it has domain extensions
6. For each **modified** file:
    - **Pure** (build configs, `scripts/*.ts`, `docs/template/*`, `shared/src/*.ts`, `components/ui/*`): `cp` and overwrite - but always diff against `v{source}` first to detect silent domain extensions (e.g., `backend/src/constants/responseExamples.ts` with custom helpers like `routeDetail`, `backend/src/db/seed/index.ts` with domain re-exports). If extensions exist, treat as infrastructure.
    - **Branded** (`Dockerfile`, `README.md`, `package.json`): `cp` then re-apply branding
    - **Infrastructure** (`backend/src/app.ts`, `frontend/src/routes.tsx`, navigation, re-export shims): do not `cp`; diff the three versions (`v{source}`, `v{target}`, current app) and hand-apply only the template delta, preserving app extensions
7. Run `bun install` if dependencies changed
8. From the template: `bun run template:sync-features -- --app ../{app}` - copy the template's feature records into the app's `.aidd/`, then run `roadmap:apply` from aidd. The push form is the one to use here: the app has not been re-stamped yet, and the pull form skips on version mismatch. The file copy pass cannot do this at all - `.aidd/` is gitignored in the template, so it is invisible to every git-driven enumeration the other steps use. See [Template Feature Sync](#template-feature-sync).
9. Bump `spernakit_version` in `package.json`
10. Run `bun run smoke:qc`
11. Commit with `chore: sync spernakit template to vX.Y.Z` (or the short form `svX.Y.Z`)
12. `bun run audit:lost-lines -- --app-dir ../{app} --rev {upgrade-commit}` - **blocking**. A non-zero exit means the copy deleted app-authored lines. Restore each one, or drop it deliberately, and amend the sync commit before cutting the release commit. See [Lost App Lines Audit](#lost-app-lines-audit).

Plan for ~3-5 minutes per app for small deltas. The manual process is deterministic and cannot silently clobber domain code, at the cost of per-file judgment.

The review packet is intentionally read-only. Template changes are applied manually after each
classification has been checked against the derived app's domain code.

### Retained Template Deletions

Drift detection asks whether the app still matches what the template ships, one file at a time, at the app's recorded version. It is blind in the other direction: when the template **removes** a file, that path simply stops being enumerated, so an app that still carries the removed module reads as perfectly clean. Nothing fails, nothing warns, and the dead file survives every subsequent upgrade.

`backend/src/routes/auth/mfa-rate-limit.ts` - 34 lines, zero importers, superseded by `backend/src/services/auth/mfaRateLimit.ts` - rode three derived apps' init commits from the version that shipped it all the way to v3.31.2, through every intervening upgrade, and was found by hand rather than by a gate. The sync packet would not have caught it either: it names what changed between `{source}` and `{target}`, and this file was dropped before `{source}`.

**Running**: `bun run check:drift -- --target-version <version>` from the derived app, against the version being upgraded **to** - step 3 of [Template Upgrade](#template-upgrade), before the copy pass, so the removals are handled in the same pass as the sync packet's deletions. `--template <path>` overrides the spernakit location (otherwise `SPERNAKIT_PATH`, then `../spernakit`).

Without `--target-version` the scan does not run at all, and `check:drift` behaves exactly as it always has - which is what `smoke:qc` invokes. There is no default target on purpose: comparing the app against the version it already declares can only report that the template has removed nothing.

**What it reports**: a `Template Deletion Report (v{recorded} -> v{target})` banner, separate from the drift report and from `missing-in-app`, because the remedy is the opposite one - **delete** the file, do not restore it. Candidates are drawn only from paths the recorded version shipped, so app-authored code can never enter the set, and both sides are compared as app-relative paths (a scaffold-mapped file such as `.gitignore` resolves through `scaffolding/` first). Paths the target dropped are handed to this report exclusively and filtered out of the drift report, where they would otherwise read as `drifted` or `missing-in-app` and prescribe restoring a file the target no longer ships.

**Retained files fail the gate.** To keep one deliberately, add a `DELETED` line for it in `.templateoverrides` with a reason; it then prints under "Retained after template removal" instead of failing. That action now covers both directions of the same question - template ships it and the app dropped it, or the template dropped it and the app still has it.

A `--target-version` naming a tag the template repo does not have is a **failure**, not a skip, unlike the environmental preconditions (`check:drift`'s other exits). The check aborts the whole run, so a typo that skipped would exit 0 while also withholding the ordinary drift verdict.

**Self-test**: `bun run test:template-deletions` drives the shipped CLI against a two-tag template/app fixture pair (`scripts/lib/template/deletions-fixture.ts`), covering a retained deletion, an overridden one, a scaffold-mapped one, a mistyped target version, and ordinary drift as a negative control.

### Template Feature Sync

A `.aidd/features/<dir>/feature.json` record is the machine-checkable half of the template contract - the acceptance criteria a derived app inherits alongside the code it grades. Every other sync mechanism in this document is blind to them, because `.gitignore` excludes `/.aidd/` in the template and both file enumerations (`git ls-files` for init, `git ls-tree` for drift) therefore return nothing under it. Until v3.32.0 the only thing that ever copied a feature record downstream was a paragraph of prose in the upgrade skill, run by hand; it had reached four of eleven apps, and the other seven carried zero template feature records.

Init now seeds the corpus (`seedTemplateFeatures` in `scripts/lib/init/scaffold.ts`, before the init commit), and this tool keeps it current. Seeding is best-effort by design: `/.aidd/` is gitignored, so a checkout that never carried the corpus - a clone of the published repository - still initializes a complete app, and init reports that the blueprint was not seeded rather than refusing to scaffold. Sync it in afterwards from a checkout that has one.

**Records named like process artifacts are never synced** - `remediation-<date>-…` and `audit-<slug>-<digits>-…`. Those are findings from the _template's own_ development; their content reaches apps by being folded into a durable feature, and the finding record is deleted upstream once folded. The pattern is deliberately narrower than a bare `audit-` prefix, which would swallow the durable `audit-logs` capability record.

**Running**: from the derived app, `bun run template:sync-features` (write) or `bun run check:template-features` (plan only, exit 1 on anything actionable - this is what `smoke:qc` invokes). From the template, `bun run template:sync-features -- --app ../{app}` pushes into one app and `--all` pushes to every app in `spernakit.psd1`. `--template <path>` overrides the spernakit location (otherwise `SPERNAKIT_PATH`, then `../spernakit`). `--adopt` is required to overwrite an unmarked app copy that carries authored text; `--overwrite-app-text` is its marked-record sibling (below); `--no-prune` keeps records the template no longer ships; `--json` prints the plan instead of the report and exits on the same condition `--check` does in the printed form.

**Run `roadmap:apply` from aidd afterwards.** The sync writes `.aidd/roadmap.json` but never shells into aidd, so the dependency graph is only rebuilt on the next apply. `roadmap:apply --dry-run` reporting `updated: 0` immediately after a sync is the sharpest available evidence that the merge was correct; a non-zero count means the app is about to re-drift. Then `bun run check:aidd-format` must report zero changed files - records are serialized through Prettier's API against the destination's config precisely so that holds.

**What it reports**: a count of durable records considered, then one line per action - `added`, `updated`, `adopted`, `adopted-with-loss`, `pruned`, `prune-blocked`, `unchanged` - with the changed field names beside each entry, and whether `roadmap.json` needs updating. Two entries are stops rather than results: `adopted-with-loss` (an unmarked app copy whose text differs from the template's) and `prune-blocked` (a stale record whose directory holds more than `feature.json`, so deleting it would destroy something else). A `prune-blocked` entry keeps failing `check:template-features` until a human reviews that directory - that is the intent, not a bug.

**Ownership is decided by the template corpus, not by the app copy's marker.** A directory present upstream and not matching the ephemeral pattern is template-owned; the app-side `spernakit_version` only separates `updated` from `adopted`. Template-owned fields (`spec`, `notes`, `description`, `summary`, `dependencies`, `affectedFiles`, …) are overwritten. `priority`, `shippedVersion`, `updatedAt` and per-run state are app-local and preserved - `priority` is seeded from the template on a new copy only, and `roadmap:apply` corrects it from the app's own milestone immediately after. Milestone _names_ are app-owned, so `roadmap.milestones` is never touched; a new entry resolves the template's milestone through exact name, then equal priority, then the app's current milestone, and fails the app if it defines none.

**When the app's text is the better text**, the report says so at the moment of loss, next to the entry, and **a write run leaves that record alone**. Any `updated` entry whose changed fields include `spec`, `notes`, `description` or `summary` is skipped, listed under `NOT OVERWRITTEN`, and makes the run exit 1 - the rest of the plan is still applied, so the app is never left half-synced with no way forward. Resolve each one: backport the text to spernakit, or record the difference as an app-owned feature whose `notes` begin `DEVIATES: <template-dir> — …` and which lists that directory in its roadmap dependencies. An app-owned feature is absent from the template corpus, so the sync never touches it. `--overwrite-app-text` discards the app's text in favour of the template's; the four populated apps carry 29-33 such records each, which is exactly why discarding them cannot be the default.

**Skips**: the pull-mode gate is silent where it cannot answer honestly - run inside spernakit itself, unresolvable template, or an app whose `spernakit_version` does not match the template's `package.json` version. That last one is load-bearing: with `.aidd/` gitignored there is no tagged baseline, so the comparison is against a moving HEAD, and without version parity every app would go red the moment spernakit bumped. The gate is meaningful exactly when it can be - after an upgrade. `TEMPLATE_FEATURES_REQUIRED=1` turns skips into failures for dance runs, matching `DRIFT_REQUIRED=1`.

**Two defects fail ahead of every skip**, because they are wrong at any version and the parity skip would otherwise hide them for the whole window between a template bump and the app's next upgrade - which is precisely how two leaked process records survived in four apps for months. A resident record whose directory matches the ephemeral pattern is always a leak (this one needs no template checkout at all), and a record whose `spernakit_version` differs from the template's value for the same directory was hand-edited - the field marks the version that _introduced_ the record and is never bumped on revision, so it is identical across template versions. Deliberately not in this tier: a marked record with no counterpart upstream. That is a defect at parity and ordinary at skew, since the template may have deleted it after the version the app is on.

**The source corpus is validated before any app is touched** - missing `.aidd/features`, zero records, zero durable records after the ephemeral filter, an unmarked record, `id !== <dir>`, or a roadmap orphan all abort with exit 1. The refusal conditions are the same functions as `check:template-feature-versions` and `check:feature-id-directory`, so the sync can never run against a corpus its own gates reject.

**Self-test**: `bun run test:template-features` drives the shipped CLI against a synthetic template/app corpus pair (`scripts/lib/template-features/fixture.ts`), covering every row of the classification table, all three milestone ladder rungs plus the zero-milestone failure, the ephemeral filter in both directions, `notes` array/string normalization, an `updatedAt`-only diff reading as `unchanged`, idempotence, the version-parity skip and its `TEMPLATE_FEATURES_REQUIRED=1` failure, a wrong-way run, and both source-corpus refusals.

### Lost App Lines Audit

Drift detection asks whether the app still matches what the template ships. This audit asks the inverse question, which nothing else answers: did the copy delete a line the app wrote that the template never had?

Nothing in `smoke:qc` can catch that. During the 2026-07-27 upgrade round one derived app lost twenty lines and nine commits of navigation entries and every gate stayed green, because a dropped nav entry typechecks, lints, builds and serves. Another lost an app-added field from a shared API type and was caught only because one page happened to consume it. A green `smoke:qc` is not evidence that app-owned work survived an upgrade.

**Running**: `bun run audit:lost-lines -- --app-dir <path> [--rev <commit>]`. `--rev` defaults to `HEAD` and is compared against its first parent, so run it against the sync commit itself - step 12 of [Template Upgrade](#template-upgrade), after the copy and before the release commit. `--template <path>` overrides the spernakit location (otherwise `SPERNAKIT_PATH`, then `../spernakit`).

**A non-zero exit is blocking.** Every reported line is app-authored content the copy removed, and each one is either restored or dropped deliberately before the release is cut.

**How a line is classified**: for each line the commit removed from a template-managed path, the audit asks whether _any_ revision of the corresponding template path ever contained it (scaffold-mapped paths resolve through `scaffolding/`, so `.prettierignore` is compared against `scaffolding/.prettierignore`). A line the template once shipped is stale content the upgrade exists to replace. A line the template never had was written by the app. Trailing commas are normalized on both sides of that comparison only - the v3.31.0 switch to `trailingComma: all` would otherwise rewrite the last line of every multi-line list in the tree and drown the signal - and findings still print the line as the file actually had it.

That test alone is too loud, because a file seeded from a pre-3.28.2 template carries lines no surviving template blob contains: those tags were squashed away. The app's own history settles it. A path is only reported when a post-init app commit touched it, and template syncs do not count - a `chore(template):` commit is the copy, not the work. Without that second exclusion the trim of `docs/template/CHANGELOG.md` to its last five releases reports as 2209 lost lines in every app that has ever been upgraded.

**Expected findings on a clean upgrade**: the audit compares whole lines, so a line the formatter rewrote in place reads as removed. On the real 3.24.1 -> 3.31.2 upgrades that is the `"spernakit_version"` bump in `package.json` plus a handful of Tailwind class-order and import-member-order reflows - roughly twenty lines, each dismissible by reading it next to the added line beside it. Anything that is not obviously a reflow is a real loss.

**Self-test**: `bun run test:lost-lines` drives the shipped CLI against a purpose-built template/app pair of git repositories (`scripts/lib/template/lost-lines-fixture.ts`), including an upgrade that preserved the same app work as a control.

### Override Delta Report

A `SKIP` or `KEEP` line in `.templateoverrides` tells drift detection to stop asking about a path. From that moment the template's own later changes to the file are invisible: `bun run check:drift` prints the path as suppressed with whatever reason its author typed, every gate stays green, and nothing states what the app has stopped receiving. This report performs the comparison the override suppressed.

During the 2026-07-27 dance a `SKIP docker/nginx.conf` taken for one CSP token - `font-src` needed `data:` for base64 woff2 fonts - had also withheld the template's `location ~ \.map$` deny block, the one that stops a stray source map exposing the original TypeScript. It was recovered because a human re-read the override text against the new target. Every entry in every app is one unread reason away from the same outcome.

**Running**: `bun run check:override-deltas -- --target-version <version> [--fail-on-delta]`. `--template <path>` overrides the spernakit location (otherwise `SPERNAKIT_PATH`, then `../spernakit`). Run it from the derived app, against the version being upgraded **to**, before the copy pass - step 2 of [Template Upgrade](#template-upgrade) - so each entry can be re-merged or deliberately kept while there is still a decision to make.

`--target-version` has no default on purpose. Comparing an override against the version the app is already on can only report that it withholds nothing, which is a clean answer to a question nobody asked.

**What it reports**: for each entry, the lines `v{target}` has that the app's copy does not, printed beside the reason recorded in `.templateoverrides` so stale reason text is visible next to what it failed to mention. `KEEP` and `SKIP` are treated alike. `branded` paths are compared after branding normalization, so an app's own name never reads as withheld content while a structural delta still does. Scaffold-mapped paths resolve through `scaffolding/`, and the report names the template path it read. Entries classified security-relevant - `SECURITY_INFRASTRUCTURE_FILES`, anything under `docker/`, and plugin or guard paths - are tagged `SECURITY` and sort first.

Two other sections matter as much as the deltas. **WITHHOLDING NOTHING** names every entry whose withheld delta is empty: those overrides are obsolete and can be deleted. **UNRESOLVED** names entries that could not be compared at all, because the app or the target no longer has the path; those exit non-zero regardless of flags, since an entry the report cannot substantiate is not a clean entry.

**Exit codes**: advisory by default - withheld deltas are review items, not failures, because an override may be withholding exactly what its reason says it should. `--fail-on-delta` makes any withheld delta blocking, for a release gate that wants every entry re-merged or re-justified first. Unresolved entries always fail.

**Self-test**: `bun run test:override-deltas` drives the shipped CLI against a two-tag template repository paired with an app frozen by its own overrides (`scripts/lib/template/override-deltas-fixture.ts`), reconstructing the nginx case beside a branded file, a scaffold-mapped file, an obsolete entry and a stale one, with a re-merged copy as the negative control.

### Module System

The monorepo uses ES Modules throughout:

- **Shared**: ES Modules (`import`) - types, constants, pure functions consumed by both workspaces
- **Backend**: ES Modules (`import`) - uses `"type": "module"` in package.json
- **Frontend**: ES Modules (`import`) - React components, hooks, services
- **MCP/CLI**: ES Modules (`import`) - uses `"type": "module"` in package.json

**Consistency**: All workspaces use ESM. Do not introduce CommonJS patterns.

### Dependency Management

- **Lock Versions**: Lock dependency versions for reproducible builds
- **Regular Audits**: Periodically review and update dependencies
- **Minimal Dependencies**: Only add dependencies that provide significant value

---

## Coding Style

### Formatting Standards

**Prettier Configuration:**

- **Indentation**: Tabs (4-space width for display)
- **Line Length**: 100 characters
- **Quotes**: Single quotes
- **Trailing Commas**: ES5

**Import Organization** (enforced by `eslint-plugin-perfectionist`):

1. Third-party imports (alphabetical, case-sensitive)
2. `@/` aliased imports (alphabetical)
3. Relative imports (alphabetical)
4. Blank line between groups

**Object Keys**: Auto-sorted by `eslint-plugin-perfectionist` (`perfectionist/sort-objects`, `perfectionist/sort-interfaces`, `perfectionist/sort-object-types`)

**Shared Skeleton Components**: Shared skeleton components live under `frontend/src/components/shared/skeletons/` and must be imported via the direct subdirectory path `@/components/shared/skeletons/<Name>` (e.g., `@/components/shared/skeletons/TableSkeleton`). Do not add a barrel re-export from `@/components/shared/<Name>` - use only the direct path. This is enforced by `scripts/check-feature-integration.ts` as part of `bun run smoke:qc`; any import written as `@/components/shared/TableSkeleton` (or any of the other four skeleton names) will fail the build.

### Naming Conventions

- **Descriptive Names**: Use clear, descriptive names that explain purpose
- **Consistent Patterns**: Follow established naming conventions for the language/framework
- **Avoid Abbreviations**: Use full words unless abbreviations are widely understood
- **Context-Appropriate**: Names should be appropriate for their scope (shorter for local, longer for global)

### Database Naming Conventions

- **Column Names**: snake_case in database, camelCase in Drizzle schema
- **Table Names**: Plural snake_case in database, defined via `sqliteTable()`
- **Foreign Key Names**: `fk_{table}_{column}_{target}` format (e.g., `fk_audit_logs_user_id_users`). Declare FKs via Drizzle's table-builder `foreignKey({ columns, foreignColumns, name }).onDelete(...)` in the constraints array - do NOT use inline `.references()`, which produces anonymous constraints. The column-qualified name is required to disambiguate multiple FKs pointing at the same target table (e.g., `created_by`, `updated_by`, `deleted_by` all reference `users`). This convention is enforced across both dialects.

```typescript
// backend/src/db/schema/users.ts
const users = sqliteTable('users', {
	passwordHash: text('password_hash').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
});
```

### Function Design

- **Single Purpose**: Each function should do one thing well
- **Predictable Behavior**: Functions should behave consistently with similar inputs
- **Minimal Side Effects**: Limit unintended consequences of function calls
- **Clear Interfaces**: Make function signatures self-documenting

### Cyclomatic Complexity

- Target: CC ≤ 7 per function
- Maximum: CC ≤ 10 per function (requires justification)
- Functions exceeding CC 10 must be decomposed into smaller, focused functions
- Security validation and configuration parsing functions may exceed CC 7 if each branch is meaningful and well-commented

### Performance Philosophy

- **Readable First**: Prioritize code clarity over micro-optimizations
- **Measure Before Optimizing**: Profile code before making performance changes
- **Algorithmic Efficiency**: Choose appropriate algorithms and data structures

---

## Backend Development

### **Project Structure**

```
backend/src/
├── config/            # Configuration loader and schema
├── constants/         # Re-exports from shared/ (errorCodes, limits, etc.)
├── db/                # Database setup and Drizzle schema
│   ├── schema/        # Drizzle ORM table definitions (users.ts, auditLogs.ts, etc.)
│   └── index.ts       # Database initialization (bun:sqlite)
├── guards/            # Authorization guards (role.ts, workspaceAccess.ts) - API key auth handled by authPlugin
├── plugins/           # Elysia plugins (auth, rateLimit, audit, securityHeaders, etc.)
├── routes/            # API route definitions (Elysia route groups)
├── services/          # Business logic (see Service Organization below)
│   ├── auth/          # Auth sub-modules (authCore, authLogin, authPasswordReset, authSecurityService)
│   ├── backup/        # Backup sub-modules (core, encryption, integrity, lifecycle, operations, restore)
│   ├── health/        # Health check sub-modules
│   ├── scheduler/     # Task scheduler sub-modules
│   ├── websocket/     # WebSocket sub-modules (wsBroadcast, wsHelpers)
│   ├── authService.ts # Facade: imports from auth/, exposes public API
│   ├── userService.ts # Facade: imports from user/, exposes public API
│   └── ...
├── storage/           # File storage adapters (local, S3)
├── types/             # Re-exports from shared/ (roles, etc.)
├── utils/             # Helper functions (logger, validation, etc.)
├── create-api-app.ts  # API Elysia instance with plugin chain and route registration
└── app.ts             # Application bootstrap (database init, calls createApiApp)
```

### **Service Organization**

Services use a **hybrid flat + subdirectory** pattern:

- **Simple services** stay as flat files: `settingsService.ts`, `emailService.ts`
- **Complex services** get a subdirectory with a **facade file**:
    - The facade file (e.g., `authService.ts`) sits at the `services/` root and imports from its subdirectory
    - The subdirectory (e.g., `auth/`) contains focused, single-responsibility modules
    - Consumers only import from the facade - subdirectory modules are implementation details

```
services/
├── authService.ts              # Facade: re-exports public API from auth/
├── auth/                       # Internal modules
│   ├── authCore.ts
│   ├── authLogin.ts
│   ├── authPasswordReset.ts
│   └── authSecurityService.ts
├── userService.ts              # Facade: re-exports public API from user/
├── user/                       # Internal modules
│   ├── userAuthQueries.ts
│   ├── userBatchService.ts
│   ├── userCrud.ts
│   ├── userSettingsService.ts
│   └── userValidationService.ts
├── websocket/                  # WebSocket modules (no facade - imported directly by WS routes)
│   ├── wsBroadcast.ts
│   └── wsHelpers.ts
├── settingsService.ts          # Simple service (no subdirectory needed)
├── emailService.ts             # Simple service
└── ...
```

**When to create a subdirectory**: When a service file exceeds ~200 lines or handles multiple distinct responsibilities, split it into a subdirectory with a facade.

**Facade pattern**: The top-level file imports from subdirectory modules and re-exports a unified public API. Route files and other consumers import only from the facade, never from subdirectory modules directly.

```typescript
// services/userService.ts (facade)
export { findUserForAuth, getUserById } from './user/userAuthQueries.ts';
export { createUser, deleteUser, updateUser } from './user/userCrud.ts';
export { validateUserCreate, validateUserUpdate } from './user/userValidationService.ts';
```

**No new `index.ts` barrels in service subdirectories**: New service subdirectories should NOT introduce an `index.ts` barrel. The root-level `xxxService.ts` facade is the single public entry point; the facade imports directly from named sub-files by filename (as in the `userService.ts` example above). Internal files within a service subdirectory import each other directly by filename.

Rationale: a subdirectory barrel duplicates the facade's role and can diverge from it by exporting
items the facade omits. The facade at the services root is the one source of truth for the public
API.

This rule applies to `auth/`, `notification/`, `user/`, `metrics/`, `oauth/`, `workspace/`, and any
future service subdirectory. The `index.ts` barrels in `backup/`, `dashboard/`, `scheduler/`,
`file/`, and `health/` are exceptions and removal candidates; do not replicate them.

### **Configuration Boundary Rules**

Spernakit has two configuration mechanisms. Each has a clear purpose - do not mix them.

**config.json** (static, loaded at startup):

- Infrastructure: server ports, database path, CORS origins
- Cryptographic material: JWT keys, encryption keys, cookie secrets
- Operational tuning: retry counts, rate limits, log levels, health check intervals
- Deployment: Docker settings, S3 storage credentials, OAuth provider keys

**Database `settings` table** (dynamic, editable at runtime via UI):

- SMTP/email connection (host, port, credentials) - SYSOP-only
- Authentication policy (lockout, password expiry, self-registration) - SYSOP-only
- Feature flags (analytics, dashboards, files, workspaces) - ADMIN+
- User UI preferences (theme, layout, timezone) - per-user
- Onboarding state - ADMIN+

**Rules:**

1. If a SYSOP needs to change it without restarting the server → database
2. If it requires a restart to take effect (ports, keys, DB path) → config.json
3. Never store the same setting in both places - pick one source of truth
4. New runtime-editable settings go in the database via `settingsService`
5. New static infrastructure settings go in `config/configSchemas/` with a TypeBox schema
6. After modifying config schemas, run `bun run config:schema` to regenerate `config/config-schema.json`
7. Config files support `"$schema": "./config-schema.json"` for VS Code intellisense
8. **`defaults.json` must contain every section registered in `configSchema.ts`.** When a TypeBox schema is wrapped with `withEmptyDefault()` and the section is absent from `defaults.json`, the config relies entirely on implicit schema defaults - invisible to anyone reading the JSON. Every section in `configSchema.ts` must have a matching entry in `defaults.json` with all default values explicitly stated. Derived apps with custom schemas must also add their custom sections to `defaults.json`.

### **Creating New API Endpoints**

1. **Define the Service** (Business Logic)

```typescript
// backend/src/services/productService.ts
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { products } from '../db/schema/products.ts';
import { logAuditEvent } from './auditService.ts';

export function createProduct(data: { name: string; price: number }, userId: number) {
	const db = getDb();
	const result = db
		.insert(products)
		.values({ ...data, createdBy: userId })
		.returning()
		.get();

	logAuditEvent({
		action: 'PRODUCT_CREATED',
		resource: 'product',
		resourceId: String(result.id),
		userId,
	});

	return result;
}

export function getProducts() {
	const db = getDb();
	return db.select().from(products).where(eq(products.isDeleted, false)).all();
}
```

2. **Define Routes** (Elysia route group with built-in validation)

```typescript
// backend/src/routes/products.ts
import { Elysia, t } from 'elysia';
import { requireRoleFresh } from '../guards/role.ts';
import { createProduct, getProducts } from '../services/productService.ts';
import { dataResponse } from '../utils/apiResponse.ts';

const productRoutes = new Elysia({ prefix: '/products' })
	.get(
		'/',
		({ user }) => {
			return dataResponse(getProducts());
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('VIEWER')({ set, user }),
		},
	)
	.post(
		'/',
		({ body, set, user }) => {
			set.status = 201;
			return dataResponse(createProduct(body, user!.id));
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('OPERATOR')({ set, user }),
			body: t.Object({
				name: t.String({ minLength: 1 }),
				price: t.Number({ minimum: 0 }),
			}),
		},
	);

export { productRoutes };
```

3. **Register Routes** (App Integration)

```typescript
// backend/src/create-api-app.ts - add to the routePlugins chain
import { productRoutes } from './routes/products.ts';

const routePlugins = new Elysia({ name: 'routes' })
	// ... existing routes
	.use(productRoutes);

// Routes are mounted under /api/v1 prefix via createApiApp()
```

4. **Verify Integration** (End-to-End Reachability)

Confirm the new endpoint is reachable from a user-facing path:

- [ ] Route is registered in `create-api-app.ts` (Step 3 above)
- [ ] Frontend API module in `frontend/src/api/` calls the endpoint
- [ ] A page or component consumes the API module and is routed in `routes.tsx`
- [ ] Navigation link exists for the feature (sidebar, menu, or in-page link)
- [ ] Endpoint appears in OpenAPI docs at `/api/v1/docs/json` (development mode only)
- [ ] If new enum/union types are introduced, they are validated by `bun run check:api-types`
- [ ] `bun run check:feature-integration` passes (no unwired routes or orphan pages)

> **Cathedral Warning**: A feature with passing tests and clean code but no user-facing path is worse than no feature - it adds maintenance burden with zero user value. See `.aidd/audits/FEATURE_INTEGRATION.md` for the full detection methodology.

### **Handler Extraction**

When a route handler exceeds ~30 lines of logic, extract it as a named function above the route definition. This keeps route definitions thin (path + handler reference + schema) while preserving readability.

**Important**: Extract to standalone functions, NOT controller classes. Elysia's type inference depends on method chaining - controller classes break this chain.

```typescript
// backend/src/routes/users-crud.ts

// Extracted handler - typed parameters match the Elysia route context
async function handleCreateUser({
	body,
	set,
	user,
}: {
	body: { email: string; password: string; role?: string; username: string };
	set: { status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);
	// ... validation, service calls, event tracking
	set.status = HTTP_STATUS.CREATED;
	return dataResponse(created);
}

// Route definition stays thin
const routes = new Elysia({ prefix: '/users' }).use(authPlugin).post('/', handleCreateUser, {
	beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
	body: t.Object({/* schema */}),
	detail: {/* OpenAPI docs */},
});
```

**When to extract**: Handler logic >30 lines (excluding the `detail` OpenAPI block).

**Where to place**: Named functions at the top of the same route file, above the `new Elysia()` definition.

### **Database Operations with Drizzle**

```typescript
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { users } from '../db/schema/users.ts';

// Query with filtering and pagination
const db = getDb();
const result = db
	.select({
		id: users.id,
		username: users.username,
		email: users.email,
		role: users.role,
	})
	.from(users)
	.where(and(eq(users.role, 'OPERATOR'), eq(users.isDeleted, false)))
	.orderBy(desc(users.createdAt))
	.limit(limit)
	.offset((page - 1) * limit)
	.all();

// Soft delete pattern
db.update(users)
	.set({
		isDeleted: true,
		deletedAt: new Date(),
		deletedBy: currentUserId,
	})
	.where(eq(users.id, userId))
	.run();
```

---

## Frontend Development

### **Project Structure**

```
frontend/src/
├── api/               # API client and domain-specific API modules
│   ├── client.ts      # Base API client with auth, CSRF, error handling
│   ├── types/         # Domain-specific API type definitions (re-exports from spernakit-shared)
│   └── ...            # Domain API modules (users.ts, settings.ts, etc.)
├── components/        # Shared/reusable UI components only
│   ├── auth/          # Authentication components (LoginForm, etc.)
│   ├── dashboard/     # Dashboard presentational components
│   ├── layout/        # Layout components (Sidebar, TopBar, AppShell)
│   ├── shared/        # Shared domain components
│   ├── ui/            # shadcn/ui primitives
│   └── workspace/     # Workspace components
├── hooks/             # Custom React hooks
│   ├── useAuth.ts
│   ├── useKeyboardShortcuts.ts
│   └── ...
├── lib/               # Library utilities (websocket manager, etc.)
├── pages/             # Route components organized by domain
│   ├── auth/          # Login, register, password reset
│   ├── dashboard/     # Main dashboard
│   ├── dashboards/    # Custom dashboards
│   ├── files/         # File management
│   ├── notifications/ # Notification center
│   ├── onboarding/    # Post-install onboarding
│   ├── profile/       # User profile
│   ├── settings/      # Admin settings (tabbed layout)
│   └── workspaces/    # Workspace management
├── stores/            # Zustand state stores
│   ├── authStore.ts
│   ├── layoutStore.ts
│   └── ...
├── types/             # TypeScript definitions (roles.ts)
└── utils/             # Utility functions
```

> **Component Conventions**: Entity-specific sub-components follow the Card/View/Form convention. See [ADR-008: Component Conventions](./adr/adr-008-component-conventions.md) for naming rules, directory placement, data flow patterns, and a worked example.

### **File Size Limit (Enforced)**

- Every `.ts`/`.tsx` source file under `backend/src`, `frontend/src`, `shared/src`, and `scripts` is hard-capped at **300 lines** - `check:max-lines` runs in `smoke:qc` and fails the build on any file over the limit, with no exemptions
- Components over the limit should be decomposed into sub-components; extract reusable sub-components to the same directory (co-located) or to `components/shared/` if used across pages
- Services, routes, and scripts should be split into cohesive submodules behind a facade so the original import path and entrypoint stay stable

### **Hook Organization**

- Single hooks live as flat files in `hooks/` (e.g., `hooks/useDebounce.ts`)
- Create a hook subdirectory only when 2+ hooks share a domain (e.g., `hooks/dashboards/useDashboardLayout.ts` + `hooks/dashboards/useDashboardWidgets.ts`)
- Do not create subdirectories for single-file hooks
- Top-level `hooks/` does not have a barrel file; consumers import directly

### **Creating New Pages**

1. **Define TypeScript Types**

```typescript
// frontend/src/types/product.ts
export interface Product {
	id: number;
	name: string;
	price: number;
	createdBy: number;
	createdAt: string;
	creator: {
		id: number;
		username: string;
	};
}

export interface CreateProductData {
	name: string;
	price: number;
}
```

2. **Create API Module**

```typescript
// frontend/src/api/products.ts
import type { DataResponse } from './types';

import { apiClient } from './client';

interface Product {
	id: number;
	name: string;
	price: number;
	createdBy: number;
	createdAt: string;
}

interface CreateProductData {
	name: string;
	price: number;
}

export function getProducts(): Promise<DataResponse<Product[]>> {
	return apiClient.get<DataResponse<Product[]>>('/products');
}

export function createProduct(data: CreateProductData): Promise<DataResponse<Product>> {
	return apiClient.post<DataResponse<Product>>('/products', data);
}
```

3. **Create Page Component**

```typescript
// frontend/src/pages/products/ProductsPage.tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createProduct, getProducts } from '@/api/products';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthorization } from '@/hooks/useAuthorization';

export function ProductsPage() {
	const queryClient = useQueryClient();
	const { hasMinRole } = useAuthorization();
	const [showCreateForm, setShowCreateForm] = useState(false);

	const { data, isLoading, error } = useQuery({
		queryKey: ['products'],
		queryFn: getProducts,
	});

	const createMutation = useMutation({
		mutationFn: createProduct,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['products'] });
			setShowCreateForm(false);
		},
	});

	const canCreate = hasMinRole('OPERATOR');

	if (isLoading) return <Skeleton className="h-48 w-full" />;
	if (error) return <p className="text-destructive">Error loading products</p>;

	return (
		<div className="container mx-auto space-y-6 p-6">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Products</h1>
				{canCreate && (
					<Button onClick={() => setShowCreateForm(true)}>Add Product</Button>
				)}
			</div>

			<div className="grid gap-4">
				{data?.data?.map((product) => (
					<Card key={product.id}>
						<CardHeader>
							<CardTitle>{product.name}</CardTitle>
						</CardHeader>
						<CardContent>
							<p>${product.price}</p>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
```

4. **Add Route**

```typescript
// frontend/src/routes.tsx - add to the router definition
// Uses lazy loading via lazyNamed() helper
{
	path: '/products',
	element: (
		<ProtectedRoute requiredRole="VIEWER">
			<ProductsPage />
		</ProtectedRoute>
	),
}

// ProtectedRoute accepts a single requiredRole (minimum role level),
// not an array - the hierarchy handles the rest automatically.
```

5. **Verify Integration** (End-to-End Reachability)

Confirm the new page is accessible to users:

- [ ] Route is registered in `routes.tsx` (Step 4 above)
- [ ] Navigation link added to sidebar or relevant menu component
- [ ] Backend API endpoints called by the page are registered in `create-api-app.ts`
- [ ] Page is accessible by navigating the UI (not just by direct URL entry)

### **Correlation IDs**

Every API request includes two correlation headers for end-to-end traceability:

- **`X-Request-ID`**: Unique per request, format `{sessionId}-{counter}`. Generated by `frontend/src/utils/correlationId.ts`.
- **`X-Session-ID`**: Stable per browser session (UUID v4 stored in `sessionStorage`). Allows grouping all requests from a single user session.

**Frontend** (`utils/correlationId.ts`):

```typescript
import { generateRequestId, getSessionId, resetSessionId } from '@/utils/correlationId';

// getSessionId() - returns or creates a session ID (persisted in sessionStorage)
// generateRequestId() - returns "{sessionId}-{counter}" format
// resetSessionId() - call on logout to clear session correlation
```

Both headers are attached automatically by `getCommonHeaders()` in `api/requestHelpers.ts`.

**Backend** (`plugins/requestId.ts`):

The `requestIdPlugin` extracts both `X-Request-ID` and `X-Session-ID` from incoming requests, making `requestId` and `sessionId` available in the scoped derive context. The logger plugin includes both fields in all request log entries.

---

## Database Management

### **Database Location**

- **Location**: Always in `data/` directory at repository root
- **Never move database** without updating `config.json` database.url
- **SQLite file**: `data/spernakit.db` (or project-specific name)
- **Schema files**: `backend/src/db/schema/` - Drizzle table definitions

### **Schema Design Patterns**

```typescript
// backend/src/db/schema/products.ts
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const products = sqliteTable('products', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	price: real('price').notNull(),

	// Soft delete fields (recommended)
	isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
	deletedAt: integer('deleted_at', { mode: 'timestamp' }),
	deletedBy: integer('deleted_by'),

	// Audit fields
	createdBy: integer('created_by').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
});

export { products };
```

### **Schema Migration Workflow (Development)**

```bash
# Generate migration SQL after schema changes
bun run db:generate

# Apply pending migrations
bun run db:migrate

# Seed database
bun run --cwd backend db:seed

# Open Drizzle Studio
bun run --cwd backend db:studio

# Reset database (development only - deletes db file and re-seeds)
bun scripts/reset-database.ts
```

### **Migration Workflow (Production)**

```bash
# Generate migration SQL after schema changes
bun run db:generate

# Review generated SQL in backend/drizzle/
# Apply pending migrations (transaction-wrapped, safe for production)
bun run db:migrate

# Check migration status
bun run db:migrate:status
```

### **Database Technology**

**Database Dialects**: Spernakit v3 supports both SQLite and PostgreSQL, configured via `config.database.dialect` (`sqlite` or `postgres`).

**Current Setup**:

- **SQLite (default)**: Drizzle ORM + Bun's built-in `bun:sqlite` module. Schema files in `backend/src/db/schema/`
- **PostgreSQL**: Drizzle ORM + `pg` driver. Schema files in `backend/src/db/schema-pg/`
- **Auto-migration**: SQLite auto-applies pending migrations on startup via `autoMigrate.ts`; PostgreSQL requires explicit `db:migrate`
- **Schema management (development)**: `db:generate` followed by `db:migrate`
- **Schema management (production)**: `db:migrate` via custom `scripts/migrate.ts` with transaction-wrapped migrations

---

## Authentication & Authorization

### **Role-Based Access Control (RBAC)**

Spernakit implements a 5-tier role system:

1. **SYSOP** (Level 5) - System administration
2. **ADMIN** (Level 4) - Application administration
3. **MANAGER** (Level 3) - Team and user management
4. **OPERATOR** (Level 2) - Standard operations
5. **VIEWER** (Level 1) - Read-only access

### **Backend Route Protection**

```typescript
// Require authentication and specific role via beforeHandle guard
.get('/admin-only', ({ user }) => {
	// Handler logic - user is guaranteed non-null by the guard
	return dataResponse({ /* ... */ });
}, {
	beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
})

// Role hierarchy: requireRoleFresh('MANAGER') allows MANAGER, ADMIN, and SYSOP
// requireRoleFresh re-validates the user's role from the database (not just JWT claims)
```

### **Frontend Route Protection**

```typescript
// Protect entire routes (requiredRole = minimum role level)
<ProtectedRoute requiredRole="MANAGER">
  <UserManagement />
</ProtectedRoute>

// Conditional rendering with useAuthorization hook
const { hasMinRole, isAdmin } = useAuthorization();

{hasMinRole('ADMIN') && (
  <AdminPanel />
)}
```

### **Operations - Key Rotation**

Spernakit supports rotating two independent secret classes without invalidating live sessions or existing backups. Rotation is an explicit operator action - there is no auto-rotation scheduler and no in-app button that writes config.

#### JWT signing keys (`jwtPrivateKey` / `jwtPublicKey` and refresh pair)

The auth plugin verifies tokens against the current public key first and, on failure, retries against `jwtPublicKeyPrevious` when set. The same applies to `jwtRefreshPublicKey` / `jwtRefreshPublicKeyPrevious`. Rotation procedure:

1. Generate a new EC P-256 keypair (`bun run generate-keys` on a scratch config, or a one-off script).
2. Move the **current** `jwtPrivateKey` / `jwtPublicKey` into `jwtPrivateKeyPrevious` / `jwtPublicKeyPrevious` in config (or via `{SLUG}_JWT_PRIVATE_KEY_PREVIOUS` / `{SLUG}_JWT_PUBLIC_KEY_PREVIOUS` env vars). Repeat for the refresh pair if rotating both.
3. Set the **new** keypair as `jwtPrivateKey` / `jwtPublicKey`.
4. Restart the app. New tokens are signed with the new key; tokens issued under the old key continue to verify against the `Previous` field.
5. After a grace window of your choosing (matching or exceeding `jwtRefreshExpiresIn` guarantees no legitimate old-key tokens remain), remove the `Previous` fields from config and restart again. Any remaining old-key tokens now fail with 401.

The grace window is operator-enforced - the code does not check a timestamp. Keep it long enough for in-flight refresh tokens to cycle through.

#### Backup encryption key (`backupEncryptionKey`)

Backup encryption uses a dedicated key (distinct from `encryptionKey`, which protects field-level data). Rotation uses a two-phase procedure with a SYSOP endpoint to re-encrypt existing backup files under the new key:

1. Generate a new 64-hex-char key (`openssl rand -hex 32`).
2. Move the **current** `backupEncryptionKey` into `backupEncryptionKeyPrevious` and set the **new** key as `backupEncryptionKey` in config (or via the `{SLUG}_BACKUP_ENCRYPTION_KEY` / `{SLUG}_BACKUP_ENCRYPTION_KEY_PREVIOUS` env vars).
3. Restart the app. New backups are now encrypted with the new key; existing backups still decrypt via the `Previous` fallback.
4. As SYSOP, call `POST /api/v1/settings/auth-security/rotate-backup-key` (or click **Re-encrypt backups under current key** in Settings → Authentication). The endpoint iterates every `.enc` file in the backup directory, decrypts with whichever of the two keys succeeds, and atomically re-encrypts under the current key.
5. After verifying the result (`processed` count matches expected, `failed` is zero), remove `backupEncryptionKeyPrevious` from config and restart.

The endpoint refuses to run unless `backupEncryptionKeyPrevious` is set (400 `BACKUP_ROTATION_NOT_STAGED`) - this prevents accidental invocation outside a staged rotation.

> **What breaks if you discard the previous key too early.** JWT: any still-live session whose token was signed under the discarded key fails with 401 - users are forced to log in again. Backup: any backup file not yet re-encrypted becomes permanently unrecoverable (decryption requires the key under which it was encrypted; there is no master key).

---

## Development Patterns

### **Error Handling**

```typescript
// Backend error handling (Elysia - return values, set status via set.status)
import { dataResponse, internalError } from '../utils/errorResponse.ts';
import { logger } from '../utils/logger.ts';

// In route handlers, return response objects directly:
try {
	const result = service.performOperation();
	return dataResponse(result);
} catch (error) {
	logger.error({ err: error }, 'Operation failed');
	set.status = 500;
	return internalError(SERVER_ERROR_CODES.SERVER_INTERNAL_ERROR, requestId);
}

// Frontend error handling with TanStack Query
// GET requests: apiClient retries 5xx up to 2x with backoff, then TanStack Query retries 3x
// Mutations: no apiClient retry by default; TanStack Query retries once
const { data, error, isLoading } = useQuery({
	queryKey: ['data'],
	queryFn: () => apiClient.get<DataResponse<Item>>('/items'),
	retry: (failureCount, error) => {
		// Don't retry client errors (4xx)
		if (error instanceof ApiError && error.status < 500) return false;
		return failureCount < 3;
	},
});
```

### **Form Handling**

```typescript
// Form with validation (native fetch via apiClient, ApiError class)
import { toast } from 'sonner';

import { ApiError } from '@/api/client';

const [formData, setFormData] = useState({ name: '', email: '' });
const [errors, setErrors] = useState<string | null>(null);

const handleSubmit = async (e: React.FormEvent) => {
	e.preventDefault();

	try {
		await apiClient.post('/users', formData);
		toast.success('User created successfully');
		setFormData({ name: '', email: '' });
	} catch (err) {
		if (err instanceof ApiError) {
			setErrors(err.message);
			toast.error(err.message);
		} else {
			toast.error('Failed to create user');
		}
	}
};
```

---

## Best Practices

### **Code Organization**

- Keep components small and focused (single responsibility)
- Use TypeScript interfaces for all data structures
- Implement proper error boundaries
- Follow consistent naming conventions

### **Performance**

- React Compiler handles memoization automatically - do not use manual `React.memo`, `useMemo`, or `useCallback` unless profiling proves the compiler misses a hot path
- Implement virtual scrolling for large lists
- Use TanStack Query for server state caching
- Optimize bundle size with code splitting

### **Security**

- Always validate input on both client and server
- Use parameterized queries to prevent SQL injection
- Implement proper CORS configuration
- Never expose sensitive data in client-side code

### **Testing**

Spernakit does not use unit test frameworks (vitest, jest, @testing-library, or similar). The verification strategy is smoke tests, crawl tests, and integration scripts - see [TESTING.md](TESTING.md) for the full strategy. Crawltest verifies features end-to-end in the running application.

### Running Tests

```bash
# Run smoke tests (development environment)
bun run smoke:dev

# Run smoke tests (preview environment)
bun run smoke:preview

# Run quality control tests
bun run smoke:qc

# Run authentication reset API tests
bun run test:auth-reset-api

# Run authentication reset UI tests
bun run test:auth-reset-ui-dev   # Development mode
bun run test:auth-reset-ui-preview  # Preview mode

# Run full validation chain (QC + all environments)
bun run supertest

# Run crawl tests
bun run crawltest          # Development mode
bun run crawltest:preview  # Preview mode

# Targeted crawl tests (requires services running)
bun scripts/crawltest.ts --page /dashboard          # Test single page
bun scripts/crawltest.ts --start-from /settings      # Test settings section only
bun scripts/crawltest.ts --404                        # Verify 404 page is clean
bun scripts/crawltest.ts --page /users --screenshot-pages  # Single page + screenshot
```

### Smoke Test Modes

Smoke tests verify that the application is running correctly:

| Mode          | Command                      | Purpose                                       |
| ------------- | ---------------------------- | --------------------------------------------- |
| dev           | `bun run smoke:dev`          | Development environment checks                |
| preview       | `bun run smoke:preview`      | Preview environment checks                    |
| docker-local  | `bun run smoke:docker-local` | Local Docker environment                      |
| docker-prod   | `bun run smoke:docker-prod`  | Production Docker environment                 |
| qc            | `bun run smoke:qc`           | Full quality control suite                    |
| reset         | `bun run smoke:reset`        | Reset and rebuild everything                  |
| **supertest** | `bun run supertest`          | Full validation chain (QC + all environments) |

For detailed testing information, see the [Testing Guide](./TESTING.md).

### Testing Philosophy

**Test like a human user with mouse and keyboard. Don't take shortcuts that bypass UI testing.**

#### Testing Checklist

✅ **Test through the UI** with clicks and keyboard input

- Navigate using browser automation clicks
- Enter data using browser automation typing
- Verify visual appearance

✅ **Take screenshots** to verify visual appearance

- Capture key states (before, during, after actions)
- Verify layouts and styling
- Confirm responsive behavior

✅ **Check for console errors** in browser

- Review browser console output
- Identify JavaScript errors
- Check for failed network requests

✅ **Verify complete user workflows** end-to-end

- Test entire feature flows, not just individual actions
- Verify data persistence across page reloads
- Check error handling and edge cases

#### Testing Anti-Patterns

❌ Only testing with curl/API commands (missing UI verification)
❌ Skipping visual verification
❌ Marking tests passing without thorough verification
❌ Assuming UI works if API works

#### Quality Bar

**Zero tolerance for:**

- Console errors in browser
- Failed API requests (unless intentional/handled)
- Visual bugs (white-on-white, broken layouts)
- Broken workflows (incomplete user journeys)

---

## Keyboard Shortcuts System

Spernakit's keyboard shortcuts use global maps, with no context provider required:

### **Architecture**

The system uses three global `Map` instances for O(1) lookup:

- **Single-key shortcuts** (e.g., `?`, `k`) - trigger immediately on keydown
- **Sequence shortcuts** (e.g., `g d`, `g s`) - vim-style two-key sequences within 800ms
- **Modifier shortcuts** (e.g., `mod+k`) - platform-agnostic Ctrl/Cmd combos

Shortcuts are disabled when input fields are focused (except modifier combos).

### **Registering Shortcuts**

```typescript
import { useEffect } from 'react';
import { registerShortcut } from '../hooks/useKeyboardShortcuts';

function MyComponent() {
	useEffect(() => {
		const cleanup = registerShortcut({
			key: 'mod+k',
			label: 'Ctrl+K',
			description: 'Open command palette',
			handler: () => setShowPalette(true),
		});
		return cleanup;
	}, []);

	return <div>...</div>;
}
```

### **Enabling the Listener**

Call `useKeyboardShortcuts()` once in a component that is always mounted (e.g., AppShell):

```typescript
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

function AppShell() {
	useKeyboardShortcuts();
	// ...
}
```

### **Listing Shortcuts**

Use `getShortcuts()` to retrieve all registered shortcuts for display in a help dialog.

---

## UI/UX Guidelines

### Visual Standards

- Responsive and accessible design
- Clear feedback for all user actions
- Meaningful icons with labels
- Consistent spacing, alignment, and naming
- Respect Light/Dark mode (no white backgrounds in dark mode)
- Match existing codebase style patterns

### Modal Behavior

- Modals close on: off-click, Escape key, or close button
- Modals require confirmation before closing when unsaved data is present

### Documentation & Comments

**Documentation:**

- Document intent (explain "why" decisions were made)
- Keep documentation current with code changes
- Write from the user's perspective
- Provide concrete usage examples

**Comments:**

- Clear and concise
- Document complex logic and business rules
- Explain "why" not "what"
- Remove redundant comments
- Update comments when code changes

---

## Audit Framework

Spernakit includes an audit framework for code quality, security, and architecture. Audits produce systematic evaluations of the codebase with prioritized findings.

### Audit Framework Overview

**Purpose**: Systematic, repeatable evaluations of code quality, architecture, security, and compliance.

**Audit Location**: `.aidd/audits/` - All audit definitions are located here.

**Available Audits**:

| Domain                  | Audit File                   | Focus Area                                                               |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| API Design              | `API_DESIGN.md`              | RESTful principles, HTTP status codes, validation                        |
| Architecture            | `ARCHITECTURE.md`            | Component relationships, layering, separation of concerns                |
| Code Quality            | `CODE_QUALITY.md`            | Maintainability, readability, naming, duplication                        |
| Security                | `SECURITY.md`                | Vulnerabilities, authentication, authorization                           |
| Performance             | `PERFORMANCE.md`             | Response times, bundle size, memory usage                                |
| Documentation           | `DOCUMENTATION.md`           | README completeness, code comments, API docs                             |
| Frontend                | `FRONTEND.md`                | React best practices, component architecture                             |
| Database                | `DATABASE.md`                | Query performance, indexes, schema consistency                           |
| Monitoring              | `MONITORING.md`              | Metrics, logging, alerting, observability                                |
| Feature Integration     | `FEATURE_INTEGRATION.md`     | Reachability verification, cathedral detection, integration completeness |
| Severity Classification | `SEVERITY_CLASSIFICATION.md` | Issue prioritization (Critical/High/Medium/Low)                          |

### When to Run Audits

**New Feature Development**:

- Pre-implementation: Run architecture and security audits to validate design
- Post-implementation: Run code quality and frontend audits on completed code

**Code Reviews**:

- Check if changes address previously identified audit issues
- Look for new violations in changed files
- Prioritize review focus based on severity levels

**Pre-Release Quality Gates**:

- 1-2 weeks before release: Run all audits
- Triage findings and address Critical/High issues
- Re-run audits to verify fixes before final release

**Periodic Health Checks**:

- Weekly: Code quality and logic audits
- Monthly: Security, API design, frontend audits
- Quarterly: Full audit suite

**Incident Response**:

- Security incidents: Run security audit on affected areas
- Performance issues: Run performance and monitoring audits
- Data problems: Run database and data architecture audits

### Running an Audit

**Step-by-Step Process**:

1. **Prepare Environment**:

    ```bash
    bun install
    bun run smoke:qc  # Establish quality baseline
    ```

2. **Select and Read Audit**:

    ```bash
    cd .aidd/audits
    cat API_DESIGN.md  # Or any other audit file
    ```

3. **Execute Audit Checklist**:
   Work through audit checklist systematically
   Document all findings with file/line, severity, and recommendations

4. **Create Feature Files**:
   For actionable findings, create `.aidd/features/{audit-type}-{timestamp}-{issue-id}/feature.json`

### Interpreting Audit Results

**Severity Levels** (see `SEVERITY_CLASSIFICATION.md`):

- **Critical**: Immediate production risk, fix within 24 hours
- **High**: Significant impact on quality/performance, fix in 1-2 weeks
- **Medium**: Best practice violations, fix in 1-4 weeks
- **Low**: Nice-to-have improvements, fix in 1-3 months

**Prioritization Rules**:

1. Always address Critical findings immediately
2. Schedule High findings for next sprint
3. Plan Medium findings for upcoming releases
4. Backlog Low findings for tech debt sprints

### Integrating Audits into Development Workflow

**Pre-commit Checks** (optional):

```bash
#!/bin/bash
# .git/hooks/pre-commit
bun run lint
bun run typecheck

if [ $? -ne 0 ]; then
  echo "❌ Quality checks failed. Fix issues before committing."
  exit 1
fi
```

**Pull Request Checklist**:

- [ ] No new Critical/High issues from audits
- [ ] All quality checks pass (`bun run smoke:qc`)
- [ ] Relevant audits run on changed files
- [ ] Findings addressed or documented as exceptions
- [ ] No regressions in previously passing features

### Audit-Driven Development

**Before Coding**:

1. Run relevant audits to understand constraints
2. Document design decisions addressing audit findings
3. Create feature files for planned improvements

**During Coding**:

1. Reference audit guidelines as you implement
2. Check code against audit checklists incrementally
3. Run targeted audits on completed sections

**After Coding**:

1. Run full audit suite on changes
2. Create feature files for any new issues
3. Prioritize and schedule fixes

### Best Practices

**Regular Audit Schedule**:

| Development Velocity      | Audit Frequency      |
| ------------------------- | -------------------- |
| High (weekly releases)    | Weekly full suite    |
| Medium (monthly releases) | Monthly full suite   |
| Low (quarterly releases)  | Quarterly full suite |

**Tracking Audit History**:
Maintain audit execution log in `.aidd/CHANGELOG.md`:

```markdown
## [YYYY-MM-DD] - Audit: {Audit Name}

- Completed {Audit Name} audit
- Fixed {N} Critical issues
- Fixed {N} High priority issues
- Fixed {N} Medium priority issues
- Backlogged {N} Low priority improvements

**Next Audit**: {Date}
```

### Quick Audit Commands

```bash
# Run quality checks
bun run smoke:qc

# List failing features
grep -r '"passes": false' .aidd/features/*/feature.json

# Count failing features by severity
grep -r '"auditSeverity":' .aidd/features/*/feature.json | sort | uniq -c
```

### Getting Help

- **Severity Classification**: See `.aidd/audits/SEVERITY_CLASSIFICATION.md`
- **Individual Audits**: See `.aidd/audits/*.md`
- **Feature Status**: See `.aidd/features/*/feature.json`

---

## Workflow Guidelines

### Session Start

Acknowledge instructions with: "Don't Panic. I am operating in {internal operating mode} mode until told otherwise."

### Task Completion

Before signoff:

1. Verify objective fulfilled
2. **Integration check**: Confirm every new service, route, page, or component is reachable from a user-facing path (no orphaned features)
3. Review changes with code reviewer mindset
4. Confirm: "I have done my best!"

---

**Next Steps:**

- [**API Reference**](./API_REFERENCE.md) - Complete API documentation
- [**Customization Guide**](./CUSTOMIZATION.md) - Extend and modify the template
- [**Advanced Topics**](../README.md#advanced-topics) - Detailed coverage of specific features
