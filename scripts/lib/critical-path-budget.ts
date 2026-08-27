/**
 * Critical-path size budget: evaluation and regeneration of BOTH recorded limits.
 *
 * `scripts/critical-path-budget.json` records two independent ceilings — brotli bytes across every
 * render-blocking asset, and gzip bytes across the blocking JavaScript alone. Both are measured
 * from a build, so the file is per-app generated state rather than template content and is excluded
 * from template drift (see scripts/lib/template/classify.ts) while staying in the init copy set.
 *
 * Regeneration writes both limits. It previously wrote only the brotli one and carried the gzip
 * ceiling forward from whatever was already on disk, which made the gzip leg unregenerable in
 * practice: an app whose critical path is legitimately larger than the template's had no way to
 * record its own gzip number, and `--update-budget` silently handed it back the template's. A
 * budget that cannot be regenerated is not a budget, it is a constant.
 *
 * Unlike scripts/bundle-budget.json this file carries no appSlug provenance stamp, and that is
 * deliberate. The bundle budget caps TOTAL build size, which scales with how much an app has been
 * built on top of the template, so the template's number says nothing about a derived app and
 * enforcing it would be a verdict from the wrong bundle. The critical path is dominated by the
 * shared framework runtime every derived app inherits unchanged, so the template's number is a
 * usable starting ceiling for an app that has never regenerated.
 *
 * A starting ceiling is not a permanent one, and for a long time nothing told the two apart. The
 * template's own recorded gzip limit sits about a kilobyte above the template's own measurement,
 * so a derived app that inherited it was graded against a line leaving it almost no room to add
 * code. scripts/init.ts now regenerates the budget from the new app's first build, so an app is
 * measured against its own number from its first commit onward.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface CriticalPathBudget {
	maxCriticalPathBrotliBytes: number;
	maxCriticalPathGzipJsBytes: number;
}

export interface BudgetLine {
	color: 'cyan' | 'green' | 'red' | 'yellow';
	text: string;
}

export interface BudgetResult {
	lines: BudgetLine[];
	ok: boolean;
}

export interface CriticalPathInput {
	budgetPath: string;
	/** Brotli bytes across every render-blocking asset (JS, CSS, and anything preloaded). */
	totalBrotliBytes: number;
	/** Gzip bytes across the render-blocking JavaScript only. */
	totalGzipJsBytes: number;
}

/**
 * Slack added to BOTH limits when writing a new budget, so hash and chunk churn between two
 * builds of the same source does not flap the gate.
 *
 * This is a flat byte pad rather than a percentage because churn is a byte-count phenomenon: two
 * builds of one unchanged tree differ by tens of bytes as content hashes reshuffle inside the
 * import graph. A percentage instead scales with the shared framework runtime, which is the part
 * that does not churn. Ten percent of a 170 KB critical path granted about 17 KB of slack for a
 * job that needs a few hundred bytes, and a ceiling carrying that much room stops ratcheting.
 */
export const BUDGET_PAD_BYTES = 2048;

const BUDGET_LABEL = 'scripts/critical-path-budget.json';
const REGENERATE_COMMAND = 'bun scripts/check-critical-path.ts --update-budget';

export function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(2)} KB`;
}

/**
 * Record the measured totals as this app's critical-path budget. Both limits are recalculated from
 * the measurement; neither is carried over from the file being replaced.
 *
 * @param input - Measured totals and the destination path.
 * @returns The lines to report and an always-ok verdict.
 */
export function writeCriticalPathBudget(input: CriticalPathInput): BudgetResult {
	const budget: CriticalPathBudget = {
		maxCriticalPathBrotliBytes: input.totalBrotliBytes + BUDGET_PAD_BYTES,
		maxCriticalPathGzipJsBytes: input.totalGzipJsBytes + BUDGET_PAD_BYTES,
	};
	writeFileSync(input.budgetPath, `${JSON.stringify(budget, null, '\t')}\n`, 'utf-8');
	return {
		lines: [
			{
				color: 'cyan',
				text:
					`\nBudget written to ${BUDGET_LABEL} with a ${kb(BUDGET_PAD_BYTES)} churn pad: ` +
					`${kb(budget.maxCriticalPathBrotliBytes)} brotli critical path ` +
					`(measured ${kb(input.totalBrotliBytes)}), ` +
					`${kb(budget.maxCriticalPathGzipJsBytes)} gzip JS ` +
					`(measured ${kb(input.totalGzipJsBytes)})`,
			},
		],
		ok: true,
	};
}

/** Compare one measured total against its recorded limit, naming both values either way. */
function compareLimit(label: string, measured: number, limit: number): BudgetLine {
	return measured <= limit
		? { color: 'green', text: `✓ ${label} ${kb(measured)} within budget ${kb(limit)}` }
		: { color: 'red', text: `✗ ${label} ${kb(measured)} exceeds budget ${kb(limit)}` };
}

/**
 * Judge the measured totals against the recorded budget. A missing budget file skips the check and
 * says how to create one; a budget missing either limit fails rather than passing vacuously.
 *
 * @param input - Measured totals and the budget path.
 * @returns The lines to report and whether both legs stay within their recorded limits.
 */
export function evaluateCriticalPathBudget(input: CriticalPathInput): BudgetResult {
	if (!existsSync(input.budgetPath)) {
		return {
			lines: [
				{ color: 'yellow', text: `\nNo ${BUDGET_LABEL} found — budget check skipped.` },
				{ color: 'yellow', text: `Create one with: ${REGENERATE_COMMAND}` },
			],
			ok: true,
		};
	}

	const parsed = JSON.parse(
		readFileSync(input.budgetPath, 'utf-8'),
	) as Partial<CriticalPathBudget>;
	if (
		typeof parsed.maxCriticalPathBrotliBytes !== 'number' ||
		typeof parsed.maxCriticalPathGzipJsBytes !== 'number'
	) {
		// Both limits are regenerated together, so a file holding only one predates that and cannot
		// be completed by guessing the other. Fail loudly instead of enforcing half a budget.
		return {
			lines: [
				{
					color: 'red',
					text: `\n✗ ${BUDGET_LABEL} is missing maxCriticalPathBrotliBytes or maxCriticalPathGzipJsBytes.`,
				},
				{ color: 'yellow', text: `Regenerate it: ${REGENERATE_COMMAND}` },
			],
			ok: false,
		};
	}

	const lines = [
		compareLimit('Critical path', input.totalBrotliBytes, parsed.maxCriticalPathBrotliBytes),
		compareLimit(
			'Critical-path JS gzip',
			input.totalGzipJsBytes,
			parsed.maxCriticalPathGzipJsBytes,
		),
	];
	const ok = lines.every((line) => line.color === 'green');
	if (!ok) {
		lines.push({
			color: 'yellow',
			text: `If the growth is intentional, regenerate: ${REGENERATE_COMMAND}`,
		});
	}
	return { lines, ok };
}
