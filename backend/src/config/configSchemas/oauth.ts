import { Type, withEmptyDefault } from '../configSchemaHelpers';

export const oauthProviderSchema = Type.Object({
	callbackUrl: Type.String({ default: '' }),
	clientId: Type.String({ default: '' }),
	clientSecret: Type.String({ default: '' }),
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
