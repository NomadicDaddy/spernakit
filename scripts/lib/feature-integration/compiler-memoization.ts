import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

const MANUAL_MEMOIZATION_APIS = new Set(['memo', 'useCallback', 'useMemo']);

function findManualMemoization(sourceFile: ts.SourceFile): string[] {
	const reactNamespaces = new Set<string>();
	const violations = new Set<string>();

	for (const statement of sourceFile.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			statement.moduleSpecifier.text !== 'react'
		) {
			continue;
		}
		const clause = statement.importClause;
		if (!clause) continue;
		if (clause.name) reactNamespaces.add(clause.name.text);
		if (!clause.namedBindings) continue;
		if (ts.isNamespaceImport(clause.namedBindings)) {
			reactNamespaces.add(clause.namedBindings.name.text);
			continue;
		}
		for (const element of clause.namedBindings.elements) {
			const importedName = (element.propertyName ?? element.name).text;
			if (MANUAL_MEMOIZATION_APIS.has(importedName)) {
				violations.add(importedName);
			}
		}
	}

	function visit(node: ts.Node): void {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.expression) &&
			reactNamespaces.has(node.expression.expression.text) &&
			MANUAL_MEMOIZATION_APIS.has(node.expression.name.text)
		) {
			violations.add(node.expression.name.text);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);

	return [...violations].sort();
}

function hasUseNoMemoDirective(sourceFile: ts.SourceFile): boolean {
	for (const statement of sourceFile.statements) {
		if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
			return false;
		}
		if (statement.expression.text === 'use no memo') return true;
	}
	return false;
}

function checkCompilerMemoization(root: string): { errors: string[]; scanned: number } {
	const errors: string[] = [];
	const frontendRoot = resolve(root, 'frontend/src');
	let scanned = 0;

	function walk(dir: string): void {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
			scanned += 1;
			const sourceFile = ts.createSourceFile(
				full,
				readFileSync(full, 'utf8'),
				ts.ScriptTarget.Latest,
				true,
				entry.name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
			);
			if (hasUseNoMemoDirective(sourceFile)) continue;
			const violations = findManualMemoization(sourceFile);
			if (violations.length === 0) continue;
			errors.push(
				`  ${relative(root, full).replace(/\\/g, '/')}: uses manual React memoization ` +
					`(${violations.join(', ')}) without a file-level 'use no memo' directive`,
			);
		}
	}

	walk(frontendRoot);
	return { errors, scanned };
}

export { checkCompilerMemoization };
