import type { BrandingValues } from './types.ts';

/**
 * Per-file branding normalizers used by normalizeBranding in branding.ts.
 */
import { escapeRegex, normalizeLineEndings } from './text.ts';

export function normalizePackageJson(
	content: string,
	_values: BrandingValues,
	_isTemplate: boolean,
	_filePath: string
): string {
	try {
		const pkg = JSON.parse(content) as Record<string, unknown>;

		// Normalize branded fields to placeholders
		pkg['name'] = '{{SLUG}}';
		pkg['description'] = '{{DESCRIPTION}}';

		// Remove spernakit_version for comparison (only in derived apps, tracks template version)
		delete pkg['spernakit_version'];

		// Remove version for comparison (app version diverges from template)
		delete pkg['version'];

		// Remove GitHub metadata for comparison (may or may not be present after setup)
		delete pkg['bugs'];
		delete pkg['homepage'];
		delete pkg['repository'];

		return JSON.stringify(pkg, null, '\t');
	} catch {
		return content;
	}
}

export function normalizeDefaultsJson(
	content: string,
	_values: BrandingValues,
	_isTemplate: boolean
): string {
	try {
		const config = JSON.parse(content) as Record<string, unknown>;

		// Normalize app section
		if (config['app'] && typeof config['app'] === 'object') {
			const app = config['app'] as Record<string, unknown>;
			app['slug'] = '{{SLUG}}';
			app['name'] = '{{NAME}}';
			app['description'] = '{{DESCRIPTION}}';
		}

		// Normalize server section
		if (config['server'] && typeof config['server'] === 'object') {
			const server = config['server'] as Record<string, unknown>;
			server['frontendPort'] = '{{FRONTEND_PORT}}';
			server['backendPort'] = '{{BACKEND_PORT}}';
			server['frontendUrl'] = 'http://localhost:{{FRONTEND_PORT}}';
			server['backendUrl'] = 'http://localhost:{{BACKEND_PORT}}';
		}

		// Normalize security section (cookie names)
		if (config['security'] && typeof config['security'] === 'object') {
			const security = config['security'] as Record<string, unknown>;
			security['authCookieName'] = '{{SLUG}}_auth';
			security['csrfCookieName'] = '{{SLUG}}_csrf';
			security['refreshCookieName'] = '{{SLUG}}_refresh';
		}

		// Normalize cors section (dev origins use frontend port)
		if (config['cors'] && typeof config['cors'] === 'object') {
			const cors = config['cors'] as Record<string, unknown>;
			cors['frontendDevOrigins'] = ['http://localhost:{{FRONTEND_PORT}}'];
		}

		// Normalize database section
		if (config['database'] && typeof config['database'] === 'object') {
			const database = config['database'] as Record<string, unknown>;
			database['url'] = 'file:./data/{{SLUG}}.db';
		}

		return JSON.stringify(config, null, '\t');
	} catch {
		return content;
	}
}

