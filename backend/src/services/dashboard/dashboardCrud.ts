import { and, eq } from 'drizzle-orm';

import type {
	DashboardConfig,
	DashboardWidget,
	DashboardWithWidgets,
	WidgetInput,
} from './dashboardTypes.ts';

import { getConfig } from '../../config/configLoader.ts';
import { getDb } from '../../db/index.ts';
import { dashboardConfigs, dashboardWidgets } from '../../db/schema/dashboards.ts';
import {
	findOwnedDashboard,
	getWidgetsForDashboard,
	MAX_WIDGETS_PER_DASHBOARD,
	mapWidgetInputsToValues,
} from './dashboardTypes.ts';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

interface DashboardInput {
	name: string;
	widgets?: undefined | WidgetInput[];
	workspaceId?: null | number;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Soft-delete all active widgets belonging to a dashboard.
 * @param dashboardId - Dashboard whose widgets to soft-delete
 * @param userId - User performing the deletion
 * @param tx - Optional transaction client; falls back to getDb() when omitted
 */
function softDeleteWidgets(dashboardId: number, userId: number, tx?: DbTransaction): void {
	const client = tx ?? getDb();
	const now = new Date();
	client
		.update(dashboardWidgets)
		.set({ deletedAt: now, deletedBy: userId, isDeleted: true })
		.where(
			and(
				eq(dashboardWidgets.dashboardId, dashboardId),
				eq(dashboardWidgets.isDeleted, false)
			)
		)
		.run();
}

/* -------------------------------------------------------------------------- */
/*  CRUD operations                                                           */
/* -------------------------------------------------------------------------- */

/**
 * List all dashboards belonging to a user, optionally scoped to a workspace.
 *
 * When workspaceId is a number, only dashboards in that workspace are returned.
 * When null (SYSOP cross-workspace view), all workspaces for the user are returned.
 *
 * @param userId
 * @param workspaceId - Active workspace context, or null for cross-workspace
 * @returns Array of dashboard configurations for the user.
 */
function listDashboards(userId: number, workspaceId: null | number = null): DashboardConfig[] {
	const db = getDb();
	const maxPerUser = getConfig().dashboards.maxPerUser;
	const conditions = [eq(dashboardConfigs.userId, userId), eq(dashboardConfigs.isDeleted, false)];
	if (workspaceId !== null) {
		conditions.push(eq(dashboardConfigs.workspaceId, workspaceId));
	}
	// Bound the result set with the same per-user cap enforced by createDashboard so the
	// "all database operations must be bounded" invariant holds even if rows accumulate
	// past the cap (e.g. config bumped down, or seeded data exceeds the limit).
	return db
		.select()
		.from(dashboardConfigs)
		.where(and(...conditions))
		.limit(maxPerUser)
		.all() as DashboardConfig[];
}

/**
 * Get a single dashboard with all its widgets, scoped by active workspace.
 *
 * @param dashboardId
 * @param userId
 * @param workspaceId - Active workspace context, or null for cross-workspace (SYSOP)
 * @returns The dashboard with widgets, or null if not found.
 */
function getDashboard(
	dashboardId: number,
	userId: number,
	workspaceId: null | number = null
): DashboardWithWidgets | null {
	const config = findOwnedDashboard(dashboardId, userId, workspaceId);
	if (!config) return null;

	return { ...config, widgets: getWidgetsForDashboard(dashboardId) };
}

/**
 * Create a new dashboard with optional initial widgets, scoped to a workspace.
 *
 * @param userId
 * @param input - Name, widgets, and active workspaceId
 * @returns The newly created dashboard with its widgets.
 */
function createDashboard(userId: number, input: DashboardInput): DashboardWithWidgets {
	const db = getDb();
	const appConfig = getConfig();
	const maxPerUser = appConfig.dashboards.maxPerUser;

	const existingConditions = [
		eq(dashboardConfigs.userId, userId),
		eq(dashboardConfigs.isDeleted, false),
	];
	if (input.workspaceId !== undefined && input.workspaceId !== null) {
		existingConditions.push(eq(dashboardConfigs.workspaceId, input.workspaceId));
	}
	const existing = db
		.select({ id: dashboardConfigs.id })
		.from(dashboardConfigs)
		.where(and(...existingConditions))
		.all();

	if (existing.length >= maxPerUser) {
		throw new Error(`Dashboard limit reached (max ${maxPerUser})`);
	}

	if (input.widgets && input.widgets.length > 0) {
		if (input.widgets.length > MAX_WIDGETS_PER_DASHBOARD) {
			throw new Error('Maximum number of widgets per dashboard reached');
		}
	}

	return db.transaction((tx) => {
		const result = tx
			.insert(dashboardConfigs)
			.values({
				createdBy: userId,
				name: input.name,
				userId,
				workspaceId: input.workspaceId ?? null,
			})
			.returning()
			.get() as DashboardConfig;

		const widgets: DashboardWidget[] =
			input.widgets && input.widgets.length > 0
				? (tx
						.insert(dashboardWidgets)
						.values(mapWidgetInputsToValues(input.widgets, result.id, userId))
						.returning()
						.all() as DashboardWidget[])
				: [];

		return { ...result, widgets };
	});
}

/**
 * Update a dashboard's name and/or replace its widgets, scoped by active workspace.
 *
 * @param dashboardId
 * @param userId
 * @param input
 * @param workspaceId - Active workspace context, or null for cross-workspace (SYSOP)
 * @returns The updated dashboard with widgets, or null if not found.
 */
function updateDashboard(
	dashboardId: number,
	userId: number,
	input: DashboardInput,
	workspaceId: null | number = null
): DashboardWithWidgets | null {
	const db = getDb();

	if (!findOwnedDashboard(dashboardId, userId, workspaceId)) return null;

	if (input.widgets && input.widgets.length > MAX_WIDGETS_PER_DASHBOARD) {
		throw new Error('Maximum number of widgets per dashboard reached');
	}

	db.transaction((tx) => {
		tx.update(dashboardConfigs)
			.set({ name: input.name, updatedAt: new Date(), updatedBy: userId })
			.where(eq(dashboardConfigs.id, dashboardId))
			.run();

		if (input.widgets) {
			softDeleteWidgets(dashboardId, userId, tx);

			if (input.widgets.length > 0) {
				tx.insert(dashboardWidgets)
					.values(mapWidgetInputsToValues(input.widgets, dashboardId, userId))
					.run();
			}
		}
	});

	return getDashboard(dashboardId, userId, workspaceId);
}

/**
 * Soft-delete a dashboard and its widgets, scoped by active workspace.
 *
 * @param dashboardId
 * @param userId
 * @param workspaceId - Active workspace context, or null for cross-workspace (SYSOP)
 * @returns True if deleted, false if not found.
 */
function deleteDashboard(
	dashboardId: number,
	userId: number,
	workspaceId: null | number = null
): boolean {
	const db = getDb();

	if (!findOwnedDashboard(dashboardId, userId, workspaceId)) return false;

	db.transaction((tx) => {
		softDeleteWidgets(dashboardId, userId, tx);

		const now = new Date();
		tx.update(dashboardConfigs)
			.set({ deletedAt: now, deletedBy: userId, isDeleted: true, updatedAt: now })
			.where(eq(dashboardConfigs.id, dashboardId))
			.run();
	});

	return true;
}

export { createDashboard, deleteDashboard, getDashboard, listDashboards, updateDashboard };
export type { DashboardInput };
export type { DashboardExport, DashboardWithWidgets, WidgetInput } from './dashboardTypes.ts';
