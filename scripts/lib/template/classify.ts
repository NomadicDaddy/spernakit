/**
 * File exclusion, enumeration, and classification for the template drift/sync tooling.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { BrandingValues, ClassificationOverrides, DriftCategory } from './types.ts';

import { loadJsonConfig } from '../../load-json-config.ts';
import { getTemplateFileAtVersion } from './repo.ts';

// Directories the initializer does NOT copy into a derived app. Shared source of truth: the copier
// (isInitExcluded → enumerateInitFiles) and the drift checker (isFileExcluded) both derive from it,
// so they can never silently diverge about what the template is.
const INIT_EXCLUDED_DIRS = [
	'.agents/',
	'.git/',
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
	/^license-core-targets\.json(\.example)?$/,
	/^scripts\/check-fresh-release\.ts$/,
	/^scripts\/lib\/fresh-release\//,
	/^scripts\/test-fresh-release\.ts$/,
	/^smoke-cache\.json$/,
	/^sync\.ps1$/,
];

// Patterns excluded from DRIFT only (copied into apps, then diverge per-app): the license inventories
// are generated from each app's own dependency graph, and bun.lock resolves per-app.
const DRIFT_EXCLUDED_PATTERNS = [
	/^THIRD_PARTY_LICENSES\.md$/,
	/^THIRD_PARTY_NOTICES\.md$/,
	/\.lock$/,
];

/**
 * Map an app-relative path to the template path it should be compared against.
 *
 * spernakit is a PUBLISHED repo; a derived app is private and has no remote. Their ignore files and
 * hooks are therefore opposites, not copies:
 *   - spernakit's .gitignore hides .aidd/ wholesale; an app must TRACK its .aidd/ blueprint.
 *   - spernakit's pre-commit runs the leak-guard, which exists to stop THIS repo committing fleet
 *     codenames; in a private app that names itself it only ever fires as a false positive.
 * Comparing an app against spernakit's own copies asks it to adopt the wrong side of both. The
 * scaffolding/ tree holds the derived-app versions, and init.ps1 seeds from exactly there — so
 * drift must read from there too, or the copier and the checker disagree.
 */
export function toTemplatePath(appPath: string): string {
	if (appPath === '.gitignore' || appPath === '.prettierignore') return `scaffolding/${appPath}`;
	if (appPath.startsWith('.githooks/')) return `scaffolding/${appPath}`;
	return appPath;
}

/** True when the path is compared against a scaffolding/ counterpart rather than the template root. */
export function isScaffoldMapped(appPath: string): boolean {
	return toTemplatePath(appPath) !== appPath;
}

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
	// derived app never invokes them). Each backs a smoke step marked templateOnly. The leak-guard's
	// self-test tests a guard only this published repo has, and the fleet-manifest check reads a
	// registry only this repo keeps. Not every spernakit-authored script belongs here:
	// sync-license-core.ts ships deliberately, because an app having it is how a wrong-way run gets
	// refused rather than silently succeeding.
	if (filePath === 'scripts/check-leak-guard.sh') return true;
	if (filePath === 'scripts/check-fleet-manifest.ts') return true;

	// Drift-only directory exclusions (generated/app-specific content copied into apps but not
	// drift-checked).
	for (const dir of DRIFT_EXCLUDED_DIRS) {
		if (filePath.startsWith(dir)) return true;
	}
	// Drift-only file patterns (bun.lock and the generated license inventories are copied, then
	// diverge per-app).
	for (const pattern of DRIFT_EXCLUDED_PATTERNS) {
		if (pattern.test(filePath)) return true;
	}
	return false;
}

export function enumerateTemplateFiles(spernakitPath: string, version: string): string[] {
	const result = Bun.spawnSync(
		['git', '-C', spernakitPath, 'ls-tree', '--name-only', '-r', `v${version}`],
		{ stderr: 'pipe', stdout: 'pipe' }
	);

	if (result.exitCode !== 0) {
		console.log(`   Warning: git ls-tree failed for v${version}`);
		return [];
	}

	const allFiles = result.stdout.toString().trim().split('\n').filter(Boolean);
	const templateManaged = allFiles.filter((f) => !isFileExcluded(f));

	// Re-introduce the scaffold under the paths an app actually uses: scaffolding/.gitignore is the
	// app's .gitignore. Without this the app's ignore files and hooks would be template-managed by
	// nobody — invisible to drift, and free to rot.
	const scaffolded = allFiles
		.filter((f) => f.startsWith('scaffolding/'))
		.map((f) => f.slice('scaffolding/'.length))
		.filter((f) => f !== '');

	return [...new Set([...templateManaged, ...scaffolded])].sort();
}

