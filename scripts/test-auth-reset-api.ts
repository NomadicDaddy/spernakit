#!/usr/bin/env bun
/**
 * Lightweight HTTP tests for the password reset endpoint.
 *
 * Runs against an already-running backend, in the `dev` smoke mode. Covers the rejections that need
 * no SMTP configuration and no real reset token.
 *
 * This file sat outside every smoke mode until 2026-09-30 and had rotted unseen: it called
 * `/api/auth/...` after the API moved to `/api/v1`, sent a `confirmPassword` field the endpoint no
 * longer takes, and expected messages nothing returns. Every assertion failed the first time a
 * mode ran it. The expectations below were read from the live endpoint, not from the old file.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getBackendUrl, getFrontendUrl, loadJsonConfig } from './load-json-config';

interface ApiResponse {
	code?: string;
	error?: string;
	message?: string;
}

interface RequestResult {
	body: ApiResponse | null;
	status: number;
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { config } = loadJsonConfig(rootDir);
const endpoint = `${getBackendUrl(config)}/api/v1/auth/reset-password`;
// State-changing requests are refused without an Origin the backend trusts.
const origin = getFrontendUrl(config, 'dev');

async function post(payload: unknown, headers: Record<string, string>): Promise<RequestResult> {
	const response = await fetch(endpoint, {
		body: JSON.stringify(payload),
		headers: { 'Content-Type': 'application/json', ...headers },
		method: 'POST',
	});
	let body: ApiResponse | null;
	try {
		body = (await response.json()) as ApiResponse;
	} catch {
		body = null;
	}
	return { body, status: response.status };
}

async function run(): Promise<void> {
	const failures: string[] = [];

	function expectRejection(
		label: string,
		result: RequestResult,
		status: number,
		code: string,
	): void {
		if (result.status !== status) {
			failures.push(`Expected ${String(status)} for ${label}, got ${String(result.status)}`);
		}
		if (result.body?.code !== code) {
			failures.push(`Expected code ${code} for ${label}, got ${String(result.body?.code)}`);
		}
	}

	console.log('Testing /api/v1/auth/reset-password rejections...');

	const strong = { password: 'S3cure!Pwd9', token: 'invalid-token' };

	expectRejection(
		'a request with no Origin header',
		await post(strong, {}),
		403,
		'AUTH_CSRF_ORIGIN_REJECTED',
	);
	expectRejection('missing fields', await post({}, { Origin: origin }), 400, 'VALIDATION_FAILED');
	expectRejection(
		'a password under the minimum length',
		await post({ password: 'short', token: 'invalid-token' }, { Origin: origin }),
		400,
		'VALIDATION_FAILED',
	);
	expectRejection(
		'a password with no uppercase letter',
		await post({ password: 'alllowercaseletters', token: 'invalid-token' }, { Origin: origin }),
		400,
		'VALIDATION_WEAK_PASSWORD',
	);

	const invalidToken = await post(strong, { Origin: origin });
	expectRejection('an invalid token', invalidToken, 400, 'AUTH_RESET_TOKEN_INVALID');
	if (invalidToken.body?.message !== 'Invalid or expired reset token') {
		failures.push(
			`Unexpected message for an invalid token: ${String(invalidToken.body?.message)}`,
		);
	}

	if (failures.length === 0) {
		console.log('[OK] Password reset endpoint rejects all five bad requests as documented.');
		process.exit(0);
	}
	console.error('[FAIL] Password reset tests failed:');
	for (const failure of failures) console.error(` - ${failure}`);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-auth-reset-api:', err);
	process.exit(1);
});
