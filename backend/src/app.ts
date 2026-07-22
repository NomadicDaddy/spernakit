import { Elysia } from 'elysia';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { initializeConfig } from './config/configLoader.ts';
import { projectRoot } from './config/configUtils.ts';
import { assertDbUnderDataDir } from './config/databaseLocation.ts';
import { HTTP_STATUS } from './constants/httpStatus.ts';
import { createApiApp } from './create-api-app.ts';
import { runAutoMigrations } from './db/autoMigrate.ts';
import { resetDevPasswordsIfDev, runAutoSeed } from './db/autoSeed.ts';
import { closeDatabase, initializeDatabase, validatePgConnection } from './db/index.ts';
import { stopRateLimitCleanup } from './plugins/rateLimit/index.ts';
import { seedAppFeatureDefaults } from './routes/settings/app-features.ts';
import { setBunServer, validateWsMaxPayload, wsRoutes } from './routes/ws/index.ts';
import { closeReadOnlyClient } from './services/databaseAdminService.ts';
import {
	initializeMetricsService,
	measureEventLoopLatency,
	stopEventLoopLatencyTimer,
} from './services/metricsService.ts';
import { cleanupExpiredRateLimitEntries } from './services/rateLimitService.ts';
import {
	initializeScheduler,
	registerBuiltInTasks,
	stopScheduler,
} from './services/schedulerService.ts';
import { closeAllConnections } from './services/websocketService.ts';
import {
	internalError,
	notFoundError,
	RESOURCE_ERROR_CODES,
	SERVER_ERROR_CODES,
} from './utils/errorResponse.ts';
import { logger } from './utils/logger.ts';

// Process-level error handlers - installed early to catch startup errors.
// Both fatal handlers flush the pino logger before exit so stack traces reach
// the log file even when an async transport is configured.
process.on('uncaughtException', (error) => {
	logger.fatal({ err: error }, 'Uncaught exception - process will exit');
	logger.flush?.();
	process.exit(1);
});
process.on('unhandledRejection', (reason) => {
	logger.fatal({ err: reason }, 'Unhandled promise rejection - process will exit');
	logger.flush?.();
	process.exit(1);
});
process.on('beforeExit', (code) => {
	logger.info({ code }, 'backend beforeExit');
	logger.flush?.();
});

let app!: { server: { stop: () => Promise<void> | void } | null };

