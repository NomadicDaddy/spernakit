import { type ColumnDef } from '@tanstack/react-table';

import type { TaskInfo } from '@/api/tasks';

import { useFormatters } from '@/hooks/useFormatters';
import { cn } from '@/lib/utils';

import { StatusIcon } from './StatusIcon';
import { TaskActionsCell, TaskEnabledCell, TaskScheduleCell } from './taskCells';

interface ScheduledTaskColumnsProps {
	onViewHistory: (name: string) => void;
	/** The task whose history panel is open, so its row action can offer to close it. */
	openHistoryTask: null | string;
}

/**
 * Columns for the scheduled-tasks table, mirroring `useUserColumns` and `useAuditColumns`.
 *
 * Only the narrow fixed-content columns declare a `size`; Task and Schedule stay fluid and absorb
 * the remaining width, which is what keeps a seven-column table from splitting evenly and giving
 * a 10-character duration the same room as a task name.
 */
function useScheduledTaskColumns({ onViewHistory, openHistoryTask }: ScheduledTaskColumnsProps) {
	const { formatDateTime } = useFormatters();

	const columns: ColumnDef<TaskInfo, unknown>[] = [
		{
			accessorKey: 'name',
			cell: ({ row }) => (
				/*
				 * A disabled task used to be dimmed by putting `opacity-60` on the whole
				 * `<TableRow>`, which also dimmed the switch that turns it back on. The table owns
				 * the row now, so the muting lands on the name — the one cell that identifies the
				 * task — and every control stays at full contrast.
				 */
				<span
					className={cn('font-medium', !row.original.enabled && 'text-muted-foreground')}>
					{row.original.name}
				</span>
			),
			header: 'Task',
		},
		{
			accessorKey: 'enabled',
			cell: ({ row }) => <TaskEnabledCell task={row.original} />,
			enableSorting: false,
			header: 'Enabled',
			size: 90,
		},
		{
			accessorKey: 'cronExpression',
			cell: ({ row }) => <TaskScheduleCell task={row.original} />,
			header: 'Schedule',
		},
		{
			cell: ({ row }) => {
				const last = row.original.lastExecution;
				if (!last) return <span className="text-muted-foreground">-</span>;
				return (
					<div className="flex items-center gap-1.5">
						<StatusIcon status={last.status} />
						<span className="text-xs">{last.status}</span>
					</div>
				);
			},
			enableSorting: false,
			header: 'Status',
			id: 'status',
			size: 120,
		},
		{
			cell: ({ row }) => (
				<span className="text-sm whitespace-nowrap text-muted-foreground">
					{row.original.lastExecution
						? formatDateTime(row.original.lastExecution.startedAt)
						: '-'}
				</span>
			),
			enableSorting: false,
			header: 'Last Run',
			id: 'lastRun',
			size: 170,
		},
		{
			cell: ({ row }) => {
				const durationMs = row.original.lastExecution?.durationMs;
				return (
					<span className="text-sm text-muted-foreground">
						{durationMs === null || durationMs === undefined ? '-' : `${durationMs}ms`}
					</span>
				);
			},
			enableSorting: false,
			header: 'Duration',
			id: 'duration',
			size: 100,
		},
		{
			cell: ({ row }) => (
				<TaskActionsCell
					isHistoryOpen={openHistoryTask === row.original.name}
					onViewHistory={onViewHistory}
					task={row.original}
				/>
			),
			enableHiding: false,
			enableSorting: false,
			header: 'Actions',
			id: 'actions',
			// One trigger instead of two glyphs — 36px narrower, which is most of what put this
			// table 27px over its container at 1024 and sliced the last column in half.
			size: 64,
		},
	];

	return columns;
}

export { useScheduledTaskColumns };
