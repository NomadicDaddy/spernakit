import { Elysia } from 'elysia';

import { getConfig } from '../config/configLoader.ts';
import { log } from '../services/auditService.ts';
import { getClientIp } from '../utils/clientIp.ts';
import { logger, REDACT_PATHS } from '../utils/logger.ts';
import { parseWorkspaceId } from '../utils/validation.ts';
import { resolveUserFromCookie } from './auth.ts';
import { getResolvedApiKeyUser } from './authRequest.ts';
import { requestIdPlugin } from './requestId.ts';

const MUTATING_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

/** Paths to exclude from audit logging (noisy or internal). */
const EXCLUDED_PATHS = new Set([
	'/api/v1/health',
	'/api/v1/auth/refresh',
	'/api/v1/system/web-vitals',
]);

/**
 * Body field names to capture into audit details for entity-name searchability.
 * Only scalar, human-readable identifier fields — no PII, no secrets.
 * REDACT_PATHS is consulted to drop any field that might leak credentials.
 */
const ENTITY_NAME_FIELDS = new Set([
	'description',
	'displayName',
	'host',
	'hostname',
	'label',
	'location',
	'name',
	'path',
	'port',
	'slug',
	'title',
	'type',
	'url',
	'username',
]);

/** Extract lowercase leaf names from REDACT_PATHS for O(1) lookup. */
const REDACTED_KEYS = new Set(
	REDACT_PATHS.map((p) => {
		const leaf = p.replace(/^\*+\./, '').toLowerCase();
		return leaf;
	})
);

function resolveUserIdFromRequest(request: Request): number | undefined {
	try {
		// API-key requests carry no auth cookie — attribute them to the key
		// owner via the request-scoped cache populated by authPlugin's derive
		// (re-validating here would fail: HMAC nonces are single-use).
		if (request.headers.get('x-api-key')) {
			return getResolvedApiKeyUser(request)?.id;
		}
		return resolveUserFromCookie(request)?.id;
	} catch (err) {
		logger.debug({ err }, 'Failed to resolve user for audit log');
		return undefined;
	}
}

function extractEntityFromPath(path: string): {
	entityId?: string | undefined;
	entityType?: string | undefined;
} {
	const pathParts = path.replace('/api/v1/', '').split('/');
	return {
		entityId: pathParts.length > 1 ? pathParts[1] : undefined,
		entityType: pathParts[0],
	};
}

/**
 * Pick human-readable identifier fields from a request body for audit details.
 * Drops any field listed in REDACT_PATHS and caps string length to 200 chars.
 * Returns undefined when no eligible fields are present.
 */
function extractEntityFieldsFromBody(body: unknown): Record<string, string> | undefined {
	if (body === null || typeof body !== 'object') return undefined;
	const entries: Record<string, string> = {};
	for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
		if (!ENTITY_NAME_FIELDS.has(key)) continue;
		if (REDACTED_KEYS.has(key.toLowerCase())) continue;
		if (typeof value === 'string') {
			entries[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
		} else if (typeof value === 'number' || typeof value === 'boolean') {
			entries[key] = String(value);
		}
	}
	return Object.keys(entries).length > 0 ? entries : undefined;
}

/**
 * Elysia plugin that auto-logs mutating HTTP requests (POST, PUT, PATCH, DELETE)
 * to the audit_logs table.
 *
 * Uses requestIdPlugin for type-safe requestId access.
 *
 * Configuration via config.audit:
 * - enabled: Whether audit logging is enabled (default: true)
 * - ipWhitelist: IPs to exclude from audit logging (default: ['127.0.0.1', '::1'])
 */
const auditPlugin = new Elysia({ name: 'audit' })
	.use(requestIdPlugin)
	.onAfterResponse({ as: 'global' }, ({ body, request, requestId, sessionId, set }) => {
		const config = getConfig();
		if (!config.audit.enabled) return;

		const method = request.method;
		if (!MUTATING_METHODS.has(method)) return;

		const url = new URL(request.url);
		const path = url.pathname;

		if (EXCLUDED_PATHS.has(path)) return;

		const status = typeof set.status === 'number' ? set.status : 200;

		const userId = resolveUserIdFromRequest(request);
		// getClientIp() transparently reads the WeakMap populated by
		// clientIpPlugin's onRequest hook — by this lifecycle stage,
		// server.requestIP(request) returns null and would otherwise fall
		// through to the '0.0.0.0' sentinel.
		const ipAddress = getClientIp(request);

		// NOTE: 127.0.0.1/::1 must NEVER be auto-excluded from audit logging.
		// They are only dropped when explicitly listed in config.audit.ipWhitelist.
		// Local development traffic (SYSOP from localhost) is the primary audit signal.
		if (ipAddress && config.audit.ipWhitelist.includes(ipAddress)) return;

		const action = `${method} ${path}`;
		const { entityId, entityType } = extractEntityFromPath(path);
		const details: Record<string, unknown> = {};
		if (requestId) details.requestId = requestId;
		if (sessionId) details.sessionId = sessionId;
		if (status >= 400) details.status = status;

		// Capture entity-identifier fields from the request body so audit-log
		// search can match on user-facing names (e.g., backup target name) in
		// addition to the bare entity type/id. REDACT_PATHS excludes secrets.
		const bodyFields = extractEntityFieldsFromBody(body);
		if (bodyFields) details.entity = bodyFields;

		const wsHeader = request.headers.get('x-workspace-id');
		const workspaceId = parseWorkspaceId(wsHeader ?? undefined) ?? undefined;

		const auditEntry = {
			action,
			...(Object.keys(details).length > 0 ? { details } : {}),
			...(entityId !== undefined ? { entityId } : {}),
			...(entityType !== undefined ? { entityType } : {}),
			...(ipAddress !== undefined ? { ipAddress } : {}),
			...(userId !== undefined ? { userId } : {}),
			...(workspaceId !== undefined ? { workspaceId } : {}),
		};

		try {
			log(auditEntry);
		} catch (err) {
			// Never let an audit-write failure break the response path; log the
			// full payload so the record is recoverable from application logs.
			logger.error({ auditEntry, err }, 'Failed to write audit log entry');
		}
	});

export { auditPlugin };
