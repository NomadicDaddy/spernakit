/**
 * What the template does not hand to a derived app, and what it stops asking about afterward.
 *
 * Two different questions share these lists, and keeping them in one file is what stops the answers
 * drifting apart. The COPY question (`isInitExcluded`) decides what the initializer writes into a
 * new app. The DRIFT question (`isFileExcluded`) decides what the checker compares once the app
 * exists. Drift is the wider of the two by construction: everything init withholds, drift also
 * ignores, plus the paths that ship on purpose and then diverge per app.
 *
 * A file that lands on the wrong list fails quietly in both directions. Copy a template-only script
 * into an app and it sits there dead, importing libraries that were never copied; leave a shipped
 * file off the drift list and every app reports it as drifted forever. Both read as ordinary noise
 * in a report nobody re-derives, which is why the reasoning stays written down beside each entry.
 */

// Directories the initializer does NOT copy into a derived app. Shared source of truth: the copier
// (isInitExcluded → enumerateInitFiles) and the drift checker (isFileExcluded) both derive from it,
// so they can never silently diverge about what the template is.
const INIT_EXCLUDED_DIRS = [
	'.agents/',
	'.git/',
	// Keep `.aidd/` here. Removing it would not seed feature records anyway — enumerateInitFiles goes
	// through `git ls-files` and `/.aidd/` is gitignored in the template, so it is invisible to this
	// list — and if it did work it would ship CHANGELOG.md, assertions.md and run artifacts along with
	// them. Feature records are seeded by `seedTemplateFeatures` (lib/init/scaffold.ts), which selects
	// durable records deliberately, and kept current by `sync-template-features.ts`.
	'.aidd/',
	'.claude/',
	'.windsurf/',
	'data/',
	'internal/',
	'logs/',
	'node_modules/',
	'dist/',
	'site/',
	'testing/',
	'upgrade-review/',
	// scaffolding/ is spernakit's copy of what a DERIVED APP should have. It is never synced to an
	// app at this path — its contents are mapped onto app root paths instead (see toTemplatePath).
	'scaffolding/',
];

// Additional exclusions for drift detection (generated/app-specific content):
const DRIFT_EXCLUDED_DIRS = [
	'backups/',
	'config/', // generated per-app by setup.ts
	'docs/', // app-specific docs excluded (docs/template/ re-included in isFileExcluded)
	'drizzle/', // migration state diverges
	'backend/drizzle/', // migration state diverges
	'frontend/public/', // app-specific icons
	'screenshots/', // app-specific
];

// File patterns the initializer does NOT copy into a derived app (spernakit-only scripts, the
// gitignored fleet/registry files, database artifacts, and the deprecated binary lockfile). Mirrors
// init.ps1's $ExcludeFiles. Note bun.lock is DELIBERATELY absent — a derived app must inherit the
// template's exact validated lockfile so `bun i --frozen-lockfile` reproduces the canonical graph.
const INIT_EXCLUDED_PATTERNS = [
	/\.db$/,
	/\.db-journal$/,
	/\.db-wal$/,
	/\.lockb$/,
	/^changes\.ps1$/,
	/^init\.ps1$/,
	/^reset\.ps1$/,
	/^run\.ps1$/,
	/^spernakit\.psd1$/,
	/^spernakit\.json$/,
	/^shared-core-targets\.json(\.example)?$/,
	/^scripts\/check-fresh-release\.ts$/,
	/^scripts\/lib\/fresh-release\//,
	/^scripts\/test-fresh-release\.ts$/,
	// Fleet peer-sync machinery, template-only for the same reason check-fresh-release is: only
	// aidd and spernakit own shared-core groups, so in a derived app every one of these can do
	// nothing but refuse. Its qc step is already templateOnly; excluding it from init keeps the
	// script, both its libraries, its manifest and its self-test out of trees that cannot use them.
	// shared-core-write/ is the self-test's fixture and invariant library and imports shared-core/,
	// so shipping one without the other leaves an app files that are dead and cannot typecheck.
	/^scripts\/lib\/shared-core\//,
	/^scripts\/lib\/shared-core-write\//,
	/^scripts\/shared-core-manifest\.json$/,
	/^scripts\/sync-shared-core\.ts$/,
	/^scripts\/test-shared-core-write\.ts$/,
	/^smoke-cache\.json$/,
	/^sync\.ps1$/,
];

