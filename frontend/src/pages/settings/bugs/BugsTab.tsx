import type { ColumnDef } from '@tanstack/react-table';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BUG_REPORT_STATUSES } from 'spernakit-shared';

import type { BugReport, PaginatedResponse } from '@/api/types';

import { listBugs, updateBugStatus } from '@/api/bugs';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useFormatters } from '@/hooks/useFormatters';
import { useUrlFilters } from '@/hooks/useUrlFilters';

const STATUS_VARIANT: Record<
	BugReport['status'],
	'default' | 'destructive' | 'outline' | 'secondary'
> = {
	closed: 'outline',
	in_progress: 'default',
	open: 'destructive',
	resolved: 'secondary',
};

const STATUS_LABEL: Record<BugReport['status'], string> = {
	closed: 'Closed',
	in_progress: 'In Progress',
	open: 'Open',
	resolved: 'Resolved',
};

const KIND_VARIANT: Record<BugReport['kind'], 'destructive' | 'secondary'> = {
	bug: 'destructive',
	feature: 'secondary',
};

const KIND_LABEL: Record<BugReport['kind'], string> = {
	bug: 'Bug',
	feature: 'Feature',
};

/** Narrow the plain string a Select hands back to the shared status union. */
function isBugStatus(value: string): value is BugReport['status'] {
	return BUG_REPORT_STATUSES.some((status) => status === value);
}

function BugsTab() {
	const { formatDate } = useFormatters();
	const { limit, page, setLimit, setPage } = useUrlFilters(20);
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery<PaginatedResponse<BugReport>>({
		queryFn: () => listBugs(page, limit),
		queryKey: ['bugs', page, limit],
	});

	const statusMutation = useMutation({
		mutationFn: ({ id, status }: { id: number; status: BugReport['status'] }) =>
			updateBugStatus(id, status),
		onError: (err) => {
			toast.error('Status Not Updated', {
				description: err instanceof Error ? err.message : 'Failed to update status',
			});
		},
		onSuccess: (_result, variables) => {
			void queryClient.invalidateQueries({ queryKey: ['bugs', page, limit] });
			toast.success('Status Updated', {
				description: `Report #${variables.id} is now ${STATUS_LABEL[variables.status]}.`,
			});
		},
	});

	const bugs = data?.data ?? [];
	const total = data?.total ?? 0;

	const columns: ColumnDef<BugReport, unknown>[] = [
		{
			accessorKey: 'status',
			cell: ({ row }) => (
				<Select
					disabled={statusMutation.isPending}
					onValueChange={(status) => {
						if (!isBugStatus(status) || status === row.original.status) return;
						statusMutation.mutate({ id: row.original.id, status });
					}}
					value={row.original.status}>
					<SelectTrigger
						aria-label={`Status for report ${row.original.id}`}
						className="w-[150px]">
						<SelectValue>
							<Badge variant={STATUS_VARIANT[row.original.status]}>
								{STATUS_LABEL[row.original.status]}
							</Badge>
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{BUG_REPORT_STATUSES.map((status) => (
							<SelectItem key={status} value={status}>
								{STATUS_LABEL[status]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			),
			header: 'Status',
		},
		{
			accessorKey: 'kind',
			cell: ({ row }) => (
				<Badge variant={KIND_VARIANT[row.original.kind]}>
					{KIND_LABEL[row.original.kind]}
				</Badge>
			),
			header: 'Kind',
		},
		{
			accessorKey: 'description',
			cell: ({ row }) => (
				<span className="line-clamp-2 max-w-md">{row.original.description}</span>
			),
			header: 'Description',
		},
		{
			accessorFn: (row) => {
				const reportedBy = row.metadata?.reportedBy as { username?: string } | undefined;
				return reportedBy?.username ?? '—';
			},
			header: 'Reporter',
			id: 'reporter',
		},
		{
			accessorKey: 'email',
			cell: ({ row }) => row.original.email ?? '—',
			header: 'Email',
		},
		{
			accessorKey: 'createdAt',
			cell: ({ row }) => formatDate(row.original.createdAt),
			header: 'Date',
		},
	];

	if (isLoading) {
		return (
			<div className="space-y-4">
				<h2 className="text-lg font-semibold">Bug Reports &amp; Feature Requests</h2>
				<p className="text-sm text-muted-foreground">Loading submissions…</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold">Bug Reports &amp; Feature Requests</h2>
				<p className="text-sm text-muted-foreground">
					View and manage bug reports and feature requests submitted by users.
				</p>
			</div>
			<DataTable
				columns={columns}
				data={bugs}
				filterPlaceholder="Search submissions…"
				pagination={{
					limit,
					onPageChange: setPage,
					onPageSizeChange: setLimit,
					page,
					total,
				}}
				searchColumn="description"
			/>
		</div>
	);
}

export { BugsTab };
