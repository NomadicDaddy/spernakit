/**
 * File Service — Facade.
 *
 * Re-exports public API from the file/ subdirectory.
 * No business logic belongs in this file.
 */
export { download, getById, list, softDelete } from './file/queries.ts';
export type { FileRecord } from './file/types.ts';
export { FileValidationError } from './file/types.ts';
export { upload } from './file/upload.ts';
