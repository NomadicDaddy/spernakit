#!/usr/bin/env bun
/**
 * Regression coverage for revoking a dashboard share link
 * (`.aidd/features/remediation-20260827-dashboard-share-link-cannot-be-revoked`).
 *
 * The defect this gate was written for: sharing a dashboard minted a token and nothing could ever
 * take it back. A link sent to the wrong person stayed live for its full 30 days, and re-sharing
 * did not help because the endpoint deliberately hands back the existing token instead of rotating
 * it.
 *
 * Runs fully in-process against a throwaway temp-file SQLite DB via `app.handle()`:
 *  1. Share, then read the dashboard through the public token route: it resolves.
 *  2. Share again without revoking: the same token comes back, so a link in circulation is not
 *     silently replaced.
 *  3. Revoke, then read through the same token: the response is the same not-found answer an
 *     unknown token gets, byte for byte.
 *  4. Share after revoking: a different token, so revoke-then-share is how a link is rotated.
 *  5. Revoke a dashboard the caller does not own: refused, and the owner's link still works.
 *  6. Delete a dashboard: the token is cleared off the row, not merely made unreachable. The
 *     public route already skips deleted dashboards, so the 404 was true before this change; what
 *     was not true is that the token stopped existing, which is what an owner is told happened.
 *  7. Revoking is recorded by the audit plugin, like the other dashboard mutations.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { auditLogs } from '../backend/src/db/schema/auditLogs.ts';
import { dashboardConfigs } from '../backend/src/db/schema/dashboards.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { workspaceMembers, workspaces } from '../backend/src/db/schema/workspaces.ts';
import { signAccessToken } from '../backend/src/plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../backend/src/plugins/csrf.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER_ID = 1;
const OTHER_ID = 2;
const WORKSPACE_ID = 1;

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

interface Actor {
	cookie: string;
	csrf: string;
}

/**
 * Both admins are members of the same workspace on purpose. The non-owner case has to fail
 * because the dashboard is not theirs, not because they could not reach the route at all.
 */
function seedWorkspace(db: ReturnType<typeof getDb>): void {
	db.insert(workspaces)
		.values({
			id: WORKSPACE_ID,
			isDefault: true,
			name: 'Share Revoke',
			ownerId: OWNER_ID,
			slug: 'share-revoke',
		})
		.run();
	db.insert(workspaceMembers)
		.values([
			{ role: 'ADMIN', userId: OWNER_ID, workspaceId: WORKSPACE_ID },
			{ role: 'ADMIN', userId: OTHER_ID, workspaceId: WORKSPACE_ID },
		])
		.run();
}

