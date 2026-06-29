import { Elysia, t } from 'elysia';

import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../constants/pagination.ts';
import {
	EMAIL_MAX_LENGTH,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN,
} from '../../constants/validation.ts';
import { requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { UserRoleSchema } from '../../schemas/domain.ts';
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
		beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
		detail: listUsersDocs,
		query: t.Object({
			fields: t.Optional(
				t.String({
					description: 'Comma-separated list of fields to return',
					maxLength: 500,
				})
			),
			limit: t.Optional(
				t.Numeric({ default: DEFAULT_PAGE_LIMIT, maximum: MAX_PAGE_LIMIT, minimum: 1 })
			),
			page: t.Optional(t.Numeric({ default: DEFAULT_PAGE, minimum: 1 })),
			role: t.Optional(UserRoleSchema),
			search: t.Optional(t.String({ maxLength: 200 })),
		}),
	})
	// API-only: No frontend caller (list endpoint covers UI needs). Available for API-key consumers.
	.get('/:id', handleGetUserById, {
		beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
		detail: getUserByIdDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	})
	.post('/', handleCreateUser, {
		beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
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
	})
	.put('/:id', handleUpdateUser, {
		beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
		body: t.Object({
			email: t.Optional(t.String({ format: 'email', maxLength: EMAIL_MAX_LENGTH })),
			role: t.Optional(UserRoleSchema),
			username: t.Optional(
				t.String({
					maxLength: USERNAME_MAX_LENGTH,
					minLength: USERNAME_MIN_LENGTH,
					pattern: USERNAME_PATTERN,
				})
			),
		}),
		detail: updateUserDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	})
	.delete('/:id', handleDeleteUser, {
		beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
		detail: deleteUserDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	})
	.post('/:id/unlock', handleUnlockUser, {
		beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
		detail: unlockUserDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	})
	.post('/:id/reset-password', handleAdminResetPassword, {
		beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
		body: t.Union([
			t.Object({ mode: t.Literal('set'), password: t.String({ minLength: 1 }) }),
			t.Object({ mode: t.Literal('email') }),
		]),
		detail: adminResetPasswordDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	});

export { usersCrudRoutes };
