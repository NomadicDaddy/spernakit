import { ValidationError } from 'elysia';

/**
 * Where the one Elysia summary that quotes the client's own value starts quoting it.
 *
 * `mapValueError` writes "Expected property 'x' to be string but found: <value>" for a type
 * mismatch, and value-free text for every other case it maps. Cutting at this marker leaves the
 * half the caller does not already have — what the schema wanted — and drops the half it sent.
 */
const SUBMITTED_VALUE_MARKER = ' but found: ';

/**
 * Where Elysia's union summary stops describing the property and starts listing what it accepts.
 *
 * Elysia builds that list from each member's JSON Schema `type`, so a union of string literals
 * reads "should be one of: 'string', 'string', 'string'" and the only thing it tells the caller is
 * how many values there are. Everything up to this marker is kept; the list after it is rebuilt.
 */
const UNION_MEMBER_MARKER = ' should be one of: ';

/**
 * Name each member of a union schema.
 *
 * A member with a `const` is a literal and is named by its value, which is written in the route's
 * own schema and is not something the caller sent. A member without one is named by its type, which
 * is what Elysia already does and is the right answer for a union like string | number | null.
 *
 * @param schema - The schema the failing entry carries.
 * @returns One name per member, or null when the schema is not a union this can describe.
 */
function unionMemberNames(schema: unknown): null | string[] {
	if (typeof schema !== 'object' || schema === null || !('anyOf' in schema)) return null;

	const members = (schema as { anyOf: unknown }).anyOf;
	if (!Array.isArray(members) || members.length === 0) return null;

	const names: string[] = [];
	for (const member of members) {
		if (typeof member !== 'object' || member === null) return null;
		if ('const' in member) {
			const literal = (member as { const: unknown }).const;
			names.push(typeof literal === 'string' ? `'${literal}'` : JSON.stringify(literal));
			continue;
		}
		const memberType = (member as { type?: unknown }).type;
		if (typeof memberType !== 'string') return null;
		names.push(`'${memberType}'`);
	}
	return names;
}

/**
 * Replace Elysia's list of union member types with the values the union actually accepts.
 *
 * @param summary - The summary Elysia wrote for the failing entry.
 * @param schema - The schema that entry carries.
 * @returns The same sentence, listing values rather than repeated type names.
 */
function withUnionValues(summary: string, schema: unknown): string {
	const marker = summary.indexOf(UNION_MEMBER_MARKER);
	if (marker < 0) return summary;

	const names = unionMemberNames(schema);
	if (names === null) return summary;

	return `${summary.slice(0, marker + UNION_MEMBER_MARKER.length)}${names.join(', ')}`;
}

/**
 * Build a development-only description of a validation failure.
 *
 * Deliberately does NOT use `error.message`. Elysia serialises the whole
 * submitted payload into that string as a `found` object, so returning it to
 * the client echoes the request body back to whoever sent it: posting to
 * /auth/login returns the caller's plaintext password verbatim, and an
 * unauthorized caller gets a 400 describing their own payload because Elysia
 * validates the body before `beforeHandle` runs the role guard.
 *
 * A range violation carries no property path. Elysia reports it through the
 * `property` branch with an empty `path`, and the parameter name appears on no
 * field of the ValidationError, so the constraint is reported on its own rather
 * than under a made-up `(root)` label that named the wrong thing. Type
 * violations still arrive through the `query` branch with a real path.
 *
 * A union reports the values it accepts. Elysia writes that list from each member's JSON Schema
 * `type`, so a union of string literals came out as "should be one of: 'string', 'string',
 * 'string'" and told the caller only how many values there were. The list is rebuilt from the
 * members' `const` values, which come from the route's own schema and not from the request.
 *
 * Only the failing property paths and the schema's expectation are reported.
 * The submitted values (`error.value`, and `value` on each entry of
 * `error.all`) are never read, and the one summary Elysia builds that quotes
 * a value back is trimmed below.
 *
 * @param error - The validation error raised by Elysia
 * @returns A message naming what failed, with no submitted values in it
 */
function describeValidationError(error: unknown): string {
	if (!(error instanceof ValidationError)) return 'Validation failed';
	const details = error.all
		.map((entry) => {
			const path = typeof entry.path === 'string' ? entry.path : '';
			const summary = entry.summary ?? entry.message;
			const trimmed =
				typeof summary === 'string' ? (summary.split(SUBMITTED_VALUE_MARKER)[0] ?? '') : '';
			const described = withUnionValues(trimmed, entry.schema);
			if (path.length === 0) return described;
			return described.length > 0 ? `${path}: ${described}` : path;
		})
		.filter((line) => line.length > 0)
		.filter((line, index, lines) => lines.indexOf(line) === index);
	if (details.length === 0) return `Validation failed on ${error.type}`;
	return `Validation failed on ${error.type} - ${details.join('; ')}`;
}

export { describeValidationError };
