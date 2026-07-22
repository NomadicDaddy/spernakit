import { Type } from '../configSchemaHelpers';

export const auditSchema = Type.Object({
	enabled: Type.Boolean({ default: true }),
	ipWhitelist: Type.Array(Type.String(), { default: [] }),
});
