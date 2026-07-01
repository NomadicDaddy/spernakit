import { Elysia, t } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../constants/pagination.ts';
import { assertUser, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { log as logAudit } from '../../services/auditService.ts';
import {
	getSafeMode,
	PostgreSqlNotSupportedError,
	setSafeMode,
} from '../../services/databaseAdminService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import { notFoundError } from '../../utils/errorResponse.ts';
import {
	handleDeleteRow,
	handleExecuteQuery,
	handleGetRelationships,
	handleGetTableData,
	handleGetTableDetails,
	handleInsertRow,
	handleListSchema,
	handleUpdateRow,
} from './handlers.ts';

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

const databaseAdminRoutes = new Elysia({
	detail: { tags: ['Database Admin'] },
	prefix: '/database-admin',
})
	.use(authPlugin)
	// Kill-switch: when databaseAdmin.enabled is false (the default), every
	// database-admin route 404s as if the panel did not exist.
	.onBeforeHandle(({ set }) => {
		if (!getConfig().databaseAdmin.enabled) {
			set.status = HTTP_STATUS.NOT_FOUND;
			return notFoundError('Resource');
		}
		return undefined;
	})
	.onError(({ code, error, set }) => {
		if (code !== 'UNKNOWN' || !(error instanceof PostgreSqlNotSupportedError)) {
			return;
		}
		set.status = HTTP_STATUS.NOT_IMPLEMENTED;
		return {
			code: 'POSTGRESQL_NOT_SUPPORTED',
			message: 'Database admin panel is not available with PostgreSQL dialect',
		};
	})
	// Schema introspection (SYSOP)
	.get('/schema', handleListSchema, {
		beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
		detail: {
			description: 'Returns all tables with metadata (name, column count, row count).',
			summary: 'List all database tables (SYSOP)',
		},
	})
	.get('/schema/relationships', handleGetRelationships, {
		beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
		detail: {
			description:
				'Returns all foreign key relationships across all tables for ERD rendering.',
			summary: 'Get all table relationships (SYSOP)',
		},
	})
	.get('/schema/:tableName', handleGetTableDetails, {
		beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
		detail: {
			description:
				'Returns detailed table metadata including columns, foreign keys, and indexes.',
			summary: 'Get table details (SYSOP)',
		},
		params: t.Object({
			tableName: t.String({ minLength: 1, pattern: '^[a-z_][a-z0-9_]*$' }),
		}),
	})
	// Data operations (SYSOP)
	.get('/data/:tableName', handleGetTableData, {
		beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
		detail: {
			description: 'Returns paginated rows from a table with optional soft-delete filtering.',
			summary: 'Get table data (SYSOP)',
		},
		params: t.Object({
			tableName: t.String({ minLength: 1, pattern: '^[a-z_][a-z0-9_]*$' }),
		}),
		query: t.Object({
			includeDeleted: t.Optional(t.BooleanString()),
			limit: t.Optional(
				t.Numeric({ default: DEFAULT_PAGE_LIMIT, maximum: MAX_PAGE_LIMIT, minimum: 1 })
			),
			page: t.Optional(t.Numeric({ default: DEFAULT_PAGE, minimum: 1 })),
		}),
	})
	.post(
		'/data/:tableName',
		({ body, params, set, user }) => {
			const authUser = assertUser(user);
			return handleInsertRow({ body, params, set, user: authUser });
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			body: t.Record(t.String(), t.Union([t.String(), t.Number(), t.Boolean(), t.Null()])),
			detail: {
				description:
					'Inserts a new row into the table. Returns 403 when safe mode is enabled.',
				summary: 'Insert a row (SYSOP)',
			},
			params: t.Object({
				tableName: t.String({ minLength: 1, pattern: '^[a-z_][a-z0-9_]*$' }),
			}),
		}
	)
	.put(
		'/data/:tableName/:rowId',
		({ body, params, set, user }) => {
			const authUser = assertUser(user);
			return handleUpdateRow({ body, params, set, user: authUser });
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			body: t.Record(t.String(), t.Union([t.String(), t.Number(), t.Boolean(), t.Null()])),
			detail: {
				description: 'Updates a row by primary key. Returns 403 when safe mode is enabled.',
				summary: 'Update a row (SYSOP)',
			},
			params: t.Object({
				rowId: t.Numeric({ minimum: 1 }),
				tableName: t.String({ minLength: 1, pattern: '^[a-z_][a-z0-9_]*$' }),
			}),
		}
	)
	.delete(
		'/data/:tableName/:rowId',
		({ params, set, user }) => {
			const authUser = assertUser(user);
			return handleDeleteRow({ params, set, user: authUser });
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			detail: {
				description:
					'Deletes a row. Soft-deletes if table has is_deleted column, hard-deletes otherwise. Returns 403 when safe mode is enabled.',
				summary: 'Delete a row (SYSOP)',
			},
			params: t.Object({
				rowId: t.Numeric({ minimum: 1 }),
				tableName: t.String({ minLength: 1, pattern: '^[a-z_][a-z0-9_]*$' }),
			}),
		}
	)
	// Query execution (SYSOP only — can access all tables)
	.post(
		'/query',
		({ body, set, user }) => {
			const authUser = assertUser(user);
			return handleExecuteQuery({ body, set, user: authUser });
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			body: t.Object({
				sql: t.String({ maxLength: 4096, minLength: 1 }),
			}),
			detail: {
				description:
					'Executes a read-only SELECT query. Non-SELECT statements are rejected server-side.',
				summary: 'Execute read-only query (SYSOP)',
			},
		}
	)
	// Safe mode management
	.get('/safe-mode', () => dataResponse({ enabled: getSafeMode() }), {
		beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
		detail: {
			description: 'Returns the current safe mode state.',
			summary: 'Get safe mode status (SYSOP)',
		},
	})
	.put(
		'/safe-mode',
		({ body, set, user }) => {
			const authUser = assertUser(user);
			setSafeMode(body.enabled);

			logAudit({
				action: 'database-admin.safe-mode',
				details: { enabled: body.enabled },
				userId: authUser.id,
			});

			set.status = HTTP_STATUS.OK;
			return successResponse();
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			body: t.Object({
				enabled: t.Boolean(),
			}),
			detail: {
				description: 'Toggles safe mode on or off. Only SYSOP can change this.',
				summary: 'Toggle safe mode (SYSOP)',
			},
		}
	);

export { databaseAdminRoutes };
