/**
 * The source text scripts/test-domain-route-aggregator.ts writes into an app initialized from
 * HEAD: the application aggregator DEVELOPMENT.md describes, the one-line change to domain.ts that
 * mounts it, and a type probe over the real `ReturnType<typeof createApiApp>`.
 */

const FIXTURE_GROUP_COUNT = 12;

function groupName(group: number): string {
	return `fixtureGroup${String(group).padStart(2, '0')}`;
}

/**
 * backend/src/routes/app.ts for the probe app: twelve literal route groups in one typed chain, the
 * way an application keeps its own groups.
 *
 * @returns The file's source text
 */
function appRoutesSource(): string {
	const groups: string[] = [];
	const uses: string[] = [];
	for (let group = 1; group <= FIXTURE_GROUP_COUNT; group++) {
		const prefix = `/fx${String(group).padStart(2, '0')}`;
		groups.push(
			`const ${groupName(group)} = new Elysia({ prefix: '${prefix}' }).get('/', () => ({ group: ${String(group)} as const }));`,
		);
		uses.push(`\t.use(${groupName(group)})`);
	}
	return [
		"import { Elysia } from 'elysia';",
		'',
		...groups,
		'',
		"const appRoutes = new Elysia({ name: 'app-routes' })",
		`${uses.join('\n')};`,
		'',
		'export { appRoutes };',
		'',
	].join('\n');
}

/**
 * Apply the documented extension to a copy of domain.ts: import the app aggregator and mount it
 * with one more .use() at the end of the domainRoutes chain.
 *
 * @param domainSource - The probe app's backend/src/routes/domain.ts
 * @returns The extended source, or null when the chain's end cannot be found
 */
function extendDomainSource(domainSource: string): null | string {
	const chainEnd = '\t.use(workspaceRoutes);';
	if (domainSource.split(chainEnd).length !== 2) return null;
	return domainSource
		.replace(
			"import { Elysia } from 'elysia';\n",
			() => "import { Elysia } from 'elysia';\n\nimport { appRoutes } from './app.ts';\n",
		)
		.replace(chainEnd, () => '\t.use(workspaceRoutes)\n\t.use(appRoutes);');
}

/**
 * backend/src/domain-route-probe.ts: type assertions over the composed API type. The two
 * `@ts-expect-error` lines are the control: if a route's type were any or missing, the wrong
 * assertion would hold, the directive would be unused, and the typecheck would fail.
 *
 * @returns The file's source text
 */
function probeSource(): string {
	return [
		"import type { createApiApp } from './create-api-app.ts';",
		'',
		"type Routes = ReturnType<typeof createApiApp>['~Routes']['api']['v1'];",
		'type IsAny<T> = 0 extends 1 & T ? true : false;',
		'type Expect<T extends true> = T;',
		'',
		'export type AppRoutesNotAny = Expect<IsAny<Routes> extends false ? true : false>;',
		"export type KeepsTemplateRoute = Expect<'tasks' extends keyof Routes ? true : false>;",
		'export type KeepsFirstAppRoute = Expect<',
		"\tRoutes['fx01']['get']['response'][200] extends { group: 1 } ? true : false",
		'>;',
		'export type KeepsLastAppRoute = Expect<',
		"\tRoutes['fx12']['get']['response'][200] extends { group: 12 } ? true : false",
		'>;',
		'// @ts-expect-error The last app route answers group 12, so this must not hold.',
		"export type WrongResponseFails = Expect<Routes['fx12']['get']['response'][200] extends { group: 13 } ? true : false>;",
		'// @ts-expect-error No route named fx13 exists.',
		"export type MissingRouteFails = Routes['fx13'];",
		'',
	].join('\n');
}

export { appRoutesSource, extendDomainSource, FIXTURE_GROUP_COUNT, probeSource };
