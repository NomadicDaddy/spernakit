import { Type } from '../configSchemaHelpers';

export const dashboardsSchema = Type.Object({
	enabled: Type.Boolean({ default: true }),
	maxPerUser: Type.Integer({ minimum: 1 }),
	sharingEnabled: Type.Boolean(),
});
