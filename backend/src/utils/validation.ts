import type { ZodType } from 'zod';

import { ZodError } from 'zod';

import { logger } from './logger.ts';

/**
 * Validate an ISO 8601 date string.
 *
 * @param value - Date string to validate
 * @returns True if valid date string
 */
function isValidDateString(value: string): boolean {
	const date = new Date(value);
	return !isNaN(date.getTime());
}

/**
 * Parse and validate a numeric ID from a route parameter.
 * Returns the parsed integer if valid, or null if invalid.
 *
 * @param value - Raw parameter string
 * @returns Parsed positive integer or null
 */
function parseId(value: string | undefined): null | number {
	if (!value) return null;
	const num = Number(value);
	if (!Number.isInteger(num) || num < 1) return null;
	return num;
}

/**
 * Parse and validate a workspace ID from a route parameter.
 *
 * @param value - Raw parameter string
 * @returns Parsed workspace ID or null
 */
function parseWorkspaceId(value: string | undefined): null | number {
	return parseId(value);
}

/**
 * Parse JSON from database settings with Zod schema validation.
 * Falls back to defaults on parse failure or validation errors.
 * Logs validation failures for debugging.
 *
 * @param value - Raw JSON string from database (may be null/undefined)
 * @param schema - Zod schema to validate the parsed result
 * @param defaults - Default values to merge with parsed result and return on failure
 * @param context - Description for logging (e.g., "auth security settings")
 * @returns Validated settings merged with defaults
 */
function parseSettingsJson<T>(
	value: null | string,
	schema: ZodType,
	defaults: T,
	context: string
): T {
	if (!value) {
		return { ...defaults } as T;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		logger.warn(`Failed to parse JSON for ${context}, using defaults`);
		return { ...defaults } as T;
	}

	const result = schema.safeParse(parsed);
	if (!result.success) {
		const issues =
			result.error instanceof ZodError
				? result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
				: 'unknown validation error';
		logger.warn(`Validation failed for ${context}: ${issues}, using defaults`);
		return { ...defaults } as T;
	}

	const validated = result.data as Record<string, unknown>;
	return { ...defaults, ...validated } as T;
}

export { isValidDateString, parseSettingsJson, parseWorkspaceId };
