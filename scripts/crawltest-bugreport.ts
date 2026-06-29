/**
 * Bug report submission test for crawltest (--bug flag).
 */
import type { Page } from 'puppeteer';

import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';

import type { TestResults } from './crawltest-results';
import type { CrawlerOpts, CrawlerState } from './crawltest-types';

import { ensureScreenshotDir } from './crawltest-screenshots';
import { isOnLoginPage, waitForContent } from './crawltest-types';

// ---------------------------------------------------------------------------
// Layout reset (direct DB) — undo settings mutations from interactive crawl
// ---------------------------------------------------------------------------

/**
 * Reset layout-related settings to defaults directly via SQLite so the bug
 * report button is visible.  The crawl's interactive element testing can
 * mutate settings (e.g. switching to the BBS super-theme whose shell does
 * not render BugReportButton).  A direct DB write avoids the cascading
 * side-effects that the settings API causes (e.g. /settings/user 500s).
 */
function resetLayoutDefaults(rootDir: string): void {
	try {
		const defaultsPath = path.join(rootDir, 'backend', 'src', 'config', 'defaults.json');
		const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as {
			app?: { slug?: string };
		};
		const slug = defaults.app?.slug ?? 'app';
		const dbPath = path.join(rootDir, 'data', `${slug}.db`);
		const db = new Database(dbPath);
		db.run(`UPDATE settings SET value = '"sidebar"' WHERE key = 'app.default_layout_mode'`);
		db.run(`UPDATE settings SET value = '"default"' WHERE key = 'app.super_theme'`);
		db.close();
		console.log('   ♻️  Layout defaults reset via DB (sidebar + default theme)');
	} catch {
		// DB may not exist or settings rows may not exist — safe to ignore
	}
}

// ---------------------------------------------------------------------------
// Bug report test
// ---------------------------------------------------------------------------