async function createApp(): Promise<{ server: { stop: () => Promise<void> | void } | null }> {
	// Initialize config
	const config = initializeConfig();
	validateWsMaxPayload();

	// Initialize database
	const dbDialect = config.database.dialect;
	const dbUrl = config.database.url;

	if (dbDialect === 'postgres') {
		initializeDatabase(dbUrl, 'postgres', config.database.ssl);
		await validatePgConnection();
	} else {
		// ASSERT-010: the resolved DB file MUST live under the project-root data/
		// directory. Fail fast on a misconfigured database.url before any file is
		// created under backend/data/ or elsewhere.
		const dbLocation = assertDbUnderDataDir(config.database, projectRoot);
		if (!dbLocation.ok) {
			logger.fatal(dbLocation.message);
			logger.flush?.();
			process.exit(1);
		}

		const dbPath = dbUrl.startsWith('file:') ? dbUrl.substring(5) : dbUrl;
		const absoluteDbPath = resolve(
			projectRoot,
			dbPath.startsWith('./') ? dbPath.substring(2) : dbPath
		);

		// Ensure the data/ directory exists
		const dataDir = dirname(absoluteDbPath);
		if (!existsSync(dataDir)) {
			mkdirSync(dataDir, { mode: 0o700, recursive: true });
		}

		initializeDatabase(absoluteDbPath, 'sqlite', undefined, config.database.busyTimeoutMs);

		// Auto-run pending migrations on startup (handles fresh installs and upgrades)
		const migrationsDir = resolve(projectRoot, 'backend', 'drizzle');
		if (existsSync(migrationsDir)) {
			runAutoMigrations(absoluteDbPath, migrationsDir);
		}

		// Auto-seed when users table is empty (fresh installs)
		await runAutoSeed(config);

		// Dev-only: reset seed-user passwords to documented values on every startup.
		// Safety net for password drift — no-op in production.
		await resetDevPasswordsIfDev(config);
	}

	// Seed app feature defaults once at startup (not per-request)
	seedAppFeatureDefaults();

	// Flush expired rate limit entries so stale lockouts from a previous run don't persist
	if (dbDialect === 'sqlite') {
		const purged = cleanupExpiredRateLimitEntries();
		if (purged > 0) {
			logger.info({ purged }, 'Flushed expired rate-limit entries on startup');
		}
	}

	// Create API routes with /api/v1 prefix (versioned API)
	const apiApp = createApiApp();

	// Root app: mounts API routes and WebSocket at root level
	const elysiaApp = new Elysia({
		serve: { maxRequestBodySize: config.server.maxRequestBodySize },
	})
		// Root-level error handler for surfaces outside the /api/v1 chain (ws upgrade,
		// security.txt, unmatched paths). Returns the standard error envelope without
		// leaking internal error messages.
		.onError(({ code, error, set }) => {
			if (code === 'NOT_FOUND') {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Resource', RESOURCE_ERROR_CODES.RESOURCE_NOT_FOUND);
			}
			set.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
			logger.error({ err: error }, 'Root-level unhandled error');
			return internalError(SERVER_ERROR_CODES.SERVER_INTERNAL_ERROR);
		})
		.get('/.well-known/security.txt', ({ set }) => {
			set.headers['content-type'] = 'text/plain; charset=utf-8';
			return [
				`Contact: mailto:security@${config.app.slug}.local`,
				`Preferred-Languages: en`,
			].join('\n');
		})
		.use(apiApp)
		.use(wsRoutes)
		.listen({ hostname: config.server.host, port: config.server.backendPort });

	// Wire up Bun server reference for native WebSocket pub/sub
	if (elysiaApp.server) {
		setBunServer(elysiaApp.server);
	}

	logger.info(
		`${config.app.name} backend running on http://localhost:${config.server.backendPort}`
	);

	// Initialize scheduled tasks and event loop latency measurement
	registerBuiltInTasks();
	await initializeScheduler();
	initializeMetricsService();
	measureEventLoopLatency();

	return elysiaApp;
}

try {
	app = await createApp();
} catch (err) {
	// Use console.error as fallback — logger may not be initialized yet
	console.error('Startup failed:', err instanceof Error ? err.message : err);
	process.exit(1);
}

// Graceful shutdown: stop server, close connections, clean up resources
const SHUTDOWN_TIMEOUT_MS = 15_000;
// Drain budget for in-flight HTTP requests — leaves headroom within the overall
// shutdown timeout for WebSocket/scheduler/database cleanup afterwards.
const SERVER_DRAIN_TIMEOUT_MS = 10_000;

async function handleShutdown(): Promise<void> {
	logger.info('Received shutdown signal, starting graceful shutdown...');

	// Hard exit after timeout to prevent hanging
	const forceExit = setTimeout(() => {
		logger.error('Shutdown timed out, forcing exit');
		process.exit(1);
	}, SHUTDOWN_TIMEOUT_MS);
	// Allow process to exit even if the timer is still running
	forceExit.unref();

	try {
		// 1. Stop accepting new HTTP connections and drain in-flight requests.
		// Bun's stop() resolves once active requests complete — race against the
		// drain budget so a stuck request can't starve the remaining cleanup.
		if (app.server) {
			await Promise.race([
				Promise.resolve(app.server.stop()),
				Bun.sleep(SERVER_DRAIN_TIMEOUT_MS),
			]);
			logger.info('HTTP server stopped');
		}

		// 2. Close all WebSocket connections
		closeAllConnections();
		logger.info('WebSocket connections closed');

		// 3. Stop scheduled tasks
		stopScheduler();
		logger.info('Scheduler stopped');

		// 4. Stop rate limit cleanup and event loop latency timer
		stopRateLimitCleanup();
		stopEventLoopLatencyTimer();

		// 5. Close database connections
		closeReadOnlyClient();
		await closeDatabase();

		// 6. Flush logger
		logger.flush();
	} catch (err) {
		logger.error({ error: err }, 'Error during graceful shutdown');
	}

	process.exit(0);
}

process.on('SIGTERM', () => void handleShutdown());
process.on('SIGINT', () => void handleShutdown());

export { app };
