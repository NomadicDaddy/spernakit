import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';

import type { AuditLog, PaginatedResponse } from '@/api/types';

import { listAuditLogs } from '@/api/audit';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuditColumns } from '@/hooks/settings/useAuditColumns';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useWorkspaceStore } from '@/stores/workspaceStore';

function AuditLogsTab() {
	const { getFilter, limit, page, setFilter, setLimit, setPage } = useUrlFilters(20);
	const search = getFilter('search');
	const [searchInput, setSearchInput] = useState(search);
	const [expandedRow, setExpandedRow] = useState<null | number>(null);
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

	const { data, isLoading } = useQuery<PaginatedResponse<AuditLog>>({
		enabled: activeWorkspaceId !== null,
		queryFn: () =>
			listAuditLogs({
				limit: String(limit),
				page: String(page),
				...(search ? { search } : {}),
			}),
		queryKey: ['audit-logs', activeWorkspaceId, page, limit, search],
	});

	function handleSearch() {
		setFilter('search', searchInput);
	}

	const columns = useAuditColumns({ expandedRow, setExpandedRow });

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-semibold">Audit Logs</h2>
				<p className="text-muted-foreground text-sm">
					View and search system activity logs.
				</p>
			</div>

			{/* Search */}
			<div className="flex items-center gap-2">
				<div className="relative max-w-sm flex-1">
					<Search
						aria-hidden="true"
						className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
					/>
					<Input
						aria-label="Search audit logs"
						autoComplete="off"
						className="pl-9"
						onChange={(e) => setSearchInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') handleSearch();
						}}
						placeholder="Search actions, resources…"
						value={searchInput}
					/>
				</div>
				<Button onClick={handleSearch} size="sm" variant="outline">
					Search
				</Button>
				{search && (
					<Button
						onClick={() => {
							setFilter('search', '');
							setSearchInput('');
						}}
						size="sm"
						variant="ghost">
						Clear
					</Button>
				)}
			</div>

			{/* Data table */}
			{isLoading ? (
				<TableSkeleton />
			) : (
				<>
					<DataTable
						columns={columns}
						data={data?.data ?? []}
						pagination={{
							limit,
							onPageChange: setPage,
							onPageSizeChange: setLimit,
							page,
							total: data?.total ?? 0,
						}}
					/>

					{/* Expanded details row */}
					{expandedRow !== null && (
						<div className="bg-muted rounded-md border p-4">
							<p className="mb-2 text-sm font-medium">Details</p>
							<pre className="text-muted-foreground overflow-x-auto text-xs">
								{JSON.stringify(
									data?.data.find((d) => d.id === expandedRow)?.details ??
										'No details available',
									null,
									2
								)}
							</pre>
						</div>
					)}
				</>
			)}
		</div>
	);
}

export { AuditLogsTab };
