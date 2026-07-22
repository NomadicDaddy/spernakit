import { Elysia } from 'elysia';

import { authConfirmEmailChangeRoutes } from './confirm-email-change.ts';
import { authLoginRoutes } from './login.ts';
import { authMeRoutes } from './me.ts';
import { authMfaRoutes } from './mfa.ts';
import { authOAuthRoutes } from './oauth.ts';
import { authPasswordResetRoutes } from './password-reset.ts';
import { authRefreshRoutes } from './refresh.ts';
import { authRegisterRoutes } from './register.ts';
import { authUtilsRoutes } from './utils.ts';
import { authVerifyEmailRoutes } from './verify-email.ts';

const authRoutes = new Elysia({ name: 'auth-routes' })
	.use(authLoginRoutes)
	.use(authRefreshRoutes)
	.use(authMeRoutes)
	.use(authMfaRoutes)
	.use(authOAuthRoutes)
	.use(authConfirmEmailChangeRoutes)
	.use(authPasswordResetRoutes)
	.use(authRegisterRoutes)
	.use(authUtilsRoutes)
	.use(authVerifyEmailRoutes);

export { authRoutes };
