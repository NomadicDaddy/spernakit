import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { AuditLog, PaginatedResponse } from '@/api/types';

import { listAuditLogs } from '@/api/audit';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { detailsId, useAuditColumns } from '@/hooks/settings/useAuditColumns';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/** Same window `useProfile` uses for its username check — one typing pause, app-wide. */
const SEARCH_DEBOUNCE_MS = 400;

/**
 * The methods worth faceting by. The backend filters `action` with a LIKE, and every action is
 * stored as `METHOD /path`, so the trailing space is what keeps `DELETE ` from also matching a
 * path segment that happens to read `…/delete`.
 */
const METHOD_FILTERS = ['DELETE', 'PATCH', 'POST', 'PUT'];

function AuditLogsTab() {
	const { getFilter, limit, page, setFilter, setFilters, setLimit, setPage } = useUrlFilters(20);
	const search = getFilter('search');
	const method = getFilter('method');
	const [searchInput, setSearchInput] = useState(search);
	const [expandedRow, setExpandedRow] = useState<null | number>(null);
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

	/*
	 * Typing filters the table. It used to take a click: the field did nothing on change, Enter or
	 * a Search button committed it, and a second Clear button appeared beside them once a term was
	 * live — three controls for one filter, on the only search field in the app that did not filter
	 * as you type. The URL param is still the source of truth, so a filtered view stays linkable.
	 */
	useEffect(() => {
		if (searchInput === search) return;
		const timer = setTimeout(() => {
			setFilter('search', searchInput);
		}, SEARCH_DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
		};
		// `setFilter` is re-created every render by `useUrlFilters`; the effect is keyed on the text.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchInput, search]);

	const { data, isLoading } = useQuery<PaginatedResponse<AuditLog>>({
		enabled: activeWorkspaceId !== null,
		queryFn: () =>
			listAuditLogs({
				limit: String(limit),
				page: String(page),
				...(method ? { action: `${method} ` } : {}),
				...(search ? { search } : {}),
			}),
		queryKey: ['audit-logs', activeWorkspaceId, page, limit, search, method],
	});

	const columns = useAuditColumns({ expandedRow, setExpandedRow });

	return (
		<div className="space-y-6">
			<SectionHeader description="View and search system activity logs." title="Audit Logs" />

			{isLoading ? (
				<TableSkeleton />
			) : (
				<DataTable
					columns={columns}
					data={data?.data ?? []}
					empty={{
						description:
							'Activity is recorded here as users act on this workspace. Nothing has been logged yet.',
						// The SectionHeader above the table owns the h2.
						headingLevel: 'h3',
						icon: ScrollText,
						// Both filters go to the server, so TanStack's own filter state stays empty
						// and the table would otherwise call a filtered-to-nothing log "empty".
						isFiltered: search !== '' || method !== '',
						// One navigation, not two — see the warning on `setFilter`. The debounced
						// input is cleared too, or it would re-commit the term it still holds.
						onClearFilters: () => {
							setSearchInput('');
							setFilters((params) => {
								params.delete('search');
								params.delete('method');
								params.delete('page');
							});
						},
						title: 'No audit entries yet',
					}}
					pagination={{
						limit,
						onPageChange: setPage,
						onPageSizeChange: setLimit,
						page,
						total: data?.total ?? 0,
					}}
					renderExpandedRow={(log) =>
						log.id === expandedRow && (
							<div className="border-t bg-muted p-4" id={detailsId(log.id)}>
								<p className="mb-2 text-sm font-medium">Details</p>
								<pre
									className="overflow-x-auto text-xs text-muted-foreground"
									translate="no">
									{JSON.stringify(log.details ?? 'No details available', null, 2)}
								</pre>
							</div>
						)
					}
					toolbar={
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<div className="relative max-w-sm min-w-52 flex-1">
								<Search
									aria-hidden="true"
									className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									aria-label="Search audit logs"
									autoComplete="off"
									className="pl-9"
									onChange={(e) => setSearchInput(e.target.value)}
									placeholder="Search actions, resources…"
									value={searchInput}
								/>
							</div>
							{/*
							 * The Action column is the one that tells rows apart and the method badge
							 * is the first thing the eye lands on in it, but there was no way to ask
							 * for just the deletes — the only filter was free text over the whole
							 * record. Server-side, so it narrows the result set rather than the page.
							 */}
							<Select
								onValueChange={(value) => {
									setFilter('method', value === 'all' ? '' : value);
								}}
								value={method || 'all'}>
								<SelectTrigger aria-label="Filter by method" className="w-[140px]">
									<SelectValue placeholder="All methods" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All methods</SelectItem>
									{METHOD_FILTERS.map((value) => (
										<SelectItem key={value} value={value}>
											{value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					}
				/>
			)}
		</div>
	);
}

export { AuditLogsTab };
