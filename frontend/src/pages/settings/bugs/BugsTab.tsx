import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bug } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { BugReport, PaginatedResponse } from '@/api/types';

import { listBugs, updateBugStatus } from '@/api/bugs';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';

import { BugDetailDialog } from './BugDetailDialog';
import { isBugKind, isBugStatus, STATUS_LABEL } from './bugMeta';
import { BugTableFilters } from './BugTableFilters';
import { useBugColumns } from './useBugColumns';

function BugsTab() {
	const { getFilter, limit, page, setFilter, setFilters, setLimit, setPage } = useUrlFilters();
	const queryClient = useQueryClient();
	const [selectedBugId, setSelectedBugId] = useState<null | number>(null);

	const statusFilter = getFilter('status');
	const kindFilter = getFilter('kind');
	const search = getFilter('search');
	const status = isBugStatus(statusFilter) ? statusFilter : undefined;
	const kind = isBugKind(kindFilter) ? kindFilter : undefined;
	// A superseded report is not separate open work, so the inbox leaves it out until asked. The
	// toggle exists because "left out" must not mean "unreachable": the reports themselves are
	// retained, and a triager auditing a merge needs to be able to see both halves of one.
	const includeSuperseded = getFilter('superseded') === 'include';

	const { data, isLoading } = useQuery<PaginatedResponse<BugReport>>({
		// `search` is part of the query key, so every keystroke started a new query. Without
		// placeholderData that makes `isPending` — and therefore `isLoading` — true again, the
		// early return below unmounted the search input and focus fell to BODY, so the field
		// accepted exactly one character per tap. useUsers, useNotifications, useHealthChecks
		// and useAppFeatures all set this already; this inline query was the only one that did not.
		placeholderData: keepPreviousData,
		queryFn: () => listBugs(page, limit, { includeSuperseded, kind, search, status }),
		queryKey: ['bugs', page, limit, status, kind, search, includeSuperseded],
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

	const columns = useBugColumns({
		isStatusPending: statusMutation.isPending,
		onOpenReport: setSelectedBugId,
		onStatusChange: (id, next) => {
			statusMutation.mutate({ id, status: next });
		},
	});

	const bugs = data?.data ?? [];
	const total = data?.total ?? 0;

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
					// All the filters are server-side — the same reason the description search had
					// to stop being a `searchColumn`. The table cannot see them, so it is told.
					isFiltered:
						search !== '' ||
						status !== undefined ||
						kind !== undefined ||
						includeSuperseded,
					// One navigation, not four — see the warning on `setFilter`.
					onClearFilters: () => {
						setFilters((params) => {
							params.delete('search');
							params.delete('status');
							params.delete('kind');
							params.delete('superseded');
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
					<BugTableFilters
						includeSuperseded={includeSuperseded}
						kind={kind ?? 'all'}
						onIncludeSupersededChange={(next) => {
							setFilter('superseded', next ? 'include' : '');
						}}
						onKindChange={(value) => {
							setFilter('kind', value === 'all' ? '' : value);
						}}
						onSearchChange={(value) => {
							setFilter('search', value);
						}}
						onStatusChange={(value) => {
							setFilter('status', value === 'all' ? '' : value);
						}}
						search={search}
						status={status ?? 'all'}
					/>
				}
			/>
			<BugDetailDialog
				bugId={selectedBugId}
				onOpenChange={(open) => {
					if (!open) setSelectedBugId(null);
				}}
				onOpenReport={setSelectedBugId}
			/>
		</div>
	);
}

export { BugsTab };
