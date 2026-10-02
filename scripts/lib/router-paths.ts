/**
 * The route paths the frontend router registers, read out of the route modules as source.
 *
 * The modules cannot simply be imported: they pull in every page component. The route tables are
 * plain object literals, so this walks them with the TypeScript parser and joins each `path` onto
 * the paths of the objects whose `children` array it sits in. A page is either a route with a
 * `path` and no children, or an `index` child that renders something other than a redirect, which
 * is how a guarded page is written: `{ path: '/files', element: <ProtectedRoute />, children:
 * [{ index: true, element: <FilesPage /> }] }`.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function property(
	node: ts.ObjectLiteralExpression,
	name: string,
): ts.PropertyAssignment | undefined {
	return node.properties.find(
		(candidate): candidate is ts.PropertyAssignment =>
			ts.isPropertyAssignment(candidate) &&
			ts.isIdentifier(candidate.name) &&
			candidate.name.text === name,
	);
}

function literalPath(node: ts.ObjectLiteralExpression): string | undefined {
	const value = property(node, 'path')?.initializer;
	if (value === undefined) return undefined;
	return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
		? value.text
		: undefined;
}

/** True when the route renders something other than a `<Navigate />` redirect. */
function rendersPage(node: ts.ObjectLiteralExpression, source: ts.SourceFile): boolean {
	const element = property(node, 'element')?.initializer.getText(source) ?? '';
	return element !== '' && !element.includes('<Navigate');
}

/** An `index` child that renders a page rather than redirecting to a sibling. */
function isIndexPage(node: ts.ObjectLiteralExpression, source: ts.SourceFile): boolean {
	const isIndex = property(node, 'index')?.initializer.kind === ts.SyntaxKind.TrueKeyword;
	return isIndex && rendersPage(node, source);
}

function join(parent: string, child: string): string {
	if (child.startsWith('/')) return child;
	return `${parent.replace(/\/$/, '')}/${child}`;
}

/**
 * Every page route in one route module, as the router would resolve it.
 * @param file - Route module to read
 * @param base - Path the module's routes are mounted under, for a table used as `children`
 * @returns Sorted, de-duplicated route paths
 */
export function routerPaths(file: string, base = ''): string[] {
	// Parsed as TSX: read as plain TypeScript, each `<LazyPage ... />` is a malformed type
	// assertion and the object literal around it is lost.
	const source = ts.createSourceFile(
		file,
		readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TSX,
	);
	const paths = new Set<string>();

	const visit = (node: ts.Node, parent: string): void => {
		if (!ts.isObjectLiteralExpression(node)) {
			node.forEachChild((child) => {
				visit(child, parent);
			});
			return;
		}
		const own = literalPath(node);
		const resolved = own === undefined ? parent : join(parent, own);
		const isLeaf = own !== undefined && property(node, 'children') === undefined;
		if ((isLeaf && rendersPage(node, source)) || isIndexPage(node, source)) {
			paths.add(resolved);
		}
		node.forEachChild((child) => {
			visit(child, resolved);
		});
	};

	visit(source, base);
	return [...paths].sort();
}
