import { Elysia, t } from 'elysia';

import {
	EMAIL_MAX_LENGTH,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN,
} from '../../constants/validation.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { UserRoleSchema } from '../../schemas/domain.ts';
import { limitParam, pageParam } from '../../schemas/pagination.ts';
import {
	adminResetPasswordDocs,
	createUserDocs,
	deleteUserDocs,
	getUserByIdDocs,
	listUsersDocs,
	unlockUserDocs,
	updateUserDocs,
} from './crud.docs.ts';
import { handleAdminResetPassword, handleUnlockUser } from './handlers-admin.ts';
import {
	handleCreateUser,
	handleDeleteUser,
	handleGetUserById,
	handleListUsers,
	handleUpdateUser,
} from './handlers-crud.ts';

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

const usersCrudRoutes = new Elysia({
	detail: { tags: ['Users'] },
	prefix: '/users',
})
	.use(authPlugin)
	.get('/', handleListUsers, {
		detail: listUsersDocs,
		query: t.Object({
			fields: t.Optional(
				t.String({
					description: 'Comma-separated list of fields to return',
					maxLength: 500,
				}),
			),
			limit: limitParam(),
			page: pageParam(),
			role: t.Optional(UserRoleSchema),
			search: t.Optional(t.String({ maxLength: 200 })),
		}),
		requireRole: 'ADMIN',
	})
	// API-only: No frontend caller (list endpoint covers UI needs). Available for API-key consumers.
	.get('/:id', handleGetUserById, {
		detail: getUserByIdDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		requireRole: 'ADMIN',
	})
	.post('/', handleCreateUser, {
		body: t.Object({
			email: t.String({ format: 'email', maxLength: EMAIL_MAX_LENGTH }),
			password: t.String({
				maxLength: PASSWORD_MAX_LENGTH,
				minLength: PASSWORD_MIN_LENGTH,
			}),
			role: t.Optional(UserRoleSchema),
			username: t.String({
				maxLength: USERNAME_MAX_LENGTH,
				minLength: USERNAME_MIN_LENGTH,
				pattern: USERNAME_PATTERN,
			}),
		}),
		detail: createUserDocs,
		requireRole: 'ADMIN',
	})
	.put('/:id', handleUpdateUser, {
		body: t.Object({
			email: t.Optional(t.String({ format: 'email', maxLength: EMAIL_MAX_LENGTH })),
			role: t.Optional(UserRoleSchema),
			username: t.Optional(
				t.String({
					maxLength: USERNAME_MAX_LENGTH,
					minLength: USERNAME_MIN_LENGTH,
					pattern: USERNAME_PATTERN,
				}),
			),
		}),
		detail: updateUserDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		requireRole: 'ADMIN',
	})
	.delete('/:id', handleDeleteUser, {
		detail: deleteUserDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		requireRole: 'ADMIN',
	})
	.post('/:id/unlock', handleUnlockUser, {
		detail: unlockUserDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		requireRole: 'ADMIN',
	})
	.post('/:id/reset-password', handleAdminResetPassword, {
		body: t.Union([
			t.Object({ mode: t.Literal('set'), password: t.String({ minLength: 1 }) }),
			t.Object({ mode: t.Literal('email') }),
		]),
		detail: adminResetPasswordDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		requireRole: 'ADMIN',
	});

export { usersCrudRoutes };
