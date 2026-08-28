/**
 * Effective request-body ceiling for the HTTP server.
 *
 * Two independent limits bound an upload. `server.maxRequestBodySize` is a transport limit: Bun
 * stops reading once a body passes it, and the 413 it writes races whatever the client is still
 * sending, so a streamed multipart upload sees the connection close rather than a status. Bun 1.4.0
 * answers a small over-limit body with 413 and resets a large one; neither outcome is a response the
 * application chose. `storage.maxFileSize` is the application limit, and rejecting an oversize
 * upload against it produces a described 400 that names the limit in megabytes.
 *
 * The application limit can only do that job if the request reaches a handler, which means the
 * transport ceiling has to sit above it. Shipped configuration set both to 10MB, so a file at
 * exactly the file limit exceeded the transport limit once the multipart envelope was added and the
 * uploader got a dropped connection instead of the 400 the route was ready to return.
 *
 * @module requestBodyLimit
 */
import { BYTES_PER_MB } from '../constants/files.ts';

/**
 * Room left above `storage.maxFileSize` for the multipart envelope and for an upload that misses
 * the file limit by a little. Anything inside this margin still reaches the route and is answered;
 * a body beyond it is one no server should buffer, and the transport limit is what stops it.
 */
export const UPLOAD_BODY_HEADROOM = BYTES_PER_MB;

/**
 * Resolve the body ceiling the server listens with.
 *
 * @param maxRequestBodySize - Configured `server.maxRequestBodySize`
 * @param maxFileSize - Configured `storage.maxFileSize`
 * @returns The configured transport limit, raised if it would pre-empt the file-size check
 */
export function resolveMaxRequestBodySize(maxRequestBodySize: number, maxFileSize: number): number {
	return Math.max(maxRequestBodySize, maxFileSize + UPLOAD_BODY_HEADROOM);
}
