import type { Static, TObject } from '@sinclair/typebox';

import { FormatRegistry } from '@sinclair/typebox/type';
import { Value } from '@sinclair/typebox/value';

/**
 * Register the string formats that the config schemas rely on.
 *
 * TypeBox ships no format validators of its own (it is not ajv), so a `format:
 * 'uri'` / `'email'` annotation validates nothing until a checker is registered
 * for it — an unregistered format silently passes. `uri` is checked with the
 * WHATWG URL parser; `email` with a permissive mailbox shape check.
 *
 * Runs at module load, and is idempotent, so every `safeParse` below sees the
 * formats regardless of import order.
 */
function registerFormats(): void {
	if (!FormatRegistry.Has('uri')) {
		FormatRegistry.Set('uri', (value) => {
			try {
				new URL(String(value));
				return true;
			} catch {
				return false;
			}
		});
	}
	if (!FormatRegistry.Has('email')) {
		FormatRegistry.Set('email', (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)));
	}
}

registerFormats();

interface SchemaIssue {
	message: string;
	path: (number | string)[];
}

type SafeParseResult<T> =
	| { readonly data: T; readonly success: true }
	| { readonly error: { readonly issues: SchemaIssue[] }; readonly success: false };

/**
 * Parse a value against a TypeBox schema, returning either the parsed data or a
 * list of issues rather than throwing.
 *
 * The three steps are ordered, not interchangeable: apply defaults
 * (`Value.Default`) must precede validation or every defaulted-but-omitted field
 * reports as missing; strip unknown keys (`Value.Clean`) keeps stray keys in a
 * config file from reaching the typed `AppConfig`; then validate
 * (`Value.Errors`).
 *
 * Issues are deduplicated by JSON-pointer path because TypeBox emits both a
 * "required property" and a "type" error for a single missing field, which would
 * otherwise double-count one problem in the validation reports.
 *
 * A failing schema's `description` is appended to its message. TypeBox reports
 * only the mechanical cause ("Expected string to match pattern ^https?://..."),
 * which tells an operator what the regex is but not what it wants; the
 * description is where a schema states that in prose.
 */
function safeParse<T extends TObject>(schema: T, value: unknown): SafeParseResult<Static<T>> {
	const defaulted = Value.Default(schema, value);
	const cleaned = Value.Clean(schema, defaulted);
	const seen = new Set<string>();
	const issues: SchemaIssue[] = [];
	for (const error of Value.Errors(schema, cleaned)) {
		if (seen.has(error.path)) continue;
		seen.add(error.path);
		const description = (error.schema as { description?: string }).description;
		issues.push({
			message: description ? `${error.message} - ${description}` : error.message,
			path:
				error.path === ''
					? []
					: error.path
							.split('/')
							.filter((segment) => segment !== '')
							.map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)),
		});
	}
	if (issues.length > 0) {
		return { error: { issues }, success: false };
	}
	return { data: cleaned as Static<T>, success: true };
}

/**
 * Binds a schema to `safeParse`, so a schema can be exported as a ready-to-call
 * validator (`appConfigSchema.safeParse(raw)`) rather than making every caller
 * pass the schema back in. `.schema` exposes the underlying TypeBox object for
 * callers that need the JSON Schema itself.
 */
class SchemaValidator<T extends TObject> {
	readonly schema: T;

	constructor(schema: T) {
		this.schema = schema;
	}

	safeParse(value: unknown): SafeParseResult<Static<T>> {
		return safeParse(this.schema, value);
	}
}

export { SchemaValidator, safeParse };
export type { SafeParseResult, SchemaIssue };
