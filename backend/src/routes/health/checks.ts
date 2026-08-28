import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { limitParam } from '../../schemas/pagination.ts';
import {
	cleanupOldLogs,
	getActiveAlerts,
	getCheckHistory,
	runAndStoreChecks,
	runAndStoreSingleCheck,
} from '../../services/healthService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { notFoundError } from '../../utils/errorResponse.ts';
import {
	cleanupHealthLogsDocs,
	healthDetailsDocs,
	healthHistoryDocs,
	runHealthCheckDocs,
} from './checks.docs.ts';

const healthChecksRoutes = new Elysia({
	detail: { tags: ['Health'] },
	prefix: '/health',
})
	.use(authPlugin)
	.get(
		'/details',
		async ({ set }) => {
			setCacheHeaders(set, 'SHORT');
			return dataResponse(await runAndStoreChecks());
		},
		{
			detail: healthDetailsDocs,
			requireRole: 'OPERATOR',
		},
	)
	.get(
		'/history',
		({ query, set }) => {
			// Historical data changes slowly - medium cache (5 min)
			setCacheHeaders(set, 'MEDIUM');
			return dataResponse({
				alerts: getActiveAlerts(),
				history: getCheckHistory(query.limit),
			});
		},
		{
			detail: healthHistoryDocs,
			query: t.Object({
				limit: limitParam({ default: 100, maximum: 1000 }),
			}),
			requireRole: 'ADMIN',
		},
	)
	.post(
		'/checks/:checkName/run',
		async ({ params, set }) => {
			const result = await runAndStoreSingleCheck(params.checkName);
			if (!result) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Health check');
			}
			return dataResponse(result);
		},
		{
			detail: runHealthCheckDocs,
			params: t.Object({
				checkName: t.String({
					maxLength: 50,
					minLength: 1,
					pattern: '^[a-z][a-z0-9_-]*$',
				}),
			}),
			requireRole: 'ADMIN',
		},
	)
	.delete(
		'/logs',
		() => {
			const result = cleanupOldLogs();
			return dataResponse({ batches: result.batches, deleted: result.cleaned });
		},
		{
			detail: cleanupHealthLogsDocs,
			requireRole: 'ADMIN',
		},
	);

export { healthChecksRoutes };
