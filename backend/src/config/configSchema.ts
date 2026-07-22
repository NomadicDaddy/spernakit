import type { Static } from '@sinclair/typebox';

import { Value } from '@sinclair/typebox/value';

import { Type, withEmptyDefault } from './configSchemaHelpers';
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
import { SchemaValidator } from './schemaParse';

const appConfigSchemaObject = Type.Object({
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

type AppConfig = Static<typeof appConfigSchemaObject>;

/**
 * Config schema validator. `.safeParse(raw)` validates a merged config object —
 * applying defaults and stripping unknown keys — and returns either the typed
 * config or a list of issues. `getConfigJsonSchema()` returns a JSON-Schema copy
 * for the `config:schema` generator and the drift check.
 */
const appConfigSchema = new SchemaValidator(appConfigSchemaObject);

/**
 * Return a fresh, JSON-serializable copy of the config JSON Schema.
 *
 * The TypeBox object is itself valid JSON Schema; callers mutate the returned
 * clone (e.g. annotating `$schema`/`title`/`description`) without affecting the
 * runtime schema. Exposed as a function so root-level scripts do not need to
 * depend on `@sinclair/typebox` directly.
 */
function getConfigJsonSchema(): Record<string, unknown> {
	return Value.Clone(appConfigSchemaObject) as unknown as Record<string, unknown>;
}

export { type AppConfig, appConfigSchema, getConfigJsonSchema };
