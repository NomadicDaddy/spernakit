/**
 * CLI parsing and configuration for crawltest.
 */

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