/**
 * The app-relative files that constitute a freshly-initialized derived app, enumerated from the
 * template's WORKING TREE (git-tracked files). Mirrors enumerateTemplateFiles but uses the COPY
 * predicate (isInitExcluded) and `git ls-files` rather than the drift predicate and a tagged commit
 * — so init.ts copies exactly what the drift checker will later hold the app to, sourced from the
 * current checkout. Map each returned path back to its template source with toTemplatePath().
 */
export function enumerateInitFiles(sourcePath: string): string[] {
	const result = Bun.spawnSync(['git', '-C', sourcePath, 'ls-files'], {
		stderr: 'pipe',
		stdout: 'pipe',
	});
	if (result.exitCode !== 0) {
		throw new Error(`git ls-files failed in ${sourcePath}: ${result.stderr.toString().trim()}`);
	}

	const allFiles = result.stdout.toString().trim().split('\n').filter(Boolean);
	const appFiles = allFiles.filter((f) => !isInitExcluded(f));

	// Re-introduce the scaffold under the app paths it maps to (scaffolding/.gitignore → .gitignore),
	// matching enumerateTemplateFiles so the copier and the drift checker enumerate the same set.
	const scaffolded = allFiles
		.filter((f) => f.startsWith('scaffolding/'))
		.map((f) => f.slice('scaffolding/'.length))
		.filter((f) => f !== '');

	return [...new Set([...appFiles, ...scaffolded])].sort();
}

export function loadClassificationOverrides(
	spernakitPath: string,
	version: string
): { overrides: ClassificationOverrides; source: 'filesystem' | 'git' } | null {
	// Check filesystem first - prefer new format (has $comment) over git tag
	const fsPath = path.join(spernakitPath, 'scripts', 'template-manifest.json');
	try {
		const fsContent = fs.readFileSync(fsPath, 'utf8');
		const parsed = JSON.parse(fsContent) as Record<string, unknown>;
		// If filesystem has new format ($comment field), prefer it
		if ('$comment' in parsed) {
			return { overrides: parseOverrides(parsed), source: 'filesystem' };
		}
	} catch {
		// Fall through to git
	}

	// Fallback: load from git tag
	const gitContent = getTemplateFileAtVersion(
		spernakitPath,
		version,
		'scripts/template-manifest.json'
	);
	if (gitContent) {
		try {
			const parsed = JSON.parse(gitContent) as Record<string, unknown>;
			return { overrides: parseOverrides(parsed), source: 'git' };
		} catch {
			return null;
		}
	}

	return null;
}

/**
 * Security-critical template-managed files whose drift or removal must FAIL the
 * drift gate in derived apps (a gutted auth route cannot pass silently), rather
 * than being reported as advisory `infrastructure` warnings.
 *
 * This set is a property of the drift checker itself, deliberately not a key in
 * scripts/template-manifest.json. Keeping the list here lets the security gate
 * harden across all derived apps without reclassifying the template manifest.
 * Files here take precedence over their `infrastructure` listing in the manifest.
 */
const SECURITY_INFRASTRUCTURE_FILES: readonly string[] = [
	'backend/src/config/configSchemas/security.ts',
	'backend/src/create-api-app.ts',
	'backend/src/routes/auth/index.ts',
];

/**
 * Build a ClassificationOverrides from a parsed template-manifest.json. The
 * security-infrastructure set is injected from the checker's own constant
 * (see SECURITY_INFRASTRUCTURE_FILES) rather than read from the manifest.
 */
function parseOverrides(parsed: Record<string, unknown>): ClassificationOverrides {
	const asStringArray = (value: unknown): string[] =>
		Array.isArray(value) ? (value as string[]) : [];
	return {
		branded: asStringArray(parsed['branded']),
		infrastructure: asStringArray(parsed['infrastructure']),
		securityInfrastructure: [...SECURITY_INFRASTRUCTURE_FILES],
	};
}

export function classifyFile(filePath: string, overrides: ClassificationOverrides): DriftCategory {
	if (overrides.branded.includes(filePath)) return 'branded';
	// security-infrastructure takes precedence over infrastructure: these
	// security-critical files fail the drift gate in derived apps rather than
	// being reported as advisory warnings.
	if (overrides.securityInfrastructure.includes(filePath)) return 'security-infrastructure';
	if (overrides.infrastructure.includes(filePath)) return 'infrastructure';
	return 'pure';
}

export function loadAppBrandingValues(repoRoot: string): BrandingValues | null {
	try {
		const { appSlug, config } = loadJsonConfig(repoRoot);
		return {
			backendPort: String(config.server?.backendPort ?? '3331'),
			description: config.app?.description ?? '',
			frontendPort: String(config.server?.frontendPort ?? '3330'),
			name: config.app?.name ?? '',
			slug: appSlug,
		};
	} catch {
		return null;
	}
}
