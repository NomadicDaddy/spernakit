#!/usr/bin/env bun
/**
 * Shared utilities for template drift detection and upgrade scripts.
 *
 * Extracted from check-template-drift.ts so both the drift checker and
 * upgrade script can reuse the same classification, normalization, and
 * comparison logic without duplication.
 *
 * This module is a facade: the implementation lives in scripts/lib/template/.
 * The export surface is intentionally unchanged so existing importers
 * (check-template-drift.ts, template-sync-plan.ts, external sync scripts)
 * keep working without modification.
 */
export { normalizeBranding } from './lib/template/branding.ts';
export {
	classifyFile,
	enumerateTemplateFiles,
	isFileExcluded,
	loadAppBrandingValues,
	loadClassificationOverrides,
} from './lib/template/classify.ts';
export { checkFile } from './lib/template/drift.ts';
export { applyTemplateOverrides, loadTemplateOverrides } from './lib/template/overrides.ts';
export {
	getTemplateFileAtVersion,
	gitTagExists,
	isSpernakitItself,
	readLocalFile,
	readSpernakitVersion,
	resolveSpernakitPath,
} from './lib/template/repo.ts';
export { printReport } from './lib/template/report.ts';
export { escapeRegex, normalizeLineEndings } from './lib/template/text.ts';
export {
	TEMPLATE_BRANDING,
	type BrandingValues,
	type ClassificationOverrides,
	type DriftCategory,
	type FileResult,
	type TemplateOverrideAction,
	type TemplateOverrides,
} from './lib/template/types.ts';