// Patterns excluded from DRIFT only (copied into apps, then diverge per-app): the license inventories
// are generated from each app's own dependency graph, bun.lock resolves per-app, and both size
// budgets are measured from each app's own build (scripts/lib/{bundle,critical-path}-budget.ts).
const DRIFT_EXCLUDED_PATTERNS = [
	/^THIRD_PARTY_LICENSES\.md$/,
	/^THIRD_PARTY_NOTICES\.md$/,
	/^scripts\/bundle-budget\.json$/,
	/^scripts\/critical-path-budget\.json$/,
	/\.lock$/,
];

/**
 * The COPY predicate: true when a file must NOT be copied into a derived app. A strict subset of
 * isFileExcluded — the extra DRIFT_EXCLUDED_* (config/, docs/, drizzle/, bun.lock, ...) ARE copied
 * (setup regenerates config/, migrations must ship) but are not drift-checked afterward.
 */
export function isInitExcluded(filePath: string): boolean {
	// docs/template/ is template-managed and ships to every app.
	if (filePath.startsWith('docs/template/')) return false;

	// spernakit's OWN ignore files and hooks are its own — the app-facing versions live in
	// scaffolding/ and are re-introduced under their app paths (see toTemplatePath).
	if (filePath === '.gitignore' || filePath === '.prettierignore') return true;
	if (filePath.startsWith('.githooks/')) return true;

	for (const dir of INIT_EXCLUDED_DIRS) {
		if (filePath.startsWith(dir)) return true;
	}
	for (const pattern of INIT_EXCLUDED_PATTERNS) {
		if (pattern.test(filePath)) return true;
	}
	return false;
}

export function isFileExcluded(filePath: string): boolean {
	// Everything init excludes, drift excludes too.
	if (isInitExcluded(filePath)) return true;

	// docs/template/ is template-managed and must NOT be excluded even though docs/ is
	// (the DRIFT_EXCLUDED_DIRS loop below would otherwise catch it under docs/).
	if (filePath.startsWith('docs/template/')) return false;

	// Scripts that only spernakit runs (drift-only exclusion — init copies them inertly, but a
	// derived app never invokes them). Each backs a smoke step marked templateOnly: the
	// fleet-manifest check reads a registry only this repo keeps. Not every spernakit-authored
	// script belongs here: sync-license-core.ts ships deliberately, because an app having it is how
	// a wrong-way run gets refused rather than silently succeeding. check-leak-guard.sh left this
	// list in 3.35.0 — every app runs the guard now, so its self-test has to stay in step with the
	// hook rather than being allowed to rot at whatever version the app was scaffolded from.
	if (filePath === 'scripts/check-fleet-manifest.ts') return true;
	if (filePath === 'scripts/read-fleet-manifest.ps1') return true;
	if (filePath === 'scripts/test-fleet-manifest.ts') return true;
	if (filePath.startsWith('scripts/lib/fleet/')) return true;

	// Drift-only directory exclusions (generated/app-specific content copied into apps but not
	// drift-checked).
	for (const dir of DRIFT_EXCLUDED_DIRS) {
		if (filePath.startsWith(dir)) return true;
	}
	// Drift-only file patterns: copied into apps, then diverge per-app (see DRIFT_EXCLUDED_PATTERNS).
	for (const pattern of DRIFT_EXCLUDED_PATTERNS) {
		if (pattern.test(filePath)) return true;
	}
	return false;
}
