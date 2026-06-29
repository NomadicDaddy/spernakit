/**
 * API key scope — permission level granted to an API key.
 *
 * - read:  Read-only access to endpoints
 * - write: Read + write access (create/update/delete)
 * - admin: Full administrative access, including destructive operations
 */

type ApiKeyScope = 'admin' | 'read' | 'write';

const API_KEY_SCOPES = {
	ADMIN: 'admin',
	READ: 'read',
	WRITE: 'write',
} as const;

const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
	[API_KEY_SCOPES.ADMIN]: 'Admin',
	[API_KEY_SCOPES.READ]: 'Read',
	[API_KEY_SCOPES.WRITE]: 'Write',
} as const;

export { API_KEY_SCOPE_LABELS, API_KEY_SCOPES };
export type { ApiKeyScope };
