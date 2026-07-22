import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import type { DashboardConfig, DashboardWithWidgets } from './dashboardTypes.ts';

type SharedDashboard = Omit<DashboardWithWidgets, 'shareExpiresAt' | 'shareToken' | 'userId'>;

import { getConfig } from '../../config/configLoader.ts';
import { MS_PER_DAY } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { dashboardConfigs } from '../../db/schema/dashboards.ts';
import { findOwnedDashboard, getWidgetsForDashboard } from './dashboardTypes.ts';

/* -------------------------------------------------------------------------- */
/*  Errors                                                                    */
/* -------------------------------------------------------------------------- */

class DashboardSharingDisabledError extends Error {
	constructor(message = 'Dashboard sharing is disabled') {
		super(message);
		this.name = 'DashboardSharingDisabledError';
	}
}

/* -------------------------------------------------------------------------- */
/*  Sharing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Generate (or reuse) a share token for a dashboard.
 *
 * Requires ADMIN+ role (enforced in route).
 *
 * Re-opening the Share dialog would otherwise rotate the token on every call,
 * breaking any link that was already handed out. If the dashboard already has
 * a non-null, unexpired shareToken we return it as-is; otherwise we mint a
 * fresh token and persist it.
 *
 * @param dashboardId
 * @param userId
 * @param expiresInDays
 * @param workspaceId
 * @returns The share token and expiration date, or null if not found.
 */
function shareDashboard(
	dashboardId: number,
	userId: number,
	expiresInDays = 30,
	workspaceId: null | number = null
): { shareExpiresAt: Date; shareToken: string } | null {
	const db = getDb();
	const appConfig = getConfig();

	if (!appConfig.dashboards.sharingEnabled) {
		throw new DashboardSharingDisabledError();
	}

	if (!findOwnedDashboard(dashboardId, userId, workspaceId)) return null;

	const existing = db
		.select({
			shareExpiresAt: dashboardConfigs.shareExpiresAt,
			shareToken: dashboardConfigs.shareToken,
		})
		.from(dashboardConfigs)
		.where(and(eq(dashboardConfigs.id, dashboardId), eq(dashboardConfigs.isDeleted, false)))
		.get() as { shareExpiresAt: Date | null; shareToken: null | string } | undefined;

	if (
		existing?.shareToken &&
		existing.shareExpiresAt &&
		existing.shareExpiresAt.getTime() > Date.now()
	) {
		return { shareExpiresAt: existing.shareExpiresAt, shareToken: existing.shareToken };
	}

	const shareToken = randomBytes(32).toString('hex');
	const shareExpiresAt = new Date(Date.now() + expiresInDays * MS_PER_DAY);

	db.update(dashboardConfigs)
		.set({ shareExpiresAt, shareToken, updatedAt: new Date(), updatedBy: userId })
		.where(eq(dashboardConfigs.id, dashboardId))
		.run();

	return { shareExpiresAt, shareToken };
}

/**
 * Get a shared dashboard by token (read-only, no auth required).
 * @param token
 * @returns The shared dashboard with widgets, or null if invalid/expired.
 */
function getSharedDashboard(token: string): null | SharedDashboard {
	const db = getDb();
	const config = db
		.select()
		.from(dashboardConfigs)
		.where(and(eq(dashboardConfigs.shareToken, token), eq(dashboardConfigs.isDeleted, false)))
		.get() as DashboardConfig | undefined;

	if (!config) return null;

	// Drizzle integer('...', { mode: 'timestamp' }) returns a Date, but the unit-agnostic
	// getTime() comparison guards against a stale Date instance reference or any future
	// mode drift, and avoids object identity pitfalls with the `<` operator on Dates.
	if (config.shareExpiresAt && config.shareExpiresAt.getTime() <= Date.now()) {
		return null;
	}

	const { shareExpiresAt: _se, shareToken: _st, userId: _uid, ...safeConfig } = config;
	return { ...safeConfig, widgets: getWidgetsForDashboard(config.id) };
}

export { DashboardSharingDisabledError, getSharedDashboard, shareDashboard };
