import { type ColumnDef } from '@tanstack/react-table';
import { Circle, CircleCheck, MailOpen, Trash2 } from 'lucide-react';

import type { Notification } from '@/api/types';

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

	const columns: ColumnDef<Notification, unknown>[] = [
		...(enableSelection ? [createSelectColumn<Notification>()] : []),
		{
			accessorKey: 'readAt',
			cell: ({ row }) =>
				row.original.readAt ? (
					<CircleCheck className="size-4 text-muted-foreground" />
				) : (
					<Circle className="size-4 fill-current text-primary" />
				),
			header: '',
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
			cell: ({ row }) => (
				<span className="line-clamp-1 max-w-xs text-muted-foreground">
					{row.original.message}
				</span>
			),
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
			header: '',
			id: 'actions',
			size: 80,
		},
	];

	return columns;
}
