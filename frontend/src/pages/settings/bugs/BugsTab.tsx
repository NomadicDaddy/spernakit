import type { ColumnDef } from '@tanstack/react-table';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bug } from 'lucide-react';
import { toast } from 'sonner';
import { BUG_REPORT_STATUSES } from 'spernakit-shared';

import type { BugReport, PaginatedResponse } from '@/api/types';
import type { DataTableFeatures } from '@/components/shared/data-table/features';

import { listBugs, updateBugStatus } from '@/api/bugs';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useFormatters } from '@/hooks/useFormatters';
import { useUrlFilters } from '@/hooks/useUrlFilters';

import {
	isBugKind,
	isBugStatus,
	KIND_LABEL,
	KIND_VARIANT,
	KINDS,
	STATUS_LABEL,
	STATUS_VARIANT,
} from './bugMeta';

function BugsTab() {
	const { formatDate } = useFormatters();
	const { getFilter, limit, page, setFilter, setFilters, setLimit, setPage } = useUrlFilters(20);
	const queryClient = useQueryClient();

	const statusFilter = getFilter('status');
	const kindFilter = getFilter('kind');
	const search = getFilter('search');
	const status = isBugStatus(statusFilter) ? statusFilter : undefined;
	const kind = isBugKind(kindFilter) ? kindFilter : undefined;

	const { data, isLoading } = useQuery<PaginatedResponse<BugReport>>({
		// `search` is part of the query key, so every keystroke started a new query. Without
		// placeholderData that makes `isPending` — and therefore `isLoading` — true again, the
		// early return below unmounted the search input and focus fell to BODY, so the field
		// accepted exactly one character per tap. useUsers, useNotifications, useHealthChecks
		// and useAppFeatures all set this already; this inline query was the only one that did not.
		placeholderData: keepPreviousData,
		queryFn: () => listBugs(page, limit, { kind, search, status }),
		queryKey: ['bugs', page, limit, status, kind, search],
	});

	const statusMutation = useMutation({
		mutationFn: ({ id, status: next }: { id: number; status: BugReport['status'] }) =>
			updateBugStatus(id, next),
		onError: (err) => {
			toast.error('Status Not Updated', {
				description: err instanceof Error ? err.message : 'Failed to update status',
			});
		},
		onSuccess: (_result, variables) => {
			void queryClient.invalidateQueries({ queryKey: ['bugs'] });
			toast.success('Status Updated', {
				description: `Report #${variables.id} is now ${STATUS_LABEL[variables.status]}.`,
			});
		},
	});

	const bugs = data?.data ?? [];
	const total = data?.total ?? 0;

	/*
	 * Identity first, editable state last — the order /settings/users uses.
	 *
	 * This table led with Status and Kind, so the first 311px of every row at 1440 were two chips
	 * and a form control and the report's own text did not begin until x=584. Scanning the inbox
	 * meant reading past a column of interactive chrome to reach the content. The id column is new:
	 * the surface already names rows that way internally (the status trigger's accessible name is
	 * "Status for report 2", and the toast says "Report #2 is now Resolved") but never showed it.
	 */
	const columns: ColumnDef<DataTableFeatures, BugReport, unknown>[] = [
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
			cell: ({ row }) => (
				<span className="line-clamp-2 max-w-[60ch] break-words whitespace-normal">
					{row.original.description}
				</span>
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
					disabled={statusMutation.isPending}
					onValueChange={(next) => {
						if (!isBugStatus(next) || next === row.original.status) return;
						statusMutation.mutate({ id: row.original.id, status: next });
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

	if (isLoading) {
		return (
			<div className="space-y-6">
				<SectionHeader
					description="View and manage bug reports and feature requests submitted by users."
					title="Bug Reports & Feature Requests"
				/>
				<p className="text-sm text-muted-foreground">Loading submissions…</p>
			</div>
		);
	}

	return (
		// `space-y-6`, the settings rail's 24px section rhythm — AuditLogsTab, RolesTab,
		// ScheduledTasksTab and SystemHealthTab all use it, and TabLayout separates the page header,
		// tab rail and outlet with it. At `space-y-4` the heading, toolbar and table read as one
		// undifferentiated block rather than the three groups they are.
		<div className="space-y-6">
			<SectionHeader
				description="View and manage bug reports and feature requests submitted by users."
				title="Bug Reports & Feature Requests"
			/>
			<DataTable
				columns={columns}
				data={bugs}
				empty={{
					description:
						'Reports submitted through the in-app bug reporter land here. Nothing has been filed yet.',
					// The SectionHeader above the table owns the h2.
					headingLevel: 'h3',
					icon: Bug,
					// All three filters are server-side — the same reason the description search had
					// to stop being a `searchColumn`. The table cannot see them, so it is told.
					isFiltered: search !== '' || status !== undefined || kind !== undefined,
					// One navigation, not three — see the warning on `setFilter`.
					onClearFilters: () => {
						setFilters((params) => {
							params.delete('search');
							params.delete('status');
							params.delete('kind');
							params.delete('page');
						});
					},
					title: 'No submissions yet',
				}}
				pagination={{
					limit,
					onPageChange: setPage,
					onPageSizeChange: setLimit,
					page,
					total,
				}}
				toolbar={
					/*
					 * All three filters go to the server, so the pagination total counts the
					 * filtered set. The description search used to be `searchColumn`, which is a
					 * client-side TanStack filter: against a server-paginated list it hid rows from
					 * the current page of twenty while the footer went on reporting the server's
					 * unfiltered total, so the table read "No results." above "Showing 1-2 of 2".
					 * Same geometry as `UserTableFilters`.
					 */
					<div className="flex flex-wrap items-center gap-2">
						<Input
							aria-label="Search submissions"
							autoComplete="off"
							className="max-w-sm"
							onChange={(e) => {
								setFilter('search', e.target.value);
							}}
							placeholder="Search submissions…"
							value={search}
						/>
						<Select
							onValueChange={(value) => {
								setFilter('status', value === 'all' ? '' : value);
							}}
							value={status ?? 'all'}>
							<SelectTrigger aria-label="Filter by status" className="w-[140px]">
								<SelectValue placeholder="All statuses" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All statuses</SelectItem>
								{BUG_REPORT_STATUSES.map((value) => (
									<SelectItem key={value} value={value}>
										{STATUS_LABEL[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							onValueChange={(value) => {
								setFilter('kind', value === 'all' ? '' : value);
							}}
							value={kind ?? 'all'}>
							<SelectTrigger aria-label="Filter by kind" className="w-[140px]">
								<SelectValue placeholder="All kinds" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All kinds</SelectItem>
								{KINDS.map((value) => (
									<SelectItem key={value} value={value}>
										{KIND_LABEL[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				}
			/>
		</div>
	);
}

export { BugsTab };
