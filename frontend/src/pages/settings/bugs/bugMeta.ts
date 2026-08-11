import { BUG_REPORT_STATUSES } from 'spernakit-shared';

import type { BugReport } from '@/api/types';

/**
 * How a bug report's two enums are labelled and coloured, and how a loose string is narrowed back
 * into either union. It is a module of its own because both the table and its filter row need the
 * same labels, and `BugsTab` is at the file-size cap without carrying them.
 */

/**
 * Status is state, so it uses the semantic ramp — and Kind below uses the neutral one. The two
 * columns previously both resolved to `destructive`, so a row could show red twice for two
 * unrelated reasons and neither told you anything the label did not.
 */
const STATUS_VARIANT: Record<BugReport['status'], 'outline' | 'secondary' | 'success' | 'warning'> =
	{
		closed: 'outline',
		in_progress: 'warning',
		open: 'secondary',
		resolved: 'success',
	};

const STATUS_LABEL: Record<BugReport['status'], string> = {
	closed: 'Closed',
	in_progress: 'In Progress',
	open: 'Open',
	resolved: 'Resolved',
};

/** Kind is identity — what the report *is*, not how it is going. Neutral both ways. */
const KIND_VARIANT: Record<BugReport['kind'], 'outline' | 'secondary'> = {
	bug: 'secondary',
	feature: 'outline',
};

const KIND_LABEL: Record<BugReport['kind'], string> = {
	bug: 'Bug',
	feature: 'Feature',
};

const KINDS: BugReport['kind'][] = ['bug', 'feature'];

/** Narrow the plain string a Select hands back to the shared status union. */
function isBugStatus(value: string): value is BugReport['status'] {
	return BUG_REPORT_STATUSES.some((status) => status === value);
}

/** Narrow a URL value to the kind union, so a hand-edited query string cannot reach the API. */
function isBugKind(value: string): value is BugReport['kind'] {
	return value === 'bug' || value === 'feature';
}

export { isBugKind, isBugStatus, KIND_LABEL, KIND_VARIANT, KINDS, STATUS_LABEL, STATUS_VARIANT };
