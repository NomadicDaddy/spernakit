import { Type, enumString } from '../configSchemaHelpers';

export const serverSchema = Type.Object({
	backendPort: Type.Integer({ maximum: 65535, minimum: 1 }),
	backendUrl: Type.String({ format: 'uri' }),
	frontendPort: Type.Integer({ maximum: 65535, minimum: 1 }),
	frontendUrl: Type.String({ format: 'uri' }),
	host: Type.String({ default: '127.0.0.1' }),
	maxRequestBodySize: Type.Integer({ default: 10 * 1024 * 1024, minimum: 1024 }),
	nodeEnv: enumString(['development', 'production', 'preview', 'test'], {
		default: 'development',
	}),
	timezone: Type.String({ default: 'UTC' }),
	trustedProxies: Type.Array(Type.String(), { default: [] }),
	trustProxy: Type.Boolean({ default: false }),
});
