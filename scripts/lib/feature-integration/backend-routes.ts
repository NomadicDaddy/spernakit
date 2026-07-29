import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

interface RouteModule {
	exports: string[];
	file: string;
	uses: string[];
}

function extractNamedExports(source: string): Set<string> {
	const names = new Set<string>();
	for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
		for (const item of match[1]!.split(',')) {
			const name = item
				.trim()
				.split(/\s+as\s+/)[0]!
				.trim();
			if (name) names.add(name);
		}
	}
	return names;
}

function extractUseCalls(source: string): string[] {
	return [...source.matchAll(/\.use\(([A-Za-z_][A-Za-z0-9_]*)\)/g)].map((match) => match[1]!);
}

function extractElysiaExports(source: string): string[] {
	const namedExports = extractNamedExports(source);
	const directExports = new Set(
		[
			...source.matchAll(
				/\bexport\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=;\n]+)?=\s*new\s+Elysia\b/g,
			),
		].map((match) => match[1]!),
	);
	const declarations = [
		...source.matchAll(
			/\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=;\n]+)?=\s*new\s+Elysia\b/g,
		),
	].map((match) => match[1]!);

	return declarations.filter((name) => directExports.has(name) || namedExports.has(name));
}

function listTypeScriptFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listTypeScriptFiles(fullPath));
		} else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
			files.push(fullPath);
		}
	}
	return files;
}

function listApiAssemblyFiles(root: string): string[] {
	const backendSource = resolve(root, 'backend/src');
	return readdirSync(backendSource, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				entry.name.startsWith('create-api-app') &&
				entry.name.endsWith('.ts'),
		)
		.map((entry) => resolve(backendSource, entry.name));
}

function readRouteModules(root: string): RouteModule[] {
	const routesDir = resolve(root, 'backend/src/routes');
	return listTypeScriptFiles(routesDir)
		.map((file) => {
			const source = readFileSync(file, 'utf8');
			return {
				exports: extractElysiaExports(source),
				file,
				uses: extractUseCalls(source),
			};
		})
		.filter((module) => module.exports.length > 0);
}

function findReachableRoutes(root: string, modules: RouteModule[]): Set<string> {
	const modulesByExport = new Map<string, RouteModule[]>();
	for (const module of modules) {
		for (const routeExport of module.exports) {
			const owners = modulesByExport.get(routeExport) ?? [];
			owners.push(module);
			modulesByExport.set(routeExport, owners);
		}
	}

	const pending = listApiAssemblyFiles(root).flatMap((file) =>
		extractUseCalls(readFileSync(file, 'utf8')),
	);
	const reachable = new Set<string>();
	const traversedModules = new Set<string>();

	while (pending.length > 0) {
		const routeExport = pending.shift()!;
		if (reachable.has(routeExport)) continue;
		reachable.add(routeExport);
		for (const module of modulesByExport.get(routeExport) ?? []) {
			if (traversedModules.has(module.file)) continue;
			traversedModules.add(module.file);
			pending.push(...module.uses);
		}
	}

	return reachable;
}

export function checkBackendRoutes(root: string): string[] {
	const modules = readRouteModules(root);
	const reachable = findReachableRoutes(root, modules);
	const errors: string[] = [];

	for (const module of modules) {
		for (const routeExport of module.exports) {
			if (routeExport === 'wsRoutes' || reachable.has(routeExport)) continue;
			const path = relative(root, module.file).replaceAll('\\', '/');
			errors.push(
				`  Route "${routeExport}" exported from ${path} but not reachable from backend/src/create-api-app.ts through .use() calls`,
			);
		}
	}

	return errors;
}
