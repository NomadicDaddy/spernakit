#!/usr/bin/env bun
/**
 * Regression coverage for the administrator's "Send reset email" action.
 *
 * The action generated a reset token, discarded it, sent nothing, and reported success. The route
 * then signed the user out and the account was already marked as needing a new password, so the
 * user was locked out with no link while the admin was told the email had gone.
 *
 * Holds four properties: a successful send delivers the generated token to the target's address
 * and only then marks the account; a server with no mail configured refuses and leaves the account
 * unmarked; a failed send does the same; and a target with no verified address is refused before
 * anything is sent.
 *
 * Runs in-process against a throwaway temp-file SQLite database, like
 * scripts/test-oauth-secret-update.ts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SendEmailResult } from '../backend/src/services/email/emailTypes.ts';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { adminResetUserPassword } from '../backend/src/services/userService.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_ID = 1;
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
	checks += 1;
	if (!condition) failures.push(message);
}

function seedUser(id: number, emailVerified: boolean): void {
	getDb()
		.insert(users)
		.values({
			email: `user${String(id)}@example.com`,
			emailVerified,
			id,
			passwordHash: 'seeded-not-used',
			role: id === ADMIN_ID ? 'ADMIN' : 'VIEWER',
			username: `user${String(id)}`,
		})
		.run();
}

function flagged(id: number): boolean {
	const row = getDb()
		.select()
		.from(users)
		.all()
		.find((user) => user.id === id);
	return row?.requiresPasswordChange === true;
}

interface Sent {
	to: string;
	token: string;
}

function recorder(result: SendEmailResult): {
	send: (to: string, token: string) => Promise<SendEmailResult>;
	sent: Sent[];
} {
	const sent: Sent[] = [];
	return {
		send: (to, token) => {
			sent.push({ to, token });
			return Promise.resolve(result);
		},
		sent,
	};
}

async function checkSuccessfulSend(): Promise<void> {
	seedUser(2, true);
	const mail = recorder({ reason: 'sent', success: true });
	const result = await adminResetUserPassword(ADMIN_ID, 2, { mode: 'email' }, mail.send);

	check(result.success, `A reset that was sent must succeed: ${result.error ?? 'no error'}`);
	check(mail.sent.length === 1, `Exactly one message must be sent, got ${mail.sent.length}`);
	check(mail.sent[0]?.to === 'user2@example.com', 'The message must go to the target user');
	check((mail.sent[0]?.token ?? '').length > 0, 'The message must carry the generated token');
	check(flagged(2), 'After a sent reset the account must require a password change');
}

async function checkRefusals(): Promise<void> {
	seedUser(3, true);
	const unconfigured = recorder({ reason: 'not_configured', success: false });
	const first = await adminResetUserPassword(ADMIN_ID, 3, { mode: 'email' }, unconfigured.send);
	check(!first.success, 'A server with no mail configured must refuse, not report success');
	check(/not configured/i.test(first.error ?? ''), `The refusal must say why: ${first.error}`);
	check(!flagged(3), 'A refused reset must not mark the account');

	seedUser(4, true);
	const failing = recorder({ reason: 'send_failed', success: false });
	const second = await adminResetUserPassword(ADMIN_ID, 4, { mode: 'email' }, failing.send);
	check(!second.success, 'A send that failed must refuse, not report success');
	check(!flagged(4), 'A failed send must not mark the account');

	seedUser(5, false);
	const unused = recorder({ reason: 'sent', success: true });
	const third = await adminResetUserPassword(ADMIN_ID, 5, { mode: 'email' }, unused.send);
	check(!third.success, 'A target with no verified address must be refused');
	check(unused.sent.length === 0, 'Nothing may be sent to an unverified address');
	check(!flagged(5), 'A refused reset must not mark the account');
}

async function run(): Promise<void> {
	initializeConfig();
	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-admin-reset-'));
	const dbPath = join(tmpDir, 'test.db');

	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);

	try {
		seedUser(ADMIN_ID, true);
		await checkSuccessfulSend();
		await checkRefusals();
	} finally {
		await closeDatabase();
		try {
			rmSync(tmpDir, { force: true, recursive: true });
		} catch {
			// Windows may briefly hold the WAL handle; temp cleanup is best-effort.
		}
	}

	if (failures.length === 0) {
		console.log(`Admin reset email checks passed (${String(checks)} assertions).`);
		return;
	}
	console.error('[FAIL] Admin reset email regression:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-admin-reset-email:', err);
	process.exit(1);
});
