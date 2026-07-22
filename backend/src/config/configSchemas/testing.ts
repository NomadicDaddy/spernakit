import { Type } from '../configSchemaHelpers';

export const testingSchema = Type.Object({
	crawlContentMinLength: Type.Integer(),
	crawlInteractionDelay: Type.Integer(),
	crawlLoginEmail: Type.String({ default: '' }),
	crawlLoginPassword: Type.String({ default: '' }),
	crawlMaxDepth: Type.Integer(),
	crawlPageSettleDelay: Type.Integer(),
	crawlSeedRoutes: Type.Array(Type.String(), { default: [] }),
	crawlTimeout: Type.Integer(),
});
