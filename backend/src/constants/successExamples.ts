/**
 * Shared OpenAPI success examples for Swagger documentation.
 *
 * Split from `responseExamples.ts`, which had grown past the 300-line modularity gate holding both
 * halves of the same idea. The error examples there are values; these are helpers that wrap a
 * caller's own value in the response envelope, so they change for different reasons. Routes still
 * import them from `responseExamples.ts`, which re-exports everything here.
 */

interface DataExampleObject<T> {
	summary: string;
	value: { data: T };
}

interface PaginatedExampleObject<T> {
	summary: string;
	value: { data: T[]; limit: number; page: number; total: number };
}

/**
 * Wraps a value in the standard { data: T } response envelope.
 * @param summary
 * @param value
 * @returns OpenAPI ExampleObject with data envelope
 */
function dataExample<T>(summary: string, value: T): DataExampleObject<T> {
	return {
		summary,
		value: { data: value },
	};
}

/** Mutation success example — { data: null }. */
const SUCCESS_EXAMPLE = {
	summary: 'Operation succeeded',
	value: { data: null },
};

/**
 * Builds a paginated response example.
 * @param summary
 * @param items
 * @param total
 * @param page
 * @param limit
 * @returns OpenAPI ExampleObject with paginated data envelope
 */
function paginatedExample<T>(
	summary: string,
	items: T[],
	total: number,
	page = 1,
	limit = 20,
): PaginatedExampleObject<T> {
	return {
		summary,
		value: { data: items, limit, page, total },
	};
}

export { dataExample, paginatedExample, SUCCESS_EXAMPLE };
