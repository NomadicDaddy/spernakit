/**
 * Enum value extraction primitives for API type contract validation.
 *
 * Extracted from scripts/validate-api-types.ts (max-lines split). Pure
 * parsing helpers: TypeBox union schemas on the backend side, regex-based
 * string-literal union parsing on the frontend/shared source side.
 */

export interface TypeBoxLiteralSchema {
	const: string;
}

export interface TypeBoxUnionSchema {
	anyOf: TypeBoxLiteralSchema[];
}

/** Extract string literal values from a TypeBox t.Union([t.Literal(...)]) schema. */
export function extractTypeBoxEnumValues(schema: TypeBoxUnionSchema): string[] {
	if (!schema.anyOf || !Array.isArray(schema.anyOf)) return [];
	return schema.anyOf
		.filter(
			(item): item is TypeBoxLiteralSchema =>
				'const' in item && typeof item.const === 'string'
		)
		.map((item) => item.const)
		.sort();
}

/** Extract string-literal union values from a TS source file.
 *  Supports two shapes:
 *   1. Plain union:        type FooType = 'a' | 'b' | 'c';
 *   2. Derived from const: const FOO_TYPES = ['a', 'b', 'c'] as const;
 *                          type FooType = (typeof FOO_TYPES)[number];
 *  Returns null if the type name is not found, or the values list (sorted) otherwise.
 */
export function extractUnionValuesFromSource(content: string, typeName: string): null | string[] {
	const typePattern = new RegExp(`type\\s+${typeName}\\s*=\\s*([^;]+);`, 's');
	const typeMatch = typePattern.exec(content);
	if (!typeMatch?.[1]) return null;

	const typeBody = typeMatch[1];
	const values: string[] = [];

	// Pattern 2: type FooType = (typeof SOME_CONST)[number];
	const derivedPattern = /\(\s*typeof\s+(\w+)\s*\)\s*\[\s*number\s*\]/;
	const derivedMatch = derivedPattern.exec(typeBody);
	if (derivedMatch?.[1]) {
		const constName = derivedMatch[1];
		const constPattern = new RegExp(
			`const\\s+${constName}\\s*=\\s*\\[([^\\]]+)\\]\\s*as\\s+const`,
			's'
		);
		const constMatch = constPattern.exec(content);
		if (!constMatch?.[1]) return null;
		const valuePattern = /'([^']+)'/g;
		let valueMatch: null | RegExpExecArray;
		while ((valueMatch = valuePattern.exec(constMatch[1])) !== null) {
			if (valueMatch[1]) values.push(valueMatch[1]);
		}
		return values.sort();
	}

	// Pattern 1: type FooType = 'a' | 'b' | 'c';
	const valuePattern = /'([^']+)'/g;
	let valueMatch: null | RegExpExecArray;
	while ((valueMatch = valuePattern.exec(typeBody)) !== null) {
		if (valueMatch[1]) values.push(valueMatch[1]);
	}
	return values.sort();
}
