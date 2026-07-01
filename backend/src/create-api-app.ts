import { swagger } from '@elysiajs/swagger';
import { Elysia } from 'elysia';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from './config/configLoader.ts';
import { HTTP_STATUS } from './constants/httpStatus.ts';
import { auditPlugin } from './plugins/audit.ts';
import { authPlugin } from './plugins/auth.ts';
import { clientIpPlugin } from './plugins/clientIp.ts';
import { corsPlugin } from './plugins/cors.ts';
import { csrfPlugin } from './plugins/csrf.ts';
import { loggerPlugin } from './plugins/logger.ts';
import { passwordChangeGuardPlugin } from './plugins/passwordChangeGuard.ts';
import { authRateLimitPlugin, rateLimitPlugin } from './plugins/rateLimit/index.ts';
import { requestIdPlugin } from './plugins/requestId.ts';
import { securityHeadersPlugin } from './plugins/securityHeaders.ts';
import { workspacePlugin } from './plugins/workspace.ts';
import { auditRoutes } from './routes/audit.ts';
import { authRoutes } from './routes/auth/index.ts';
import { bugsRoutes } from './routes/bugs.ts';
import { businessMetricsRoutes } from './routes/business-metrics.ts';
import { dashboardRoutes } from './routes/dashboards/index.ts';
import { databaseAdminRoutes } from './routes/database-admin/index.ts';
import { fileRoutes } from './routes/files/index.ts';
import { healthRoutes } from './routes/health/index.ts';
import { notificationRoutes } from './routes/notifications/index.ts';
import { onboardingRoutes } from './routes/onboarding.ts';
import { settingsRoutes } from './routes/settings/index.ts';
import { systemRoutes } from './routes/system/index.ts';
import { taskRoutes } from './routes/tasks.ts';
import { usersRoutes } from './routes/users/index.ts';
import { workspaceRoutes } from './routes/workspaces/index.ts';
// Imported directly (not via the healthService facade) so the readiness probe
// can share the READINESS_CACHE_TTL_MS constant with the checks implementation.
import { READINESS_CACHE_TTL_MS, runAllChecks } from './services/health/healthChecks.ts';
import {
	internalError,
	notFoundError,
	RESOURCE_ERROR_CODES,
	SERVER_ERROR_CODES,
	VALIDATION_ERROR_CODES,
	validationError,
} from './utils/errorResponse.ts';
import { logger } from './utils/logger.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Bundles all route plugins into a single Elysia instance. */
const routePlugins = new Elysia({ name: 'routes' })
	.use(auditRoutes)
	.use(authRoutes)
	.use(bugsRoutes)
	.use(businessMetricsRoutes)
	.use(databaseAdminRoutes)
	.use(dashboardRoutes)
	.use(fileRoutes)
	.use(healthRoutes)
	.use(notificationRoutes)
	.use(onboardingRoutes)
	.use(settingsRoutes)
	.use(systemRoutes)
	.use(taskRoutes)
	.use(usersRoutes)
	.use(workspaceRoutes);

interface CreateApiAppOptions {
	/** Mount swagger regardless of nodeEnv (for build-time spec extraction scripts). */
	forceSwagger?: boolean;
}

/**
 * Create the API Elysia instance with the full plugin chain and all routes.
 * Config and database must be initialized before calling this function.
 *
 * @returns Elysia instance with /api/v1 prefix, ready for .listen() or .handle()
 */
