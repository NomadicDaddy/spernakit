import type { ColumnDef } from '@tanstack/react-table';

import { BUG_REPORT_STATUSES } from 'spernakit-shared';

import type { BugReport } from '@/api/types';
import type { DataTableFeatures } from '@/components/shared/data-table/features';

import { Badge } from '@/components/ui/badge';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useFormatters } from '@/hooks/useFormatters';

import { BugLinks } from './BugLinks';
import { isBugStatus, KIND_LABEL, KIND_VARIANT, STATUS_LABEL, STATUS_VARIANT } from './bugMeta';

interface UseBugColumnsOptions {
	/** True while a status write is in flight, which disables every status control. */
	isStatusPending: boolean;
	/** Open the full text of one report. */
	onOpenReport: (id: number) => void;
	onStatusChange: (id: number, status: BugReport['status']) => void;
}

/**
 * The submissions table's columns.
 *
 * A hook rather than an array in `BugsTab` because the cells need the date formatter and the
 * callbacks the page owns, and because `BugsTab` is at the file-size cap without them. Same shape
 * the workspaces list uses.
 *
 * Identity first, editable state last — the order /settings/users uses.
 *
 * This table led with Status and Kind, so the first 311px of every row at 1440 were two chips
 * and a form control and the report's own text did not begin until x=584. Scanning the inbox
 * meant reading past a column of interactive chrome to reach the content. The id column is new:
 * the surface already names rows that way internally (the status trigger's accessible name is
 * "Status for report 2", and the toast says "Report #2 is now Resolved") but never showed it.
 *
 * @param options - The formatter-independent state and callbacks the cells need.
 * @returns The column definitions, in display order.
 */
function useBugColumns({
	isStatusPending,
	onOpenReport,
	onStatusChange,
}: UseBugColumnsOptions): ColumnDef<DataTableFeatures, BugReport, unknown>[] {
	const { formatDate } = useFormatters();

	return [
		{
			accessorKey: 'id',
			cell: ({ row }) => (
				<span className="font-mono text-xs text-muted-foreground">#{row.original.id}</span>
			),
			header: '#',
			size: 56,
		},
		{
			accessorKey: 'description',
			// No `max-w-md`. At 1920 and 2250 that cap held the text to 448px inside a 664px column
			// and left a 208px void before Reporter, so the layout got emptier as the viewport grew.
			//
			// `line-clamp-2` alone does NOT bound this — an earlier comment here claimed it did.
			// TableCell sets `whitespace-nowrap` on every cell in the app, and a clamp cannot clamp
			// text forbidden to wrap, so the clamp was inert and the column was sized by the whole
			// string: one 3,493-character report produced a 23,155px table inside a 332px mobile
			// scroller, putting the Status control 22,823px off screen. The intake accepts 5,000
			// characters, so a string that long is reachable through the app's own form rather than
			// only by seeding. `whitespace-normal` re-enables wrapping locally so the clamp can bind;
			// the `ch` cap bounds the measure without reintroducing the fixed-px void described above.
			//
			// The clamped text still has to be readable somewhere, hence the button: before it a report
			// was truncated in the only place it was ever shown — no tooltip, no expander, no detail
			// view — so the triage queue could not be triaged from what it displayed.
			cell: ({ row }) => (
				<button
					className="line-clamp-2 max-w-[60ch] cursor-pointer text-left break-words whitespace-normal hover:underline"
					onClick={() => {
						onOpenReport(row.original.id);
					}}
					type="button">
					{row.original.description}
				</button>
			),
			header: 'Description',
		},
		{
			accessorKey: 'kind',
			cell: ({ row }) => (
				<Badge variant={KIND_VARIANT[row.original.kind]}>
					{KIND_LABEL[row.original.kind]}
				</Badge>
			),
			header: 'Kind',
			size: 100,
		},
		{
			// Shown in the table and not only in the detail view, because the relationship is the
			// thing that tells a triager which of two rows about the same problem is the current one.
			// Finding that out by opening both is what the link exists to stop.
			cell: ({ row }) => <BugLinks bug={row.original} onOpenReport={onOpenReport} />,
			header: 'Links',
			id: 'links',
			size: 150,
		},
		{
			accessorFn: (row) => {
				const reportedBy = row.metadata?.reportedBy as { username?: string } | undefined;
				return reportedBy?.username ?? '—';
			},
			header: 'Reporter',
			id: 'reporter',
			size: 130,
		},
		{
			accessorKey: 'email',
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">{row.original.email ?? '—'}</span>
			),
			header: 'Email',
			size: 180,
		},
		{
			accessorKey: 'createdAt',
			cell: ({ row }) => (
				<span className="text-sm whitespace-nowrap text-muted-foreground">
					{formatDate(row.original.createdAt)}
				</span>
			),
			header: 'Date',
			size: 110,
		},
		{
			accessorKey: 'status',
			cell: ({ row }) => (
				<Select
					disabled={isStatusPending}
					onValueChange={(next) => {
						if (!isBugStatus(next) || next === row.original.status) return;
						onStatusChange(row.original.id, next);
					}}
					value={row.original.status}>
					<SelectTrigger
						aria-label={`Status for report ${String(row.original.id)}`}
						className="w-[150px]">
						<SelectValue>
							<Badge variant={STATUS_VARIANT[row.original.status]}>
								{STATUS_LABEL[row.original.status]}
							</Badge>
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{BUG_REPORT_STATUSES.map((value) => (
							<SelectItem key={value} value={value}>
								{STATUS_LABEL[value]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			),
			header: 'Status',
			// Declared, so the column holds its control instead of stretching to 299px around a
			// 150px trigger and stranding another 149px of the row.
			size: 170,
		},
	];
}

export { useBugColumns };
