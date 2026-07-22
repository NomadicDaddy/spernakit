import { Type } from '../configSchemaHelpers';

export const appSchema = Type.Object({
	description: Type.String(),
	name: Type.String(),
	slug: Type.String(),
});
