/**
 * The self-test's assertion counter.
 *
 * It lives in its own module so both the driver and `expectations.ts` increment the same total. A
 * count printed on success is the only thing that distinguishes "71 assertions passed" from a run
 * that silently skipped its way to the end.
 */
let checks = 0;

export function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

export function assertionCount(): number {
	return checks;
}
