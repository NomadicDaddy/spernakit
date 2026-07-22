import { Type } from '../configSchemaHelpers';

export const emailSchema = Type.Object({
	retryAttempts: Type.Integer({ default: 2, maximum: 10, minimum: 1 }),
	retryDelayMs: Type.Integer({ default: 1000, maximum: 60000, minimum: 0 }),
});
