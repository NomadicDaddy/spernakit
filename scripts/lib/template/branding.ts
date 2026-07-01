import type { BrandingValues } from './types.ts';

/**
 * Branding normalization dispatcher for the template drift/sync tooling.
 *
 * Routes branded files to their structured normalizers and applies the
 * default text-based normalization (docker files, etc.) otherwise.
 */
import {
	normalizeDefaultsJson,
	normalizeIndexHtml,
	normalizePackageJson,
	normalizeReadme,
	normalizeSettingsSmtp,
} from './branding-normalizers.ts';
import { escapeRegex, normalizeLineEndings } from './text.ts';

export function normalizeBranding(
	content: string,
	values: BrandingValues,
	filePath: string
): string {
	const isTemplate = values.slug === 'spernakit';

	// Handle JSON files with structured normalization
	if (
		filePath === 'package.json' ||
		filePath === 'backend/package.json' ||
		filePath === 'frontend/package.json'
	) {
		return normalizePackageJson(content, values, isTemplate, filePath);
	}

	if (filePath === 'backend/src/config/defaults.json') {
		return normalizeDefaultsJson(content, values, isTemplate);
	}

	// Handle README
	if (
		filePath === 'README.md' ||
		filePath === 'backend/README.md' ||
		filePath === 'frontend/README.md'
	) {
		return normalizeReadme(content, values, isTemplate);
	}

	// Handle health test (slug assertion)
	if (filePath === 'backend/src/test/health.test.ts') {
		return normalizeLineEndings(content).replace(
			new RegExp(`\\.toBe\\('${escapeRegex(values.slug)}'\\)`, 'g'),
			".toBe('{{SLUG}}')"
		);
	}

	// Handle settings-smtp.ts
	if (filePath === 'backend/src/routes/settings-smtp.ts') {
		return normalizeSettingsSmtp(content, values, isTemplate);
	}

	// Handle index.html with specific patterns
	if (filePath === 'frontend/index.html') {
		return normalizeIndexHtml(content, values, isTemplate);
	}

	// Default text-based normalization for docker files
	let result = normalizeLineEndings(content);

	// Replace specific values with placeholders (longer/more specific patterns first)
	result = result.replace(new RegExp(escapeRegex(values.description), 'g'), '{{DESCRIPTION}}');

	// Slug replacements BEFORE generic name — when name === slug, generic name replacement
	// would consume slug values in slug-specific contexts (service names, container names)
	result = result.replace(
		new RegExp(`container_name: ${escapeRegex(values.slug)}`, 'g'),
		'container_name: {{SLUG}}'
	);
	result = result.replace(
		new RegExp(`APP_SLUG:-${escapeRegex(values.slug)}`, 'g'),
		'APP_SLUG:-{{SLUG}}'
	);
	result = result.replace(new RegExp(`^(\\s+)${escapeRegex(values.slug)}:`, 'gm'), '$1{{SLUG}}:');

	// Generic name replacement (after slug-specific patterns to avoid overlap)
	result = result.replace(new RegExp(escapeRegex(values.name), 'g'), '{{NAME}}');

	// Port replacements — only in known contexts to avoid false positives
	result = result.replace(
		new RegExp(`EXPOSE ${escapeRegex(values.frontendPort)}`, 'g'),
		'EXPOSE {{FRONTEND_PORT}}'
	);
	result = result.replace(
		new RegExp(`localhost:${escapeRegex(values.frontendPort)}`, 'g'),
		'localhost:{{FRONTEND_PORT}}'
	);
	// Docker port mapping: 127.0.0.1:HOST_PORT:CONTAINER_PORT (must come before simpler pattern)
	result = result.replace(
		new RegExp(
			`127\\.0\\.0\\.1:${escapeRegex(values.frontendPort)}:${escapeRegex(values.frontendPort)}`,
			'g'
		),
		'127.0.0.1:{{FRONTEND_PORT}}:{{FRONTEND_PORT}}'
	);
	result = result.replace(
		new RegExp(`127\\.0\\.0\\.1:${escapeRegex(values.frontendPort)}`, 'g'),
		'127.0.0.1:{{FRONTEND_PORT}}'
	);
	result = result.replace(
		new RegExp(
			`'${escapeRegex(values.frontendPort)}:${escapeRegex(values.frontendPort)}'`,
			'g'
		),
		"'{{FRONTEND_PORT}}:{{FRONTEND_PORT}}'"
	);
	result = result.replace(
		new RegExp(`FRONTEND_PORT[=:-]+${escapeRegex(values.frontendPort)}`, 'g'),
		(match) => match.replace(values.frontendPort, '{{FRONTEND_PORT}}')
	);
	result = result.replace(
		new RegExp(`BACKEND_PORT[=:-]+${escapeRegex(values.backendPort)}`, 'g'),
		(match) => match.replace(values.backendPort, '{{BACKEND_PORT}}')
	);
	// Port in Dockerfile comment: "falls back to NNNN" pattern
	result = result.replace(
		new RegExp(`falls back to ${escapeRegex(values.frontendPort)}`, 'g'),
		'falls back to {{FRONTEND_PORT}}'
	);

	return result;
}
