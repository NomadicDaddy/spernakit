import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, History, MoreHorizontal, Pencil, Play, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { TaskInfo } from '@/api/tasks';

import { triggerTask, updateTask } from '@/api/tasks';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatScheduleExpression } from '@/lib/formatters';

const SCHEDULE_PATTERN = /^\d+(ms|[dhms])$/;

/**
 * The interactive cells of the scheduled-tasks table.
 *
 * These were one `TaskRow` component that rendered a whole `<TableRow>` by hand. Moving the list
 * onto the shared `DataTable` means the table owns the row, so each piece of behaviour that used
 * to live in that row becomes the cell renderer of its own column.
 */

function useTaskUpdate(name: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: { cronExpression?: string; enabled?: boolean }) =>
			updateTask(name, payload),
		onError: () => {
			toast.error(
				`Failed to update ${name}. Check the cron expression format and try again.`,
			);
		},
		onSuccess: () => {
			toast.success(`Task ${name} updated`);
			void queryClient.invalidateQueries({ queryKey: ['tasks'] });
		},
	});
}

function TaskEnabledCell({ task }: { task: TaskInfo }) {
	const updateMutation = useTaskUpdate(task.name);

	return (
		<Switch
			aria-label={`Toggle ${task.name}`}
			checked={task.enabled}
			disabled={updateMutation.isPending}
			onCheckedChange={(checked) => updateMutation.mutate({ enabled: checked })}
		/>
	);
}

function TaskScheduleCell({ task }: { task: TaskInfo }) {
	const updateMutation = useTaskUpdate(task.name);
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(task.cronExpression);

	function handleSave() {
		const trimmed = value.trim();
		if (!SCHEDULE_PATTERN.test(trimmed)) {
			toast.error('Invalid schedule. Use format like "6h", "30m", "10s", "5000ms".');
			return;
		}
		setEditing(false);
		if (trimmed !== task.cronExpression) {
			updateMutation.mutate({ cronExpression: trimmed });
		}
	}

	function handleCancel() {
		setValue(task.cronExpression);
		setEditing(false);
	}

	if (editing) {
		return (
			<div className="flex items-center gap-1">
				<Input
					aria-label={`Edit schedule for ${task.name}`}
					autoComplete="off"
					className="h-7 w-24 font-mono text-xs"
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') handleSave();
						if (e.key === 'Escape') handleCancel();
					}}
					value={value}
				/>
				<Button
					aria-label="Save schedule"
					onClick={handleSave}
					size="icon"
					title="Save"
					variant="ghost">
					<Check className="size-3.5 text-success" />
				</Button>
				<Button
					aria-label="Cancel edit"
					onClick={handleCancel}
					size="icon"
					title="Cancel"
					variant="ghost">
					<X className="size-3.5 text-destructive" />
				</Button>
			</div>
		);
	}

	return (
		/*
		 * The only editable field in the row, and it used to be styled as the least important thing
		 * on it: 12px monospace in `text-muted-foreground`, two steps below the 14px task name and
		 * the 14px Last Run beside it, with a pencil at `opacity-0` until hover. At rest the values
		 * read as static metadata and nothing said the column could be clicked. Row baseline, full
		 * foreground, and a pencil that is visible before you reach for it.
		 */
		<button
			className="group flex items-center gap-1.5 font-mono text-sm hover:text-foreground"
			disabled={updateMutation.isPending}
			onClick={() => setEditing(true)}
			title={`Edit schedule for ${task.name}`}
			type="button">
			{formatScheduleExpression(task.cronExpression)}
			<Pencil
				aria-hidden="true"
				className="size-3 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100"
			/>
		</button>
	);
}

function TaskActionsCell({
	isHistoryOpen,
	onViewHistory,
	task,
}: {
	/** True when this row's history panel is the one open, so the menu can offer to close it. */
	isHistoryOpen: boolean;
	onViewHistory: (name: string) => void;
	task: TaskInfo;
}) {
	const queryClient = useQueryClient();
	const [confirmRun, setConfirmRun] = useState(false);

	const triggerMutation = useMutation({
		mutationFn: () => triggerTask(task.name),
		onSuccess: (response) => {
			if (response.data.error) {
				toast.error(`Task ${task.name} failed: ${response.data.error}`);
			} else {
				toast.success(`Task ${task.name} completed in ${response.data.durationMs}ms`);
			}
			void queryClient.invalidateQueries({ queryKey: ['tasks'] });
		},
	});

	return (
		<>
			{/*
			 * The row-action idiom /settings/users established: one `MoreHorizontal` trigger over
			 * labelled items. These were two unlabelled 36px ghost glyphs, which put "fire a
			 * background job now" one click from a bare triangle with no label and no confirmation,
			 * while the far safer "Edit user" sat behind a menu two surfaces away.
			 */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button aria-label={`Actions for ${task.name}`} size="icon" variant="ghost">
						<MoreHorizontal aria-hidden="true" className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => onViewHistory(task.name)}>
						<History aria-hidden="true" className="size-4" />
						{isHistoryOpen ? 'Hide history' : 'View history'}
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={triggerMutation.isPending}
						onClick={() => setConfirmRun(true)}>
						<Play aria-hidden="true" className="size-4" />
						Run now
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Running a job off-schedule is a real side effect; it gets the same confirmation
			    step every other mutating row action on this rail has. */}
			<ConfirmAlertDialog
				confirmText="Run now"
				description={`Run ${task.name} immediately, outside its ${formatScheduleExpression(task.cronExpression)} schedule. It runs once now; the schedule is unchanged.`}
				isOpen={confirmRun}
				isPending={triggerMutation.isPending}
				onConfirm={() => {
					setConfirmRun(false);
					triggerMutation.mutate();
				}}
				onOpenChange={setConfirmRun}
				title={`Run ${task.name} now?`}
			/>
		</>
	);
}

export { TaskActionsCell, TaskEnabledCell, TaskScheduleCell };
