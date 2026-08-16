/**
 * CLI parsing and configuration for crawltest.
 */
import type { SeedCredential } from '../backend/src/utils/auth/passwordGenerator.ts';
import type { AppConfig } from './lib/app-config-types.ts';

// ---------------------------------------------------------------------------
// Login credential resolution
// ---------------------------------------------------------------------------

export interface CrawlLogin {
	email: string;
	password: string;
}

export interface CrawlLoginResolution {
	/** Config keys that fell back to the seed credential, named as they appear in the config file. */
	fromSeed: string[];
	/** Resolved credentials, or null when a key could not be resolved from any source. */
	login: CrawlLogin | null;
	/** Config keys that resolved to nothing, named as they appear in the config file. */
	unresolved: string[];
}

/**
 * Resolve the crawl login from config, falling back per key to the development-seed credential.
 *
 * `backend/src/config/defaults.json` is tracked, so it can never carry a concrete credential and
 * ships both keys blank. Every derived app then filled them with its own SYSOP seed account by
 * hand, and several pinned the whole file as a template override to keep doing so. The values were
 * never app-specific — they were whatever that app's seed script creates — so they are resolved
 * here instead of stored.
 *
 * Each key falls back independently: a config that sets only the email keeps that email and takes
 * the seed password, so an app that renamed its crawl account is not silently given back the seed
 * one.
 *
 * @param testing - The `testing` section of the loaded config; either key may be absent or blank.
 * @param seedCredential - The development-seed credential to fall back to, or undefined when there
 *   is none to trust (no seed user holds the role, or the target was seeded in production, where
 *   seed passwords are random). Passed in rather than looked up here so the caller owns that
 *   judgement.
 * @returns Resolved credentials plus the keys that came from the seed, or — when a key resolved to
 *   nothing — a null login and the list of keys that could not be resolved.
 */
export function resolveCrawlLogin(
	testing: AppConfig['testing'],
	seedCredential: SeedCredential | undefined,
): CrawlLoginResolution {
	const configuredEmail = testing?.crawlLoginEmail;
	const configuredPassword = testing?.crawlLoginPassword;
	const email = configuredEmail || seedCredential?.email;
	const password = configuredPassword || seedCredential?.password;

	const fromSeed: string[] = [];
	if (!configuredEmail) fromSeed.push('testing.crawlLoginEmail');
	if (!configuredPassword) fromSeed.push('testing.crawlLoginPassword');

	const unresolved: string[] = [];
	if (!email) unresolved.push('testing.crawlLoginEmail');
	if (!password) unresolved.push('testing.crawlLoginPassword');
	if (!email || !password) {
		return { fromSeed: [], login: null, unresolved };
	}

	return { fromSeed, login: { email, password }, unresolved };
}

// ---------------------------------------------------------------------------
// CLI argument parsers
// ---------------------------------------------------------------------------

/**
 * Modes crawltest accepts. Anything else is a typo and must fail loudly.
 * `docker-local`/`docker-prod` are what smoke.json passes when crawling the
 * containerized stack; like `preview`, they promise a production build.
 */
const VALID_MODES = ['dev', 'preview', 'docker-local', 'docker-prod'] as const;

/**
 * Accepts both `--mode=preview` and `--mode preview`. The space form is what
 * package.json actually uses; parsing only the `=` form silently returned 'dev',
 * so `crawltest:preview` reported `Mode: dev` while measuring whatever happened
 * to be serving. An unknown mode exits rather than falling back, because a silent
 * fallback is what made the earlier Web Vitals numbers unattributable.
 */
export function parseMode(argv: string[]): string {
	const idx = argv.findIndex((a) => a === '--mode' || a.startsWith('--mode='));
	if (idx === -1) return 'dev';

	const flag = argv[idx]!;
	const value = flag.startsWith('--mode=') ? flag.slice('--mode='.length) : argv[idx + 1];

	if (!value || value.startsWith('--')) {
		console.error(`--mode requires a value (one of: ${VALID_MODES.join(', ')})`);
		process.exit(1);
	}

	const mode = value.trim();
	if (!VALID_MODES.includes(mode as (typeof VALID_MODES)[number])) {
		console.error(`Unknown --mode "${mode}". Expected one of: ${VALID_MODES.join(', ')}`);
		process.exit(1);
	}
	return mode;
}

