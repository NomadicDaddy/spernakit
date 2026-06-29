/**
 * WebSocket CRUD event type constants.
 *
 * Used by both backend (broadcast) and frontend (subscription/invalidation)
 * to ensure event type strings are consistent across the full stack.
 */

/** CRUD event types broadcast by backend mutation endpoints. */
const WS_CRUD_EVENTS = {
	DASHBOARD_CREATED: 'dashboard-created',
	DASHBOARD_DELETED: 'dashboard-deleted',
	DASHBOARD_UPDATED: 'dashboard-updated',
	FILE_CREATED: 'file-created',
	FILE_DELETED: 'file-deleted',
	HEALTH_ALERT_UPDATED: 'health-alert-updated',
	HEALTH_CONFIG_UPDATED: 'health-config-updated',
	SETTING_UPDATED: 'setting-updated',
	USER_CREATED: 'user-created',
	USER_DELETED: 'user-deleted',
	USER_UPDATED: 'user-updated',
	WORKSPACE_CREATED: 'workspace-created',
	WORKSPACE_DELETED: 'workspace-deleted',
	WORKSPACE_MEMBER_CREATED: 'workspace-member-created',
	WORKSPACE_MEMBER_DELETED: 'workspace-member-deleted',
	WORKSPACE_MEMBER_UPDATED: 'workspace-member-updated',
	WORKSPACE_UPDATED: 'workspace-updated',
} as const;

type WsCrudEvent = (typeof WS_CRUD_EVENTS)[keyof typeof WS_CRUD_EVENTS];

export { WS_CRUD_EVENTS };
export type { WsCrudEvent };
