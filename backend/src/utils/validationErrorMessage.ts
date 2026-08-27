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
 * Build a development-only description of a validation failure.
 *
 * Deliberately does NOT use `error.message`. Elysia serialises the whole
 * submitted payload into that string as a `found` object, so returning it to
 * the client echoes the request body back to whoever sent it: posting to
 * /auth/login returns the caller's plaintext password verbatim, and an
 * unauthorized caller gets a 400 describing their own payload because Elysia
 * validates the body before `beforeHandle` runs the role guard.
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
			const path =
				typeof entry.path === 'string' && entry.path.length > 0 ? entry.path : '(root)';
			const summary = entry.summary ?? entry.message;
			const described =
				typeof summary === 'string' ? (summary.split(SUBMITTED_VALUE_MARKER)[0] ?? '') : '';
			return described.length > 0 ? `${path}: ${described}` : path;
		})
		.filter((line, index, lines) => lines.indexOf(line) === index);
	if (details.length === 0) return `Validation failed on ${error.type}`;
	return `Validation failed on ${error.type} - ${details.join('; ')}`;
}

export { describeValidationError };
