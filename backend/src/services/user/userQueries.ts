import { and, count, desc, eq, or, sql } from 'drizzle-orm';

import type { UserRole } from '../../types/roles.ts';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import {
	escapeLikePattern,
	likeEscaped,
	paginatedQuery,
	type PaginatedResponse,
} from '../../utils/dbHelpers.ts';
import { logger } from '../../utils/logger.ts';
import { getUserCache, type UserPublic } from './userCrudHelpers.ts';

const userPublicFields = {
	createdAt: users.createdAt,
	email: users.email,
	failedLoginAttempts: users.failedLoginAttempts,
	id: users.id,
	lastLoginAt: users.lastLoginAt,
	lockedUntil: users.lockedUntil,
	role: users.role,
	updatedAt: users.updatedAt,
	username: users.username,
} as const;

interface ListOptions {
	limit: number;
	page: number;
	role?: UserRole;
	search?: string;
}

function listUsers(options: ListOptions): PaginatedResponse<UserPublic> {
	const db = getDb();
	const conditions = [eq(users.isDeleted, false)];

	if (options.role) conditions.push(eq(users.role, options.role));
	if (options.search) {
		const pattern = `%${escapeLikePattern(options.search)}%`;
		conditions.push(
			or(likeEscaped(users.username, pattern), likeEscaped(users.email, pattern))!,
		);
	}

	const where = and(...conditions);
	return paginatedQuery(
		options.page,
		options.limit,
		(limit, offset) =>
			db
				.select(userPublicFields)
				.from(users)
				.where(where)
				// `id` breaks ties: created_at has one-second resolution, and the seed users share a
				// second, so an unresolved tie under LIMIT/OFFSET can show a user twice and another not
				// at all (see auditService).
				.orderBy(sql`${users.createdAt} DESC`, desc(users.id))
				.limit(limit)
				.offset(offset)
				.all(),
		() => db.select({ count: count() }).from(users).where(where).get(),
	);
}

function getUserById(id: number): null | UserPublic {
	const userCache = getUserCache();
	const cached = userCache.get(id);
	if (cached) {
		logger.debug({ userId: id }, 'User cache hit');
		return cached;
	}

	const db = getDb();
	const user =
		db
			.select(userPublicFields)
			.from(users)
			.where(and(eq(users.id, id), eq(users.isDeleted, false)))
			.get() ?? null;

	if (user) userCache.set(id, user);
	return user;
}

export { getUserById, listUsers, userPublicFields };
