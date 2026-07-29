/**
 * Per-file drift comparison for the template drift/sync tooling.
 */
import { normalizeBranding } from './branding.ts';
import { isScaffoldMapped, toTemplatePath } from './classify.ts';
import { getTemplateFileAtVersion, readLocalFile } from './repo.ts';
import { findRemovedLines, normalizeLineEndings } from './text.ts';
import {
	type BrandingValues,
	type DriftCategory,
	type FileResult,
	TEMPLATE_BRANDING,
} from './types.ts';

export function checkFile(
	spernakitPath: string,
	version: string,
	filePath: string,
	category: DriftCategory,
	appBranding: BrandingValues | null,
	repoRoot: string,
	buildCritical = false,
): FileResult {
	const classifyResult = (result: FileResult): FileResult =>
		buildCritical ? { ...result, severity: 'build-critical' } : result;
	// An app's ignore files and hooks are compared against scaffolding/, not against spernakit's own
	// copies — those are the published-repo versions and are deliberately the opposite of an app's.
	const templateContent = getTemplateFileAtVersion(
		spernakitPath,
		version,
		toTemplatePath(filePath),
	);
	const localContent = readLocalFile(repoRoot, filePath);

	if (!templateContent) {
		// Versions before the scaffold existed have nothing to compare against. Reporting
		// 'missing-in-template' would invite someone to "fix" it by copying spernakit's own
		// .gitignore into the app — the exact propagation this mapping exists to stop. Treat the
		// file as app-owned until the app is on a version that ships the scaffold.
		if (isScaffoldMapped(filePath)) {
			return classifyResult({ category, filePath, status: 'identical' });
		}
		return classifyResult({ category, filePath, status: 'missing-in-template' });
	}

	if (!localContent) {
		return classifyResult({ category, filePath, status: 'missing-in-app' });
	}

	if (category === 'branded' && appBranding) {
		const normalizedTemplate = normalizeBranding(templateContent, TEMPLATE_BRANDING, filePath);
		const normalizedLocal = normalizeBranding(localContent, appBranding, filePath);
		const status = normalizedTemplate === normalizedLocal ? 'identical' : 'drifted';
		const structuralMissingLines =
			buildCritical && status === 'drifted'
				? findRemovedLines(normalizedTemplate, normalizedLocal)
				: [];
		return classifyResult({
			category,
			filePath,
			...(structuralMissingLines.length > 0 ? { structuralMissingLines } : {}),
			status,
		});
	}

	// Pure and infrastructure: direct content comparison after line ending normalization
	const normalizedTemplate = normalizeLineEndings(templateContent);
	const normalizedLocal = normalizeLineEndings(localContent);

	const status = normalizedTemplate === normalizedLocal ? 'identical' : 'drifted';
	const structuralMissingLines =
		buildCritical && status === 'drifted'
			? findRemovedLines(normalizedTemplate, normalizedLocal)
			: [];
	return classifyResult({
		category,
		filePath,
		...(structuralMissingLines.length > 0 ? { structuralMissingLines } : {}),
		status,
	});
}
