import { Elysia } from 'elysia';

import { getRedactedConfigSnapshot } from '../../config/runtimeConfigSnapshot.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';

const RUNTIME_CONFIG_EXAMPLE = {
	app: { description: 'Spernakit app', name: 'Spernakit', slug: 'spernakit' },
	database: { dialect: 'sqlite', url: '[REDACTED]' },
	server: { backendPort: 3441, frontendPort: 3440, nodeEnv: 'production' },
	storage: { adapter: 'local', s3: { accessKeyId: '(not set)', secretAccessKey: '(not set)' } },
};

const settingsRuntimeConfigRoutes = new Elysia({
	detail: { tags: ['Settings'] },
	prefix: '/settings',
})
	.use(authPlugin)
	.get(
		'/runtime-config',
		({ set }) => {
			// Sensitive operational snapshot — never store in a shared/CDN cache.
			setCacheHeaders(set, 'NO_CACHE');
			return dataResponse(getRedactedConfigSnapshot());
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			detail: {
				description:
					'Returns a read-only, redacted snapshot of the effective startup configuration ' +
					'(config/{slug}.json merged with defaults), sourced live from the validated ' +
					'config singleton in configLoader.ts. Exposes operational fields from the app, ' +
					'server, database, databaseAdmin, cors, rateLimit, websocket, logging, storage, ' +
					'retention, tokenCleanup, metrics, healthCheck, audit and alerting sections. All secrets — ' +
					'security keys, cookie secrets, API keys, OAuth client secrets, SMTP passwords, ' +
					'the database connection string, S3 credentials and the alerting webhook ' +
					'secret/headers — are excluded or masked with `[REDACTED]`. This endpoint never ' +
					'writes configuration and is not a second source of config truth. Requires ' +
					'SYSOP role.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample(
										'Redacted runtime config snapshot',
										RUNTIME_CONFIG_EXAMPLE
									),
								},
							},
						},
						description: 'Redacted effective runtime configuration.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get redacted runtime config overview (SYSOP only)',
			},
		}
	);

export { settingsRuntimeConfigRoutes };
