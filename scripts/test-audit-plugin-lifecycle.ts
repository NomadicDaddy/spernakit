#!/usr/bin/env bun
import {
	buildAuditEntry,
	buildResponseDetails,
	shouldExcludeAuditRequest,
} from '../backend/src/plugins/audit.ts';

const failures: string[] = [];
const assert = (condition: boolean, message: string): void => {
	if (!condition) failures.push(message);
};

const base = {
	auditEnabled: true,
	ipAddress: '203.0.113.10',
	ipWhitelist: ['127.0.0.1'],
	method: 'POST',
	path: '/api/v1/widgets/7',
};
assert(!shouldExcludeAuditRequest(base), 'ordinary mutating requests must be audited');
assert(shouldExcludeAuditRequest({ ...base, auditEnabled: false }), 'disabled audit must exclude');
assert(shouldExcludeAuditRequest({ ...base, method: 'GET' }), 'reads must be excluded');
assert(
	shouldExcludeAuditRequest({ ...base, ipAddress: '127.0.0.1' }),
	'whitelisted clients must be excluded',
);
assert(
	shouldExcludeAuditRequest({ ...base, path: '/api/v1/auth/refresh' }),
	'refresh noise must be excluded',
);

const success = buildResponseDetails(
	{ name: 'Widget', password: 'never-copy' },
	'req-1',
	's-1',
	204,
);
assert(success?.['status'] === undefined, 'successful requests must not store a failure status');
assert(
	JSON.stringify(success?.['entity']) === JSON.stringify({ name: 'Widget' }),
	'entity extraction must retain names and discard secrets',
);
const failure = buildResponseDetails(undefined, 'req-2', undefined, 422);
assert(failure?.['status'] === 422, 'failed requests must retain their response status');

const authenticated = buildAuditEntry({ action: 'POST /users', userId: 7, workspaceId: 2 });
const apiKeyActor = buildAuditEntry({ action: 'POST /widgets', userId: 9 });
const impersonated = buildAuditEntry({ action: 'PATCH /users/7', impersonatedBy: 1, userId: 7 });
assert(authenticated.userId === 7 && authenticated.workspaceId === 2, 'session actor was lost');
assert(apiKeyActor.userId === 9, 'API-key owner attribution was lost');
assert(
	impersonated.userId === 7 && impersonated.impersonatedBy === 1,
	'impersonation attribution was lost',
);

if (failures.length > 0) {
	console.error('[FAIL] audit-plugin-lifecycle');
	for (const item of failures) console.error(` - ${item}`);
	process.exit(1);
}
console.log('[OK] audit lifecycle exclusions, response details, and actor attribution are stable');
