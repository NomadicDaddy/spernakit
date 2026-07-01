import { z } from 'zod';

import { withEmptyDefault } from '../configUtilsZod';

export const oauthProviderSchema = z.object({
	callbackUrl: z.string().default(''),
	clientId: z.string().default(''),
	clientSecret: z.string().default(''),
	enabled: z.boolean().default(false),
});

export const oauthMicrosoftSchema = oauthProviderSchema.extend({
	tenantId: z.string().default('common'),
});

export const oauthSchema = z.object({
	github: withEmptyDefault(oauthProviderSchema),
	google: withEmptyDefault(oauthProviderSchema),
	microsoft: withEmptyDefault(oauthMicrosoftSchema),
});