export async function testBugReport(
	page: Page,
	results: TestResults,
	opts: CrawlerOpts,
	state: CrawlerState,
	rootDir: string
): Promise<void> {
	console.log('\n🐛 Testing bug report submission...');

	if (!opts.loginCredentials) {
		console.log('   ⏭️  Skipped — no login credentials configured');
		return;
	}

	try {
		// Undo any layout/theme mutations from interactive crawl so the bug button is visible
		resetLayoutDefaults(rootDir);

		// Navigate directly to dashboard — going through /login triggers a redirect
		// that can race with feature-flag loading after a long crawl.
		await page.goto(`${opts.baseUrl}/dashboard`, {
			timeout: opts.timeout,
			waitUntil: 'networkidle2',
		});

		// If we landed on login, re-authenticate
		if (isOnLoginPage(page) && opts.loginCredentials) {
			await page.waitForSelector('#username', { timeout: 15000 });
			await page.type('#username', opts.loginCredentials.email, { delay: 10 });
			await page.type('#password', opts.loginCredentials.password, { delay: 10 });
			await page.click('button[type="submit"]');
			await page.waitForFunction(() => location.pathname === '/dashboard', {
				timeout: 20000,
			});
		}

		await waitForContent(page, opts.pageSettleDelay);

		// Find and click the bug icon in the navigation bar.
		// After a long crawl CDP can be degraded — retry with a reload if needed.
		const BUG_SELECTOR = 'button[aria-label*="Report a bug"], button[title*="Report a bug"]';
		let bugIconClicked = false;

		for (let attempt = 0; attempt < 2 && !bugIconClicked; attempt++) {
			if (attempt === 1) {
				console.log('   ⟳ Retrying after page reload...');
				await page.reload({ timeout: opts.timeout, waitUntil: 'networkidle2' });
				await waitForContent(page, opts.pageSettleDelay);
			}
			try {
				await page.waitForSelector(BUG_SELECTOR, { timeout: 10000, visible: true });
				bugIconClicked = await page.evaluate((sel) => {
					const btn = document.querySelector(sel);
					if (btn) {
						(btn as HTMLElement).click();
						return true;
					}
					return false;
				}, BUG_SELECTOR);
			} catch {
				// Button didn't appear within timeout
			}
		}

		if (!bugIconClicked) {
			console.log('   ⚠️  Bug icon button not found in navigation');
			results.addError('BUG_TEST', 'Bug icon button not found in navigation bar');
			return;
		}

		console.log('   Bug icon clicked, waiting for dialog...');
		await Bun.sleep(500);

		// Wait for the bug report dialog to appear
		const dialogAppeared = await page.evaluate(() => {
			return document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length > 0;
		});

		if (!dialogAppeared) {
			console.log('   ⚠️  Bug report dialog did not appear');
			results.addError(
				'BUG_TEST',
				'Bug report dialog did not appear after clicking bug icon'
			);
			return;
		}

		console.log('   Bug report dialog opened');

		// Wait for and fill in the bug description (React controlled component)
		let descriptionEntered = false;
		try {
			await page.waitForSelector('textarea#bug-description', {
				timeout: 5000,
				visible: true,
			});
			await page.focus('textarea#bug-description');
			await Bun.sleep(100);

			// Use evaluate to set value and trigger React's input event
			const testDescription = 'Automated test bug report from crawltest --bug flag.';
			await page.evaluate((text) => {
				const textarea = document.querySelector(
					'textarea#bug-description'
				) as HTMLTextAreaElement | null;
				if (textarea) {
					const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
						window.HTMLTextAreaElement.prototype,
						'value'
					)?.set;
					if (nativeInputValueSetter) {
						nativeInputValueSetter.call(textarea, text);
					} else {
						textarea.value = text;
					}
					textarea.dispatchEvent(new Event('input', { bubbles: true }));
					return true;
				}
				return false;
			}, testDescription);

			// Verify text was entered
			const textareaValue = await page.$eval(
				'textarea#bug-description',
				(el) => (el as HTMLTextAreaElement).value
			);
			descriptionEntered = textareaValue.length > 0;
			if (descriptionEntered) {
				console.log(`   Bug description entered (${textareaValue.length} chars)`);
			} else {
				console.log('   ⚠️  Bug description was not entered');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.log(`   ⚠️  Description field error: ${msg}`);
		}

		if (!descriptionEntered) {
			await page.keyboard.press('Escape');
			results.addError('BUG_TEST', 'Failed to enter bug description');
			return;
		}

		// Click the Submit Report button directly via evaluate
		const submitClicked = await page.evaluate(() => {
			const buttons = document.querySelectorAll('button');
			for (const btn of buttons) {
				if (btn.textContent?.includes('Submit Report')) {
					(btn as HTMLElement).click();
					return true;
				}
			}
			return false;
		});

		if (submitClicked) {
			console.log('   Bug report submitted via Submit Report button');
			// Wait for API call - check for dialog close or toast
			await Bun.sleep(2000);
		} else {
			console.log('   ⚠️  Submit Report button not found');
			await page.keyboard.press('Escape');
			results.addError('BUG_TEST', 'Submit Report button not found');
			return;
		}

		// Check for success toast (data-state="open" on toast element)
		await Bun.sleep(500);
		const hasSuccessToast = await page.evaluate(() => {
			const toasts = document.querySelectorAll('[data-sonner-toast][data-type="success"]');
			return toasts.length > 0;
		});

		// Check for error toast
		const hasErrorToast = await page.evaluate(() => {
			const toasts = document.querySelectorAll('[data-sonner-toast][data-type="error"]');
			return toasts.length > 0;
		});

		if (hasSuccessToast) {
			console.log('   ✓ Bug report submitted successfully (success toast visible)');
			console.log('   📄 Bug report saved to: data/bugs.json');
			results.addClickedElement('bug report submit', page.url(), true, 'bug-report');
		} else if (hasErrorToast) {
			console.log('   ❌ Bug report submission failed (error toast visible)');
			results.addError('BUG_TEST', 'Bug report submission showed error toast');
			await page.keyboard.press('Escape');
		} else {
			// No toast - check if dialog closed
			const dialogClosed = await page.evaluate(() => {
				return (
					document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length === 0
				);
			});
			if (dialogClosed) {
				console.log('   ✓ Bug report submitted (dialog closed, no toast)');
				console.log('   📄 Bug report saved to: data/bugs.json');
				results.addClickedElement('bug report submit', page.url(), true, 'bug-report');
			} else {
				console.log('   ⚠️  Bug report submission unclear - no toast, dialog still open');
				await page.keyboard.press('Escape');
				results.addError('BUG_TEST', 'Bug report submission status unclear');
			}
		}

		// Screenshot (if enabled)
		const dirBug = await ensureScreenshotDir(opts, state, rootDir);
		if (dirBug) {
			const filepath = path.join(dirBug, 'bug-report.png');
			try {
				await page.screenshot({ path: filepath });
				results.screenshotsTaken++;
				console.log(`   📸 Screenshot: ${filepath}`);
			} catch {
				console.log('   ⚠️  Screenshot failed for bug report test');
			}
		}
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		results.addError('BUG_TEST', `Bug report test failed: ${typedErr.message}`);
		console.log(`   ❌ Bug report test error: ${typedErr.message}`);
	}
}
