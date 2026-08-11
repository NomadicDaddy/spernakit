import { NOTIFICATION_TYPES } from 'spernakit-shared';

import type { ReadFilter } from '@/hooks/notifications/useNotifications';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

interface NotificationFiltersProps {
	onReadFilterChange: (filter: ReadFilter) => void;
	onTypeFilterChange: (filter: string) => void;
	readFilter: ReadFilter;
	/** Per-type totals, shown beside each option. Omitted while the statistics are loading. */
	typeCounts?: Record<string, number> | undefined;
	typeFilter: string;
}

export function NotificationFilters({
	onReadFilterChange,
	onTypeFilterChange,
	readFilter,
	typeCounts,
	typeFilter,
}: NotificationFiltersProps) {
	return (
		/*
		 * No local `gap-4`. These sit inside the shared table toolbar, which spaces every other
		 * control in the row at `gap-2`, so a wider gap here put the filter pair on a rhythm of its
		 * own next to the Columns button it shares a line with.
		 */
		<div className="flex items-center gap-2">
			<Select
				onValueChange={(v) => {
					onReadFilterChange(v as ReadFilter);
				}}
				value={readFilter}>
				<SelectTrigger aria-label="Filter by read status" className="w-36">
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					{/* "All statuses", not "All". Unlabelled and first in the toolbar, a bare "All"
					    does not say what it is all of — and the type filter beside it and the role
					    filter on /settings/users both already name their dimension. */}
					<SelectItem value="all">All statuses</SelectItem>
					<SelectItem value="unread">Unread</SelectItem>
					<SelectItem value="read">Read</SelectItem>
				</SelectContent>
			</Select>

			<Select
				onValueChange={(v) => {
					onTypeFilterChange(v);
				}}
				value={typeFilter}>
				<SelectTrigger aria-label="Filter by notification type" className="w-44">
					<SelectValue placeholder="Type" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All types</SelectItem>
					{NOTIFICATION_TYPES.map((t) => (
						<SelectItem key={t} value={t}>
							{t.charAt(0).toUpperCase() + t.slice(1)}
							{typeCounts ? ` (${String(typeCounts[t] ?? 0)})` : ''}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
