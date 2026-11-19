#!/usr/bin/env bun
/**
 * Gate: the template mounts its route groups through one typed aggregator, backend/src/routes/
 * domain.ts, and an application can add its own groups the same way without losing type inference
 * (`.aidd/features/typed-domain-route-aggregator`).
 *
 * Compile time (this file is in scripts/tsconfig.json, so typecheck fails if any of these break):
 *  - DomainRoutes is inferred, not any, and carries the template's routes.
 *  - A derived aggregator (the template's groups plus a twelve-group application aggregator) keeps
 *    every application route's response type, with no TS2589 at that depth.
 * Run time:
 *  1. create-api-app.ts imports the aggregator and mounts it with exactly one .use(), and mounts no
 *     route group of its own.
 *  2. Every group the aggregator mounts serves its route under /api/v1, checked against the
 *     fixture application's twelve groups.
 */
import { Elysia } from 'elysia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DomainRoutes } from '../backend/src/routes/domain.ts';

import {
	type derivedDomainRoutes,
	FIXTURE_GROUP_COUNT,
	fixtureAppRoutes,
} from './lib/domain-route-fixture.ts';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Expect<T extends true> = T;
type DerivedRoutes = (typeof derivedDomainRoutes)['~Routes'];

// The template aggregator's type is real, and it holds a template route.
export type DomainRoutesNotAny = Expect<
	IsAny<DomainRoutes['~Routes']> extends false ? true : false
>;
export type DomainRoutesHasTasks = Expect<
	'tasks' extends keyof DomainRoutes['~Routes'] ? true : false
>;
// The derived aggregator keeps both the template's routes and the application's, fully typed.
export type DerivedHasTemplateRoute = Expect<'tasks' extends keyof DerivedRoutes ? true : false>;
export type DerivedKeepsAppResponse = Expect<
	DerivedRoutes['fx12']['get']['response'][200] extends { group: 12 } ? true : false
>;
export type DerivedResponseNotAny = Expect<
	IsAny<DerivedRoutes['fx01']['get']['response'][200]> extends false ? true : false
>;

const repoRoot = resolve(import.meta.dir, '..');
const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

// 1. One import, one .use(), no route group of its own.
const createApiApp = readFileSync(resolve(repoRoot, 'backend/src/create-api-app.ts'), 'utf8');
assert(
	createApiApp.includes("import { domainRoutes } from './routes/domain.ts';"),
	'1: create-api-app.ts should import domainRoutes from routes/domain.ts',
);
assert(
	(createApiApp.match(/\.use\(domainRoutes\)/g) ?? []).length === 1,
	'1: create-api-app.ts should mount domainRoutes exactly once',
);
const groupImports = createApiApp.match(/from '\.\/routes\/(?!domain\.ts')[^']+'/g) ?? [];
assert(
	groupImports.length === 0,
	`1: create-api-app.ts should import no route group directly, found ${groupImports.join(', ')}`,
);

// 2. The application's groups are reachable once mounted.
const app = new Elysia({ prefix: '/api/v1' }).use(fixtureAppRoutes);
for (let group = 1; group <= FIXTURE_GROUP_COUNT; group++) {
	const path = `/api/v1/fx${String(group).padStart(2, '0')}`;
	const response = await app.handle(new Request(`http://localhost${path}`));
	const body = (await response.json()) as { group?: number };
	assert(response.status === 200 && body.group === group, `2: ${path} should answer its group`);
}

if (failures.length > 0) {
	console.error(`domain route aggregator: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('domain route aggregator: all checks passed');
