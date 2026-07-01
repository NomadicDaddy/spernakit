import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { ROLES } from 'spernakit-shared';

// DB-level domain guard: keep the CHECK list single-sourced from the shared ROLES constant.
const ROLE_IN_LIST = ROLES.map((role) => `'${role}'`).join(', ');

/**
 * Users table for authentication and user management.
 *
 * This is the core user accounts table containing authentication credentials,
 * profile information, and access control data. Users are the primary identity
 * for the application and have relationships to workspaces, notifications, and audit logs.
 *
 * Table features:
 * - Soft delete: isDeleted, deletedAt, deletedBy fields for recoverable deletion
 * - Audit fields: createdBy, updatedBy (self-referential FK with onDelete: 'set null' — seed user has createdBy = null)
 * - Account lockout: failedLoginAttempts, lockedUntil for brute-force protection
 * - Password reset: resetToken, resetTokenExpiresAt for forgot password flow
 * - Password expiry: passwordChangedAt for password policy enforcement
 * - Session tracking: lastLoginAt, lastLoginIp, refreshTokenHash for security
 * - Email verification: emailVerified, emailVerificationToken, emailVerificationExpiresAt
 * - CSRF protection: csrfToken for preventing Cross-Site Request Forgery attacks
 *
 * RBAC role hierarchy (highest to lowest):
 * - SYSOP (5): System administration, cross-workspace access
 * - ADMIN (4): Application administration, user management
 * - MANAGER (3): Team and workspace member management
 * - OPERATOR (2): Standard operations, data entry
 * - VIEWER (1): Read-only access
 *
 * Soft-delete + unique constraint note:
 * Soft-deleted users retain their email and username in the unique indexes. This is
 * intentional — it prevents new registrations from claiming a deleted user's identity,
 * which could cause confusion in audit logs and workspace membership history.
 *
 * Indexes:
 * - (implicit via UNIQUE): email, username — fast lookup for login
 * - idx_users_role: Filtering users by role
 * - idx_users_is_deleted: Excluding soft-deleted users in queries
 */
const users = sqliteTable(
	'users',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		csrfToken: text('csrf_token').unique(),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: integer('deleted_by'),
		email: text('email').notNull().unique(),
		emailVerificationExpiresAt: integer('email_verification_expires_at', { mode: 'timestamp' }),
		emailVerificationToken: text('email_verification_token').unique(),
		emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
		failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
		lastLoginIp: text('last_login_ip'),
		lockedUntil: integer('locked_until', { mode: 'timestamp' }),
		passwordChangedAt: integer('password_changed_at', { mode: 'timestamp' }),
		passwordHash: text('password_hash').notNull(),
		refreshTokenHash: text('refresh_token_hash').unique(),
		requiresPasswordChange: integer('requires_password_change', { mode: 'boolean' })
			.notNull()
			.default(false),
		resetToken: text('reset_token').unique(),
		resetTokenExpiresAt: integer('reset_token_expires_at', { mode: 'timestamp' }),
		role: text('role', {
			enum: ROLES,
		})
			.notNull()
			.default('VIEWER'),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		username: text('username').notNull().unique(),
	},
	(table) => [
		check('chk_users_role', sql`${table.role} in (${sql.raw(ROLE_IN_LIST)})`),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [table.id],
			name: 'fk_users_created_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.deletedBy],
			foreignColumns: [table.id],
			name: 'fk_users_deleted_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [table.id],
			name: 'fk_users_updated_by_users',
		}).onDelete('set null'),
		// idx_users_email and idx_users_username omitted — UNIQUE constraints on
		// email/username already create implicit indexes in SQLite
		index('idx_users_role').on(table.role),
		index('idx_users_is_deleted').on(table.isDeleted),
		index('idx_users_email_is_deleted').on(table.email, table.isDeleted),
		index('idx_users_username_is_deleted').on(table.username, table.isDeleted),
	]
);

export { users };
