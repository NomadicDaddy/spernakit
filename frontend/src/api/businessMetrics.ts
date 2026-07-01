import type { EventCategory } from 'spernakit-shared';

import type { DataResponse } from './types';

import { apiClient } from './client';

interface TrackEventInput {
	eventCategory: EventCategory;
	eventName: string;
	metadata?: null | Record<string, unknown>;
}

interface DashboardStats {
	conversionRates: {
		fileUploads: number;
		registrations: number;
		workspaceCreations: number;
	};
	dailyActiveUsers: number;
	monthlyActiveUsers: number;
	topFeatures: { count: number; eventName: string }[];
	totalEvents: number;
}

interface EventSummary {
	count: number;
	eventCategory: EventCategory;
	eventName: string;
}

/**
 * Get business metrics dashboard statistics.
 *
 * @returns Dashboard stats including DAU, MAU, conversions, top features
 */
function getDashboardStats(days = 30): Promise<DataResponse<DashboardStats>> {
	return apiClient.get<DataResponse<DashboardStats>>('/business-metrics/dashboard', {
		params: { days: String(days) },
	});
}

/**
 * Get event summary grouped by category and name.
 *
 * @returns Array of event summaries
 */
function getEventSummary(days = 30): Promise<DataResponse<EventSummary[]>> {
	return apiClient.get<DataResponse<EventSummary[]>>('/business-metrics/events', {
		params: { days: String(days) },
	});
}

interface UserActivityEvent {
	createdAt: string;
	eventCategory: EventCategory;
	eventName: string;
	metadata: null | Record<string, unknown>;
}

interface UserActivityData {
	byCategory: { count: number; eventCategory: EventCategory }[];
	recentEvents: UserActivityEvent[];
	totalEvents: number;
}

/**
 * Get activity metrics for a specific user.
 *
 * @returns User activity including total events, breakdown by category, recent events
 */
function getUserActivity(userId: number, days = 30): Promise<DataResponse<UserActivityData>> {
	return apiClient.get<DataResponse<UserActivityData>>(
		`/business-metrics/user-activity/${userId}`,
		{ params: { days: String(days) } }
	);
}

/** Track a business metrics event. */
async function trackEvent(input: TrackEventInput): Promise<void> {
	await apiClient.post('/business-metrics/track', { body: input });
}

export { getDashboardStats, getEventSummary, getUserActivity, trackEvent };
export type { DashboardStats, EventSummary, UserActivityData };
