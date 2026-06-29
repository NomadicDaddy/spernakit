import { Elysia, t } from 'elysia';
import { OAUTH_PROVIDERS } from 'spernakit-shared';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { log as logAudit } from '../../services/auditService.ts';
import {
	getOAuthProviderSettingsAsync,
	updateOAuthProviderSettings,
	type OAuthProviderName,
} from '../../services/oauthService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';

const providerParam = t.Object({
	provider: t.Union(OAUTH_PROVIDERS.map((p) => t.Literal(p))),
});

async function handleOAuthProviderTest({
	params,
	set,
}: {
	params: { provider: string };
	set: { headers: Record<string, number | string>; status?: number | string };
}) {
	const provider = params.provider as OAuthProviderName;

	// Basic connectivity test — verify the provider's authorization URL is reachable
	const urls: Record<string, string> = {
		github: 'https://github.com/login/oauth/authorize',
		google: 'https://accounts.google.com/o/oauth2/v2/auth',
		microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
	};

	const url = urls[provider];
	if (!url) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return { error: 'Unknown provider' };
	}

	try {
		const response = await fetch(url, {
			method: 'HEAD',
			redirect: 'manual',
			signal: AbortSignal.timeout(10_000),
		});
		// OAuth endpoints typically return 200 or 3xx — anything not a network error is OK
		return dataResponse({
			provider,
			reachable: response.status < 500,
			statusCode: response.status,
		});
	} catch (err) {
		return dataResponse({
			error: err instanceof Error ? err.message : 'Connection failed',
			provider,
			reachable: false,
		});
	}
}

const settingsOAuthProvidersRoutes = new Elysia({
	detail: { tags: ['Settings'] },
	prefix: '/settings',
})
	.use(authPlugin)
	.get(
		'/oauth-providers',
		async () => {
			const providers = await getOAuthProviderSettingsAsync();
			return dataResponse({ providers });
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			detail: {
				description:
					'Returns OAuth provider settings from the database. Client secrets are ' +
					'returned as last-4 characters only. Requires SYSOP role.',
				summary: 'Get OAuth provider settings (SYSOP)',
			},
		}
	)
	.patch(
		'/oauth-providers/:provider',
		async ({ body, params, user }) => {
			const authUser = assertUser(user);
			const provider = params.provider as OAuthProviderName;

			await updateOAuthProviderSettings(provider, body, authUser.id);

			logAudit({
				action: 'oauth.provider.updated',
				details: {
					fields: Object.keys(body),
					provider,
				},
				entityId: provider,
				entityType: 'oauth-provider',
				userId: authUser.id,
			});

			return successResponse();
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			body: t.Object({
				callbackUrlOverride: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
				clientId: t.Optional(t.String({ maxLength: 500 })),
				clientSecret: t.Optional(t.String({ maxLength: 500 })),
				enabled: t.Optional(t.Boolean()),
			}),
			detail: {
				description:
					"Updates a specific OAuth provider's settings. Client secret is encrypted " +
					'before storage. All fields are optional — partial updates supported. Requires SYSOP role.',
				summary: 'Update OAuth provider settings (SYSOP)',
			},
			params: providerParam,
		}
	)
	.post('/oauth-providers/:provider/test', handleOAuthProviderTest, {
		beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
		detail: {
			description:
				'Tests connectivity to an OAuth provider endpoint. Returns status code and ' +
				'reachability. Requires SYSOP role.',
			summary: 'Test OAuth provider connection (SYSOP)',
		},
		params: providerParam,
	});

export { settingsOAuthProvidersRoutes };