function createApiApp(options?: CreateApiAppOptions) {
	const config = getConfig();
	const { version } = JSON.parse(
		readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')
	) as {
		version: string;
	};
	const isDev = config.server.nodeEnv === 'development';

	const app = new Elysia({ name: 'api-v1', prefix: '/api/v1' })
		// clientIpPlugin MUST be first — only the onRequest hook can resolve
		// `server.requestIP(request)` reliably. It caches the IP per-request
		// via a WeakMap keyed by the Request object so later hooks (audit,
		// rate limiting) can retrieve the real client IP transparently via
		// getClientIp(request).
		.use(clientIpPlugin)
		.use(requestIdPlugin)
		.use(loggerPlugin)
		.use(corsPlugin)
		.use(securityHeadersPlugin)
		.use(authPlugin)
		.use(passwordChangeGuardPlugin)
		.use(csrfPlugin)
		.use(rateLimitPlugin)
		.use(authRateLimitPlugin)
		.use(workspacePlugin)
		.use(auditPlugin);

	// Expose Swagger/OpenAPI docs in development mode (or when forced for spec extraction)
	if (isDev || options?.forceSwagger) {
		app.use(
			swagger({
				documentation: {
					info: {
						description: config.app.description,
						title: config.app.name,
						version,
					},
				},
				path: '/docs',
			})
		);
	}

	return app
		.onError(({ code, error, requestId, set }) => {
			if (code === 'VALIDATION') {
				set.status = HTTP_STATUS.BAD_REQUEST;
				logger.debug({ message: error.message, requestId }, 'Validation error details');
				const clientMessage = isDev ? error.message : 'Validation failed';
				return validationError(
					clientMessage,
					VALIDATION_ERROR_CODES.VALIDATION_FAILED,
					requestId
				);
			}
			if (code === 'NOT_FOUND') {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError(
					'Resource',
					RESOURCE_ERROR_CODES.RESOURCE_NOT_FOUND,
					requestId
				);
			}
			set.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
			logger.error({ err: error, requestId }, 'Internal error');
			return internalError(SERVER_ERROR_CODES.SERVER_INTERNAL_ERROR, requestId);
		})
		.get(
			'/health',
			() => {
				const result = runAllChecks();
				// Intentionally returns raw {status, lastChecked} without dataResponse() envelope.
				// Load balancer health probes expect minimal response parsing. No schemaVersion:
				// this endpoint is unauthenticated and must not disclose internal details.
				return { lastChecked: result.timestamp, status: result.status };
			},
			{
				detail: {
					description:
						'Lightweight health check that runs all system checks (database, memory, ' +
						'filesystem) and returns the overall status. No authentication required. ' +
						'Returns { status: "healthy" | "degraded" | "unhealthy" }. Use for ' +
						'load-balancer or uptime monitoring probes.',
					responses: {
						'200': {
							content: {
								'application/json': {
									examples: {
										degraded: {
											summary: 'Some checks degraded',
											value: { status: 'degraded' },
										},
										healthy: {
											summary: 'All checks passing',
											value: { status: 'healthy' },
										},
									},
								},
							},
							description: 'System health status.',
						},
					},
					summary: 'Health check endpoint',
					tags: ['Health'],
				},
			}
		)
		.get(
			'/health/ready',
			({ set }) => {
				// Readiness uses a short cache (5s) so orchestrators notice DB outages
				// quickly — the default liveness cache (60s) is far too stale for routing.
				const result = runAllChecks(READINESS_CACHE_TTL_MS);
				// DB unreachable surfaces as 'unhealthy' (checkDatabase) → 503.
				// 'degraded' (memory/disk pressure) deliberately stays 200: the app is
				// still serving and pulling it from rotation would only add load elsewhere.
				if (result.status === 'unhealthy') {
					set.status = HTTP_STATUS.SERVICE_UNAVAILABLE;
					return { ready: false, status: result.status };
				}
				return { ready: true, status: result.status };
			},
			{
				detail: {
					description:
						'Readiness probe for orchestrators (Kubernetes, Docker Swarm). ' +
						'Returns 200 when the application is ready to accept traffic ' +
						'(database connected, config validated). Returns 503 when unhealthy. ' +
						'No authentication required.',
					responses: {
						'200': {
							content: {
								'application/json': {
									examples: {
										ready: {
											summary: 'Application ready',
											value: { ready: true, status: 'healthy' },
										},
									},
								},
							},
							description: 'Application is ready to serve traffic.',
						},
						'503': {
							content: {
								'application/json': {
									examples: {
										notReady: {
											summary: 'Application not ready',
											value: { ready: false, status: 'unhealthy' },
										},
									},
								},
							},
							description: 'Application is not ready to serve traffic.',
						},
					},
					summary: 'Readiness probe endpoint',
					tags: ['Health'],
				},
			}
		)
		.use(routePlugins);
}

export { createApiApp };
