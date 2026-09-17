import { Elysia } from 'elysia';

import { getConfig } from '../config/configLoader.ts';
import { log } from '../services/auditService.ts';
import { getClientIp } from '../utils/clientIp.ts';
import { logger, REDACT_PATHS } from '../utils/logger.ts';
import { parseWorkspaceId } from '../utils/validation.ts';
import { resolveUserFromCookie } from './auth.ts';
import { getHandlerResolvedUser, getResolvedApiKeyUser } from './authRequest.ts';
import { requestIdPlugin } from './requestId.ts';

const MUTATING_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

/** Paths to exclude from audit logging (noisy or internal). */
const EXCLUDED_PATHS = new Set([
	'/api/v1/auth/refresh',
	'/api/v1/health',
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
	}),
);

interface AuditActor {
	/** The real operator when the session is an impersonation session (`POST /users/:id/impersonate`). */
	impersonatedBy?: number | undefined;
	userId?: number | undefined;
}

interface AuditEntryInput extends AuditActor {
	action: string;
	details?: Record<string, unknown> | undefined;
	entityId?: string | undefined;
	entityType?: string | undefined;
	ipAddress?: string | undefined;
	workspaceId?: number | undefined;
}

interface AuditExclusionInput {
	auditEnabled: boolean;
	ipAddress: string | undefined;
	ipWhitelist: string[];
	method: string;
	path: string;
}

/**
 * Who to attribute the request to. `userId` is the session the request ran as — under impersonation
 * that is the impersonated account, which is what authorization saw — and `impersonatedBy` names the
 * operator behind it, so an impersonated action is never indistinguishable from the user's own.
 */
function resolveActorFromRequest(request: Request): AuditActor {
	try {
		// API-key requests carry no auth cookie — attribute them to the key
		// owner via the request-scoped cache populated by authPlugin's derive
		// (re-validating here would fail: HMAC nonces are single-use).
		if (request.headers.get('x-api-key')) {
			return { userId: getResolvedApiKeyUser(request)?.id };
		}
		// A sign-in route sets the auth cookie on the RESPONSE, so by this hook
		// there is no cookie on the REQUEST to resolve. Those handlers publish
		// the identity they established into a request-scoped cache instead.
		const payload = resolveUserFromCookie(request) ?? getHandlerResolvedUser(request);
		return { impersonatedBy: payload?.impersonatedBy, userId: payload?.id };
	} catch (err) {
		logger.debug({ err }, 'Failed to resolve user for audit log');
		return {};
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

function shouldExcludeAuditRequest(input: AuditExclusionInput): boolean {
	return (
		!input.auditEnabled ||
		!MUTATING_METHODS.has(input.method) ||
		EXCLUDED_PATHS.has(input.path) ||
		(input.ipAddress !== undefined && input.ipWhitelist.includes(input.ipAddress))
	);
}

function buildResponseDetails(
	body: unknown,
	requestId: string | undefined,
	sessionId: string | undefined,
	status: number,
): Record<string, unknown> | undefined {
	const details: Record<string, unknown> = {};
	if (requestId) details.requestId = requestId;
	if (sessionId) details.sessionId = sessionId;
	if (status >= 400) details.status = status;
	const bodyFields = extractEntityFieldsFromBody(body);
	if (bodyFields) details.entity = bodyFields;
	return Object.keys(details).length > 0 ? details : undefined;
}

function buildAuditEntry(input: AuditEntryInput): Parameters<typeof log>[0] {
	return {
		action: input.action,
		...(input.details ? { details: input.details } : {}),
		...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
		...(input.entityType !== undefined ? { entityType: input.entityType } : {}),
		...(input.impersonatedBy !== undefined ? { impersonatedBy: input.impersonatedBy } : {}),
		...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
		...(input.userId !== undefined ? { userId: input.userId } : {}),
		...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
	};
}

function persistAuditEntry(auditEntry: Parameters<typeof log>[0]): void {
	try {
		log(auditEntry);
	} catch (err) {
		// Never let an audit-write failure break the response path; log the full payload so the
		// record is recoverable from application logs.
		logger.error({ auditEntry, err }, 'Failed to write audit log entry');
	}
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
		const method = request.method;
		const path = new URL(request.url).pathname;
		// getClientIp() transparently reads the WeakMap populated by
		// clientIpPlugin's onRequest hook — by this lifecycle stage,
		// server.requestIP(request) returns null and would otherwise fall
		// through to the '0.0.0.0' sentinel.
		const ipAddress = getClientIp(request);
		if (
			shouldExcludeAuditRequest({
				auditEnabled: config.audit.enabled,
				ipAddress,
				ipWhitelist: config.audit.ipWhitelist,
				method,
				path,
			})
		)
			return;

		const status = typeof set.status === 'number' ? set.status : 200;
		const { impersonatedBy, userId } = resolveActorFromRequest(request);
		const { entityId, entityType } = extractEntityFromPath(path);
		const wsHeader = request.headers.get('x-workspace-id');
		const workspaceId = parseWorkspaceId(wsHeader ?? undefined) ?? undefined;
		persistAuditEntry(
			buildAuditEntry({
				action: `${method} ${path}`,
				details: buildResponseDetails(body, requestId, sessionId, status),
				entityId,
				entityType,
				impersonatedBy,
				ipAddress,
				userId,
				workspaceId,
			}),
		);
	});

export { auditPlugin, buildAuditEntry, buildResponseDetails, shouldExcludeAuditRequest };
