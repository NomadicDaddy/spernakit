import { Elysia, t } from 'elysia';
import { join } from 'node:path';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	badRequestExample,
	dataExample,
	FORBIDDEN_EXAMPLE,
	INTERNAL_ERROR_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import {
	createBackup,
	getBackupDirectory,
	getBackupStatus,
	restoreFromBackup,
} from '../../services/backupService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';

const systemBackupRoutes = new Elysia({
	detail: { tags: ['System'] },
	prefix: '/system',
})
	.use(authPlugin)
	.get(
		'/backup/status',
		({ set }) => {
			// Backup status changes infrequently - medium cache (5 min)
			setCacheHeaders(set, 'MEDIUM');
			return dataResponse(getBackupStatus());
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			detail: {
				description:
					'Returns current backup status including last backup time, backup ' +
					'size, and available backup files. Cached for 5 minutes. Requires ' +
					'SYSOP role.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Backup status with recent backups', {
										backups: [
											{
												createdAt: '2026-02-03T06:00:00.000Z',
												filename: 'backup-2026-02-03T06-00-00.db',
												size: 2457600,
											},
											{
												createdAt: '2026-02-02T06:00:00.000Z',
												filename: 'backup-2026-02-02T06-00-00.db',
												size: 2441216,
											},
										],
										lastBackupAt: '2026-02-03T06:00:00.000Z',
										lastBackupSize: 2457600,
									}),
								},
							},
						},
						description: 'Current backup status.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get database backup status (SYSOP only)',
			},
		}
	)
	.post(
		'/backup/trigger',
		async ({ set }) => {
			const result = await createBackup();
			if (!result.success) {
				set.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
			}
			return dataResponse(result);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			detail: {
				description:
					'Triggers an immediate database backup. Returns { data: { success, ' +
					'path, size } } on success, or 500 if the backup fails. Backups are ' +
					'stored in the configured backup directory. Requires SYSOP role.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Backup completed', {
										path: 'data/backups/backup-2026-02-03T12-30-00.db',
										size: 2457600,
										success: true,
									}),
								},
							},
						},
						description: 'Backup created successfully.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Trigger manual database backup (SYSOP only)',
			},
		}
	)
	.post(
		'/backup/restore',
		async ({ body, set }) => {
			const fullPath = join(getBackupDirectory(), body.backupPath);
			const result = await restoreFromBackup(fullPath);
			if (!result.success) {
				set.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
			}
			return dataResponse(result);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			body: t.Object({
				backupPath: t.String({ minLength: 1, pattern: '^[a-zA-Z0-9._-]+$' }),
			}),
			detail: {
				description:
					'Restores the database from a specified backup file. This is a ' +
					'destructive operation that replaces the current database. Returns ' +
					'500 if the restore fails. The backupPath must point to an existing ' +
					'backup file. Requires SYSOP role (highest privilege level).',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Restore completed', {
										success: true,
									}),
								},
							},
						},
						description: 'Database restored successfully.',
					},
					'400': badRequestExample('backupPath must not be empty', 'VALIDATION_FAILED'),
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Restore database from backup (SYSOP only)',
			},
		}
	);

export { systemBackupRoutes };
