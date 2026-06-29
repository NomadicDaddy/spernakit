/**
 * Delay execution for the specified duration.
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run async operations with bounded concurrency and return settled results.
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Maximum number of concurrent operations (default: 5)
 * @returns Array of settled results matching Promise.allSettled format
 */
async function mapWithConcurrency<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	concurrency = 5
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = [];
	for (let i = 0; i < items.length; i += concurrency) {
		const batch = items.slice(i, i + concurrency);
		const batchResults = await Promise.allSettled(batch.map(fn));
		results.push(...batchResults);
	}
	return results;
}

export { mapWithConcurrency, sleep };
