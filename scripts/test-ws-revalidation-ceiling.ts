#!/usr/bin/env bun
/**
 * Gate: the WebSocket revalidation timer always runs the full check, so a recent message-driven
 * check can't throttle a tick and push the next full check a whole period later
 * (`.aidd/features/audit-assertions-1790852982-assert-042-websocket-revalidation-gap-can-exceed-the-two-minute-ceiling`).
 *
 * The defect: the timer and the message path shared one throttle and one lastValidatedAt. With a
 * 119 s timer, a message at 91 s revalidated, the 119 s tick was throttled (28 s since the last
 * check), and the next full check came at 238 s, a 147 s gap against a 120 s ceiling.
 *
 * The context carries no user, so the checks below exercise the throttle and the expiry check
 * without a database: a full check is visible as lastValidatedAt moving to now.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { getAppSlug, loadDefaults } from '../backend/src/config/configUtils.ts';
import { WS_REVALIDATION_INTERVAL_MS, type WsContext } from '../backend/src/routes/ws/wsAuth.ts';
import { revalidateConnection } from '../backend/src/routes/ws/wsRevalidation.ts';

const repoRoot = resolve(import.meta.dir, '..');
const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

const closes: string[] = [];
const socket = { close: (_code?: number, reason?: string): void => void closes.push(reason ?? '') };

function contextValidatedAgo(seconds: number): WsContext {
	return {
		lastValidatedAt: Date.now() - seconds * 1000,
		tokenExpiresAt: Date.now() + WS_REVALIDATION_INTERVAL_MS * 10,
		wsUser: null,
	};
}

/** True when the call ran the full check, which moves lastValidatedAt to about now. */
function ranFullCheck(ctx: WsContext, force: boolean): boolean {
	const before = ctx.lastValidatedAt;
	const valid = revalidateConnection(socket, ctx, force);
	return (
		valid && ctx.lastValidatedAt !== before && Date.now() - (ctx.lastValidatedAt ?? 0) < 1000
	);
}

// A throwaway config directory, created from defaults, so neither the checkout's own config nor its
// split secrets can change the result behind the step's cache key (Roger 5Q-1, 27cf159). The
// app's slug-prefixed environment overrides are dropped for the same reason (Roger 5Q-1, 3be4f05):
// the cache keys no environment value but PATH, and a short override fails schema validation.
// Windows looks names up case-insensitively, so the comparison is too (Roger, f7078eb).
const envPrefix = `${getAppSlug(loadDefaults()).toUpperCase().replace(/-/g, '_')}_`;
for (const name of Object.keys(process.env)) {
	if (name.toUpperCase().startsWith(envPrefix)) delete process.env[name];
}
const configDir = mkdtempSync(join(tmpdir(), 'spernakit-ws-ceiling-'));
try {
	initializeConfig(configDir);
} finally {
	rmSync(configDir, { force: true, recursive: true });
}

// The defect's trace: a message-driven check 28 s ago, then the timer tick.
assert(
	ranFullCheck(contextValidatedAgo(28), true),
	'a timer tick 28 s after a message check runs the full check',
);
assert(
	!ranFullCheck(contextValidatedAgo(28), false),
	'a message 28 s after the last check is still throttled',
);
assert(
	ranFullCheck(contextValidatedAgo(91), false),
	'a message 91 s after the last check runs the full check',
);
const neverValidated: WsContext = {
	tokenExpiresAt: Date.now() + WS_REVALIDATION_INTERVAL_MS * 10,
	wsUser: null,
};
assert(
	ranFullCheck(neverValidated, false),
	'a message on a connection never validated runs the full check (Morticia L-1)',
);
assert(
	ranFullCheck(contextValidatedAgo(1), true),
	'the timer runs the full check however recent the last one was',
);

// Expiry is checked first, forced or not.
const expired: WsContext = {
	lastValidatedAt: Date.now(),
	tokenExpiresAt: Date.now() - 1,
	wsUser: null,
};
assert(
	!revalidateConnection(socket, expired, true),
	'an expired token closes the socket on a timer tick',
);
assert(closes.at(-1) === 'Token expired', 'the close reason names the expired token');

// The wiring: the per-connection timer passes force, and the message path does not.
const handlers = readFileSync(resolve(repoRoot, 'backend/src/routes/ws/wsHandlers.ts'), 'utf8');
const timerBody = handlers.slice(
	handlers.indexOf('setInterval('),
	handlers.indexOf('wsContext.revalTimer = revalTimer'),
);
assert(
	timerBody.includes('revalidateConnection(') && /wsContext,\s*true,?\s*\)/.test(timerBody),
	'the timer calls revalidateConnection with force',
);
assert(
	/if \(!revalidateConnection\(ws, ctx\)\) return;/.test(handlers),
	'the message path calls revalidateConnection unforced',
);

if (failures.length > 0) {
	console.error(`ws revalidation ceiling: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('ws revalidation ceiling: all checks passed');
