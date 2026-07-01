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

import { getFrontendUrl, loadJsonConfig } from './load-json-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function parseMode(argv: string[]): string {
	const modeFlag = argv.find((a) => a.startsWith('--mode'));
	if (!modeFlag) return 'dev';
	const parts = modeFlag.split('=');
	const val = parts[1];
	return (val ?? 'dev').trim();
}

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

			await page.waitForFunction(
				() => document.body.innerText.includes('Invalid credentials'),
				{ timeout: 15000 }
			);
		});

		await step('Reset password request validates missing email', async () => {
			await page.goto(new URL('/reset-password', baseUrl).toString(), {
				timeout: 30000,
				waitUntil: 'domcontentloaded',
			});

			// The reset page is gated behind email configuration. In environments
			// where password reset is disabled, we should see the service-unavailable
			// message instead of the form submit button.
			const serviceUnavailableText =
				'Password reset is currently unavailable. Email services are not configured.';

			const stateHandle = await page.waitForFunction(
				(unavailableText: string) => {
					const text = document.body.innerText;
					if (text.includes(unavailableText)) return 'unavailable';
					if (document.querySelector('button[type="submit"]')) return 'has-submit';
					return null;
				},
				{ timeout: 15000 },
				serviceUnavailableText
			);
			const state = await stateHandle.jsonValue();

			if (state === 'unavailable') {
				console.log(
					'Password reset is disabled in this environment; skipping missing-email validation step.'
				);
				return;
			}

			await page.click('button[type="submit"]');

			await page.waitForFunction(
				() => document.body.innerText.includes('Email is required'),
				{ timeout: 15000 }
			);
		});

		await step('Reset password confirm shows error for invalid token', async () => {
			const invalidUrl = new URL('/reset-password/confirm', baseUrl);
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

			// Wait for Sonner error toast with the backend error message
			await page.waitForFunction(
				() => document.body.innerText.includes('Invalid or expired reset token'),
				{ timeout: 20000 }
			);
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
