import { Type } from '../configSchemaHelpers';

export const apiKeysSchema = Type.Object({
	maxPerUser: Type.Integer({ default: 10, minimum: 1 }),
});
