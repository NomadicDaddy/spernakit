import { Type } from '../configSchemaHelpers';

export const corsSchema = Type.Object({
	allowedOrigins: Type.Array(
		Type.String({
			description:
				'Origin must be scheme + host + optional port (no trailing slash or path), e.g. https://app.example.com:8443',
			pattern: '^https?://[a-zA-Z0-9._-]+(:\\d+)?$',
		}),
		{
			default: [],
			description:
				'Explicit list of allowed origins for production deployments with trustProxy enabled',
		}
	),
	allowNoOrigin: Type.Boolean({ default: false }),
	frontendDevOrigins: Type.Array(Type.String(), { default: [] }),
	inheritFrontendUrl: Type.Boolean({
		default: false,
		description:
			'When true and allowedOrigins is empty, server.frontendUrl is appended at config-load. ' +
			'Lets staging configs run in NODE_ENV=production without manually duplicating the host ' +
			'into cors.allowedOrigins. Off by default - real production should set allowedOrigins explicitly.',
	}),
});
