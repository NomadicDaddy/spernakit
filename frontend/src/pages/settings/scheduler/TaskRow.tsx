import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, History, Pencil, Play, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { TaskInfo } from '@/api/tasks';

import { triggerTask, updateTask } from '@/api/tasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { TableCell, TableRow } from '@/components/ui/table';
import { useFormatters } from '@/hooks/useFormatters';
import { formatScheduleExpression } from '@/lib/formatters';

import { StatusIcon } from './StatusIcon';

const SCHEDULE_PATTERN = /^\d+(ms|[dhms])$/;

function TaskRow({
	onViewHistory,
	task,
}: {
	onViewHistory: (name: string) => void;
	task: TaskInfo;
}) {
	const queryClient = useQueryClient();
	const { formatDateTime } = useFormatters();
	const [editingSchedule, setEditingSchedule] = useState(false);
	const [scheduleValue, setScheduleValue] = useState(task.cronExpression);

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

	const updateMutation = useMutation({
		mutationFn: (payload: { cronExpression?: string; enabled?: boolean }) =>
			updateTask(task.name, payload),
		onError: () => {
			toast.error(
				`Failed to update ${task.name}. Check the cron expression format and try again.`
			);
		},
		onSuccess: () => {
			toast.success(`Task ${task.name} updated`);
			void queryClient.invalidateQueries({ queryKey: ['tasks'] });
		},
	});

	function handleToggleEnabled(checked: boolean) {
		updateMutation.mutate({ enabled: checked });
	}

	function handleSaveSchedule() {
		const trimmed = scheduleValue.trim();
		if (!SCHEDULE_PATTERN.test(trimmed)) {
			toast.error('Invalid schedule. Use format like "6h", "30m", "10s", "5000ms".');
			return;
		}
		setEditingSchedule(false);
		if (trimmed !== task.cronExpression) {
			updateMutation.mutate({ cronExpression: trimmed });
		}
	}

	function handleCancelEdit() {
		setScheduleValue(task.cronExpression);
		setEditingSchedule(false);
	}

	const last = task.lastExecution;
	const isPending = updateMutation.isPending;

	return (
		<TableRow className={!task.enabled ? 'opacity-60' : undefined}>
			<TableCell>
				<span className="font-medium">{task.name}</span>
			</TableCell>
			<TableCell>
				<Switch
					aria-label={`Toggle ${task.name}`}
					checked={task.enabled}
					disabled={isPending}
					onCheckedChange={handleToggleEnabled}
				/>
			</TableCell>
			<TableCell>
				{editingSchedule ? (
					<div className="flex items-center gap-1">
						<Input
							aria-label={`Edit schedule for ${task.name}`}
							autoComplete="off"
							className="h-7 w-24 font-mono text-xs"
							onChange={(e) => setScheduleValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleSaveSchedule();
								if (e.key === 'Escape') handleCancelEdit();
							}}
							value={scheduleValue}
						/>
						<Button
							aria-label="Save schedule"
							onClick={handleSaveSchedule}
							size="icon"
							title="Save"
							variant="ghost">
							<Check className="size-3.5 text-green-600" />
						</Button>
						<Button
							aria-label="Cancel edit"
							onClick={handleCancelEdit}
							size="icon"
							title="Cancel"
							variant="ghost">
							<X className="size-3.5 text-red-500" />
						</Button>
					</div>
				) : (
					<button
						className="text-muted-foreground hover:text-foreground group flex items-center gap-1.5 font-mono text-xs"
						disabled={isPending}
						onClick={() => setEditingSchedule(true)}
						type="button">
						{formatScheduleExpression(task.cronExpression)}
						<Pencil
							aria-hidden="true"
							className="size-3 opacity-0 group-hover:opacity-100"
						/>
					</button>
				)}
			</TableCell>
			<TableCell>
				{last ? (
					<div className="flex items-center gap-1.5">
						<StatusIcon status={last.status} />
						<span className="text-xs">{last.status}</span>
					</div>
				) : (
					<span className="text-muted-foreground">-</span>
				)}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{last ? formatDateTime(last.startedAt) : '-'}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{last?.durationMs !== null && last?.durationMs !== undefined
					? `${last.durationMs}ms`
					: '-'}
			</TableCell>
			<TableCell>
				<div className="flex items-center gap-1">
					<Button
						aria-label="View history"
						onClick={() => onViewHistory(task.name)}
						size="icon"
						title="View history"
						variant="ghost">
						<History className="size-4" />
					</Button>
					<Button
						aria-label="Trigger now"
						disabled={triggerMutation.isPending}
						onClick={() => triggerMutation.mutate()}
						size="icon"
						title="Trigger now"
						variant="ghost">
						<Play className="size-4" />
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}

export { TaskRow };