/**
 * Detects whether the app answering at `baseUrl` is a Vite dev server or a
 * production build, by looking for the dev client Vite injects into index.html.
 *
 * `--mode` alone proves nothing: getFrontendUrl() ignores it and returns the same
 * configured URL either way, so the flag is a label. Web Vitals differ enormously
 * between an unminified dev bundle and a production one, so a run that cannot say
 * which it measured produces numbers nobody can act on.
 */
export async function detectServedBuild(baseUrl: string): Promise<'dev' | 'production'> {
	const res = await fetch(baseUrl, { headers: { accept: 'text/html' } });
	const html = await res.text();
	return /\/@vite\/client|\/@react-refresh/.test(html) ? 'dev' : 'production';
}

/** Git Bash MSYS2 converts /foo args to C:/Program Files/Git/foo — strip that mangling. */
function stripMsysPath(val: string): string {
	const msys = val.match(/^[A-Z]:\/Program Files\/Git\/(.*)/i);
	return msys ? `/${msys[1]}` : val;
}

export function parsePage(argv: string[]): null | string {
	const idx = argv.indexOf('--page');
	if (idx === -1) return null;
	const next = argv[idx + 1];
	if (!next || next.startsWith('--')) {
		console.error('--page requires a route path (e.g. --page /settings/audit-logs)');
		process.exit(1);
	}
	const route = stripMsysPath(next);
	return route.startsWith('/') ? route : `/${route}`;
}

export function parseStartFrom(argv: string[]): null | string {
	const idx = argv.indexOf('--start-from');
	if (idx === -1) return null;
	const next = argv[idx + 1];
	if (!next || next.startsWith('--')) {
		console.error('--start-from requires a route path (e.g. --start-from /settings)');
		process.exit(1);
	}
	const route = stripMsysPath(next);
	return route.startsWith('/') ? route : `/${route}`;
}

export function parseTest404(argv: string[]): boolean {
	return argv.includes('--404');
}

/**
 * Whether this crawl may change data. Read-only is the default and the opt-out is explicit, because
 * the crawl runs against a live development database and clicks controls it cannot read: it is not
 * possible to tell from a label whether a button writes, so the safe direction has to be the one you
 * get by not thinking about it.
 */
export function parseReadOnly(argv: string[]): boolean {
	return !argv.includes('--allow-writes');
}

export function parseTestBug(argv: string[]): boolean {
	return argv.includes('--bug');
}

export function parseScreenshotDir(argv: string[]): null | string {
	const idx = argv.indexOf('--screenshot-pages');
	if (idx === -1) return null;
	const next = argv[idx + 1];
	return next && !next.startsWith('--') ? next : 'screenshots';
}

// ---------------------------------------------------------------------------
// CrawlConfig
// ---------------------------------------------------------------------------

export interface CrawlConfig {
	baseUrl: string;
	contentMinLength: number;
	interactionDelay: number;
	maxDepth: number;
	mode: string;
	pageSettleDelay: number;
	readOnly: boolean;
	screenshotDir: null | string;
	singlePage: null | string;
	startFrom: null | string;
	test404: boolean;
	testBug: boolean;
	timeout: number;
}

export function logCrawlConfig(c: CrawlConfig): void {
	console.log('🕷️  Web Crawler Starting...');
	console.log(`   Mode: ${c.mode}`);
	console.log(`   Base URL: ${c.baseUrl}`);
	if (c.singlePage) {
		console.log(`   Single Page: ${c.singlePage}`);
	} else if (c.startFrom) {
		console.log(`   Start From: ${c.startFrom}`);
		console.log(`   Discovery Passes: ${c.maxDepth}`);
	} else {
		console.log(`   Discovery Passes: ${c.maxDepth}`);
	}
	console.log(`   Timeout: ${c.timeout}ms`);
	console.log(`   Interaction Delay: ${c.interactionDelay}ms`);
	console.log(`   Page Settle Delay: ${c.pageSettleDelay}ms`);
	console.log(`   Content Min Length: ${c.contentMinLength} chars`);
	console.log(
		c.readOnly
			? '   Writes: blocked (read-only guard active)'
			: '   Writes: ALLOWED — this crawl will change data',
	);
	if (c.screenshotDir) {
		console.log(`   Screenshots: ${c.screenshotDir}`);
	}
	if (c.test404) {
		console.log('   404 Test: enabled');
	}
	if (c.testBug) {
		console.log('   Bug Report Test: enabled');
	}
	console.log('');
}
