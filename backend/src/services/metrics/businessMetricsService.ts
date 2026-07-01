import type { EventCategory } from 'spernakit-shared';

import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { MS_PER_DAY } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { businessEvents } from '../../db/schema/businessEvents.ts';
import { logger } from '../../utils/logger.ts';

interface TrackEventInput {
	eventCategory: EventCategory;
	eventName: string;
	metadata?: Record<string, unknown>;
	userId?: number;
	workspaceId?: number;
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

interface UserActivity {
	byCategory: { count: number; eventCategory: EventCategory }[];
	recentEvents: {
		createdAt: Date;
		eventCategory: EventCategory;
		eventName: string;
		metadata: null | Record<string, unknown>;
	}[];
	totalEvents: number;
}

/**
 * Track a business event.
 *
 * @param input - Event data to record
 */
function trackEvent(input: TrackEventInput): void {
	try {
		const db = getDb();
		db.insert(businessEvents)
			.values({
				eventCategory: input.eventCategory,
				eventName: input.eventName,
				metadata: input.metadata ?? null,
				userId: input.userId ?? null,
				workspaceId: input.workspaceId ?? null,
			})
			.run();
	} catch (err) {
		logger.error({ err }, 'Failed to track business event');
	}
}

function countTotalEvents(db: ReturnType<typeof getDb>, since: Date): number {
	const result = db
		.select({ count: count() })
		.from(businessEvents)
		.where(gte(businessEvents.createdAt, since))
		.get();
	return result?.count ?? 0;
}

function countDistinctUsers(db: ReturnType<typeof getDb>, since: Date): number {
	const result = db
		.select({ count: sql<number>`COUNT(DISTINCT ${businessEvents.userId})` })
		.from(businessEvents)
		.where(and(gte(businessEvents.createdAt, since), sql`${businessEvents.userId} IS NOT NULL`))
		.get();
	return result?.count ?? 0;
}

function getConversionRates(
	db: ReturnType<typeof getDb>,
	since: Date
): DashboardStats['conversionRates'] {
	const events = db
		.select({
			count: count(),
			eventCategory: businessEvents.eventCategory,
			eventName: businessEvents.eventName,
		})
		.from(businessEvents)
		.where(
			and(
				gte(businessEvents.createdAt, since),
				sql`(
					(${businessEvents.eventCategory} = 'conversion' AND ${businessEvents.eventName} IN ('user_registered', 'workspace_created'))
					OR
					(${businessEvents.eventCategory} = 'feature_usage' AND ${businessEvents.eventName} = 'file_uploaded')
				)`
			)
		)
		.groupBy(businessEvents.eventCategory, businessEvents.eventName)
		.all();

	const rates = { fileUploads: 0, registrations: 0, workspaceCreations: 0 };
	for (const row of events) {
		if (row.eventName === 'user_registered') rates.registrations = row.count;
		else if (row.eventName === 'workspace_created') rates.workspaceCreations = row.count;
		else if (row.eventName === 'file_uploaded') rates.fileUploads = row.count;
	}
	return rates;
}

function getTopFeatures(db: ReturnType<typeof getDb>, since: Date): DashboardStats['topFeatures'] {
	return db
		.select({ count: count(), eventName: businessEvents.eventName })
		.from(businessEvents)
		.where(
			and(
				eq(businessEvents.eventCategory, 'feature_usage'),
				gte(businessEvents.createdAt, since)
			)
		)
		.groupBy(businessEvents.eventName)
		.orderBy(desc(count()))
		.limit(10)
		.all();
}

/**
 * Get dashboard statistics for a given time window.
 *
 * @param days - Number of days to look back (default: 30)
 * @returns Dashboard stats including DAU, MAU, conversion rates, top features
 */
function getDashboardStats(days = 30): DashboardStats {
	const db = getDb();
	const since = new Date(Date.now() - days * MS_PER_DAY);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);

	return {
		conversionRates: getConversionRates(db, since),
		dailyActiveUsers: countDistinctUsers(db, today),
		monthlyActiveUsers: countDistinctUsers(db, thirtyDaysAgo),
		topFeatures: getTopFeatures(db, since),
		totalEvents: countTotalEvents(db, since),
	};
}

/**
 * Get event summary grouped by category and name for a given time window.
 *
 * @param days - Number of days to look back (default: 30)
 * @param limit
 * @returns Array of event summaries
 */
function getEventSummary(days = 30, limit = 20): EventSummary[] {
	const db = getDb();
	const since = new Date(Date.now() - days * MS_PER_DAY);

	return db
		.select({
			count: count(),
			eventCategory: businessEvents.eventCategory,
			eventName: businessEvents.eventName,
		})
		.from(businessEvents)
		.where(gte(businessEvents.createdAt, since))
		.groupBy(businessEvents.eventCategory, businessEvents.eventName)
		.orderBy(desc(count()), businessEvents.eventName)
		.limit(limit)
		.all() as EventSummary[];
}

/**
 * Get user activity metrics for a specific user.
 *
 * @param userId - User ID
 * @param days - Number of days to look back (default: 30)
 * @returns User activity data
 */
function getUserActivity(userId: number, days = 30): UserActivity {
	const db = getDb();
	const since = new Date(Date.now() - days * MS_PER_DAY);

	const byCategory = db
		.select({
			count: count(),
			eventCategory: businessEvents.eventCategory,
		})
		.from(businessEvents)
		.where(and(eq(businessEvents.userId, userId), gte(businessEvents.createdAt, since)))
		.groupBy(businessEvents.eventCategory)
		.all();

	const recentEvents = db
		.select({
			createdAt: businessEvents.createdAt,
			eventCategory: businessEvents.eventCategory,
			eventName: businessEvents.eventName,
			metadata: businessEvents.metadata,
		})
		.from(businessEvents)
		.where(and(eq(businessEvents.userId, userId), gte(businessEvents.createdAt, since)))
		.orderBy(desc(businessEvents.createdAt))
		.limit(50)
		.all();

	const totalEvents = byCategory.reduce((sum, row) => sum + row.count, 0);

	return {
		byCategory,
		recentEvents,
		totalEvents,
	};
}

export { getDashboardStats, getEventSummary, getUserActivity, trackEvent };
