import { Inbox, Mail } from 'lucide-react';

import type { NotificationStatistics } from '@/api/types';

import { StatCard } from '@/components/shared/charts/StatCard';
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton';

/**
 * The wide step every other KPI row in the app has and this one did not.
 *
 * Stopping at `sm:grid-cols-2` meant two tiles split the whole canvas between them: 728px wide at
 * 2560, twice the width of the tiles on /dashboard and /analytics, to carry a label and a single
 * integer. Inside each one the value sat at the far left with ~690px of empty card to its right and
 * the icon that annotates the label 609px away from it — the card's own composition pulled apart by
 * width it had no content for. Two tracks left unfilled at the end of a row is ordinary page
 * whitespace; 690px of it inside a card is a broken card.
 *
 * `xl:grid-cols-4`, matching DashboardStatsSection, rather than the `xl:grid-cols-3` of
 * MetricsSummary — 4 puts these tiles at the same width as the KPI band on /analytics, which is the
 * row this one most resembles: a small fixed set of totals above a table.
 */
const STATS_GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4';

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
			<div className={STATS_GRID}>
				<StatCardSkeleton />
				<StatCardSkeleton />
			</div>
		);
	}

	return (
		<div className={STATS_GRID}>
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
