import type { ScheduledTaskStatus } from 'spernakit-shared';

import type { DataResponse } from './types';

import { apiClient } from './client';

/** Most recent execution result for a scheduled task. */
interface TaskLastExecution {
	completedAt: null | string;
	durationMs: null | number;
	error: null | string;
	startedAt: string;
	status: ScheduledTaskStatus;
}

/** Registered scheduled task with its cron expression, enabled state, and last execution. */
interface TaskInfo {
	cronExpression: string;
	enabled: boolean;
	lastExecution: null | TaskLastExecution;
	name: string;
}

/** Historical execution record for a scheduled task. */
interface TaskHistoryEntry {
	completedAt: null | string;
	createdAt: string;
	durationMs: null | number;
	error: null | string;
	id: number;
	startedAt: string;
	status: ScheduledTaskStatus;
	taskName: string;
}

interface TaskUpdatePayload {
	cronExpression?: string;
	enabled?: boolean;
}

interface TaskUpdateResult {
	cronExpression: string;
	enabled: boolean;
	name: string;
}

interface TriggerResult {
	durationMs: number;
	error: null | string;
	status: ScheduledTaskStatus;
}

/** Fetch all registered scheduled tasks with their current state. Requires ADMIN+ role. */
function listTasks(): Promise<DataResponse<TaskInfo[]>> {
	return apiClient.get<DataResponse<TaskInfo[]>>('/tasks');
}

/** Fetch execution history for a specific scheduled task. */
function getTaskHistory(taskName: string): Promise<DataResponse<TaskHistoryEntry[]>> {
	return apiClient.get<DataResponse<TaskHistoryEntry[]>>(`/tasks/${taskName}/history`);
}

/** Manually trigger a scheduled task by name. Requires ADMIN+ role. */
function triggerTask(taskName: string): Promise<DataResponse<TriggerResult>> {
	return apiClient.post<DataResponse<TriggerResult>>(`/tasks/${taskName}/trigger`);
}

/** Update a scheduled task's configuration (schedule and/or enabled state). Requires ADMIN+ role. */
function updateTask(
	taskName: string,
	payload: TaskUpdatePayload
): Promise<DataResponse<TaskUpdateResult>> {
	return apiClient.patch<DataResponse<TaskUpdateResult>>(`/tasks/${taskName}`, { body: payload });
}

export { getTaskHistory, listTasks, triggerTask, updateTask };
export type { TaskInfo };
