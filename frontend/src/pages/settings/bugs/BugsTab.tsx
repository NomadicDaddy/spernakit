import type { ColumnDef } from '@tanstack/react-table';

import { useQuery } from '@tanstack/react-query';

import type { BugReport, PaginatedResponse } from '@/api/types';

import { listBugs } from '@/api/bugs';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
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

function BugsTab() {
	const { formatDate } = useFormatters();
	const { limit, page, setLimit, setPage } = useUrlFilters(20);
	const { data, isLoading } = useQuery<PaginatedResponse<BugReport>>({
		queryFn: () => listBugs(page, limit),
		queryKey: ['bugs', page, limit],
	});

	const bugs = data?.data ?? [];
	const total = data?.total ?? 0;

	const columns: ColumnDef<BugReport, unknown>[] = [
		{
			accessorKey: 'status',
			cell: ({ row }) => (
				<Badge variant={STATUS_VARIANT[row.original.status]}>
					{STATUS_LABEL[row.original.status]}
				</Badge>
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
				<p className="text-muted-foreground text-sm">Loading submissions…</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold">Bug Reports &amp; Feature Requests</h2>
				<p className="text-muted-foreground text-sm">
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
