/**
 * The dev and preview proxies must dial the address the backend binds.
 *
 * `frontend/vite.config.ts` used to hardcode `http://localhost:<backendPort>` for both proxy
 * blocks while the backend binds `server.host`, which is `127.0.0.1` and therefore IPv4 only. When
 * `localhost` resolves to `::1` as well, Node's dual-stack connect can pick the address nothing is
 * listening on; with time to spare it falls back and the request succeeds, and under a burst of
 * connections it times out and Vite answers 502. Six applications reported that 502 out of their
 * own crawl gate, where an intermittent false failure is worse than a steady one.
 *
 * Two things are checked, because either one alone can bring the defect back. The proxy targets
 * must be built from the configured host rather than naming a host of their own, and the mapping
 * that turns a bound address into a dialable one must still answer correctly for the wildcards.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { backendProxyAuthority } from '../../../frontend/vite-plugins/proxyTarget.ts';

/** Bound address to the address a proxy should dial, and what each case is guarding. */
const HOST_MAPPINGS: { bound: string; dialed: string; why: string }[] = [
	{ bound: '127.0.0.1', dialed: '127.0.0.1:3331', why: 'the default bind is passed through' },
	{ bound: '0.0.0.0', dialed: '127.0.0.1:3331', why: 'an IPv4 wildcard is not dialable' },
	{ bound: '::', dialed: '[::1]:3331', why: 'an IPv6 wildcard is not dialable' },
	{ bound: '::1', dialed: '[::1]:3331', why: 'an IPv6 literal needs brackets in a URL' },
	{ bound: '192.168.1.10', dialed: '192.168.1.10:3331', why: 'a named host is left alone' },
];

function checkDevProxyTarget(repoRoot: string): void {
	console.log('   Checking the dev proxy dials the address the backend binds...');

	for (const { bound, dialed, why } of HOST_MAPPINGS) {
		const actual = backendProxyAuthority(bound, 3331);
		if (actual !== dialed) {
			throw new Error(
				`backendProxyAuthority('${bound}', 3331) returned '${actual}', expected ` +
					`'${dialed}' (${why}).`,
			);
		}
	}

	const viteConfig = readFileSync(join(repoRoot, 'frontend', 'vite.config.ts'), 'utf8');
	const targets = [...viteConfig.matchAll(/target: `([^`]+)`/g)].map((match) => match[1] ?? '');
	if (targets.length === 0) {
		throw new Error('frontend/vite.config.ts declares no proxy targets to check.');
	}

	const named = targets.filter((target) => !target.includes('${backendAuthority}'));
	if (named.length > 0) {
		throw new Error(
			`frontend/vite.config.ts proxy targets must be built from backendAuthority, which is ` +
				`derived from the configured server.host. These name a host of their own: ` +
				`${named.join(', ')}.`,
		);
	}

	const defaults = JSON.parse(
		readFileSync(join(repoRoot, 'backend', 'src', 'config', 'defaults.json'), 'utf8'),
	) as { server?: { host?: string } };
	if (typeof defaults.server?.host !== 'string' || defaults.server.host === '') {
		throw new Error(
			'backend/src/config/defaults.json has no server.host, so the proxy has nothing to ' +
				'derive its target from and would fall back to a guess.',
		);
	}

	console.log(
		`   Proxy targets derive from server.host (${defaults.server.host}); ` +
			`${String(targets.length)} target(s) checked.`,
	);
}

export { checkDevProxyTarget };
