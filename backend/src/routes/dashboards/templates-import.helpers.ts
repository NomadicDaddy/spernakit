import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser, isSysop } from '../../guards/role.ts';
import { requireWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { checkRouteLimit, createRateLimitStore } from '../../plugins/rateLimit/index.ts';
import {
	type DashboardExport,
	importDashboard,
	type WidgetInput,
} from '../../services/dashboardService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import { badRequestError, extractErrorMessage } from '../../utils/errorResponse.ts';

/* Per-route rate limit for unauthenticated shared dashboard endpoint */
const SHARED_RATE_LIMIT_MAX = 30;
const SHARED_RATE_LIMIT_WINDOW_MS = 60_000;
const sharedRateStore = createRateLimitStore();

function checkSharedRateLimit(request: Request): { limited: boolean; retryAfter?: number } {
	const config = getConfig();
	if (!config.rateLimit.enabled || config.server.nodeEnv === 'development') {
		return { limited: false };
	}
	sharedRateStore.startCleanup();
	const ip = getClientIp(request);
	const result = checkRouteLimit(
		sharedRateStore,
		`shared:${ip}`,
		SHARED_RATE_LIMIT_MAX,
		SHARED_RATE_LIMIT_WINDOW_MS
	);
	if (result.limited) {
		return result.retryAfter !== undefined
			? { limited: true, retryAfter: result.retryAfter }
			: { limited: true };
	}
	return { limited: false };
}

function validateDashboardWriteWorkspace({
	set,
	user,
	workspaceId,
}: {
	set: { status?: number | string };
	user: AuthPayload;
	workspaceId: null | number;
}): object | undefined {
	if (isSysop(user) && workspaceId === null) {
		return undefined;
	}
	return requireWorkspaceAccess({ set, user, workspaceId });
}

function handleImportDashboard({
	body,
	set,
	user,
	workspaceId,
}: {
	body: { name: string; version: number; widgets: WidgetInput[] };
	set: { status?: number | string };
	user: AuthPayload | null;
	workspaceId: null | number;
}) {
	const authUser = assertUser(user);
	const workspaceGuard = validateDashboardWriteWorkspace({ set, user: authUser, workspaceId });
	if (workspaceGuard) return workspaceGuard;

	if (body.version !== 1) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(`Unsupported dashboard export version: ${body.version}`);
	}
	try {
		const widgets: WidgetInput[] = body.widgets.map((w) => ({
			col: w.col,
			height: w.height,
			metricType: w.metricType,
			...(w.options !== undefined ? { options: w.options } : {}),
			...(w.refreshInterval !== undefined ? { refreshInterval: w.refreshInterval } : {}),
			row: w.row,
			...(w.timeRange !== undefined ? { timeRange: w.timeRange } : {}),
			title: w.title,
			widgetType: w.widgetType,
			width: w.width,
		}));
		const data: DashboardExport = {
			name: body.name,
			version: 1,
			widgets,
		};
		const dashboard = importDashboard(authUser.id, data, workspaceId);
		set.status = HTTP_STATUS.CREATED;
		return dataResponse(dashboard);
	} catch (err) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(extractErrorMessage(err, 'Failed to import dashboard'));
	}
}

export { checkSharedRateLimit, handleImportDashboard, validateDashboardWriteWorkspace };
