/**
 * CLI parsing and configuration for crawltest.
 */

// ---------------------------------------------------------------------------
// CLI argument parsers
// ---------------------------------------------------------------------------

export function parseMode(argv: string[]): string {
	const modeFlag = argv.find((a) => a.startsWith('--mode'));
	if (!modeFlag) return 'dev';
	const parts = modeFlag.split('=');
	const val = parts[1];
	return (val ?? 'dev').trim();
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
