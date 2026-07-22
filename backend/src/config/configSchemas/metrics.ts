import { Type } from '../configSchemaHelpers';

export const metricsSchema = Type.Object({
	collectionIntervalMs: Type.Integer(),
});
