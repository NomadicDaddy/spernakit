import { type ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { AuditLog } from '@/api/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/hooks/useFormatters';

interface AuditColumnsProps {
	expandedRow: null | number;
	setExpandedRow: (id: null | number) => void;
}

export function useAuditColumns({ expandedRow, setExpandedRow }: AuditColumnsProps) {
	const { formatTimestamp } = useFormatters();

	const columns: ColumnDef<AuditLog, unknown>[] = [
		{
			cell: ({ row }) => (
				<Button
					aria-label={expandedRow === row.original.id ? 'Collapse row' : 'Expand row'}
					onClick={() =>
						setExpandedRow(expandedRow === row.original.id ? null : row.original.id)
					}
					size="icon"
					variant="ghost">
					{expandedRow === row.original.id ? (
						<ChevronDown className="size-4" />
					) : (
						<ChevronRight className="size-4" />
					)}
				</Button>
			),
			header: '',
			id: 'expand',
			size: 40,
		},
		{
			accessorKey: 'createdAt',
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm whitespace-nowrap">
					{formatTimestamp(row.original.createdAt)}
				</span>
			),
			header: 'Timestamp',
			size: 160,
		},
		{
			accessorKey: 'username',
			cell: ({ row }) => (
				<span className="text-sm">
					{row.original.username ?? (
						<span className="text-muted-foreground italic">System</span>
					)}
				</span>
			),
			header: 'User',
			size: 120,
		},
		{
			accessorKey: 'action',
			cell: ({ row }) => {
				const action = row.original.action;
				const parts = action.split(' ');
				const method = parts[0] ?? '';
				const methodVariant: Record<
					string,
					'default' | 'destructive' | 'outline' | 'secondary'
				> = {
					DELETE: 'destructive',
					PATCH: 'secondary',
					POST: 'default',
					PUT: 'secondary',
				};
				const knownMethods = ['DELETE', 'PATCH', 'POST', 'PUT'] as const;
				const isKnownMethod = method
					? knownMethods.includes(method as 'DELETE' | 'PATCH' | 'POST' | 'PUT')
					: false;
				const badgeVariant = isKnownMethod ? methodVariant[method] : 'outline';
				const displayMethod = isKnownMethod ? method : '';
				return (
					<div className="flex items-center gap-2">
						{displayMethod && <Badge variant={badgeVariant}>{displayMethod}</Badge>}
						<span className="text-muted-foreground text-sm">
							{action.substring(displayMethod.length).trim()}
						</span>
					</div>
				);
			},
			header: 'Action',
		},
		{
			accessorKey: 'resource',
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm">
					{row.original.resource ?? '-'}
					{row.original.resourceId ? ` #${row.original.resourceId}` : ''}
				</span>
			),
			header: 'Resource',
			size: 140,
		},
		{
			accessorKey: 'ipAddress',
			cell: ({ row }) => (
				<span className="text-muted-foreground font-mono text-xs">
					{row.original.ipAddress ?? '-'}
				</span>
			),
			header: 'IP Address',
			size: 120,
		},
	];

	return columns;
}
