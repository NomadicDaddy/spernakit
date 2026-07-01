import { z } from 'zod';
import { toJSONSchema } from 'zod/v4/core';

import { alertingSchema } from './configSchemas/alerting';
import { apiKeysSchema } from './configSchemas/apiKeys';
import { appSchema } from './configSchemas/app';
import { auditSchema } from './configSchemas/audit';
import { corsSchema } from './configSchemas/cors';
import { dashboardsSchema } from './configSchemas/dashboards';
import { databaseSchema } from './configSchemas/database';
import { databaseAdminSchema } from './configSchemas/databaseAdmin';
import { emailSchema } from './configSchemas/email';
import { healthCheckSchema } from './configSchemas/healthCheck';
import { loggingSchema } from './configSchemas/logging';
import { metricsSchema } from './configSchemas/metrics';
import { oauthSchema } from './configSchemas/oauth';
import { rateLimitSchema } from './configSchemas/rateLimit';
import { retentionSchema } from './configSchemas/retention';
import { rolesSchema } from './configSchemas/roles';
import { securitySchema } from './configSchemas/security';
import { serverSchema } from './configSchemas/server';
import { storageSchema } from './configSchemas/storage';
import { testingSchema } from './configSchemas/testing';
import { tokenCleanupSchema } from './configSchemas/tokenCleanup';
import { websocketSchema } from './configSchemas/websocket';
import { withEmptyDefault } from './configUtilsZod';

const appConfigSchema = z.object({
	alerting: withEmptyDefault(alertingSchema),
	apiKeys: withEmptyDefault(apiKeysSchema),
	app: appSchema,
	audit: withEmptyDefault(auditSchema),
	cors: withEmptyDefault(corsSchema),
	dashboards: withEmptyDefault(dashboardsSchema),
	database: databaseSchema,
	databaseAdmin: withEmptyDefault(databaseAdminSchema),
	email: withEmptyDefault(emailSchema),
	healthCheck: withEmptyDefault(healthCheckSchema),
	logging: withEmptyDefault(loggingSchema),
	metrics: withEmptyDefault(metricsSchema),
	oauth: withEmptyDefault(oauthSchema),
	rateLimit: withEmptyDefault(rateLimitSchema),
	retention: withEmptyDefault(retentionSchema),
	roles: withEmptyDefault(rolesSchema),
	security: securitySchema,
	server: serverSchema,
	storage: withEmptyDefault(storageSchema),
	testing: withEmptyDefault(testingSchema),
	tokenCleanup: withEmptyDefault(tokenCleanupSchema),
	websocket: withEmptyDefault(websocketSchema),
});

type AppConfig = z.infer<typeof appConfigSchema>;

export { type AppConfig, appConfigSchema, toJSONSchema };
