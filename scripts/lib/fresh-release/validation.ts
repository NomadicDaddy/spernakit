/**
 * The public baseline: the first release published from this repository. It is a floor, not a
 * pin. Releases at or above it are expected; anything below it belongs to history that this
 * repository deliberately does not carry, so referencing it is a contract violation.
 */
export const FRESH_RELEASE_VERSION = '3.29.0';

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
			/\b(?:tag|release|previous|compare|commits)[^\r\n]{0,80}?\bv(\d+\.\d+\.\d+)\b/gi,
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

function changelogIssues(text: string, packageVersion: string): string[] {
	const issues: string[] = [];
	const headings = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)](?:\s+-\s+.+)?$/gm)].map(
		(match) => match[1] ?? '',
	);
	if (headings.length === 0) {
		return ['docs/template/CHANGELOG.md has no release heading'];
	}

	const predating = headings.filter(
		(version) => compareVersions(version, FRESH_RELEASE_VERSION) < 0,
	);
	if (predating.length > 0) {
		issues.push(
			`docs/template/CHANGELOG.md: release heading(s) predating the ` +
				`${FRESH_RELEASE_VERSION} public baseline: ${predating.join(', ')}`,
		);
	}
	if (!headings.includes(FRESH_RELEASE_VERSION)) {
		issues.push(
			`docs/template/CHANGELOG.md must retain the ${FRESH_RELEASE_VERSION} baseline heading`,
		);
	}
	if (headings[0] !== packageVersion) {
		issues.push(
			`docs/template/CHANGELOG.md must lead with the ${packageVersion} heading; ` +
				`found ${headings[0]}`,
		);
	}
	// Descending order with no repeats: the leading heading is the release being cut, and
	// release-notes.ts reads an entry by slicing to the next heading, so a stray duplicate or
	// out-of-order entry silently truncates published notes.
	if (
		headings.some(
			(version, index) =>
				index > 0 && compareVersions(headings[index - 1] ?? '', version) <= 0,
		)
	) {
		issues.push(
			'docs/template/CHANGELOG.md release headings must be newest first, with no duplicates',
		);
	}
	return issues;
}

export function validateFreshRelease(snapshot: FreshReleaseSnapshot): string[] {
	const issues: string[] = [];
	if (!/^\d+\.\d+\.\d+$/.test(snapshot.packageVersion)) {
		issues.push(
			`package.json version must be a three-part version; ` +
				`found ${snapshot.packageVersion || '(none)'}`,
		);
	} else if (compareVersions(snapshot.packageVersion, FRESH_RELEASE_VERSION) < 0) {
		issues.push(
			`package.json version must be at least the ${FRESH_RELEASE_VERSION} public baseline; ` +
				`found ${snapshot.packageVersion}`,
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
		issues.push(...changelogIssues(changelog.text, snapshot.packageVersion));
	}

	for (const file of snapshot.files) {
		if (file.path === 'README.md' && /\bAIDD\b/.test(file.text)) {
			issues.push('README.md: visible aidd branding must use lowercase');
		}
		const olderVersions = olderVersionReferences(file);
		if (olderVersions.length > 0) {
			issues.push(
				`${file.path}: older Spernakit release reference(s): ${olderVersions.join(', ')}`,
			);
		}
		for (const pattern of HISTORICAL_NARRATIVE) {
			if (pattern.test(file.text)) {
				issues.push(
					`${file.path}: fresh-release historical narrative matches ${pattern.source}`,
				);
			}
		}
	}

	return issues.sort();
}
