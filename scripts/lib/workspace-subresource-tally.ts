/**
 * The workspace sub-resource gate's tally of claims that did not hold.
 *
 * It lives in its own module so the claims that send requests and the one that reads source write
 * into the same list. Every claim is checked even after an earlier one fails, so one run reports
 * everything that is wrong rather than the first thing.
 */
const failures: string[] = [];

/**
 * Record a claim that did not hold.
 *
 * @param condition - What the claim says. A false value is recorded and the run carries on.
 * @param message - What the reader is told when it does not hold.
 */
export function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/**
 * Everything the run found wrong.
 *
 * @returns The recorded messages, empty when every claim held.
 */
export function failedClaims(): string[] {
	return failures;
}
