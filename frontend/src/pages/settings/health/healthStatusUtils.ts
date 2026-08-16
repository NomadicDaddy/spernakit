import type { VariantProps } from 'class-variance-authority';

import type { badgeVariants } from '@/components/ui/badge';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/**
 * Health status maps onto the shared Badge state variants rather than raw palette utilities, so
 * "healthy" here is the same green as "completed" on /settings/scheduled-tasks and the same green
 * the glyph inside the badge inherits.
 */
export function statusBadgeVariant(status: string): BadgeVariant {
	if (status === 'healthy') return 'success';
	if (status === 'degraded') return 'warning';
	return 'destructive';
}

/**
 * One order for the four checks, everywhere they are listed.
 *
 * The surface lists them twice within a single screen and used to list them differently each time:
 * the Enabled Checks toggles read Database, Disk, Memory, Filesystem, and the check cards read
 * whatever order the API returned them in — Database, Memory, Filesystem, Disk. Both are visible
 * together, so an operator matching a toggle to its result had to re-find each name rather than
 * read across. Both lists sort against this array now, and because the check cards use the same
 * four-across grid the toggles do, they line up column for column.
 */
export const CHECK_ORDER = ['database', 'disk', 'memory', 'filesystem'] as const;

/** Position in {@link CHECK_ORDER}; unknown check types sort to the end in API order. */
export function checkOrderIndex(checkType: string): number {
	const idx = CHECK_ORDER.indexOf(checkType as (typeof CHECK_ORDER)[number]);
	return idx === -1 ? CHECK_ORDER.length : idx;
}
