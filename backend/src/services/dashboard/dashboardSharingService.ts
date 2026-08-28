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
 * What an owner can see about a dashboard's share link without being handed the link itself.
 *
 * `isActive` is the server's answer rather than something the caller derives from the token and the
 * expiry, because the rule for "this link still works" lives here and the caller would be
 * reimplementing it. `expiresAt` is null exactly when there is nothing live to expire.
 */
interface DashboardShareState {
	expiresAt: Date | null;
	isActive: boolean;
}

interface ShareColumns {
	shareExpiresAt: Date | null;
	shareToken: null | string;
}

/**
 * Read the two share columns off a dashboard row, without the ownership check.
 *
 * @param dashboardId - Dashboard to read
 * @returns The stored token and expiry, or undefined when the row is gone or soft-deleted
 */
function readShareColumns(dashboardId: number): ShareColumns | undefined {
	const db = getDb();
	return db
		.select({
			shareExpiresAt: dashboardConfigs.shareExpiresAt,
			shareToken: dashboardConfigs.shareToken,
		})
		.from(dashboardConfigs)
		.where(and(eq(dashboardConfigs.id, dashboardId), eq(dashboardConfigs.isDeleted, false)))
		.get() as ShareColumns | undefined;
}

/**
 * Whether a stored token is a link that still works.
 *
 * The public fetch, the repeat-share reuse, and the state an owner is shown all have to agree on
 * this. They used to each spell it out, and they did not quite match: a row with a token and no
 * expiry was served by the public route but treated as absent by the reuse check, so re-sharing
 * rotated a link that was still in circulation. One predicate keeps them from drifting again.
 *
 * @param columns - The dashboard's stored share token and expiry
 * @returns True when the token is present and has not expired
 */
function isShareLive(columns: ShareColumns | undefined): boolean {
	if (!columns?.shareToken) return false;
	return columns.shareExpiresAt === null || columns.shareExpiresAt.getTime() > Date.now();
}

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
	workspaceId: null | number = null,
): { shareExpiresAt: Date; shareToken: string } | null {
	const db = getDb();
	const appConfig = getConfig();

	if (!appConfig.dashboards.sharingEnabled) {
		throw new DashboardSharingDisabledError();
	}

	if (!findOwnedDashboard(dashboardId, userId, workspaceId)) return null;

	const existing = readShareColumns(dashboardId);

	if (isShareLive(existing) && existing?.shareToken) {
		return { shareExpiresAt: existing.shareExpiresAt as Date, shareToken: existing.shareToken };
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
 * Report whether a dashboard currently has a working share link.
 *
 * Reading the state is what makes revoking an informed action instead of a guess: before this
 * existed the only way to find out whether a link was live was to POST the share endpoint, which
 * creates one when there is none.
 *
 * @param dashboardId
 * @param userId
 * @param workspaceId - Active workspace context, or null for cross-workspace (SYSOP)
 * @returns The share state, or null when the dashboard is not the caller's to see.
 */
function getDashboardShareState(
	dashboardId: number,
	userId: number,
	workspaceId: null | number = null,
): DashboardShareState | null {
	if (!findOwnedDashboard(dashboardId, userId, workspaceId)) return null;

	const columns = readShareColumns(dashboardId);
	const isActive = isShareLive(columns);
	return { expiresAt: isActive ? (columns?.shareExpiresAt ?? null) : null, isActive };
}

/**
 * Revoke a dashboard's share link.
 *
 * Clearing the token is what makes the previously issued URL answer the same not-found response as
 * a token that never existed, and it is also what lets a re-share mint a new one: repeat shares
 * deliberately reuse a live token, so without this there was no way to rotate a link that had gone
 * to the wrong person short of waiting out its 30 days.
 *
 * Unlike sharing, this does not check `dashboards.sharingEnabled`. Turning sharing off must not
 * strand the links that were handed out while it was on.
 *
 * @param dashboardId
 * @param userId
 * @param workspaceId - Active workspace context, or null for cross-workspace (SYSOP)
 * @returns The state after revoking, or null when the dashboard is not the caller's to revoke.
 */
function revokeDashboardShare(
	dashboardId: number,
	userId: number,
	workspaceId: null | number = null,
): DashboardShareState | null {
	if (!findOwnedDashboard(dashboardId, userId, workspaceId)) return null;

	const db = getDb();
	db.update(dashboardConfigs)
		.set({ shareExpiresAt: null, shareToken: null, updatedAt: new Date(), updatedBy: userId })
		.where(eq(dashboardConfigs.id, dashboardId))
		.run();

	return { expiresAt: null, isActive: false };
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

	// isShareLive holds the getTime() comparison this used to spell out. It is unit-agnostic on
	// purpose: it guards against a stale Date instance reference or any future Drizzle timestamp
	// mode drift, and avoids object identity pitfalls with the `<` operator on Dates.
	if (!isShareLive({ shareExpiresAt: config.shareExpiresAt, shareToken: config.shareToken })) {
		return null;
	}

	const { shareExpiresAt: _se, shareToken: _st, userId: _uid, ...safeConfig } = config;
	return { ...safeConfig, widgets: getWidgetsForDashboard(config.id) };
}

export type { DashboardShareState };
export {
	DashboardSharingDisabledError,
	getDashboardShareState,
	getSharedDashboard,
	revokeDashboardShare,
	shareDashboard,
};
