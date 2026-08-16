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
    testing.crawlLoginEmail       -> login email    (falls back to the SYSOP dev-seed account)
    testing.crawlLoginPassword    -> login password (falls back to the SYSOP dev-seed account)
    testing.crawlMaxDepth        -> discovery passes (default 3)
    testing.crawlTimeout         -> timeout per action in ms (default 30000)
    testing.crawlInteractionDelay -> ms between element interactions (default 400)
    testing.crawlPageSettleDelay  -> ms to wait after navigation (default 500)
    testing.crawlContentMinLength -> min chars for content assertion (default 50)
*/
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSeedCredential } from '../backend/src/utils/auth/passwordGenerator.ts';
import {
	detectServedBuild,
	logCrawlConfig,
	parseMode,
	parsePage,
	parseReadOnly,
	parseScreenshotDir,
	parseStartFrom,
	parseTest404,
	parseTestBug,
	resolveCrawlLogin,
} from './crawltest-config';
import { WebCrawler } from './crawltest-crawler';
import { getVersionedScreenshotDir, printReport } from './crawltest-reporting';
import { writeCrawlResult } from './crawltest-screenshots';
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
	const readOnly = parseReadOnly(args);
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
	const { appSlug, config } = loadJsonConfig(ROOT_DIR);

	// Resolve the login before anything else runs. An unauthenticated crawl does not fail loudly —
	// it reports a shallow public site, which reads as a successful test run — so an unresolvable
	// login has to stop the run here, before the screenshot directory is stamped `started` and
	// before a browser is launched.
	//
	// The dev-seed fallback is only trustworthy against a development seed: a production seed gives
	// the same account a random password, so offer nothing there and let the keys report as unset.
	const isProduction = config.server?.nodeEnv === 'production';
	const { fromSeed, login, unresolved } = resolveCrawlLogin(
		config.testing,
		isProduction ? undefined : getSeedCredential('SYSOP'),
	);
	if (!login) {
		const reason = isProduction
			? [
					'   nodeEnv is "production", where the seed generates a random password for',
					'   that account, so there is no development-seed credential to fall back to.',
				]
			: ['   No SYSOP development-seed account is defined to fall back to either.'];
		console.error(
			[
				'❌ Cannot resolve the crawl login; these config keys are unset:',
				...unresolved.map((key) => `   - ${key}`),
				...reason,
				`   Set them in config/${appSlug}.json or config/testing.local.json — crawling`,
				'   anonymously would only reach the public routes and report a shallow pass.',
			].join('\n'),
		);
		process.exit(1);
	}
	if (fromSeed.length > 0) {
		console.log(
			`ℹ️  Resolved ${fromSeed.join(' and ')} from the SYSOP development-seed account; ` +
				`crawling as ${login.email}`,
		);
	}

	// Compute versioned screenshot directory
	const screenshotDir = rawScreenshotDir
		? getVersionedScreenshotDir(rawScreenshotDir, ROOT_DIR)
		: null;

	// The versioned directory is the release artifact, so its verdict is stamped before the crawl
	// starts: a run that dies partway leaves `started` behind and the pre-push guard refuses it.
	if (screenshotDir) {
		await writeCrawlResult(screenshotDir, { status: 'started', success: false });
	}

	// Get configuration values
	const baseUrl = getFrontendUrl(config, mode);

	// `mode` is only a label — getFrontendUrl() ignores it and returns the same
	// configured URL either way — so ask the running app what it actually is.
	const servedBuild = await detectServedBuild(baseUrl);
	if (mode !== 'dev' && servedBuild === 'dev') {
		console.error(
			`--mode ${mode} was requested but ${baseUrl} is serving a Vite dev server.\n` +
				'Build and serve a production build on that URL first.',
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
				'   field metrics the app POSTs to /api/v1/system/web-vitals.\n',
		);
	}
	const maxDepth = config.testing?.crawlMaxDepth ?? 3;
	const timeout = config.testing?.crawlTimeout ?? 30000;
	const interactionDelay = config.testing?.crawlInteractionDelay ?? 400;
	const pageSettleDelay = config.testing?.crawlPageSettleDelay ?? 500;
	const contentMinLength = config.testing?.crawlContentMinLength ?? 50;
	const seedRoutes = config.testing?.crawlSeedRoutes ?? [];

	logCrawlConfig({
		baseUrl,
		contentMinLength,
		interactionDelay,
		maxDepth,
		mode,
		pageSettleDelay,
		readOnly,
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
		readOnly,
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
		await crawler.screenshotPreLoginPages();
		await crawler.login(login.email, login.password);
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
		// Before printReport — it ends the process, so anything after it never runs.
		if (screenshotDir) {
			await writeCrawlResult(screenshotDir, {
				screenshots: report.summary.screenshotsTaken,
				status: report.summary.success ? 'passed' : 'failed',
				success: report.summary.success,
			});
		}
		printReport(report, reportPath);
	}
}

run().catch((e: unknown) => {
	console.error('Fatal error:', e);
	process.exit(1);
});
