/**
 * Screenshot capture — basic screenshot with optional full-page mode.
 *
 * Adapts the timeout/retry pattern from crawltest-screenshots.ts.
 */
import type { Page } from 'puppeteer';

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { SCREENSHOT_TIMEOUT_MS } from './types';

/** Take a screenshot of the current page. */
export async function takeScreenshot(
	page: Page,
	outputPath?: string,
	options?: { fullPage?: boolean }
): Promise<string> {
	const fullPage = options?.fullPage ?? false;

	// Ensure output directory exists
	if (outputPath) {
		const dir = path.dirname(outputPath);
		mkdirSync(dir, { recursive: true });
	}

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const screenshotOpts = {
				captureBeyondViewport: false,
				fullPage,
				optimizeForSpeed: true,
				...(outputPath ? { path: outputPath } : {}),
			};

			const screenshotPromise = page.screenshot(screenshotOpts);
			const timeoutPromise = Bun.sleep(SCREENSHOT_TIMEOUT_MS).then(() => {
				throw new Error('Screenshot timed out');
			});
			const result = await Promise.race([screenshotPromise, timeoutPromise]);

			if (outputPath) {
				return `Screenshot saved to ${outputPath}`;
			}

			// Return base64 if no path specified
			if (Buffer.isBuffer(result)) {
				return `data:image/png;base64,${result.toString('base64').substring(0, 100)}... (${result.length} bytes)`;
			}

			return 'Screenshot captured';
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (attempt === 0 && msg.includes('timed out')) {
				// Retry after reload (crawltest pattern)
				try {
					await page.reload({ timeout: 30_000, waitUntil: 'networkidle2' });
					await Bun.sleep(2000);
				} catch {
					// Reload failed — give up
				}
				continue;
			}
			return `Error: screenshot failed — ${msg}`;
		}
	}

	return 'Error: screenshot failed after retry';
}
