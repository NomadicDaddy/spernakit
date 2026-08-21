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
			/*
			 * Pinned alongside Timestamp. This is the disclosure control — the row's primary
			 * action — and the audit table is roughly 2x its card at 390px, so scrolling right to
			 * read Action or IP took the only way to open the row off screen with it.
			 */
			meta: { sticky: 'left' },
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
			// The row's identity on this surface: an audit entry is named by when it happened.
			// Pinned at the 40px offset the expand column leaves behind it.
			meta: { sticky: 'left' },
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
				 *
				 * The Recent activity card on /dashboard runs this the opposite way round, bolding
				 * the username and muting the path, and that is intended rather than drift: that
				 * card takes `canUseGlobalScope` and can span users, so there the username is what
				 * distinguishes rows. Emphasis follows whichever field discriminates on the surface
				 * it is on. The type treatment is shared; the emphasis is not.
				 */
				<span className="text-sm text-muted-foreground">
					{row.original.username ?? <span className="italic">System</span>}
					{/*
					 * An impersonated row names the operator behind it. `username` stays the account
					 * the request ran as — that is what authorization saw — so the impersonator is a
					 * suffix rather than a replacement: the row must never read as the user's own act.
					 */}
					{row.original.impersonatedBy !== null && (
						<span
							className="ml-1 text-xs"
							title={`Impersonated by user #${String(row.original.impersonatedBy)}`}>
							via{' '}
							{row.original.impersonatorUsername ??
								`#${String(row.original.impersonatedBy)}`}
						</span>
					)}
				</span>
			),
			header: 'User',
			size: 100,
		},
		{
			accessorKey: 'action',
			cell: ({ row }) => {
				// Split and variant map both live in `parseAuditAction`, so the Recent activity
				// card on /dashboard reads the identical records into the identical parts. What
				// that card does with them differs only in emphasis — see the note on `username`.
				const { method, path, variant } = parseAuditAction(row.original.action);
				return (
					<div className="flex items-center gap-2">
						{method && <Badge variant={variant}>{method}</Badge>}
						{/*
						 * `font-mono`, matching the same field on the /dashboard card. The path
						 * rendered 14px Inter here and 12px mono there — one value in two type
						 * treatments with nothing to justify the split. Mono is the correct half to
						 * keep: it marks the value as a machine route, and it aligns the `/api/v1/`
						 * prefix every row shares so the segment that actually varies lands in the
						 * same column down the table. The size stays 14px, the table's body size —
						 * this is the discriminating column and must not be its smallest text.
						 */}
						<span className="font-mono text-sm">{path}</span>
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
			// 180, not 120: `business-metrics #track` needs 179px at this type size, so a declared
			// 120 was overridden by the cell's own min-content width whenever such a row was on
			// screen and honoured whenever one was not. The column changed width as the operator
			// filtered, and Action — the fluid column beside it — took up the difference, so the
			// grid slid sideways while they typed. A declared width that its own content cannot fit
			// is not a width, it is a suggestion.
			size: 180,
		},
		{
			accessorKey: 'ipAddress',
			cell: ({ row }) => (
				<span className="font-mono text-xs text-muted-foreground">
					{row.original.ipAddress ?? '-'}
				</span>
			),
			header: 'IP Address',
			// 110 because IP Address is last in the row and used to be the column that got clipped
			// at 1024x768, rendering as "IP A" over "127" — the widths were trimmed to bring the
			// table inside that shell. The table no longer fits there (Resource needs 180 for its
			// own content, and `action` is fluid now that DataTable honours the declared/fluid
			// split), but the condition that made clipping harmful is gone: `Table` renders a
			// scroll cue whenever there is width remaining, so the row is signposted as continuing
			// rather than silently truncated. Verified at 1024x768: 59px of scroll, cue visible,
			// the header reading "IP Address" in full.
			size: 110,
		},
	];

	return columns;
}

export { detailsId };
