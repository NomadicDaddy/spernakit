import { type z } from 'zod';

/**
 * Helper to provide empty-object pre-parse defaults for nested Zod schemas.
 *
 * In Zod v4, `.default({})` inserts the literal `{}` AFTER parsing, so field-level
 * defaults inside the sub-schema are not applied. `.prefault({})` instead substitutes
 * `{}` BEFORE parsing, which causes the sub-schema's own field-level defaults to run.
 *
 * This pattern is representable by `toJSONSchema()` (unlike the previous
 * `.optional().transform()` approach, which Zod 4's JSON Schema generator rejects
 * because transforms cannot be expressed in JSON Schema).
 *
 * Lives in its own module so `configSchemas/*.ts` files can import it without creating
 * a circular dependency with `configSchema.ts`.
 */
function withEmptyDefault<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
	return schema.prefault({} as never);
}

export { withEmptyDefault };
