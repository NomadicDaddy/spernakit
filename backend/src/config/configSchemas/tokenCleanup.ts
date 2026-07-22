import { Type } from '../configSchemaHelpers';

export const tokenCleanupSchema = Type.Object({
	enabled: Type.Boolean({ default: true }),
	intervalHours: Type.Integer(),
	minimumIntervalHours: Type.Integer(),
});