export function normalizeReadme(
	content: string,
	values: BrandingValues,
	isTemplate: boolean
): string {
	let result = content;

	// Normalize heading
	if (isTemplate) {
		result = result.replace(/^# Spernakit v3/gm, '# {{NAME}}');
	} else {
		result = result.replace(new RegExp(`^# ${escapeRegex(values.name)}`, 'gm'), '# {{NAME}}');
	}

	// Normalize config file references - handle template placeholders, template slug, and app slug
	result = result.replace(/config\/\{appname\}\.json/g, 'config/{{SLUG}}.json');
	result = result.replace(/config\/spernakit\.json/g, 'config/{{SLUG}}.json');
	result = result.replace(
		new RegExp(`config\\/${escapeRegex(values.slug)}\\.json`, 'g'),
		'config/{{SLUG}}.json'
	);

	// Normalize directory references - handle both template slug and app slug
	result = result.replace(/spernakit\//g, '{{SLUG}}/');
	result = result.replace(new RegExp(`${escapeRegex(values.slug)}\\/`, 'g'), '{{SLUG}}/');

	// Normalize description line
	if (isTemplate) {
		result = result.replace(/Spernakit v3 is a/gm, '{{NAME}} is a');
	} else {
		result = result.replace(
			new RegExp(`${escapeRegex(values.name)} is a`, 'gm'),
			'{{NAME}} is a'
		);
	}

	// Normalize port references in README
	result = result.replace(
		new RegExp(`localhost:${escapeRegex(values.backendPort)}`, 'g'),
		'localhost:{{BACKEND_PORT}}'
	);
	result = result.replace(
		new RegExp(`localhost:${escapeRegex(values.frontendPort)}`, 'g'),
		'localhost:{{FRONTEND_PORT}}'
	);
	result = result.replace(
		new RegExp(`default: ${escapeRegex(values.backendPort)}`, 'g'),
		'default: {{BACKEND_PORT}}'
	);
	result = result.replace(
		new RegExp(`default: ${escapeRegex(values.frontendPort)}`, 'g'),
		'default: {{FRONTEND_PORT}}'
	);

	// Normalize sub-README heading variants (backend/README.md, frontend/README.md)
	if (isTemplate) {
		result = result.replace(/# Backend - Spernakit v3/g, '# Backend - {{NAME}}');
		result = result.replace(/# Frontend - Spernakit v3/g, '# Frontend - {{NAME}}');
		result = result.replace(
			/The Elysia-based REST API backend for Spernakit v3/g,
			'The Elysia-based REST API backend for {{NAME}}'
		);
		result = result.replace(
			/The React-based frontend application for Spernakit v3/g,
			'The React-based frontend application for {{NAME}}'
		);
	} else {
		result = result.replace(
			new RegExp(`# Backend - ${escapeRegex(values.name)}`, 'g'),
			'# Backend - {{NAME}}'
		);
		result = result.replace(
			new RegExp(`# Frontend - ${escapeRegex(values.name)}`, 'g'),
			'# Frontend - {{NAME}}'
		);
		result = result.replace(
			new RegExp(`The Elysia-based REST API backend for ${escapeRegex(values.name)}`, 'g'),
			'The Elysia-based REST API backend for {{NAME}}'
		);
		result = result.replace(
			new RegExp(`The React-based frontend application for ${escapeRegex(values.name)}`, 'g'),
			'The React-based frontend application for {{NAME}}'
		);
	}

	return result;
}

export function normalizeSettingsSmtp(
	content: string,
	values: BrandingValues,
	isTemplate: boolean
): string {
	if (isTemplate) {
		return content.replace(/Spernakit v3/g, '{{NAME}}');
	}
	return content.replace(new RegExp(escapeRegex(values.name), 'g'), '{{NAME}}');
}

export function normalizeIndexHtml(
	content: string,
	values: BrandingValues,
	isTemplate: boolean
): string {
	let result = normalizeLineEndings(content);

	// Collapse whitespace within HTML tags for consistent comparison
	// Template has multi-line formatting, derived apps may have single-line
	// Match content between < and > and normalize whitespace
	result = result.replace(/<([^>]+)>/g, (_match, inner) => {
		// Collapse multiple whitespace to single space
		return `<${inner.replace(/\s+/g, ' ').trim()}>`;
	});

	// Normalize keywords meta tag (app-specific content, not structural)
	result = result.replace(
		/<meta content="[^"]*" name="keywords" ?\/?>/g,
		'<meta content="{{KEYWORDS}}" name="keywords" />'
	);

	// Normalize meta description - template has "Spernakit v3 - Self-Hosted Multi-User Application Template"
	// and derived apps have "AppName - AppDescription" format
	result = result.replace(
		/Spernakit v3 - Self-Hosted Multi-User Application Template/g,
		'{{NAME}} - {{DESCRIPTION}}'
	);

	// Normalize og/twitter description - template has "Self-Hosted Multi-User Application Template"
	// (without prefix). This is different from meta description and gets replaced separately by
	// setup.ts
	result = result.replace(/Self-Hosted Multi-User Application Template/g, '{{DESCRIPTION}}');

	// Normalize author - template has "Spernakit", apps have app name
	result = result.replace(/"Spernakit"/g, '"{{NAME}}"');
	result = result.replace(new RegExp(`"${escapeRegex(values.name)}"`, 'g'), '"{{NAME}}"');

	// Normalize app name references
	if (isTemplate) {
		result = result.replace(/"Spernakit v3"/g, '"{{NAME}}"');
		result = result.replace(/>Spernakit v3</g, '>{{NAME}}<');
		result = result.replace(/Spernakit v3/g, '{{NAME}}');
	} else {
		result = result.replace(new RegExp(`"${escapeRegex(values.name)}"`, 'g'), '"{{NAME}}"');
		result = result.replace(new RegExp(`>${escapeRegex(values.name)}<`, 'g'), '>{{NAME}}<');
		result = result.replace(new RegExp(escapeRegex(values.name), 'g'), '{{NAME}}');
	}

	// Normalize description - both template's long description and app's short description
	result = result.replace(new RegExp(escapeRegex(values.description), 'g'), '{{DESCRIPTION}}');

	return result;
}
