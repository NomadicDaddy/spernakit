# Migration Guide: Spernakit v3.7 → v3.8

This guide covers upgrading a derived application from Spernakit v3.7.x to v3.8.0. For the current patch policy, see [`LTS.md`](LTS.md).

## TL;DR

1. Pull spernakit v3.8.0 into the template source.
2. Run the dance / `template-upgrade` flow against your app.
3. `bun run smoke:qc` must pass — the new LTS guards are now part of the gate.

If smoke:qc fails on `check:lockfile-frozen`, `check:lts-surface`, or `check:drift`, read the relevant section below before patching.

---

## Migration squash impact

The v3.7.x migration history was squashed into a single baseline migration as part of the release preparation.

**Existing apps with a v3.7.x database.** The new baseline migration applies on first boot of v3.8.0. Drizzle's runner cooperates with the squash via `isBenignDdlError` in `backend/src/db/migrate/runner.ts`, which swallows "already exists" errors emitted when the squashed DDL re-runs against a database that already had each statement applied incrementally. End state matches a fresh install. No data migration is required.

**Fresh installs.** Only the squashed baseline runs. The pre-squash migration files are not shipped — they are preserved at `docs/lts-baseline/migrations-pre-squash/` for forensic reference (e.g., when reconstructing what shape a v3.7.x database had at a given point in history).

**What this means for derived apps.** If your app added migrations on top of v3.7.x, those migrations follow the squashed baseline as before — the squash applies only to template-shipped migrations. Run your app's normal migration test (boot against an existing dev DB, then boot against an empty DB) after upgrading.

---

## Dependency pin impact

Every dependency in the template's `package.json` files (root, `backend/`, `frontend/`) was repinned to exact versions during LTS preparation. No `^` or `~` ranges remain.

**Inheritance.** Derived apps that pull from the template via `template-upgrade` inherit the pinned versions automatically. Your app's own non-template dependencies are not touched.

**Lockfile changes.** `check:lockfile-frozen` runs in `smoke:qc` and fails if `bun.lock` drifts from the committed lockfile. To intentionally bump a dependency during a patch release:

1. Set `LTS_LOCKFILE_BUMP=1` for the local run that updates the lockfile.
2. Land an ADR justifying the bump under `docs/template/adr/` (security advisory, correctness fix, or other category permitted by `LTS.md`).
3. Without both the env override and the ADR, the bump will not pass review.

---

## New guards in smoke:qc

Two checks were added to the QC pipeline as part of release hardening. Derived apps inherit them automatically through `template-upgrade`.

### check:lockfile-frozen

Compares the working `bun.lock` to the committed one. Fails on any drift unless `LTS_LOCKFILE_BUMP=1` is set. The point is to catch drive-by `bun add` / `bun update` invocations that would silently change the dependency graph.

### check:lts-surface

Diffs the current shape against the baseline captured in `docs/lts-baseline/`. The surfaces guarded are:

- Zod config schema (`config/schema.ts` and the validators it composes)
- Template manifest (`template-manifest.json`)
- `process.env` reads across the codebase

A failure means one of those surfaces diverged from the LTS baseline. There are exactly two acceptable resolutions:

1. **Revert the change** — the diff was unintentional or out of LTS scope.
2. **Branch the successor line** — the change is genuinely needed and qualifies for the next line; it does not belong on the patch-only v3 main branch.

There is no "update the baseline" option for routine work. The baseline moves only on a patch tag where the change has already been justified per LTS.

### check:drift hard-fail

`check:drift` was previously advisory in some contexts. Under LTS it hard-fails the QC pipeline on any detected template-vs-app drift in protected paths. Use the dance flow to reconcile, or scope the change to the app-local override path documented in `CUSTOMIZATION.md`.

### check:deps universal

The dependency-version check runs unconditionally now (previously gated on flags). It enforces that derived apps stay aligned with the template's pinned versions for the dependencies the template manages.

---

## Patch-only policy

Patch releases continue to receive fixes in the categories enumerated in [`LTS.md`](LTS.md): security advisories, correctness fixes, doc corrections, dance-blocking template drift, critical observability gaps. New features no longer ship on v3 — they accumulate against the successor-line backlog.

The decision rationale is in [`adr/adr-010-v38-lts.md`](adr/adr-010-v38-lts.md). If you are unsure whether a change qualifies, read that ADR before opening a PR.
