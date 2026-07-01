import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { ROLES } from 'spernakit-shared';

// DB-level domain guard: keep the CHECK list single-sourced from the shared ROLES constant.
const ROLE_IN_LIST = ROLES.map((role) => `'${role}'`).join(', ');

/**
 * Users table for authentication and user management (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/users.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'/'boolean'
 * - PostgreSQL: native timestamp/boolean types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/users.ts for SQLite variant and full documentation
 */
const users = pgTable(
	'users',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		csrfToken: text('csrf_token').unique(),
		deletedAt: timestamp('deleted_at', { mode: 'date' }),
		deletedBy: integer('deleted_by'),
		email: text('email').notNull().unique(),
		emailVerificationExpiresAt: timestamp('email_verification_expires_at', { mode: 'date' }),
		emailVerificationToken: text('email_verification_token').unique(),
		emailVerified: boolean('email_verified').notNull().default(false),
		failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
		id: serial('id').primaryKey(),
		isDeleted: boolean('is_deleted').notNull().default(false),
		lastLoginAt: timestamp('last_login_at', { mode: 'date' }),
		lastLoginIp: text('last_login_ip'),
		lockedUntil: timestamp('locked_until', { mode: 'date' }),
		passwordChangedAt: timestamp('password_changed_at', { mode: 'date' }),
		passwordHash: text('password_hash').notNull(),
		refreshTokenHash: text('refresh_token_hash').unique(),
		requiresPasswordChange: boolean('requires_password_change').notNull().default(false),
		resetToken: text('reset_token').unique(),
		resetTokenExpiresAt: timestamp('reset_token_expires_at', { mode: 'date' }),
		role: text('role', {
			enum: ROLES,
		})
			.notNull()
			.default('VIEWER'),
		updatedAt: timestamp('updated_at', { mode: 'date' })
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
		// email/username already create implicit indexes in PostgreSQL
		index('idx_users_role').on(table.role),
		index('idx_users_is_deleted').on(table.isDeleted),
		index('idx_users_email_is_deleted').on(table.email, table.isDeleted),
		index('idx_users_username_is_deleted').on(table.username, table.isDeleted),
	]
);

export { users };
