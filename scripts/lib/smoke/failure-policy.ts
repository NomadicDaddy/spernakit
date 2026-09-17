/**
 * Decide whether a smoke run should continue after a failed step.
 *
 * Full QC is order-independent and reports every failure. Fast QC is the deliberately ordered
 * pre-commit subset, so it stops at the first actionable failure like lifecycle smoke modes do.
 */
export function shouldAggregateFailures(mode: string, fast: boolean): boolean {
	return mode === 'qc' && !fast;
}
