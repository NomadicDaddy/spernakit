/**
 * Bundle size budget: provenance-checked read, evaluation, and regeneration.
 *
 * The budget is per-app generated state rather than template content, so `scripts/bundle-budget.json`
 * is excluded from template drift (see scripts/lib/template/classify.ts) and an app can record its
 * own numbers without carrying permanent drift. The cost of that freedom is that a freshly
 * scaffolded app starts out holding the TEMPLATE's numbers, and nothing would otherwise say so — it
 * would be measured against a bundle it does not build. The recorded `appSlug` closes that gap: a
 * budget whose slug is absent or belongs to another app is not this app's budget, so the check is
 * skipped and the operator is told to regenerate, rather than being handed a verdict derived from
 * the wrong bundle.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface BundleBudget {
	appSlug: string;
	maxCssBytes: number;
	maxJsBytes: number;
}

export interface BudgetLine {
	color: 'cyan' | 'green' | 'red' | 'yellow';
	text: string;
}

export interface BudgetResult {
	lines: BudgetLine[];
	ok: boolean;
}

export interface BudgetInput {
	/** Slug of the app whose build output was just measured. */
	appSlug: string;
	budgetPath: string;
	totalCssBytes: number;
	totalJsBytes: number;
}

/** Headroom applied when writing a new budget so hash/chunk churn doesn't flap the gate. */
export const BUDGET_HEADROOM = 1.1;

const BUDGET_LABEL = 'scripts/bundle-budget.json';
const REGENERATE_COMMAND = 'bun scripts/verify-minification.ts --update-budget';

export function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(2)} KB`;
}

/**
 * Record the measured totals as this app's budget, stamped with the app it was measured from.
 *
 * @param input - Measured totals, the destination path, and the owning app slug.
 * @returns The lines to report and an always-ok verdict.
 */
export function writeBundleBudget(input: BudgetInput): BudgetResult {
	const budget: BundleBudget = {
		appSlug: input.appSlug,
		maxCssBytes: Math.ceil(input.totalCssBytes * BUDGET_HEADROOM),
		maxJsBytes: Math.ceil(input.totalJsBytes * BUDGET_HEADROOM),
	};
	writeFileSync(input.budgetPath, `${JSON.stringify(budget, null, '\t')}\n`, 'utf-8');
	return {
		lines: [
			{
				color: 'cyan',
				text: `\nBudget for '${input.appSlug}' written to ${BUDGET_LABEL} (${BUDGET_HEADROOM}x headroom)`,
			},
		],
		ok: true,
	};
}

/** A skip result carrying the reason the recorded budget cannot be attributed to this app. */
function skipForProvenance(recorded: string | undefined, appSlug: string): BudgetResult {
	const reason =
		recorded === undefined || recorded === ''
			? `${BUDGET_LABEL} records no appSlug, so it cannot be attributed to '${appSlug}'`
			: `${BUDGET_LABEL} was generated for '${recorded}', not '${appSlug}'`;
	return {
		lines: [
			{ color: 'yellow', text: `\n${reason} — budget check skipped.` },
			{ color: 'yellow', text: `Measure this app's own bundle: ${REGENERATE_COMMAND}` },
		],
		ok: true,
	};
}

/** Compare the measured totals against a budget this app owns. */
function compare(input: BudgetInput, budget: BundleBudget): BudgetResult {
	const lines: BudgetLine[] = [];
	let ok = true;

	if (input.totalJsBytes > budget.maxJsBytes) {
		lines.push({
			color: 'red',
			text: `✗ JS bundle ${kb(input.totalJsBytes)} exceeds budget ${kb(budget.maxJsBytes)}`,
		});
		ok = false;
	} else {
		lines.push({
			color: 'green',
			text: `✓ JS bundle ${kb(input.totalJsBytes)} within budget ${kb(budget.maxJsBytes)}`,
		});
	}

	if (input.totalCssBytes > budget.maxCssBytes) {
		lines.push({
			color: 'red',
			text: `✗ CSS bundle ${kb(input.totalCssBytes)} exceeds budget ${kb(budget.maxCssBytes)}`,
		});
		ok = false;
	} else {
		lines.push({
			color: 'green',
			text: `✓ CSS bundle ${kb(input.totalCssBytes)} within budget ${kb(budget.maxCssBytes)}`,
		});
	}

	if (!ok) {
		lines.push({
			color: 'yellow',
			text: `If the growth is intentional, regenerate: ${REGENERATE_COMMAND}`,
		});
	}
	return { lines, ok };
}

/**
 * Judge the measured totals against the recorded budget, but only when that budget belongs to this
 * app. A missing budget file, and a budget stamped for another app (or for none), both skip the
 * comparison and instruct the operator to regenerate.
 *
 * @param input - Measured totals, the budget path, and the app slug the totals were measured from.
 * @returns The lines to report and whether the build stays within its own budget.
 */
export function evaluateBundleBudget(input: BudgetInput): BudgetResult {
	if (!existsSync(input.budgetPath)) {
		return {
			lines: [
				{ color: 'yellow', text: `\nNo ${BUDGET_LABEL} found — budget check skipped.` },
				{ color: 'yellow', text: `Create one with: ${REGENERATE_COMMAND}` },
			],
			ok: true,
		};
	}

	const parsed = JSON.parse(readFileSync(input.budgetPath, 'utf-8')) as Partial<BundleBudget>;
	if (typeof parsed.maxCssBytes !== 'number' || typeof parsed.maxJsBytes !== 'number') {
		return {
			lines: [
				{
					color: 'red',
					text: `\n✗ ${BUDGET_LABEL} has no maxCssBytes/maxJsBytes to check.`,
				},
				{ color: 'yellow', text: `Regenerate it: ${REGENERATE_COMMAND}` },
			],
			ok: false,
		};
	}

	const recorded = typeof parsed.appSlug === 'string' ? parsed.appSlug : undefined;
	if (recorded !== input.appSlug) return skipForProvenance(recorded, input.appSlug);

	return compare(input, {
		appSlug: recorded,
		maxCssBytes: parsed.maxCssBytes,
		maxJsBytes: parsed.maxJsBytes,
	});
}
