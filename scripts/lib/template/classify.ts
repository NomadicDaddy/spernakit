/**
 * File enumeration and classification for the template drift/sync tooling.
 *
 * The exclusion lists these functions enumerate against live in `exclusions.ts`; they are data with
 * a long comment per entry, and holding them here left no room for the logic beside them.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { BrandingValues, ClassificationOverrides, DriftCategory } from './types.ts';

import { loadJsonConfig } from '../../load-json-config.ts';
import { isFileExcluded, isInitExcluded } from './exclusions.ts';
import { getTemplateFileAtVersion } from './repo.ts';
import { SECURITY_INFRASTRUCTURE_FILES } from './security.ts';

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

export function enumerateTemplateFiles(spernakitPath: string, version: string): string[] {
	const result = Bun.spawnSync(
		['git', '-C', spernakitPath, 'ls-tree', '--name-only', '-r', `v${version}`],
		{ stderr: 'pipe', stdout: 'pipe', windowsHide: true },
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
		windowsHide: true,
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
	version: string,
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
		'scripts/template-manifest.json',
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
 * Build a ClassificationOverrides from a parsed template-manifest.json. The
 * security-infrastructure set is injected from the checker's own constant
 * (see SECURITY_INFRASTRUCTURE_FILES in ./security.ts) rather than read from the manifest.
 */
function parseOverrides(parsed: Record<string, unknown>): ClassificationOverrides {
	const asStringArray = (value: unknown): string[] =>
		Array.isArray(value) ? (value as string[]) : [];
	return {
		branded: asStringArray(parsed['branded']),
		buildCriticalBranded: asStringArray(parsed['buildCriticalBranded']),
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
