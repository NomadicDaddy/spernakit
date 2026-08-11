/**
 * The analytics time ranges, named once.
 *
 * The page's range Select and the KPI tiles both have to say what window they are talking about,
 * and the sweep found they did not agree: the Select offered "Last 30 days" while the tiles said
 * nothing at all, so a row that mixed range-scoped metrics with fixed-window ones (DAU, MAU) read
 * as four tiles under one selector. One vocabulary, used in both places.
 */
interface AnalyticsRange {
	days: number;
	/** The Select option label — "Last 30 days". */
	label: string;
	/** Sentence-case phrase for a tile subtitle — "the last 30 days". */
	phrase: string;
}

const ANALYTICS_RANGES: AnalyticsRange[] = [
	{ days: 7, label: 'Last 7 days', phrase: 'Last 7 days' },
	{ days: 30, label: 'Last 30 days', phrase: 'Last 30 days' },
	{ days: 90, label: 'Last 90 days', phrase: 'Last 90 days' },
	{ days: 365, label: 'Last year', phrase: 'Last year' },
];

const DEFAULT_ANALYTICS_DAYS = 30;

/** The label for a day count, falling back to a plain phrasing for a value not in the list. */
function getRangeLabel(days: number): string {
	return ANALYTICS_RANGES.find((r) => r.days === days)?.phrase ?? `Last ${String(days)} days`;
}

export { ANALYTICS_RANGES, DEFAULT_ANALYTICS_DAYS, getRangeLabel };
export type { AnalyticsRange };
