#!/usr/bin/env bun
/** Verifies auth-cookie headers depend only on validated configuration. */
import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import {
	buildClearCookieHeader,
	buildCookieHeader,
} from '../backend/src/utils/auth/authHelpers.ts';

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

initializeConfig();
const security = getConfig().security;

security.cookieSecure = true;
const secure = buildCookieHeader('session', 'token', 60_000);
const secureClear = buildClearCookieHeader('refresh', '/api/v1/auth');
assert(secure.includes('; Secure'), 'secure configuration must add the Secure flag');
assert(secureClear.includes('; Secure'), 'secure clear headers must add the Secure flag');
assert(secureClear.includes('Path=/api/v1/auth'), 'clear headers must preserve cookie scope');

security.cookieSecure = false;
const development = buildCookieHeader('session', 'token', 60_000);
const developmentClear = buildClearCookieHeader('refresh', '/api/v1/auth');
assert(!development.includes('; Secure'), 'development configuration must omit the Secure flag');
assert(
	!developmentClear.includes('; Secure'),
	'development clear headers must omit the Secure flag',
);

console.log('[OK] cookie headers use configuration-only secure behavior');
