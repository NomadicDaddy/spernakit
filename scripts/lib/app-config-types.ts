/**
 * Shared AppConfig type definitions for scripts.
 *
 * Extracted from scripts/load-json-config.ts so the loader stays under the
 * max-lines ceiling. Consumers should keep importing AppConfig/LoadedConfig
 * from scripts/load-json-config.ts, which re-exports these types.
 */
export interface AppConfig {
	alerting?: {
		cooldownMinutes?: number;
		email?: {
			enabled?: boolean;
			recipients?: string[];
		};
		inApp?: {
			enabled?: boolean;
		};
		webhook?: {
			enabled?: boolean;
			headers?: Record<string, string>;
			secret?: string;
			timeoutMs?: number;
			url?: string;
		};
	};
	app?: {
		apiKey?: string;
		description?: string;
		name?: string;
		slug?: string;
	};
	audit?: {
		enabled?: boolean;
		ipWhitelist?: string[];
	};
	cors?: {
		allowNoOrigin?: boolean;
		frontendDevOrigins?: string[];
	};
	dashboards?: {
		enabled?: boolean;
		maxPerUser?: number;
		sharingEnabled?: boolean;
	};
	database?: {
		allowDbPush?: boolean;
		backup?: {
			compress?: boolean;
			enabled?: boolean;
			encrypt?: boolean;
			intervalHours?: number;
			location?: string;
			retentionDays?: number;
		};
		dialect?: string;
		integrityCheck?: {
			enabled?: boolean;
			intervalHours?: number;
			mode?: string;
		};
		url?: string;
		vacuum?: {
			enabled?: boolean;
			intervalHours?: number;
		};
	};
	email?: {
		from?: string;
		host?: string;
		pass?: string;
		port?: number;
		secure?: boolean;
		user?: string;
	};
	healthCheck?: {
		alertsEnabled?: boolean;
		alertThreshold?: number;
		enabled?: boolean;
		interval?: number;
		retentionDays?: number;
		thresholds?: {
			auth?: { critical: number; warn: number };
			db?: { critical: number; warn: number };
			fs?: { critical: number; warn: number };
			memory?: { critical: number; warn: number };
		};
	};
	logging?: {
		file?: {
			enabled?: boolean;
			maxFiles?: number;
			maxSize?: number;
			path?: string;
		};
		level?: string;
	};
	metrics?: {
		collectionIntervalMs?: number;
	};
	oauth?: {
		github?: {
			callbackUrl?: string;
			clientId?: string;
			clientSecret?: string;
			enabled?: boolean;
		};
		google?: {
			callbackUrl?: string;
			clientId?: string;
			clientSecret?: string;
			enabled?: boolean;
		};
		microsoft?: {
			callbackUrl?: string;
			clientId?: string;
			clientSecret?: string;
			enabled?: boolean;
			tenantId?: string;
		};
	};
	rateLimit?: {
		backend?: string;
		enabled?: boolean;
		maxRequests?: number;
		windowMs?: number;
	};
	retention?: {
		auditLogsDays?: number;
		businessEventsDays?: number;
		healthCheckAlertsDays?: number;
		healthCheckLogsDays?: number;
		scheduledTaskExecutionsDays?: number;
		systemMetricsDays?: number;
	};
	roles?: {
		ADMIN?: { description: string; label: string };
		MANAGER?: { description: string; label: string };
		OPERATOR?: { description: string; label: string };
		SYSOP?: { description: string; label: string };
		VIEWER?: { description: string; label: string };
	};
	security: {
		applicationApiKey?: string;
		authCookieName?: string;
		bcryptRounds?: number;
		cookieMaxAge?: number;
		cookieSecret?: string;
		cookieSecure?: boolean;
		csrfTokenTtlMs?: number;
		encryptionKey?: string;
		jwtExpiresIn?: string;
		jwtPrivateKey?: string;
		jwtPublicKey?: string;
		jwtRefreshExpiresIn?: string;
		jwtRefreshPrivateKey?: string;
		jwtRefreshPublicKey?: string;
		lockoutDurationMs?: number;
		maxFailedLoginAttempts?: number;
		maxTokenSize?: number;
		passwordResetTokenExpiryMs?: number;
		refreshCookieName?: string;
		sessionTimeout?: number;
		strictCsp?: boolean;
	};
	server?: {
		backendPort?: number;
		backendUrl?: string;
		frontendPort?: number;
		frontendUrl?: string;
		host?: string;
		maxRequestBodySize?: number;
		nodeEnv?: string;
		timezone?: string;
		trustedProxies?: string[];
		trustProxy?: boolean;
	};
	storage?: {
		adapter?: string;
		allowedMimeTypes?: string[];
		maxFileSize?: number;
		s3?: {
			accessKeyId?: string;
			bucket?: string;
			endpoint?: string;
			region?: string;
			secretAccessKey?: string;
		};
	};
	testing?: {
		crawlContentMinLength?: number;
		crawlInteractionDelay?: number;
		crawlLoginEmail?: string;
		crawlLoginPassword?: string;
		crawlMaxDepth?: number;
		crawlPageSettleDelay?: number;
		crawlSeedRoutes?: string[];
		crawlTimeout?: number;
	};
	tokenCleanup?: {
		enabled?: boolean;
		intervalHours?: number;
		minimumIntervalHours?: number;
	};
	websocket?: {
		cleanupInterval?: number;
		connectTimeout?: number;
		maxConnectionsPerIp?: number;
		maxPayload?: number;
		pingInterval?: number;
		pingTimeout?: number;
		rateLimitWindow?: number;
		upgradeTimeout?: number;
	};
}

export interface LoadedConfig {
	appSlug: string;
	config: AppConfig;
}
