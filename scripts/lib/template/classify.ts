/**
 * File exclusion, enumeration, and classification for the template drift/sync tooling.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { BrandingValues, ClassificationOverrides, DriftCategory } from './types.ts';

import { loadJsonConfig } from '../../load-json-config.ts';
import { getTemplateFileAtVersion } from './repo.ts';

// Directories to exclude from drift checking (must match init.ps1 + drift-specific)
// From init.ps1:
const INIT_EXCLUDED_DIRS = [
	'.git/',
	'.aidd/',
	'.claude/',
	'.windsurf/',
	'data/',
	'internal/',
	'logs/',
	'node_modules/',
	'dist/',
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

const EXCLUDED_DIRS = [...INIT_EXCLUDED_DIRS, ...DRIFT_EXCLUDED_DIRS];

// File patterns to exclude from drift checking (must match init.ps1)
const EXCLUDED_PATTERNS = [
	/\.db$/,
	/\.db-journal$/,
	/\.db-wal$/,
	/\.lock$/,
	/\.lockb$/,
	/^changes\.ps1$/,
	/^init\.ps1$/,
	/^reset\.ps1$/,
	/^run\.ps1$/,
	/^spernakit\.psd1$/,
	/^spernakit\.json$/,
	/^smoke-cache\.json$/,
	/^sync\.ps1$/,
];

export function isFileExcluded(filePath: string): boolean {
	// docs/template/ is template-managed and must NOT be excluded even though docs/ is
	if (filePath.startsWith('docs/template/')) return false;

	// Check directory exclusions
	for (const dir of EXCLUDED_DIRS) {
		if (filePath.startsWith(dir)) return true;
	}
	// Check file pattern exclusions
	for (const pattern of EXCLUDED_PATTERNS) {
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
	return allFiles.filter((f) => !isFileExcluded(f));
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
 * This set is a property of the drift checker itself — deliberately NOT a key in
 * scripts/template-manifest.json, which is a frozen LTS public surface. Keeping
 * the list here lets the security gate harden across all derived apps without
 * mutating (and thus breaking) the LTS-baselined manifest. Files here take
 * precedence over their `infrastructure` listing in the manifest.
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
