import { Elysia } from 'elysia';

import { settingsAppFeaturesRoutes } from './app-features.ts';
import { settingsAuthSecurityRoutes } from './auth-security.ts';
import { settingsGeneralRoutes } from './general.ts';
import { settingsOAuthProvidersRoutes } from './oauth-providers.ts';
import { settingsRuntimeConfigRoutes } from './runtime-config.ts';
import { settingsSmtpRoutes } from './smtp.ts';
import { settingsUserRoutes } from './user.ts';

const settingsRoutes = new Elysia({ name: 'settings-routes' })
	.use(settingsAppFeaturesRoutes)
	.use(settingsGeneralRoutes)
	.use(settingsAuthSecurityRoutes)
	.use(settingsOAuthProvidersRoutes)
	.use(settingsRuntimeConfigRoutes)
	.use(settingsSmtpRoutes)
	.use(settingsUserRoutes);

export { settingsRoutes };
