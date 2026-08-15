import { type ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { AuditLog } from '@/api/types';
import type { DataTableFeatures } from '@/components/shared/data-table/features';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/hooks/useFormatters';
import { parseAuditAction } from '@/lib/auditAction';

/** The id `AuditLogsTab` gives the expanded panel, so the toggle can point `aria-controls` at it. */
function detailsId(logId: number) {
	return `audit-details-${String(logId)}`;
}

interface AuditColumnsProps {
	expandedRow: null | number;
	setExpandedRow: (id: null | number) => void;
}

export function useAuditColumns({ expandedRow, setExpandedRow }: AuditColumnsProps) {
	const { formatDateTime, formatTimestamp } = useFormatters();

	const columns: ColumnDef<DataTableFeatures, AuditLog, unknown>[] = [
		{
			cell: ({ row }) => {
				const isOpen = expandedRow === row.original.id;
				return (
					/*
					 * Every other disclosure on this page reports its state — the bug reporter, the
					 * notification bell, the Columns menu all announce `[expanded=false]`. These
					 * twenty announced nothing; the state lived only in a swapped label, so a
					 * screen-reader user heard the control rename itself and never heard it open.
					 */
					<Button
						aria-controls={isOpen ? detailsId(row.original.id) : undefined}
						aria-expanded={isOpen}
						aria-label="Row details"
						onClick={() => setExpandedRow(isOpen ? null : row.original.id)}
						size="icon"
						variant="ghost">
						{isOpen ? (
							<ChevronDown aria-hidden="true" className="size-4" />
						) : (
							<ChevronRight aria-hidden="true" className="size-4" />
						)}
					</Button>
				);
			},
			// Not hideable: it is the disclosure control, not data. Offered in the Columns menu it
			// let an operator switch off the only way to open a row's details.
			enableHiding: false,
			// A visually-hidden label rather than `''`, which announced the column unlabelled.
			header: () => <span className="sr-only">Details</span>,
			id: 'expand',
			size: 40,
		},
		{
			accessorKey: 'createdAt',
			cell: ({ row }) => (
				/*
				 * This surface is the one place in the app where the exact instant *is* the record,
				 * and the column showed relative time only: twelve of twenty rows read `now` or
				 * `1 minute ago`, which cannot order or date anything. The relative string stays —
				 * it is what makes the column scannable — with the absolute one a hover away.
				 */
				<span
					className="text-sm whitespace-nowrap text-muted-foreground"
					title={formatDateTime(row.original.createdAt)}>
					{formatTimestamp(row.original.createdAt)}
				</span>
			),
			header: 'Timestamp',
			size: 145,
		},
		{
			accessorKey: 'username',
			cell: ({ row }) => (
				/*
				 * Muted, and the action path below is not. Emphasis used to run the other way: the
				 * User column — which alternates `sysop` and `System` for all twenty rows and so
				 * distinguishes nothing — was the only cell at full foreground, while the action
				 * path, the one column that tells rows apart, was muted.
				 */
				<span className="text-sm text-muted-foreground">
					{row.original.username ?? <span className="italic">System</span>}
				</span>
			),
			header: 'User',
			size: 100,
		},
		{
			accessorKey: 'action',
			cell: ({ row }) => {
				// Split and variant map both live in `parseAuditAction`, so the Recent activity
				// card on /dashboard renders the identical records the identical way.
				const { method, path, variant } = parseAuditAction(row.original.action);
				return (
					<div className="flex items-center gap-2">
						{method && <Badge variant={variant}>{method}</Badge>}
						<span className="text-sm">{path}</span>
					</div>
				);
			},
			header: 'Action',
		},
		{
			accessorKey: 'resource',
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{row.original.resource ?? '-'}
					{row.original.resourceId ? ` #${row.original.resourceId}` : ''}
				</span>
			),
			header: 'Resource',
			size: 120,
		},
		{
			accessorKey: 'ipAddress',
			cell: ({ row }) => (
				<span className="font-mono text-xs text-muted-foreground">
					{row.original.ipAddress ?? '-'}
				</span>
			),
			header: 'IP Address',
			// The declared widths totalled 59px more than the shell at 1024x768, and IP Address —
			// last in the row — was the column that got clipped, rendering as "IP A" over "127".
			// Trimming the four fixed columns brings the natural width inside 1024 rather than
			// leaving the operator to discover a scroller with no fade, scrollbar or hint.
			size: 110,
		},
	];

	return columns;
}

export { detailsId };
