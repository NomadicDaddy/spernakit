import { type ColumnDef } from '@tanstack/react-table';

import type { TaskInfo } from '@/api/tasks';
import type { DataTableFeatures } from '@/components/shared/data-table/features';

import { Badge } from '@/components/ui/badge';
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

	const columns: ColumnDef<DataTableFeatures, TaskInfo, unknown>[] = [
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
			// Sized, so the leftover width goes to Task rather than here. A cron expression is
			// bounded content; left fluid it took 245px to render "6h".
			size: 160,
		},
		/*
		 * The last three data columns read out of `lastExecution`, so they were authored as display
		 * columns with `enableSorting: false` — which was accurate while no header in the app
		 * rendered a sort control at all. Now that `DataTableHeadCell` does, "when did this last
		 * run" and "which task is slowest" are the two questions this table exists to answer, and a
		 * display column cannot answer either. An `accessorFn` gives each one a value to order by
		 * while the `cell` keeps rendering the formatted one: the ISO timestamp sorts correctly as
		 * a string, and `durationMs` is already a number.
		 */
		{
			accessorFn: (row) => row.lastExecution?.status,
			cell: ({ row }) => {
				const last = row.original.lastExecution;
				if (!last) return <span className="text-muted-foreground">-</span>;
				/*
				 * The app's documented state vocabulary, not the raw API enum. This cell printed
				 * `completed` — lowercase, 12px — inside a row where every other value is 14px and
				 * sentence-cased, so it was simultaneously the only undersized value and the only
				 * uncased copy on the surface. `badge.tsx` states "one status vocabulary, app-wide"
				 * and the sibling Users tab already renders its equivalent state through a Badge, so
				 * two settings tabs were presenting run state in two different visual languages.
				 *
				 * `running` takes `warning` because the vocabulary has no in-flight variant and the
				 * remaining candidates are worse: `default` is `bg-primary`, which badge.tsx reserves
				 * for things you click, and the neutral variants are for identity, not state. Amber
				 * reads here as "no result yet", which is what a running task has.
				 *
				 * The glyph travels inside the badge rather than beside it — Badge reserves
				 * `[&>svg]:size-3` and `gap-1` for exactly this, the same way CheckCard on
				 * /settings/system-health carries StatusGlyph.
				 */
				return (
					<Badge
						variant={
							last.status === 'completed'
								? 'success'
								: last.status === 'running'
									? 'warning'
									: 'destructive'
						}>
						<StatusIcon status={last.status} />
						<span className="capitalize">{last.status}</span>
					</Badge>
				);
			},
			header: 'Status',
			id: 'status',
			size: 120,
		},
		{
			accessorFn: (row) => row.lastExecution?.startedAt,
			cell: ({ row }) => (
				<span className="text-sm whitespace-nowrap text-muted-foreground">
					{row.original.lastExecution
						? formatDateTime(row.original.lastExecution.startedAt)
						: '-'}
				</span>
			),
			header: 'Last Run',
			id: 'lastRun',
			size: 170,
		},
		{
			accessorFn: (row) => row.lastExecution?.durationMs,
			cell: ({ row }) => {
				const durationMs = row.original.lastExecution?.durationMs;
				/*
				 * Right-aligned tabular figures, the treatment /settings/system-health already gives
				 * its own Duration column and /settings/backup gives Size. Left-aligned in
				 * proportional Inter, a page of 78ms / 5ms / 67ms / 4ms never lined up on its digits
				 * and a one-digit duration rendered narrower than a two-digit one, so the column that
				 * answers "which task is slowest" could not be scanned as a column.
				 */
				return (
					<span className="block text-right text-sm text-muted-foreground tabular-nums">
						{durationMs === null || durationMs === undefined ? '-' : `${durationMs}ms`}
					</span>
				);
			},
			header: 'Duration',
			id: 'duration',
			// See useBackupColumns: the alignment lives in `meta` so the shared header cell can lay
			// its sort button out against the right edge rather than nesting a right-aligned span
			// inside a button that hugs its own text.
			meta: { headerAlign: 'right' },
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
