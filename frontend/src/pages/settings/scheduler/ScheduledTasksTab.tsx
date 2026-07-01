import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getTaskHistory, listTasks } from '@/api/tasks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFormatters } from '@/hooks/useFormatters';

import { StatusIcon } from './StatusIcon';
import { TaskRow } from './TaskRow';

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

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-semibold">Scheduled Tasks</h2>
				<p className="text-muted-foreground text-sm">
					View and manage background scheduled tasks.
				</p>
			</div>

			{/* Task List */}
			{isLoading ? (
				<div className="space-y-1">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton className="h-8 w-full" key={i} />
					))}
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Task</TableHead>
							<TableHead className="w-16">Enabled</TableHead>
							<TableHead>Schedule</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Last Run</TableHead>
							<TableHead>Duration</TableHead>
							<TableHead className="w-20">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data?.data.map((task) => (
							<TaskRow key={task.name} onViewHistory={setSelectedTask} task={task} />
						))}
					</TableBody>
				</Table>
			)}

			{/* Execution History */}
			{selectedTask && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							Execution History: {selectedTask}
						</CardTitle>
						<CardDescription>Recent execution results for this task.</CardDescription>
					</CardHeader>
					<CardContent>
						{historyLoading ? (
							<Skeleton className="h-40 w-full" />
						) : historyData?.data && historyData.data.length > 0 ? (
							<div className="max-h-64 space-y-1 overflow-y-auto">
								{historyData.data.map((entry) => (
									<div
										className="flex items-center gap-3 rounded px-2 py-1.5 text-sm"
										key={entry.id}>
										<StatusIcon status={entry.status} />
										<Badge
											className="text-xs"
											variant={
												entry.status === 'completed'
													? 'default'
													: entry.status === 'running'
														? 'secondary'
														: 'destructive'
											}>
											{entry.status}
										</Badge>
										<span className="text-muted-foreground text-xs">
											{entry.durationMs !== null
												? `${entry.durationMs}ms`
												: '-'}
										</span>
										{entry.error && (
											<span className="truncate text-xs text-red-500">
												{entry.error}
											</span>
										)}
										<span className="text-muted-foreground ml-auto text-xs">
											{formatDateTime(entry.startedAt)}
										</span>
									</div>
								))}
							</div>
						) : (
							<p className="text-muted-foreground text-sm">
								No execution history for this task.
							</p>
						)}
						<Button
							className="mt-3"
							onClick={() => setSelectedTask(null)}
							size="sm"
							variant="ghost">
							Close
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

export { ScheduledTasksTab };
