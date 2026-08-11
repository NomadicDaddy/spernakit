import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';

import type { TaskInfo } from '@/api/tasks';

import { getTaskHistory, listTasks } from '@/api/tasks';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { useFormatters } from '@/hooks/useFormatters';

import { useScheduledTaskColumns } from './useScheduledTaskColumns';

function ScheduledTasksTab() {
	const { formatDateTime } = useFormatters();
	const [selectedTask, setSelectedTask] = useState<null | string>(null);

	const { data, isLoading } = useQuery({
		queryFn: listTasks,
		queryKey: ['tasks'],
	});

	const { data: historyData, isLoading: historyLoading } = useQuery({
		enabled: selectedTask !== null,
		queryFn: () => getTaskHistory(selectedTask!),
		queryKey: ['task-history', selectedTask],
	});

	const columns = useScheduledTaskColumns({
		onViewHistory: (name) => setSelectedTask((current) => (current === name ? null : name)),
		openHistoryTask: selectedTask,
	});

	/*
	 * The history renders as the expanded row of the task it belongs to.
	 *
	 * It used to append a Card below the whole 13-row table with no scroll: activating it on row 1
	 * at 1440x1200 put the card's top at y=1055 in a 1144px viewport, so 89px of a 280px panel was
	 * on screen and not one history entry was visible — and the clicked row got no selected state,
	 * so after scrolling there was nothing tying the panel back to its task but the title string.
	 * `renderExpandedRow` is the app's own answer to that, already used by the audit log, and it
	 * marks the source row `data-state="selected"` for free.
	 */
	function renderHistory(task: TaskInfo) {
		if (task.name !== selectedTask) return null;

		return (
			<div className="border-t bg-muted/40 p-4">
				<p className="mb-2 text-sm font-medium">Recent executions</p>
				{historyLoading ? (
					<Skeleton className="h-24 w-full" />
				) : historyData?.data && historyData.data.length > 0 ? (
					/*
					 * The shared table, not a stack of flex rows. Unaligned, `43ms`, `35ms` and
					 * `90ms` started at three different x positions from the timestamps sharing
					 * their line, and the error text had no reserved column at all.
					 */
					<div className="max-h-64 overflow-y-auto rounded-md border bg-card">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Duration</TableHead>
									<TableHead>Error</TableHead>
									<TableHead className="text-right">Started</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{historyData.data.map((entry) => (
									<TableRow key={entry.id}>
										<TableCell>
											<Badge
												variant={
													entry.status === 'completed'
														? 'success'
														: entry.status === 'running'
															? 'secondary'
															: 'destructive'
												}>
												{entry.status}
											</Badge>
										</TableCell>
										<TableCell className="text-right text-muted-foreground tabular-nums">
											{entry.durationMs !== null
												? `${entry.durationMs}ms`
												: '—'}
										</TableCell>
										<TableCell className="max-w-xs truncate text-destructive">
											{entry.error ?? ''}
										</TableCell>
										<TableCell className="text-right text-muted-foreground">
											{formatDateTime(entry.startedAt)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No execution history for this task.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SectionHeader
				description="View and manage background scheduled tasks."
				title="Scheduled Tasks"
			/>

			{/*
			 * Client-side pagination — the `pagination` prop is deliberately omitted. The task set
			 * is a fixed handful defined in the scheduler, not a growing table, so paging it on the
			 * server would add a round trip to sort a list that fits on one page.
			 */}
			{isLoading ? (
				<TableSkeleton />
			) : (
				<DataTable
					columns={columns}
					data={data?.data ?? []}
					empty={{
						description:
							'The scheduler defines its task set at startup; none is registered.',
						// The SectionHeader above the table owns the h2.
						headingLevel: 'h3',
						icon: CalendarClock,
						// No `isFiltered`: the search box is `searchColumn`, a filter the table owns.
						title: 'No scheduled tasks',
					}}
					filterPlaceholder="Search tasks…"
					renderExpandedRow={renderHistory}
					searchColumn="name"
				/>
			)}
		</div>
	);
}

export { ScheduledTasksTab };
