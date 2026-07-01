/**
 * Report printing and versioned screenshot directory for crawltest.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { CrawlReport, WebVitalEntry } from './crawltest-types';

// ---------------------------------------------------------------------------
// Versioned screenshot directory
// ---------------------------------------------------------------------------

/**
 * Compute a versioned subdirectory under the screenshot base dir.
 *   spernakit (template):  screenshots/v2.7.4/
 *   derived apps:          screenshots/v0.9.0-sv2.7.4/
 */
export function getVersionedScreenshotDir(baseDir: string, rootDir: string): string {
	const pkgPath = path.join(rootDir, 'package.json');
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
			spernakit_version?: string;
			version?: string;
		};
		const version = pkg.version;
		const spernakitVersion = pkg.spernakit_version;

		if (!version) return baseDir;

		const subdir = spernakitVersion ? `v${version}-sv${spernakitVersion}` : `v${version}`;
		return path.join(baseDir, subdir);
	} catch {
		return baseDir;
	}
}

// ---------------------------------------------------------------------------
// Report printing
// ---------------------------------------------------------------------------

export function printReport(report: CrawlReport, reportPath: string): void {
	console.log('\n📊 Test Report:');
	console.log(`   Duration: ${report.summary.duration}`);
	console.log(`   Routes Discovered: ${report.summary.routesDiscovered}`);
	console.log(`   URLs Visited: ${report.summary.urlsVisited}`);
	console.log(
		`   Content Assertions: ${report.summary.contentAssertions} (${report.summary.contentFailures} failed)`
	);
	console.log(`   Elements Clicked: ${report.summary.elementsClicked}`);
	console.log(`   Failed Clicks: ${report.summary.failedClicks}`);
	console.log(`   Dialogs Tested: ${report.summary.dialogsTested}`);
	console.log(`   Switches Tested: ${report.summary.switchesTested}`);
	console.log(`   Selects Tested: ${report.summary.selectsTested}`);
	console.log(`   Total Errors: ${report.summary.totalErrors}`);
	console.log(`   Console Errors: ${report.summary.consoleErrors}`);
	console.log(`   Console Warnings: ${report.summary.consoleWarnings}`);
	console.log(`   Network Errors: ${report.summary.networkErrors}`);
	console.log(`   Web Vitals Captured: ${report.summary.webVitalsCount}`);
	if (report.summary.screenshotsTaken > 0) {
		console.log(`   Screenshots Taken: ${report.summary.screenshotsTaken}`);
	}

	if (report.summary.webVitalsCount > 0) {
		console.log('\n📈 Web Vitals Summary:');
		const latest = new Map<string, WebVitalEntry>();
		for (const entry of report.webVitals) {
			latest.set(entry.name, entry);
		}
		for (const name of ['CLS', 'FCP', 'INP', 'LCP', 'TTFB']) {
			const m = latest.get(name);
			if (m) {
				const flag =
					m.rating === 'good' ? '✓' : m.rating === 'needs-improvement' ? '⚠' : '✗';
				const unit = name === 'CLS' ? '' : 'ms';
				console.log(`   ${flag} ${name}: ${m.value}${unit} (${m.rating})`);
			}
		}
	}

	console.log(`\n📄 Full report saved to: ${reportPath}`);

	if (!report.summary.success) {
		console.log('\n❌ Test failed due to errors');
		process.exit(1);
	} else {
		console.log('\n✅ All tests passed!');
		process.exit(0);
	}
}
