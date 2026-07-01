# Migration Guide: Spernakit v3.7 → v3.8

This guide covers upgrading a derived application from Spernakit v3.7.x to v3.8.0.

## TL;DR

1. Pull spernakit v3.8.0 into the template source.
2. Run the dance / `template-upgrade` flow against your app.
3. `bun run smoke:qc` must pass.

If `smoke:qc` fails on template drift, dependency pinning, or config/schema checks, read the relevant section below before patching.

---

## Migration squash impact

The v3.7.x migration history was squashed into a single baseline migration as part of the release preparation.

**Existing apps with a v3.7.x database.** The new baseline migration applies on first boot of v3.8.0. Drizzle's runner cooperates with the squash via `isBenignDdlError` in `backend/src/db/migrate/runner.ts`, which swallows "already exists" errors emitted when the squashed DDL re-runs against a database that already had each statement applied incrementally. End state matches a fresh install. No data migration is required.

**Fresh installs.** Only the squashed baseline runs. The pre-squash migration files are not shipped in the active tree; use git history for forensic reference if you need to reconstruct what shape a v3.7.x database had at a given point in history.

**What this means for derived apps.** If your app added migrations on top of v3.7.x, those migrations follow the squashed baseline as before — the squash applies only to template-shipped migrations. Run your app's normal migration test (boot against an existing dev DB, then boot against an empty DB) after upgrading.

---

## Dependency pin impact

Every dependency in the template's `package.json` files (root, `backend/`, `frontend/`) was repinned to exact versions during v3.8 release preparation. No `^` or `~` ranges remain.

**Inheritance.** Derived apps that pull from the template via `template-upgrade` inherit the pinned versions automatically. Your app's own non-template dependencies are not touched.

**Lockfile changes.** Keep `bun.lock` changes intentional and committed with the matching manifest edit. `check-deps` enforces exact dependency specs so accidental version ranges do not land.

---

## Release-hardening guards

The v3.8 release added several QC guardrails. Some were later retired from the active tree, but the generic protections below remain useful when upgrading derived apps.

### Dependency pinning

Exact dependency versions catch drive-by `bun add` / `bun update` invocations that would silently change the dependency graph.

### Config and environment discipline

The current quality gate checks generated config schema drift, validates defaults/example/instance config, verifies split-secret file shape, and restricts direct `process.env` access to the approved config path.

### Template drift hard-fail

`check:drift` hard-fails the QC pipeline on detected template-vs-app drift in protected paths. Use the dance flow to reconcile, or scope the change to the app-local override path documented in `CUSTOMIZATION.md`.

### Dependency-version check

The dependency-version check runs unconditionally. It enforces that derived apps stay aligned with the template's pinned versions for the dependencies the template manages.

---

## Historical patch-only policy

At the time of v3.8.0, the template adopted a patch-only policy for the v3 line. That live policy and its dedicated freeze guards have since been removed from the active tree.

The decision rationale remains in [`adr/adr-010-v38-lts.md`](adr/adr-010-v38-lts.md) as historical context.
