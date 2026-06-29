/**
 * Per-file drift comparison for the template drift/sync tooling.
 */
import { normalizeBranding } from './branding.ts';
import { getTemplateFileAtVersion, readLocalFile } from './repo.ts';
import { normalizeLineEndings } from './text.ts';
import {
	TEMPLATE_BRANDING,
	type BrandingValues,
	type DriftCategory,
	type FileResult,
} from './types.ts';

export function checkFile(
	spernakitPath: string,
	version: string,
	filePath: string,
	category: DriftCategory,
	appBranding: BrandingValues | null,
	repoRoot: string
): FileResult {
	const templateContent = getTemplateFileAtVersion(spernakitPath, version, filePath);
	const localContent = readLocalFile(repoRoot, filePath);

	if (!templateContent) {
		return { category, filePath, status: 'missing-in-template' };
	}

	if (!localContent) {
		return { category, filePath, status: 'missing-in-app' };
	}

	if (category === 'branded' && appBranding) {
		const normalizedTemplate = normalizeBranding(templateContent, TEMPLATE_BRANDING, filePath);
		const normalizedLocal = normalizeBranding(localContent, appBranding, filePath);
		return {
			category,
			filePath,
			status: normalizedTemplate === normalizedLocal ? 'identical' : 'drifted',
		};
	}

	// Pure and infrastructure: direct content comparison after line ending normalization
	const normalizedTemplate = normalizeLineEndings(templateContent);
	const normalizedLocal = normalizeLineEndings(localContent);

	return {
		category,
		filePath,
		status: normalizedTemplate === normalizedLocal ? 'identical' : 'drifted',
	};
}
