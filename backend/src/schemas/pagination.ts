import { t } from 'elysia';

import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../constants/pagination.ts';

/*
 * Pagination query parameters are integers, not arbitrary numbers. t.Numeric accepts a fractional
 * string like "1.5" and hands the route a float, which reaches paginatedQuery and produces a
 * fractional SQL OFFSET. t.Integer coerces the same query strings, applies the same defaults, and
 * rejects the fraction at the edge with a 422 naming the parameter.
 */

/** Page number query parameter. Pass a default only when the route documents something other than 1. */
function pageParam(defaultPage: number = DEFAULT_PAGE) {
	return t.Optional(t.Integer({ default: defaultPage, minimum: 1 }));
}

/**
 * Page size query parameter. The advertised maximum is the enforced maximum: a route that declares
 * a ceiling above what its service clamps to promises a page size it will never return.
 */
function limitParam(options: { default?: number; maximum?: number } = {}) {
	return t.Optional(
		t.Integer({
			default: options.default ?? DEFAULT_PAGE_LIMIT,
			maximum: options.maximum ?? MAX_PAGE_LIMIT,
			minimum: 1,
		}),
	);
}

export { limitParam, pageParam };
