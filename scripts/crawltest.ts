#!/usr/bin/env bun
/*
  crawltest.ts
  - Dynamically discovers all routes in the application via link scraping
  - Visits every route via direct navigation (no goBack)
  - Asserts page content is present and valid
  - Tests interactive elements: buttons, switches, selects, dialog triggers
  - Captures Web Vitals, console errors, console warnings, network errors
  - Generates a detailed test report

  Usage:
    bun scripts/crawltest.ts --mode dev
    bun scripts/crawltest.ts --mode preview
    bun scripts/crawltest.ts --mode dev --screenshot-pages
    bun scripts/crawltest.ts --mode dev --screenshot-pages path/to/dir
    bun scripts/crawltest.ts --mode dev --page /settings/audit-logs
    bun scripts/crawltest.ts --mode dev --start-from /settings
    bun scripts/crawltest.ts --mode dev --404
    bun scripts/crawltest.ts --mode dev --screenshot-pages --404
    bun scripts/crawltest.ts --mode dev --bug

  Screenshots are saved in versioned subdirectories:
    spernakit (template):  screenshots/v{version}/
    derived apps:          screenshots/v{version}-sv{spernakit_version}/

  Config (from JSON config file):
    testing.crawlLoginEmail       -> login email
    testing.crawlLoginPassword    -> login password
    testing.crawlMaxDepth        -> discovery passes (default 3)
    testing.crawlTimeout         -> timeout per action in ms (default 30000)
    testing.crawlInteractionDelay -> ms between element interactions (default 400)
    testing.crawlPageSettleDelay  -> ms to wait after navigation (default 500)
    testing.crawlContentMinLength -> min chars for content assertion (default 50)
*/
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	detectServedBuild,
	logCrawlConfig,
	parseMode,
	parsePage,
	parseScreenshotDir,
	parseStartFrom,
	parseTest404,
	parseTestBug,
} from './crawltest-config';
import { WebCrawler } from './crawltest-crawler';
import { getVersionedScreenshotDir, printReport } from './crawltest-reporting';
import { flushRateLimits } from './crawltest-session';
import { getFrontendUrl, loadJsonConfig } from './load-json-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
	const args = process.argv.slice(2);
	const mode = parseMode(args);
	const rawScreenshotDir = parseScreenshotDir(args);
	const singlePage = parsePage(args);
	const startFrom = parseStartFrom(args);
	const test404 = parseTest404(args);
	const testBug = parseTestBug(args);

	// Validate mutual exclusivity
	if (singlePage && startFrom) {
		console.error('--page and --start-from cannot be used together.');
		process.exit(1);
	}

	// Load JSON config
	const { config } = loadJsonConfig(ROOT_DIR);

	// Compute versioned screenshot directory
	const screenshotDir = rawScreenshotDir
		? getVersionedScreenshotDir(rawScreenshotDir, ROOT_DIR)
		: null;

	// Get configuration values
	const baseUrl = getFrontendUrl(config, mode);

	// `mode` is only a label — getFrontendUrl() ignores it and returns the same
	// configured URL either way — so ask the running app what it actually is.
	const servedBuild = await detectServedBuild(baseUrl);
	if (mode !== 'dev' && servedBuild === 'dev') {
		console.error(
			`--mode ${mode} was requested but ${baseUrl} is serving a Vite dev server.\n` +
				'Build and serve a production build on that URL first.'
		);
		process.exit(1);
	}
	if (mode === 'dev' && servedBuild === 'production') {
		console.warn(`⚠️  --mode dev but ${baseUrl} is serving a production build.`);
	}
	// Web Vitals capture is structurally dev-only: the crawler harvests them from
	// `[Web Vitals]` console lines that frontend/src/lib/webVitals.ts emits only under
	// `import.meta.env.DEV` (a production build buffers and POSTs them instead, silently).
	// Dev also sets reportAllChanges for CLS/INP, so those two are worst-intermediate
	// values, not the CWV definitions. Never read them as production numbers — use the
	// stored field vitals from the backend for that.
	if (servedBuild === 'production') {
		console.warn(
			'⚠️  Serving a production build: Web Vitals will NOT be captured.\n' +
				'   Console capture is dev-only (webVitals.ts gates it on import.meta.env.DEV).\n' +
				'   This run validates crawl correctness only. For production vitals, read the\n' +
				'   field metrics the app POSTs to /api/v1/system/web-vitals.\n'
		);
	}
	const loginEmail = config.testing?.crawlLoginEmail;
	const loginPassword = config.testing?.crawlLoginPassword;
	const maxDepth = config.testing?.crawlMaxDepth ?? 3;
	const timeout = config.testing?.crawlTimeout ?? 30000;
	const interactionDelay = config.testing?.crawlInteractionDelay ?? 400;
	const pageSettleDelay = config.testing?.crawlPageSettleDelay ?? 500;
	const contentMinLength = config.testing?.crawlContentMinLength ?? 50;
	const seedRoutes = config.testing?.crawlSeedRoutes ?? [];
	const requiresLogin = Boolean(loginEmail && loginPassword);

	logCrawlConfig({
		baseUrl,
		contentMinLength,
		interactionDelay,
		maxDepth,
		mode,
		pageSettleDelay,
		screenshotDir,
		singlePage,
		startFrom,
		test404,
		testBug,
		timeout,
	});

	const crawler = new WebCrawler(baseUrl, {
		contentMinLength,
		interactionDelay,
		maxDepth,
		page: singlePage,
		pageSettleDelay,
		screenshotDir,
		seedRoutes,
		startFrom,
		test404,
		testBug,
		timeout,
	});

	try {
		await crawler.init();
		flushRateLimits();
		if (requiresLogin) {
			await crawler.screenshotPreLoginPages();
			await crawler.login(loginEmail!, loginPassword!);
		} else {
			console.log('ℹ️  No login credentials configured — crawling as anonymous user');
			await crawler.navigateToStart();
		}
		await crawler.crawl();

		console.log('\n✅ Crawl completed!');
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.error('\n❌ Crawl failed:', typedErr.message);
	} finally {
		await crawler.close();

		const report = crawler.getResults().generateReport();
		// Stamp what was actually measured. Without this the Web Vitals in this file
		// cannot be attributed to a build, which is how dev-mode INP/CLS numbers were
		// previously read as production regressions.
		report.servedBuild = servedBuild;
		const reportPath = path.join(__dirname, '../logs/crawltest.json');
		await Bun.write(reportPath, JSON.stringify(report, null, 2));
		printReport(report, reportPath);
	}
}

run().catch((e: unknown) => {
	console.error('Fatal error:', e);
	process.exit(1);
});
