#!/usr/bin/env bun
/**
 * Regression coverage for a backend that could not start in an image built from production
 * dependencies, and for the crash that hid why.
 *
 * docker-local runs the production image with a development configuration. pino-pretty is a
 * devDependency, so that image does not carry it. Once the configured logger replaced the bootstrap
 * one, the transport worker could not load pino-pretty and the backend exited with status 7 before
 * serving a request (found 2026-10-10 while proving the Bun 1.4.3 image). The error it raised was a
 * DOMException, and the log-redaction clone of a DOMException threw on the first read of its
 * message, so the handler reporting the failure crashed too and the cause never reached a log.
 *
 * Two assertions, one per defect:
 *  1. developmentTargets returns nothing when pino-pretty cannot be resolved or resolves to a path
 *     that does not exist, so the logger falls back to the JSON targets, and returns both targets
 *     when it is installed.
 *  2. An error logged through the redaction hook stays readable when it is a DOMException.
 */
import { exit } from 'node:process';

import { developmentTargets } from '../backend/src/utils/logger.ts';
import { LOG_SECRET_REDACTION_HOOKS } from '../backend/src/utils/logSecretRedaction.ts';

const failures: string[] = [];
function check(label: string, ok: boolean): void {
	if (!ok) failures.push(label);
}

const missing = developmentTargets(() => {
	throw new Error("Cannot find package 'pino-pretty'");
});
check('a missing pino-pretty yields no development targets', missing === undefined);
// A production install can leave the package's link in place pointing at nothing, and resolution
// then succeeds with a path that does not exist. That is the shape the image actually has.
const dangling = developmentTargets(() => '/app/backend/node_modules/pino-pretty/absent.js');
check('a dangling pino-pretty link yields no development targets', dangling === undefined);
const present = developmentTargets();
check('an installed pino-pretty yields both development targets', present?.length === 2);

/** Runs a value through the redaction hook exactly as pino does, and returns what it would log. */
function logged(value: unknown): unknown {
	let seen: unknown;
	const capture = (first: unknown): void => {
		seen = first;
	};
	LOG_SECRET_REDACTION_HOOKS.logMethod?.call(
		{} as never,
		[value, 'probe'] as never,
		capture as never,
		30,
	);
	return seen;
}

const domLogged = logged({
	err: new DOMException('The object can not be cloned.', 'DataCloneError'),
});
const domErr = (domLogged as { err: Error }).err;
let domMessage = '';
let domThrew = false;
try {
	domMessage = `${domErr.name}: ${domErr.message}`;
	// Bun gives a DOMException no stack; what matters is that reading it does not throw either.
	void domErr.stack;
} catch {
	domThrew = true;
}
check('a logged DOMException can be read without throwing', !domThrew);
check(
	'and keeps its name and message',
	domMessage === 'DataCloneError: The object can not be cloned.',
);

// An ordinary Error must come through unchanged in kind: the DOMException path is an exception.
const plain = (logged({ err: new RangeError('out of range') }) as { err: Error }).err;
check('an ordinary error keeps its type', plain instanceof RangeError);
check('and its message', plain.message === 'out of range');

if (failures.length > 0) {
	console.error('[FAIL] logger fallback:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log('[OK] logger fallback: 7 assertions.');
