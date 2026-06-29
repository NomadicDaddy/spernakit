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
	typeFilter: string;
}

export function NotificationFilters({
	onReadFilterChange,
	onTypeFilterChange,
	readFilter,
	typeFilter,
}: NotificationFiltersProps) {
	return (
		<div className="flex items-center gap-4">
			<Select
				onValueChange={(v) => {
					onReadFilterChange(v as ReadFilter);
				}}
				value={readFilter}>
				<SelectTrigger aria-label="Filter by read status" className="w-36">
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All</SelectItem>
					<SelectItem value="unread">Unread</SelectItem>
					<SelectItem value="read">Read</SelectItem>
				</SelectContent>
			</Select>

			<Select
				onValueChange={(v) => {
					onTypeFilterChange(v);
				}}
				value={typeFilter}>
				<SelectTrigger aria-label="Filter by notification type" className="w-36">
					<SelectValue placeholder="Type" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All types</SelectItem>
					{NOTIFICATION_TYPES.map((t) => (
						<SelectItem key={t} value={t}>
							{t.charAt(0).toUpperCase() + t.slice(1)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
