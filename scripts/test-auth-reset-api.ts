#!/usr/bin/env bun
/**
 * Lightweight HTTP tests for password reset endpoints.
 *
 * Runs against an already-running backend (local or Docker), similar to test-auto.
 * Focuses on error paths that do not require SMTP configuration.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getBackendUrl, loadJsonConfig } from './load-json-config';

interface ApiResponse {
	error?: string;
	message?: string;
}

interface RequestResult {
	body: ApiResponse | null;
	response: Response;
}

function getBackendBaseUrl(): string {
	const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const { config } = loadJsonConfig(rootDir);
	return getBackendUrl(config);
}

async function request(path: string, options: RequestInit = {}): Promise<RequestResult> {
	const base = getBackendBaseUrl();
	const url = `${base}/api${path}`;
	const response = await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...(options.headers ?? {}),
		},
	});
	let body: ApiResponse | null;
	try {
		body = (await response.json()) as ApiResponse;
	} catch {
		body = null;
	}
	return { body, response };
}

async function run(): Promise<void> {
	const failures: string[] = [];

	function assert(condition: boolean, message: string): void {
		if (!condition) failures.push(message);
	}

	console.log('🔐 Testing /api/auth/reset-password validation...');

	// 1) Missing fields
	{
		const { body, response } = await request('/auth/reset-password', {
			body: JSON.stringify({}),
			method: 'POST',
		});
		assert(response.status === 400, `Expected 400 for missing fields, got ${response.status}`);
		assert(
			body?.message === 'Token, password, and confirm password are required',
			`Unexpected message for missing fields: ${body?.message}`
		);
	}

	// 2) Mismatched passwords
	{
		const { body, response } = await request('/auth/reset-password', {
			body: JSON.stringify({
				confirmPassword: 'Different123!',
				password: 'Password123!',
				token: 'dummy-token',
			}),
			method: 'POST',
		});
		assert(
			response.status === 400,
			`Expected 400 for mismatched passwords, got ${response.status}`
		);
		assert(
			body?.message === 'Passwords do not match',
			`Unexpected message for mismatched passwords: ${body?.message}`
		);
	}

	// 3) Invalid token but valid password payload
	{
		const { body, response } = await request('/auth/reset-password', {
			body: JSON.stringify({
				confirmPassword: 'S3cure!Pwd9',
				password: 'S3cure!Pwd9',
				token: 'invalid-token',
			}),
			method: 'POST',
		});
		assert(response.status === 400, `Expected 400 for invalid token, got ${response.status}`);
		assert(
			body?.error === 'Invalid or expired reset token',
			`Unexpected error for invalid token: ${body?.error}`
		);
		assert(
			(typeof body?.message === 'string' && body.message.toLowerCase().includes('invalid')) ||
				(typeof body?.message === 'string' &&
					body.message.toLowerCase().includes('expired')),
			`Unexpected message detail for invalid token: ${body?.message}`
		);
	}

	if (failures.length === 0) {
		console.log('✅ Password reset endpoint basic contract tests passed');
		process.exit(0);
	} else {
		console.error('❌ Password reset tests failed:');
		for (const f of failures) {
			console.error(' -', f);
		}
		process.exit(1);
	}
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-auth-reset-api:', err);
	process.exit(1);
});
