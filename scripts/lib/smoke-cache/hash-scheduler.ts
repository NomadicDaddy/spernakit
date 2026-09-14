import { type HashContext } from './types.ts';

const MAX_HASH_CONCURRENCY = 8;

function scheduleHash(context: HashContext, task: () => Promise<string>): Promise<string> {
	return new Promise((resolve, reject) => {
		const run = (): void => {
			context.activeHashes++;
			if (context.diagnostics) {
				context.diagnostics.peakHashConcurrency = Math.max(
					context.diagnostics.peakHashConcurrency,
					context.activeHashes,
				);
			}
			void task()
				.then(resolve, reject)
				.finally(() => {
					context.activeHashes--;
					context.hashQueue.shift()?.();
				});
		};
		if (context.activeHashes < MAX_HASH_CONCURRENCY) run();
		else context.hashQueue.push(run);
	});
}

export { MAX_HASH_CONCURRENCY, scheduleHash };
