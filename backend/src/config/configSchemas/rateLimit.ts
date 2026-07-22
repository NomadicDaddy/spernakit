import { Type, enumString } from '../configSchemaHelpers';

export const rateLimitSchema = Type.Object({
	authEnabled: Type.Boolean({ default: true }),
	backend: enumString(['memory', 'database']),
	enabled: Type.Boolean({ default: true }),
	maxRequests: Type.Integer(),
	windowMs: Type.Integer(),
});
