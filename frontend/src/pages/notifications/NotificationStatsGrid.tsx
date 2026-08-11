import { Inbox, Mail } from 'lucide-react';

import type { NotificationStatistics } from '@/api/types';

import { StatCard } from '@/components/shared/charts/StatCard';
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton';

/**
 * Two numbers, rendered with the shared `StatCard`.
 *
 * This was eight bespoke tiles — Total, Unread and six per-type counts — in a `lg:grid-cols-8` row
 * that cost 126px of vertical band to deliver eight integers. Three problems compounded: the tiles
 * were a local Card composition rather than the `StatCard` every other KPI row in the app uses, so
 * the same idea rendered at a different size and rhythm here; the per-type tiles restated the
 * options in the type filter directly below them, without being clickable and without a System
 * tile, so they were redundant *and* incomplete; and eight columns at `lg` meant ~85px tiles at
 * 1024, where the untruncated labels painted straight through the card borders.
 *
 * The per-type counts were not dropped — they moved into the type filter's own option labels, where
 * they are exhaustive by construction (the list is built from `NOTIFICATION_TYPES`) and where the
 * number is next to the control it would make you press. What is left here is the two figures an
 * operator acts on.
 */
function NotificationStatsGrid({ stats }: { stats: NotificationStatistics | undefined }) {
	if (!stats) {
		return (
			<div className="grid gap-4 sm:grid-cols-2">
				<StatCardSkeleton />
				<StatCardSkeleton />
			</div>
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<StatCard
				icon={<Mail aria-hidden="true" className="size-5 text-muted-foreground" />}
				title="Unread"
				value={stats.unread}
			/>
			<StatCard
				icon={<Inbox aria-hidden="true" className="size-5 text-muted-foreground" />}
				title="Total"
				value={stats.total}
			/>
		</div>
	);
}

export { NotificationStatsGrid };
