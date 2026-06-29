import { t } from 'elysia';
import { API_KEY_SCOPES, NOTIFICATION_TYPES } from 'spernakit-shared';

const UserRoleSchema = t.Union([
	t.Literal('SYSOP'),
	t.Literal('ADMIN'),
	t.Literal('MANAGER'),
	t.Literal('OPERATOR'),
	t.Literal('VIEWER'),
]);

const NotificationTypeSchema = t.Union(NOTIFICATION_TYPES.map((v) => t.Literal(v)));

const NotificationReadStatusSchema = t.Union([
	t.Literal('all'),
	t.Literal('read'),
	t.Literal('unread'),
]);

const ApiKeyScopeSchema = t.Union([
	t.Literal(API_KEY_SCOPES.READ),
	t.Literal(API_KEY_SCOPES.WRITE),
	t.Literal(API_KEY_SCOPES.ADMIN),
]);

export { ApiKeyScopeSchema, NotificationReadStatusSchema, NotificationTypeSchema, UserRoleSchema };
