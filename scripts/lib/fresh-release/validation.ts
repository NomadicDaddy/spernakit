export const FRESH_RELEASE_VERSION = '3.28.2';

export interface FreshReleaseFile {
	path: string;
	text: string;
}

export interface FreshReleaseSnapshot {
	files: FreshReleaseFile[];
	packageVersion: string;
}

const RETIRED_PATHS = [
	/^docs\/template\/CHANGELOG-v\d+\.md$/,
	/^docs\/template\/MIGRATION_[^/]+\.md$/,
	/^docs\/template\/WHY_V\d+\.md$/,
	/^docs\/template\/adr\/adr-010-v38-lts\.md$/,
];

const RELEASE_SURFACES = new Set([
	'.github/workflows/release.yml',
	'docs/template/CHANGELOG.md',
	'docs/testing/OAUTH-TEST-PLAN.md',
	'scripts/release-notes.ts',
	'spernakit.psd1.example',
]);

const HISTORICAL_NARRATIVE = [
	/\bclean[- ]history\b/i,
	/\bre[- ]release\b/i,
	/\bold repositor(?:y|ies)\b/i,
	/\bprevious public release\b/i,
	/\bpostmortem\b/i,
];

function compareVersions(left: string, right: string): number {
	const leftParts = left.split('.').map(Number);
	const rightParts = right.split('.').map(Number);
	for (let index = 0; index < 3; index += 1) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

function olderVersionReferences(file: FreshReleaseFile): string[] {
	const references = new Set<string>();
	const contextualPatterns = [
		/\bSpernakit\s+v?(\d+\.\d+\.\d+)\b/gi,
		/\bspernakit_version\b[^\r\n]{0,80}?(\d+\.\d+\.\d+)\b/gi,
	];
	if (RELEASE_SURFACES.has(file.path)) {
		contextualPatterns.push(
			/\b(?:tag|release|previous|compare|commits)[^\r\n]{0,80}?\bv(\d+\.\d+\.\d+)\b/gi
		);
	}

	for (const pattern of contextualPatterns) {
		for (const match of file.text.matchAll(pattern)) {
			const version = match[1];
			if (version && compareVersions(version, FRESH_RELEASE_VERSION) < 0) {
				references.add(version);
			}
		}
	}
	return [...references].sort();
}

function changelogIssues(text: string): string[] {
	const headings = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)](?:\s+-\s+.+)?$/gm)].map(
		(match) => match[1]
	);
	if (headings.length !== 1 || headings[0] !== FRESH_RELEASE_VERSION) {
		return [
			`docs/template/CHANGELOG.md must contain only the ${FRESH_RELEASE_VERSION} ` +
				`release heading; found ${headings.length === 0 ? 'none' : headings.join(', ')}`,
		];
	}
	return [];
}

export function validateFreshRelease(snapshot: FreshReleaseSnapshot): string[] {
	const issues: string[] = [];
	if (snapshot.packageVersion !== FRESH_RELEASE_VERSION) {
		issues.push(
			`package.json version must be ${FRESH_RELEASE_VERSION}; found ${snapshot.packageVersion}`
		);
	}

	const paths = new Set(snapshot.files.map((file) => file.path));
	for (const path of paths) {
		if (RETIRED_PATHS.some((pattern) => pattern.test(path))) {
			issues.push(`${path}: retired release-history artifact is still tracked`);
		}
	}

	const changelog = snapshot.files.find((file) => file.path === 'docs/template/CHANGELOG.md');
	if (!changelog) {
		issues.push('docs/template/CHANGELOG.md is missing');
	} else {
		issues.push(...changelogIssues(changelog.text));
	}

	for (const file of snapshot.files) {
		if (file.path === 'README.md' && /\bAIDD\b/.test(file.text)) {
			issues.push('README.md: visible aidd branding must use lowercase');
		}
		const olderVersions = olderVersionReferences(file);
		if (olderVersions.length > 0) {
			issues.push(
				`${file.path}: older Spernakit release reference(s): ${olderVersions.join(', ')}`
			);
		}
		for (const pattern of HISTORICAL_NARRATIVE) {
			if (pattern.test(file.text)) {
				issues.push(
					`${file.path}: fresh-release historical narrative matches ${pattern.source}`
				);
			}
		}
	}

	return issues.sort();
}
