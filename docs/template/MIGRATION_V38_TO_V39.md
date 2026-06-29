# Migration Guide: Spernakit v3.8 → v3.9

This guide covers upgrading a derived application from Spernakit v3.8.x to v3.9.0. The headline change is the enforced 300-line `check:max-lines` quality gate; everything else in the range is behavior-preserving decomposition, stricter compiler options, and tooling fixes.

## TL;DR

1. Pull spernakit v3.9.0 into the template source.
2. Run the dance / `template-upgrade` flow against your app.
3. Split any **app-owned** `.ts`/`.tsx` file over 300 lines (the gate has no grandfather list).
4. `bun run smoke:qc` must pass — `check:max-lines` is now part of the gate and of the CI quality job.

If smoke:qc fails on `check:max-lines` or on typecheck after the tsconfig changes, read the relevant section below before patching.

---

## The 300-line max-lines gate

`scripts/check-max-lines.ts` runs as the `check:max-lines` step in `scripts/smoke.json` mode `qc` and as a "Max lines gate" step in the `.github/workflows/ci.yml` quality job. It fails when any tracked `.ts`/`.tsx` file under `cli/src`, `backend/src`, `frontend/src`, `shared/src`, or `scripts` exceeds **300 lines** (`.d.ts` files and `node_modules`/`dist`/`build`/snapshot directories are skipped), listing each offending file with its line count.

**What derived apps must do.** Every template-shipped file already complies — the template split 22 files below the threshold in this release. Your app-owned files are now held to the same ceiling:

- There is **no grandfather list and no exemption mechanism** (the former orchestration-only page-component allowance is gone). Do not add one.
- Split oversized files into cohesive modules — typically a facade that re-exports from a sibling subdirectory or a dotted-suffix helper file (`foo.helpers.ts`) — **preserving the original entrypoint path and export surface** so importers do not change.
- The rule is documented in `DEVELOPMENT.md` under "File Size Limit (Enforced)".

---

## Template file decompositions

To get under its own gate, the template decomposed files in two areas. All changes are behavior-preserving: entrypoint paths, CLI flags, and export surfaces are unchanged, so app-side imports keep working.

**Scripts → `scripts/lib/`.** 18 oversized scripts were split into facade + submodules, including:

- `scripts/migrate.ts` → `scripts/lib/migrate/` (journal, history, records, statements, validate, rollback, apply, reporting)
- `scripts/smoke.ts` / `scripts/smoke-cache.ts` → `scripts/lib/smoke/` + `scripts/lib/smoke-cache/` (the step-dependency map relocated verbatim; cache globs now track the new lib paths)
- `scripts/template-shared.ts` → pure re-export facade over `scripts/lib/template/`
- `setup`/`start`/`stop` → `scripts/lib/setup/` + `scripts/lib/process/`
- `crawltest.ts` → six `crawltest-*` satellites

**App source.** Four backend/frontend modules were split below the gate: `services/user/userCrud.ts` (helpers into `userCrudHelpers.ts`), `lib/websocket/manager.ts` (reconnect/backoff into `reconnect.ts`), `routes/dashboards/templates-import.ts` (into `templates-import.helpers.ts`), and `services/backup/backupRestore.ts` (into `backupRestoreHelpers.ts`).

**Impact on your upgrade.** If your app carries local patches against any of the old monolithic files, re-apply them against the new submodules during the dance — a straight file-level overwrite will silently drop your patch or resurrect an oversized file that then fails the gate.

---

## Stricter TypeScript compiler options

All workspace `tsconfig` files now enable `erasableSyntaxOnly` and `noUncheckedSideEffectImports`; the backend and scripts configs additionally enable `verbatimModuleSyntax`.

App code that may now fail typecheck:

- **`erasableSyntaxOnly`** forbids TypeScript syntax with runtime semantics: `enum`, runtime `namespace` bodies, and class constructor parameter properties. Replace enums with `const` object + union-type patterns (the style the template already uses).
- **`verbatimModuleSyntax`** (backend/scripts) requires `import type { ... }` for type-only imports.
- **`noUncheckedSideEffectImports`** errors on side-effect imports of modules that do not exist.

---

## Platform floor

The supported runtime floor is **Node `>=24.0.0 <25.0.0`** and **Bun `>=1.3.14`** (`engines` in all workspace `package.json` files, `.nvmrc` at 24, `packageManager` pinned to `bun@1.3.14`). This floor landed in v3.8.1 — if you are upgrading from v3.8.0 directly, update your runtimes first; `preinstall: only-allow bun` also rejects accidental `npm install` / `yarn install`.

---

## Smaller behavior changes

- **`bun run start` crash recovery** — `start.ts` no longer unlinks stale `backend.pid` itself; it delegates to `stop.ts --from-start`, which cleans stale backend and frontend PID files, so a single `bun run start` recovers from a silent crash.
- **LTS surface guard skip** — `check:lts-surface` exits gracefully with a skip message when `docs/lts-baseline/` is absent (freshly scaffolded apps have no LTS contract) instead of ENOENT-failing `smoke:qc`.
- **Windows child environments** — the allowlisted child-process environment introduced in v3.8.1 was fixed to include the variables Windows child processes require.
- **Dependency bumps** — patch/minor bumps across the workspace (lru-cache, nodemailer, @tanstack/react-query, @tanstack/react-virtual, lucide-react, react-router-dom, web-vitals, zustand, vite, eslint, knip, puppeteer, typescript-eslint, and others). Inherited automatically via `template-upgrade`; `check-deps` enforces alignment.

---

## Schema and config changes

None in this range. No database migrations were added between v3.8.1 and v3.9.0, and the Zod config schema (`backend/src/config/configSchemas/`) is unchanged — no `config/{appname}.json` edits are required for this upgrade.

---

## Upgrade checklist

1. Update runtimes if needed (Node 24, Bun 1.3.14+).
2. Pull v3.9.0 and run the dance / `template-upgrade` flow; hand-apply any local patches that targeted the now-decomposed files.
3. Run `bun run check:max-lines` directly to enumerate app-owned offenders, then split them (facade + submodules, entrypoints preserved).
4. Fix any new typecheck errors from `erasableSyntaxOnly` / `verbatimModuleSyntax`.
5. `bun run smoke:qc` must pass end to end.
6. Boot against an existing dev database and against an empty database (standard migration smoke; no new migrations are expected to run).
