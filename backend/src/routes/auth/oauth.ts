import { Elysia, t } from 'elysia';

import {
	badRequestExample,
	dataExample,
	notFoundExample,
	RATE_LIMITED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { getEnabledProviders } from '../../services/oauthService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { handleOAuthCallback, handleOAuthRedirect } from './oauth-handlers.ts';

const providerParam = t.Object({
	provider: t.Union([t.Literal('github'), t.Literal('google'), t.Literal('microsoft')]),
});

const authOAuthRoutes = new Elysia({ detail: { tags: ['Auth'] }, prefix: '/auth' })
	.use(authPlugin)
	.get(
		'/oauth/providers',
		() => {
			return dataResponse({ providers: getEnabledProviders() });
		},
		{
			detail: {
				description:
					'Returns the list of OAuth providers enabled in the server configuration ' +
					'(e.g., GitHub, Google). No authentication required. Returns ' +
					'{ data: { providers: string[] } }.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Two providers enabled', {
										providers: ['github', 'google'],
									}),
								},
							},
						},
						description: 'List of enabled OAuth provider names.',
					},
				},
				summary: 'List enabled OAuth providers',
			},
		}
	)
	.get('/oauth/:provider', handleOAuthRedirect, {
		detail: {
			description:
				'Initiates an OAuth login flow by redirecting the user to the specified ' +
				'provider authorization URL. Supported providers depend on the server config. ' +
				'Returns 404 if the provider is not enabled or does not exist.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: {
								success: dataExample('GitHub OAuth URL', {
									url: 'https://github.com/login/oauth/authorize?client_id=abc&state=xyz',
								}),
							},
						},
					},
					description: 'Authorization URL (also sets 302 redirect).',
				},
				'404': notFoundExample('OAuth provider'),
			},
			summary: 'Redirect to OAuth provider',
		},
		params: providerParam,
	})
	.get('/oauth/:provider/callback', handleOAuthCallback, {
		detail: {
			description:
				'Handles the OAuth callback after the user authorizes with an external ' +
				'provider. Exchanges the authorization code for tokens, creates or links ' +
				'the user account, sets auth cookies, and redirects to /dashboard. ' +
				'Returns 400 with AUTH_OAUTH_FAILED if the code is missing or the exchange fails.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: {
								success: dataExample('OAuth user profile', {
									email: 'octocat@github.com',
									id: 5,
									role: 'VIEWER',
									username: 'octocat',
								}),
							},
						},
					},
					description: 'OAuth login successful - cookies set, redirecting.',
				},
				'400': badRequestExample('Missing authorization code', 'AUTH_OAUTH_FAILED'),
				'429': RATE_LIMITED_EXAMPLE,
			},
			summary: 'Handle OAuth provider callback',
		},
		params: providerParam,
		query: t.Object({
			code: t.Optional(t.String({ maxLength: 2048 })),
			error: t.Optional(t.String({ maxLength: 256 })),
			state: t.Optional(t.String({ maxLength: 512 })),
		}),
	});

export { authOAuthRoutes };
