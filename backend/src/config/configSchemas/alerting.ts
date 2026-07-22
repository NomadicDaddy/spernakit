import { Type, withEmptyDefault } from '../configSchemaHelpers';

export const alertingEmailSchema = Type.Object({
	enabled: Type.Boolean({ default: false }),
	recipients: Type.Array(Type.String({ format: 'email' }), { default: [] }),
});

export const alertingWebhookSchema = Type.Object({
	enabled: Type.Boolean({ default: false }),
	headers: Type.Record(Type.String(), Type.String(), { default: {} }),
	secret: Type.String({ default: '' }),
	timeoutMs: Type.Integer(),
	url: Type.Union([Type.String({ format: 'uri' }), Type.Literal('')], { default: '' }),
});

export const alertingInAppSchema = Type.Object({
	enabled: Type.Boolean({ default: true }),
});

export const alertingSchema = Type.Object({
	cooldownMinutes: Type.Integer({ minimum: 1 }),
	email: withEmptyDefault(alertingEmailSchema),
	inApp: withEmptyDefault(alertingInAppSchema),
	webhook: withEmptyDefault(alertingWebhookSchema),
});
