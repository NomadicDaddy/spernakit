#!/usr/bin/env bun
/** Native Bun params must reach Elysia defaults and validation as mutable own properties. */
import type * as ElysiaExports from 'elysia';

import { Elysia, t } from 'elysia';

const failures: string[] = [];
let checks = 0;
function check(condition: boolean, message: string): void {
	checks++;
	if (!condition) failures.push(message);
}

const cjsEntry = new URL('./dist/index.js', import.meta.resolve('elysia/package.json'));
const cjsModule = (await import(cjsEntry.href)) as typeof ElysiaExports;

for (const variant of [
	{ constructor: Elysia, label: 'ESM', schema: t },
	{ constructor: cjsModule.Elysia, label: 'CJS', schema: cjsModule.t },
]) {
	const app = new variant.constructor()
		.get('/numbers/:id', ({ params }) => params, {
			params: variant.schema.Object({ id: variant.schema.Numeric({ minimum: 1 }) }),
		})
		.get('/strings/:value', ({ params }) => params, {
			params: variant.schema.Object({ value: variant.schema.String() }),
		})
		.get('/wildcards/*', ({ params }) => params, {
			params: variant.schema.Object({ '*': variant.schema.String() }),
		});

	try {
		app.listen({ hostname: '127.0.0.1', port: 0 });
		const port = app.server?.port;
		if (!port) throw new Error('Native params fixture needs an ephemeral loopback port');
		const request = (path: string): Promise<Response> =>
			fetch(`http://127.0.0.1:${String(port)}${path}`, {
				signal: AbortSignal.timeout(5_000),
			});

		const valid = await request('/numbers/1');
		check(
			valid.status === 200,
			`${variant.label}: valid native numeric param returns 200, received ${valid.status}`,
		);
		const validBody: unknown = valid.status === 200 ? await valid.json() : await valid.text();
		check(
			typeof validBody === 'object' &&
				validBody !== null &&
				'id' in validBody &&
				validBody.id === 1,
			'Native numeric params retain their number transformation',
		);
		for (const id of ['0', 'not-a-number']) {
			const invalid = await request(`/numbers/${id}`);
			check(
				invalid.status === 422,
				`${variant.label}: invalid native param ${id} is rejected by validation`,
			);
			await invalid.body?.cancel();
		}

		const encoded = await request('/strings/a%2Fb');
		check(encoded.status === 200, `${variant.label}: encoded slash route returns 200`);
		const encodedBody: unknown = await encoded.json();
		check(
			typeof encodedBody === 'object' &&
				encodedBody !== null &&
				'value' in encodedBody &&
				encodedBody.value === 'a%2Fb',
			'Native parameter copying preserves the encoded slash contract',
		);
		const wildcard = await request('/wildcards/a%2Fb/c');
		check(wildcard.status === 200, `${variant.label}: wildcard route returns 200`);
		const wildcardBody: unknown = await wildcard.json();
		check(
			typeof wildcardBody === 'object' &&
				wildcardBody !== null &&
				'*' in wildcardBody &&
				wildcardBody['*'] === 'a%2Fb/c',
			`${variant.label}: wildcard params preserve encoded slash behavior: ${JSON.stringify(wildcardBody)}`,
		);
	} finally {
		if (app.server) await app.stop(true);
	}
}

if (failures.length > 0) {
	for (const failure of failures) console.error(`[FAIL] ${failure}`);
	process.exit(1);
}
console.log(`Native Elysia params passed (${String(checks)} assertions).`);