async function run(): Promise<void> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	config.dashboards.enabled = true;
	config.dashboards.sharingEnabled = true;
	config.audit.enabled = true;
	config.audit.ipWhitelist = [];
	const cookieName = config.security.authCookieName;
	const origin = config.server.frontendUrl;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-share-revoke-'));
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	const db = getDb();
	db.insert(users)
		.values([
			{
				email: 'owner@example.com',
				id: OWNER_ID,
				passwordHash: 'x',
				role: 'ADMIN',
				username: 'owner',
			},
			{
				email: 'other@example.com',
				id: OTHER_ID,
				passwordHash: 'x',
				role: 'ADMIN',
				username: 'other',
			},
		])
		.run();
	seedWorkspace(db);

	const app = createApiApp();
	const actor = async (id: number): Promise<Actor> => ({
		cookie: `${cookieName}=${signAccessToken({ id, role: 'ADMIN' })}`,
		csrf: await generateAndStoreCsrfToken(id),
	});
	const owner = await actor(OWNER_ID);
	const other = await actor(OTHER_ID);

	const call = (method: string, path: string, who?: Actor, body?: unknown): Promise<Response> => {
		const headers: Record<string, string> = {};
		if (who) {
			headers.cookie = who.cookie;
			headers.origin = origin;
			headers['X-CSRF-Token'] = who.csrf;
			headers['X-Workspace-ID'] = String(WORKSPACE_ID);
		}
		if (body !== undefined) headers['content-type'] = 'application/json';
		return app.handle(
			new Request(`http://localhost/api/v1${path}`, {
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				headers,
				method,
			}),
		);
	};

	/** Create a dashboard owned by `who` and return its id. */
	const createDashboard = async (who: Actor, name: string): Promise<number> => {
		const response = await call('POST', '/dashboards', who, { name, widgets: [] });
		const payload = (await response.json()) as { data?: { id?: number } };
		const id = payload.data?.id;
		if (id === undefined) {
			throw new Error(
				`could not create dashboard "${name}": ${String(response.status)} ${JSON.stringify(payload)}`,
			);
		}
		return id;
	};

	/** Share `dashboardId` as `who` and return the token, or null when the call was refused. */
	const share = async (who: Actor, dashboardId: number): Promise<null | string> => {
		const response = await call('POST', `/dashboards/${String(dashboardId)}/share`, who);
		if (response.status !== 200) return null;
		const payload = (await response.json()) as { data?: { shareToken?: string } };
		return payload.data?.shareToken ?? null;
	};

	const fetchShared = (token: string): Promise<Response> =>
		call('GET', `/dashboards/shared/${token}`);

	const dashboardId = await createDashboard(owner, 'Revocable');
	const otherId = await createDashboard(other, 'Someone else');

	// --- 1. a fresh link resolves ---
	const token = await share(owner, dashboardId);
	assert(token !== null && token.length > 0, 'sharing a dashboard returns a token');
	const shared = await fetchShared(token ?? '');
	assert(
		shared.status === 200,
		`a fresh share token must resolve, got ${String(shared.status)} ${await shared.clone().text()}`,
	);

	// --- 2. sharing again reuses the live token ---
	assert(
		(await share(owner, dashboardId)) === token,
		'a repeat share must reuse the live token rather than silently replacing a link in circulation',
	);

	// --- 3. the state endpoint reports the live link ---
	const stateResponse = await call('GET', `/dashboards/${String(dashboardId)}/share`, owner);
	const state = (await stateResponse.json()) as {
		data?: { expiresAt?: null | string; isActive?: boolean };
	};
	assert(
		stateResponse.status === 200 && state.data?.isActive === true,
		`the share state must report a live link, got ${String(stateResponse.status)} ${JSON.stringify(state)}`,
	);
	assert(typeof state.data?.expiresAt === 'string', 'a live link reports when it stops working');

	// --- 4. a non-owner cannot revoke it ---
	const stolen = await call('DELETE', `/dashboards/${String(dashboardId)}/share`, other);
	assert(
		stolen.status === 404,
		`revoking someone else's dashboard must be refused, got ${String(stolen.status)}`,
	);
	assert(
		(await fetchShared(token ?? '')).status === 200,
		"a refused revoke must leave the owner's link working",
	);

	// --- 5. revoking kills the link, and answers exactly like an unknown token ---
	const revoked = await call('DELETE', `/dashboards/${String(dashboardId)}/share`, owner);
	assert(revoked.status === 200, `the owner can revoke, got ${String(revoked.status)}`);
	const afterRevoke = await fetchShared(token ?? '');
	const unknown = await fetchShared('0'.repeat(64));
	assert(
		afterRevoke.status === unknown.status && afterRevoke.status === 404,
		`a revoked token must answer like an unknown one, got ${String(afterRevoke.status)} vs ${String(unknown.status)}`,
	);
	assert(
		(await afterRevoke.text()) === (await unknown.text()),
		'a revoked token must not be distinguishable from a token that never existed',
	);

	// --- 6. re-sharing after a revoke rotates the token ---
	const rotated = await share(owner, dashboardId);
	assert(
		rotated !== null && rotated !== token,
		'sharing after a revoke must mint a new token, which is how a link gets rotated',
	);
	assert((await fetchShared(rotated ?? '')).status === 200, 'the replacement link resolves');

	// --- 7. deleting a dashboard revokes its link ---
	const deleted = await call('DELETE', `/dashboards/${String(dashboardId)}`, owner);
	assert(deleted.status === 200, `deleting the dashboard, got ${String(deleted.status)}`);
	assert(
		(await fetchShared(rotated ?? '')).status === 404,
		'deleting a dashboard must take its share link down with it',
	);
	/*
	 * The 404 above passes either way: getSharedDashboard already filters out deleted rows, so an
	 * uncleared token is unreachable without being gone. Read the row to tell the two apart. A
	 * token that outlives the delete comes back the moment a row is restored, and it holds the
	 * unique share_token index against a value nobody can use.
	 */
	const deletedRow = db
		.select({
			id: dashboardConfigs.id,
			shareExpiresAt: dashboardConfigs.shareExpiresAt,
			shareToken: dashboardConfigs.shareToken,
		})
		.from(dashboardConfigs)
		.all()
		.find((row) => row.id === dashboardId);
	assert(
		deletedRow?.shareToken === null && deletedRow.shareExpiresAt === null,
		`deleting a dashboard must clear its share columns, not just hide the row; found ${JSON.stringify(deletedRow)}`,
	);

	// --- 8. the revoke is audited like other dashboard mutations ---
	// onAfterResponse runs after app.handle() resolves; let the hook settle before reading.
	await new Promise((settle) => setTimeout(settle, 50));
	const actions = db
		.select({ action: auditLogs.action })
		.from(auditLogs)
		.all()
		.map((row) => row.action);
	assert(
		actions.includes(`DELETE /api/v1/dashboards/${String(dashboardId)}/share`),
		`revoking must be audit-logged; the log held ${JSON.stringify(actions)}`,
	);

	// Keep the second dashboard meaningful: it proves the non-owner check was about ownership
	// rather than about the dashboard being unshareable.
	assert(
		(await share(other, otherId)) !== null,
		'the second admin can still share the dashboard they do own',
	);

	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}

	if (failures.length === 0) {
		console.log(
			'[OK] dashboard-share-revoke: links revoke, rotate on re-share, survive a refused revoke, and die with the dashboard',
		);
		process.exit(0);
	}
	console.error('[FAIL] dashboard-share-revoke:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-dashboard-share-revoke:', err);
	process.exit(1);
});
