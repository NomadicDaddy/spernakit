/**
 * Assertion bookkeeping for the shared-core self-tests, and the count they report.
 *
 * The count is the point rather than decoration. This suite exists because a writer never seen
 * writing and never seen refusing is a vacuous gate, and a suite that quietly stopped running half
 * its assertions would be the same defect one level up. A run that prints a smaller number than the
 * last one is visible in a way a silently skipped block is not.
 */
let assertions = 0;
const failures: string[] = [];

export function check(label: string, condition: boolean): void {
	assertions += 1;
	if (!condition) failures.push(label);
}

export function equal(label: string, actual: unknown, expected: unknown): void {
	assertions += 1;
	if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
}

/** Prints the verdict and returns the process exit code. */
export function verdict(name: string): number {
	if (failures.length > 0) {
		console.error(`${name} FAILED (${failures.length} of ${assertions}):`);
		for (const failure of failures) console.error(`  - ${failure}`);
		return 1;
	}
	console.log(`${name} passed (${assertions} assertions).`);
	return 0;
}
