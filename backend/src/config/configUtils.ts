import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the project root (three levels up from backend/src/config/). */
const projectRoot = resolve(join(__dirname, '..', '..', '..'));

/**
 * Type guard to check if a value is a plain object (not null, not array, typeof object).
 * Used by deepMerge to determine when recursive merging should occur.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep merge two objects. Source values override target values.
 * Arrays are replaced, not merged.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
	const result = { ...target };

	for (const key of Object.keys(source) as (keyof T)[]) {
		if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
		const sourceValue = source[key];
		const targetValue = target[key];

		if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
			result[key] = deepMerge(
				targetValue as Record<string, unknown>,
				sourceValue as Partial<Record<string, unknown>>
			) as T[keyof T];
		} else if (sourceValue !== undefined) {
			result[key] = sourceValue as T[keyof T];
		}
	}

	return result;
}

/**
 * Ensure the frontend URL is included in the CORS dev origins.
 *
 * Also handles the production-mode `cors.inheritFrontendUrl` opt-in: when set
 * and `cors.allowedOrigins` is empty, append server.frontendUrl so staging
 * configs can run with NODE_ENV=production + trustProxy without duplicating
 * the host into allowedOrigins. Real production should set allowedOrigins
 * explicitly and leave inheritFrontendUrl off.
 */
function ensureFrontendOrigin(configData: Record<string, unknown>): void {
	const server = configData['server'] as Record<string, unknown> | undefined;
	const cors = configData['cors'] as Record<string, unknown> | undefined;
	if (!server || !cors) return;

	const frontendUrl = server['frontendUrl'];
	const devOrigins = cors['frontendDevOrigins'];
	const nodeEnv = server['nodeEnv'];
	if (
		nodeEnv !== 'production' &&
		typeof frontendUrl === 'string' &&
		frontendUrl &&
		Array.isArray(devOrigins) &&
		!devOrigins.includes(frontendUrl)
	) {
		devOrigins.push(frontendUrl);
	}

	const allowedOrigins = cors['allowedOrigins'];
	if (
		cors['inheritFrontendUrl'] === true &&
		typeof frontendUrl === 'string' &&
		frontendUrl &&
		Array.isArray(allowedOrigins) &&
		allowedOrigins.length === 0
	) {
		allowedOrigins.push(frontendUrl);
	}
}

/**
 * Load and parse defaults.json from the backend config directory.
 */
function loadDefaults(): Record<string, unknown> {
	const defaultsPath = join(__dirname, 'defaults.json');
	if (!existsSync(defaultsPath)) {
		throw new Error(`defaults.json not found at ${defaultsPath}`);
	}
	try {
		return JSON.parse(readFileSync(defaultsPath, 'utf8')) as Record<string, unknown>;
	} catch (err) {
		throw new Error(
			`Failed to parse defaults.json at ${defaultsPath}: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err }
		);
	}
}

/**
 * Determine the app slug from defaults.json.
 */
function getAppSlug(defaults: Record<string, unknown>): string {
	const app = defaults['app'];
	if (app && typeof app === 'object' && 'slug' in app) {
		const slug = (app as Record<string, unknown>)['slug'];
		if (typeof slug === 'string') {
			return slug;
		}
	}
	throw new Error('Unable to determine app slug from defaults.json');
}

export { deepMerge, ensureFrontendOrigin, getAppSlug, isPlainObject, loadDefaults, projectRoot };
