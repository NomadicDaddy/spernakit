/**
 * OAuth provider identifiers. The const array is the runtime source of truth;
 * the `OAuthProvider` literal union is derived from it so the list and type
 * cannot drift.
 *
 * Add a new provider by appending to `OAUTH_PROVIDERS` and adding a label to
 * `OAUTH_PROVIDER_LABELS` — the Drizzle schema enum, TypeBox schemas, backend
 * services, and frontend buttons all reference these shared values.
 */

const OAUTH_PROVIDERS = ['google', 'github', 'microsoft'] as const;

type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
	github: 'GitHub',
	google: 'Google',
	microsoft: 'Microsoft',
};

export { OAUTH_PROVIDER_LABELS, OAUTH_PROVIDERS };
export type { OAuthProvider };
