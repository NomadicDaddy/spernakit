import { Type, withEmptyDefault } from '../configSchemaHelpers';

export const oauthProviderSchema = Type.Object({
	callbackUrl: Type.String({ default: '' }),
	clientId: Type.String({ default: '' }),
	clientSecret: Type.String({ default: '' }),
	clientSecretRef: Type.String({
		default: '',
		description:
			'Optional dot-path into `config/{slug}.secrets.json` (split-secrets file) holding the client ' +
			'secret, e.g. `oauth.github.clientSecret`. When set it takes precedence over the inline ' +
			'`clientSecret` and must resolve at startup; leave empty to keep the secret inline.',
	}),
	enabled: Type.Boolean({ default: false }),
});

export const oauthMicrosoftSchema = Type.Object({
	...oauthProviderSchema.properties,
	tenantId: Type.String({ default: 'common' }),
});

export const oauthSchema = Type.Object({
	github: withEmptyDefault(oauthProviderSchema),
	google: withEmptyDefault(oauthProviderSchema),
	microsoft: withEmptyDefault(oauthMicrosoftSchema),
});
