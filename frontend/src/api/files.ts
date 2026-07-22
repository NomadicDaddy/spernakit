import type { DataResponse, PaginatedResponse, SuccessResponse } from './types';

import { apiClient } from './client';
import { buildQueryParams } from './requestHelpers';

interface FileRecord {
	createdAt: string;
	filename: string;
	id: number;
	mimeType: string;
	originalName: string;
	size: number;
	thumbnailKey: null | string;
	uploadedBy: null | number;
}

interface ListFilesParams {
	limit?: string;
	page?: string;
}

/**
 * List files with pagination support.
 *
 * @returns Paginated list of files with total count
 */
function listFiles(params?: ListFilesParams): Promise<PaginatedResponse<FileRecord>> {
	const filtered = buildQueryParams(params);
	return apiClient.get<PaginatedResponse<FileRecord>>('/files', {
		...(filtered ? { params: filtered } : {}),
	});
}

/**
 * Upload a file via multipart/form-data.
 *
 * @returns Uploaded file metadata (id, originalName, mimeType, size, thumbnailKey, uploadedBy)
 */
function uploadFile(file: File): Promise<DataResponse<FileRecord>> {
	const formData = new FormData();
	formData.append('file', file);
	return apiClient.upload<DataResponse<FileRecord>>('/files/upload', formData);
}

/**
 * Download a file by its numeric ID.
 *
 * @returns File blob content with appropriate content type
 */
function downloadFile(id: number): Promise<Blob> {
	return apiClient.download(`/files/${id}`);
}

/**
 * Soft-delete a file by ID (marks as deleted, preserves data).
 *
 * @returns Success response
 */
function deleteFile(id: number): Promise<SuccessResponse> {
	return apiClient.delete<SuccessResponse>(`/files/${id}`);
}

export { deleteFile, downloadFile, listFiles, uploadFile };
export type { FileRecord };
