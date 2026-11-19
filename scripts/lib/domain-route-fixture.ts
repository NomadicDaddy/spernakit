/**
 * Twelve small route groups and the aggregator a derived application would build from them, for
 * scripts/test-domain-route-aggregator.ts. Each group is a literal chain, as an application's own
 * groups are, so the test sees the same inferred route types an application would.
 */
import { Elysia } from 'elysia';

import { domainRoutes } from '../../backend/src/routes/domain.ts';

const fixtureGroup01 = new Elysia({ prefix: '/fx01' }).get('/', () => ({ group: 1 as const }));
const fixtureGroup02 = new Elysia({ prefix: '/fx02' }).get('/', () => ({ group: 2 as const }));
const fixtureGroup03 = new Elysia({ prefix: '/fx03' }).get('/', () => ({ group: 3 as const }));
const fixtureGroup04 = new Elysia({ prefix: '/fx04' }).get('/', () => ({ group: 4 as const }));
const fixtureGroup05 = new Elysia({ prefix: '/fx05' }).get('/', () => ({ group: 5 as const }));
const fixtureGroup06 = new Elysia({ prefix: '/fx06' }).get('/', () => ({ group: 6 as const }));
const fixtureGroup07 = new Elysia({ prefix: '/fx07' }).get('/', () => ({ group: 7 as const }));
const fixtureGroup08 = new Elysia({ prefix: '/fx08' }).get('/', () => ({ group: 8 as const }));
const fixtureGroup09 = new Elysia({ prefix: '/fx09' }).get('/', () => ({ group: 9 as const }));
const fixtureGroup10 = new Elysia({ prefix: '/fx10' }).get('/', () => ({ group: 10 as const }));
const fixtureGroup11 = new Elysia({ prefix: '/fx11' }).get('/', () => ({ group: 11 as const }));
const fixtureGroup12 = new Elysia({ prefix: '/fx12' }).get('/', () => ({ group: 12 as const }));

/** An application's own aggregator: its route groups in one typed chain. */
const fixtureAppRoutes = new Elysia({ name: 'fixture-app-routes' })
	.use(fixtureGroup01)
	.use(fixtureGroup02)
	.use(fixtureGroup03)
	.use(fixtureGroup04)
	.use(fixtureGroup05)
	.use(fixtureGroup06)
	.use(fixtureGroup07)
	.use(fixtureGroup08)
	.use(fixtureGroup09)
	.use(fixtureGroup10)
	.use(fixtureGroup11)
	.use(fixtureGroup12);

/**
 * The derived application's domain aggregator: the template's groups, then the application's own
 * aggregator with one more .use(), which is what DEVELOPMENT.md tells an application to add.
 */
const derivedDomainRoutes = new Elysia({ name: 'derived-routes' })
	.use(domainRoutes)
	.use(fixtureAppRoutes);

const FIXTURE_GROUP_COUNT = 12;

export { derivedDomainRoutes, FIXTURE_GROUP_COUNT, fixtureAppRoutes };
