/**
 * Run a parsed regression suite against isolated instances, one database per case.
 *
 * The seed runs once: a backend starts on `seed.db`, migrates and seeds it, and stops, and the file
 * is checkpointed so it holds no WAL. That is the snapshot. Each case then copies it to its own
 * `tc-00n.db`, starts its own backend, signs in through crawltest's loginSession in the managed
 * browser, and runs its steps. Every case starts from the same seeded state, so no case can change
 * another's baseline, and `restartBackend` restarts only that case's backend on its own file.
 */
import type { Page } from 'puppeteer';

import type { TestCase } from './suite.ts';

import { getSeedCredential } from '../../../backend/src/utils/auth/passwordGenerator.ts';
import { TestResults } from '../../crawltest-results.ts';
import { type CrawlSession, loginSession } from '../../crawltest-session.ts';
import { launchManaged } from './browser.ts';
import { startFrontendProxy } from './frontend-proxy.ts';
import {
	type Backend,
	copySnapshot,
	createRun,
	freezeSnapshot,
	removeAbandonedRuns,
	removeRun,
	type Run,
	startBackend,
	stopBackend,
} from './instance.ts';
import { guardOrigin, runStep } from './steps.ts';

export interface CaseResult {
	error?: string;
	id: string;
	title: string;
}

type SeedRole = Parameters<typeof getSeedCredential>[0];

function signInAs(role: string): { email: string; password: string } {
	const credential = getSeedCredential(role as SeedRole);
	if (credential === undefined) throw new Error(`no seeded user holds the role "${role}".`);
	return credential;
}

async function runCase(
	run: Run,
	testCase: TestCase,
	index: number,
	frontend: ReturnType<typeof startFrontendProxy>,
): Promise<CaseResult> {
	const dbFile = `tc-${String(index + 1).padStart(3, '0')}.db`;
	copySnapshot(run, 'seed.db', dbFile);
	let backend: Backend | null = await startBackend(run, frontend.origin, dbFile);
	frontend.setBackend(backend.origin);
	const browser = await launchManaged();
	try {
		const page: Page = await browser.newPage();
		await page.setViewport({ height: 900, width: 1440 });
		const leftOrigin = guardOrigin(page, frontend.origin);
		const session: CrawlSession = {
			browser,
			isLoggedIn: false,
			loginCredentials: null,
			page,
			reLoginFailed: false,
		};
		const opts = {
			baseUrl: frontend.origin,
			contentMinLength: 0,
			interactionDelay: 0,
			loginCredentials: null,
			pageSettleDelay: 500,
			readOnly: false,
			screenshotDir: null,
			testBug: false,
			timeout: 30_000,
		};
		const credential = signInAs(testCase.role);
		const ctx = {
			origin: frontend.origin,
			page,
			restartBackend: async (): Promise<void> => {
				if (backend !== null) await stopBackend(backend);
				backend = null;
				backend = await startBackend(run, frontend.origin, dbFile);
				frontend.setBackend(backend.origin);
			},
			runId: run.id,
			signIn: async (): Promise<void> => {
				const shot = `${run.dir}/${testCase.id}-login-error.png` as const;
				await loginSession(
					session,
					new TestResults(),
					opts,
					credential.email,
					credential.password,
					shot,
				);
			},
		};
		for (const [step, at] of testCase.steps.map((s, i) => [s, i + 1] as const)) {
			try {
				await runStep(step, ctx);
				leftOrigin();
			} catch (err) {
				return {
					error: `step ${String(at)}: ${err instanceof Error ? err.message : String(err)}`,
					id: testCase.id,
					title: testCase.title,
				};
			}
		}
		return { id: testCase.id, title: testCase.title };
	} finally {
		await browser.close();
		if (backend !== null) await stopBackend(backend);
	}
}

/** Run every case in order and report each one; teardown always runs. */
export async function runSuite(cases: TestCase[]): Promise<CaseResult[]> {
	const kept = removeAbandonedRuns();
	if (kept.length > 0)
		console.log(`   Left in place (not provably abandoned): ${kept.join(', ')}`);
	const run = createRun();
	const frontend = startFrontendProxy();
	try {
		const seed = await startBackend(run, frontend.origin, 'seed.db');
		await stopBackend(seed);
		freezeSnapshot(run, 'seed.db');
		const results: CaseResult[] = [];
		for (const [index, testCase] of cases.entries()) {
			const result = await runCase(run, testCase, index, frontend);
			console.log(
				result.error === undefined
					? `[PASS] ${result.id}: ${result.title}`
					: `[FAIL] ${result.id}: ${result.title} -- ${result.error}`,
			);
			results.push(result);
		}
		return results;
	} finally {
		frontend.stop();
		removeRun(run);
	}
}
