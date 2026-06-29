import { Elysia, t } from 'elysia';

import {
	badRequestExample,
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { requireAuth } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import {
	handleDeleteFile,
	handleDownloadFile,
	handleGetFileInfo,
	handleListFiles,
	handleUploadFile,
} from './handlers.ts';

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

const fileRoutes = new Elysia({ detail: { tags: ['Files'] }, prefix: '/files' })
	.use(authPlugin)
	.use(workspacePlugin)
	.post('/upload', handleUploadFile, {
		beforeHandle: requireAuth,
		body: t.Object({
			file: t.File(),
		}),
		detail: {
			description:
				'Uploads a file via multipart/form-data. Optionally scoped to a workspace ' +
				'via the X-Workspace-Id header. File size and type constraints are enforced ' +
				'server-side. Returns 201 with file metadata (id, originalName, mimeType, ' +
				'size) on success. SYSOP users can upload without workspace scope.',
			responses: {
				'201': {
					content: {
						'application/json': {
							examples: {
								success: dataExample('Uploaded file metadata', {
									createdAt: '2026-02-01T12:00:00.000Z',
									id: 7,
									mimeType: 'application/pdf',
									originalName: 'report.pdf',
									size: 245760,
									uploadedBy: 1,
									workspaceId: 1,
								}),
							},
						},
					},
					description: 'File uploaded successfully.',
				},
				'400': badRequestExample('No file provided'),
				'401': UNAUTHORIZED_EXAMPLE,
			},
			summary: 'Upload a file',
		},
		type: 'multipart',
	})
	.get('/:id', handleDownloadFile, {
		beforeHandle: requireAuth,
		detail: {
			description:
				'Downloads the binary content of a file by its numeric ID. Returns the file ' +
				'with appropriate Content-Type and Content-Disposition headers for browser ' +
				'download. Only the file owner or ADMIN+ users can download. Workspace access ' +
				'is validated via X-Workspace-Id header. SYSOP users bypass all checks. ' +
				'Returns 403 if not owner/admin, 404 if not found.',
			responses: {
				'200': {
					description: 'File binary content with appropriate headers.',
				},
				'401': UNAUTHORIZED_EXAMPLE,
				'403': FORBIDDEN_EXAMPLE,
				'404': notFoundExample('File'),
			},
			summary: 'Download a file by ID',
		},
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	})
	.get('/:id/info', handleGetFileInfo, {
		beforeHandle: requireAuth,
		detail: {
			description:
				'Returns metadata for a file without downloading its content. Includes id, ' +
				'originalName, mimeType, size, uploadedBy, workspaceId, and timestamps. ' +
				'Workspace access enforced via X-Workspace-Id header. Returns 404 if not found. ' +
				'This is an API-only endpoint for programmatic consumers (e.g., API-key ' +
				'integrations). The frontend file list already provides metadata inline.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: {
								success: dataExample('File info', {
									createdAt: '2026-02-01T12:00:00.000Z',
									id: 7,
									mimeType: 'application/pdf',
									originalName: 'report.pdf',
									size: 245760,
									updatedAt: '2026-02-01T12:00:00.000Z',
									uploadedBy: 1,
									workspaceId: 1,
								}),
							},
						},
					},
					description: 'File metadata.',
				},
				'401': UNAUTHORIZED_EXAMPLE,
				'404': notFoundExample('File'),
			},
			summary: 'Get file metadata',
		},
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	})
	.get('/', handleListFiles, {
		beforeHandle: requireAuth,
		detail: {
			description:
				'Lists files with pagination support. Returns array of file records with ' +
				'metadata and total count. Results are ordered by creation date (newest ' +
				'first). Workspace access enforced via X-Workspace-Id header. SYSOP users ' +
				'bypass workspace scoping.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: {
								success: dataExample('Files list', {
									data: [
										{
											createdAt: '2026-02-01T12:00:00.000Z',
											id: 7,
											mimeType: 'application/pdf',
											originalName: 'report.pdf',
											size: 245760,
											uploadedBy: 1,
										},
										{
											createdAt: '2026-02-01T11:00:00.000Z',
											id: 6,
											mimeType: 'image/jpeg',
											originalName: 'photo.jpg',
											size: 102400,
											uploadedBy: 1,
										},
									],
									limit: 20,
									page: 1,
									total: 15,
								}),
							},
						},
					},
					description: 'Paginated file list.',
				},
				'401': UNAUTHORIZED_EXAMPLE,
			},
			summary: 'List files with pagination',
		},
		query: t.Object({
			limit: t.Optional(t.Numeric({ maximum: 100, minimum: 1 })),
			page: t.Optional(t.Numeric({ default: 1, minimum: 1 })),
		}),
	})
	.delete('/:id', handleDeleteFile, {
		beforeHandle: requireAuth,
		detail: {
			description:
				'Soft-deletes a file by ID (marks as deleted, preserves data). Only the ' +
				'file owner or ADMIN+ users can delete. Workspace access enforced via ' +
				'X-Workspace-Id header. SYSOP users bypass all checks. Returns 403 if ' +
				'not owner/admin, 404 if the file does not exist.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: { success: SUCCESS_EXAMPLE },
						},
					},
					description: 'File soft-deleted.',
				},
				'401': UNAUTHORIZED_EXAMPLE,
				'403': FORBIDDEN_EXAMPLE,
				'404': notFoundExample('File'),
			},
			summary: 'Delete a file',
		},
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	});

export { fileRoutes };
