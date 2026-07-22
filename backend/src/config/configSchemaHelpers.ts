import { Type, type Static, type TObject, type TLiteral, type TUnion } from '@sinclair/typebox';

export { Type } from '@sinclair/typebox';
export type { Static, TObject, TSchema } from '@sinclair/typebox';

/**
 * Build a closed set of allowed string values as a union of literals.
 *
 * The cast target `TUnion<TLiteral<V[number]>[]>` is what keeps `Static`
 * resolving to the narrow union (e.g. `'a' | 'b'`) instead of widening to
 * `string`; without it the schema still validates but every consumer loses the
 * literal type. A `default` passed here is forwarded into the union options, so
 * a defaulted enum keeps the narrow type and still defaults at parse time.
 *
 * A union of literals, rather than a raw `enum` JSON-Schema keyword: `Value`
 * dispatches on TypeBox's `[Kind]` symbol, so a hand-rolled `{ enum: [...] }`
 * (via `Type.Unsafe`) would carry no kind and silently validate nothing.
 */
function enumString<const V extends readonly string[]>(
	values: V,
	options: { default?: V[number]; description?: string } = {}
) {
	return Type.Union(
		values.map((value) => Type.Literal(value)),
		options
	) as TUnion<TLiteral<V[number]>[]>;
}

/**
 * Attach an object default to a nested `TObject` schema.
 *
 * Spreading is safe here because TypeBox's symbol keys are enumerable, so
 * `[Kind]` survives the copy and the result is still a validatable `TObject`
 * with an unchanged `Static`.
 */
function withDefault<T extends TObject>(schema: T, defaultValue: Static<T>): T {
	return { ...schema, default: defaultValue } as T;
}

/**
 * Give a nested config section an empty-object default, so omitting the whole
 * section from the JSON is recoverable.
 *
 * `Value.Default` substitutes `{}` for the missing section and then descends
 * into it, which lets the section's own field-level defaults fill it in. The
 * property stays `required` in the emitted JSON Schema — the default is applied
 * before validation runs, so a config file may omit the section, but the
 * validated `AppConfig` always has it.
 */
function withEmptyDefault<T extends TObject>(schema: T): T {
	return withDefault(schema, {});
}

export { enumString, withDefault, withEmptyDefault };
