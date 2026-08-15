import { type ColumnDef } from '@tanstack/react-table';
import { Circle, CircleCheck, MailOpen, Trash2 } from 'lucide-react';

import type { Notification } from '@/api/types';
import type { DataTableFeatures } from '@/components/shared/data-table/features';

import { createSelectColumn } from '@/components/shared/data-table/selectColumn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/hooks/useFormatters';

const typeBadgeVariant: Record<string, 'default' | 'destructive' | 'outline' | 'secondary'> = {
	error: 'destructive',
	info: 'default',
	marketing: 'outline',
	security: 'destructive',
	success: 'outline',
	system: 'secondary',
	warning: 'secondary',
};

interface NotificationColumnsProps {
	/** Prepend the row-selection column. Set this only when the table also passes
	 * onRowSelectionChange, so the checkboxes and the bulk delete button appear together. */
	enableSelection?: boolean;
	onDelete: (notification: Notification) => void;
	onMarkAsRead: (id: number) => void;
}

export function useNotificationColumns({
	enableSelection = false,
	onDelete,
	onMarkAsRead,
}: NotificationColumnsProps) {
	const { formatTimestamp } = useFormatters();

	const columns: ColumnDef<DataTableFeatures, Notification, unknown>[] = [
		...(enableSelection ? [createSelectColumn<Notification>()] : []),
		{
			accessorKey: 'readAt',
			cell: ({ row }) =>
				row.original.readAt ? (
					<CircleCheck className="size-4 text-muted-foreground" />
				) : (
					<Circle className="size-4 fill-current text-primary" />
				),
			/*
			 * An sr-only name rather than an empty string: the column had no name in the
			 * accessibility tree at all, so a screen reader announced the read/unread dot as a cell
			 * in an unnamed column. `enableHiding: false` keeps it out of the Columns menu, where it
			 * appeared as the raw field name `readAt` — a token printed nowhere else in the UI.
			 */
			enableHiding: false,
			/*
			 * Not sortable either, though the API would order by it. The header is a visually-hidden
			 * name in a 40px column, so the shared sort control would render here as a bare arrow with
			 * no label beside it — an affordance nobody can read. Read state is already a filter in
			 * the toolbar, which answers the same question and says what it is answering.
			 */
			enableSorting: false,
			header: () => <span className="sr-only">Read status</span>,
			size: 40,
		},
		{
			accessorKey: 'type',
			cell: ({ row }) => (
				<Badge variant={typeBadgeVariant[row.original.type] ?? 'outline'}>
					{row.original.type}
				</Badge>
			),
			header: 'Type',
			size: 100,
		},
		{
			accessorKey: 'title',
			cell: ({ row }) => (
				<span className={row.original.readAt ? 'text-muted-foreground' : 'font-medium'}>
					{row.original.title}
				</span>
			),
			header: 'Title',
		},
		{
			accessorKey: 'message',
			/*
			 * No `max-w-xs`. The cap held the message to 320px however wide its cell grew, so at
			 * 1920 it clamped inside a 409px track and truncated text there was room to show.
			 * `line-clamp-1` still keeps every row one line tall.
			 */
			cell: ({ row }) => (
				<span className="line-clamp-1 text-muted-foreground">{row.original.message}</span>
			),
			// The API deliberately refuses to order by this one — see NOTIFICATION_SORT_COLUMNS — so
			// the header must not offer it. A control that sorts by the fallback column while its
			// arrow claims Message is worse than no control.
			enableSorting: false,
			header: 'Message',
		},
		{
			accessorKey: 'createdAt',
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{formatTimestamp(row.original.createdAt)}
				</span>
			),
			header: 'Time',
			size: 100,
		},
		{
			cell: ({ row }) => (
				<div className="flex items-center gap-1">
					{!row.original.readAt && (
						<Button
							aria-label="Mark as read"
							onClick={() => onMarkAsRead(row.original.id)}
							size="icon"
							title="Mark as read"
							variant="ghost">
							<MailOpen className="size-4" />
						</Button>
					)}
					<Button
						aria-label="Delete notification"
						onClick={() => onDelete(row.original)}
						size="icon"
						title="Delete"
						variant="ghost">
						<Trash2 className="size-4" />
					</Button>
				</div>
			),
			/* Control column, not data: hiding it would remove the row's buttons with nothing in the
			 * menu to say what had been switched off. */
			enableHiding: false,
			header: () => <span className="sr-only">Actions</span>,
			id: 'actions',
			size: 80,
		},
	];

	return columns;
}
