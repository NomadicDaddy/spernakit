import { extractEnumColumns, extractSchemaTables } from './extract.ts';

function escapeRegularExpression(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Report enum columns that lack their required named domain constraint.
 *
 * A Drizzle `enum` is a TypeScript-level narrowing only; without a `check('chk_<table>_<column>')`
 * beside it, the database accepts any string the application forgets to validate.
 */
export function checkEnumDomainConstraints(source: string, relativePath: string): string[] {
	const domainErrors: string[] = [];

	for (const table of extractSchemaTables(source)) {
		for (const column of extractEnumColumns(table.source, table.startLine)) {
			const constraintName = `chk_${table.tableName}_${column.columnName}`;
			const pattern = new RegExp(
				`check\\s*\\(\\s*'${escapeRegularExpression(constraintName)}'\\s*,`,
			);

			if (!pattern.test(table.source)) {
				domainErrors.push(
					`  ${relativePath}:${column.line}: enum column "${column.columnName}" lacks a named domain CHECK constraint`,
				);
			}
		}
	}

	return domainErrors;
}
