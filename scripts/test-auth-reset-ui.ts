#!/usr/bin/env bun
/*
  test-auth-reset-ui.ts
  - Focused Puppeteer-based UI checks for authentication and password reset flows
  - Complements scripts/crawltest.ts
  - Fails (exit 1) on any uncaught page error, console.error, or missing expected UX text

  Usage:
    bun scripts/test-auth-reset-ui.ts --mode dev
    bun scripts/test-auth-reset-ui.ts --mode preview

  Config (env overrides):
    FRONTEND_ORIGIN | VITE_FRONTEND_ORIGIN  -> base URL
    testing.crawlLoginEmail                  -> login email (default: sysop@example.com)
*/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer';

import { parseMode } from './crawltest-config.ts';
import { getFrontendUrl, loadJsonConfig } from './load-json-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function run(): Promise<void> {
	const mode = parseMode(process.argv.slice(2));

	// Load JSON config
	const { config } = loadJsonConfig(ROOT_DIR);

	// Get configuration values from returned config
	const baseUrl = getFrontendUrl(config, mode);
	const loginEmail = config.testing?.crawlLoginEmail;

	if (!loginEmail) {
		console.error('testing.crawlLoginEmail must be set in JSON config.');
		process.exit(1);
	}

	let hadPageError = false;
	let hadConsoleError = false;

	const browser = await puppeteer.launch({
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
		headless: true,
	});
	const page: Page = await browser.newPage();

	page.on('console', (msg) => {
		const type = msg.type();
		const text = msg.text();
		if (type === 'error') {
			// Allow expected 4xx responses during auth tests without failing the suite.
			// Includes both browser network errors and app-level API error logs.
			if (
				text.includes('the server responded with a status of 401') ||
				text.includes('the server responded with a status of 400') ||
				text.includes('API Error: 401') ||
				text.includes('API Error: 400')
			) {
				console.warn(`Console expected 4xx error: ${text}`);
				return;
			}

			hadConsoleError = true;
			console.error(`Console error: ${text}`);
		} else {
			console.log(`Console[${type}]: ${text}`);
		}
	});

	page.on('pageerror', (err: unknown) => {
		hadPageError = true;
		const error = err as Error;
		console.error(`Uncaught page error: ${error.stack ?? error.message ?? String(err)}`);
	});

	const step = async (name: string, fn: () => Promise<void>): Promise<void> => {
		console.log(`STEP: ${name}`);
		const start = Date.now();
		await fn();
		console.log(`DONE: ${name} (${Date.now() - start}ms)`);
	};

	try {
		await step('Invalid login shows credentials error', async () => {
			await page.goto(new URL('/login', baseUrl).toString(), {
				timeout: 30000,
				waitUntil: 'domcontentloaded',
			});
			await page.waitForSelector('#username', { timeout: 15000 });
			await page.waitForSelector('#password', { timeout: 15000 });

			await page.type('#username', loginEmail, { delay: 50 });
			await page.type('#password', 'definitely-wrong-password', { delay: 50 });
			await page.click('button[type="submit"]');

			// The page shows its own wording for AUTH_INVALID_CREDENTIALS
			// (frontend/src/api/errorHandling.ts), not the backend's generic message.
			await page.waitForFunction(
				() => document.body.innerText.includes('Invalid username or password'),
				{ timeout: 15000 },
			);
		});

		await step('Reset password request validates missing email', async () => {
			// The request form lives at /forgot-password; /reset-password is the confirm page.
			await page.goto(new URL('/forgot-password', baseUrl).toString(), {
				timeout: 30000,
				waitUntil: 'domcontentloaded',
			});
			await page.waitForSelector('#email', { timeout: 15000 });
			await page.click('button[type="submit"]');

			// The form uses the browser's own required-field validation, so an empty submit is
			// stopped before any request: the field reports valueMissing and the page does not
			// move on to its "Check Your Email" state.
			const blocked = await page.evaluate(() => {
				const email = document.querySelector<HTMLInputElement>('#email');
				return (
					email?.validity.valueMissing === true &&
					!document.body.innerText.includes('Check Your Email')
				);
			});
			if (!blocked) throw new Error('An empty email was not stopped by the request form.');
		});

		await step('Reset password confirm shows error for invalid token', async () => {
			const invalidUrl = new URL('/reset-password', baseUrl);
			invalidUrl.searchParams.set('token', 'invalid-token');

			await page.goto(invalidUrl.toString(), {
				timeout: 30000,
				waitUntil: 'domcontentloaded',
			});

			await page.waitForSelector('#password', { timeout: 15000 });
			await page.waitForSelector('#confirm-password', { timeout: 15000 });

			const newPassword = 'S3cure!Pwd9';
			await page.type('#password', newPassword, { delay: 50 });
			await page.type('#confirm-password', newPassword, { delay: 50 });
			await page.click('button[type="submit"]');

			await page.waitForSelector('#reset-password-error', { timeout: 20000 });
			const shown = await page.$eval('#reset-password-error', (el) => el.textContent ?? '');
			console.log(`Reset error shown: ${shown}`);
			if (!/invalid or (has )?expired/i.test(shown)) {
				throw new Error(`Unexpected reset error for an invalid token: ${shown}`);
			}
		});
	} catch (err) {
		const error = err as Error;
		console.error(`Failure: ${error?.stack ?? error?.message ?? String(err)}`);
		hadPageError = true;
	} finally {
		await browser.close();
	}

	if (hadPageError || hadConsoleError) {
		console.error('Auth/reset UI checks failed due to page error and/or console error.');
		process.exit(1);
	}

	console.log('Auth/reset UI checks passed with no uncaught errors.');
	process.exit(0);
}

run().catch((e: unknown) => {
	console.error(e);
	process.exit(1);
});
