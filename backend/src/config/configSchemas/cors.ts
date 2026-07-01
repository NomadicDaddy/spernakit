import { z } from 'zod';

export const corsSchema = z.object({
	allowedOrigins: z
		.array(
			z
				.string()
				.regex(
					/^https?:\/\/[a-zA-Z0-9._-]+(:\d+)?$/,
					'Origin must be scheme + host + optional port (no trailing slash or path)'
				)
		)
		.default([])
		.describe(
			'Explicit list of allowed origins for production deployments with trustProxy enabled'
		),
	allowNoOrigin: z.boolean().default(false),
	frontendDevOrigins: z.array(z.string()).default([]),
	inheritFrontendUrl: z
		.boolean()
		.default(false)
		.describe(
			'When true and allowedOrigins is empty, server.frontendUrl is appended at config-load. ' +
				'Lets staging configs run in NODE_ENV=production without manually duplicating the host ' +
				'into cors.allowedOrigins. Off by default — real production should set allowedOrigins explicitly.'
		),
});
