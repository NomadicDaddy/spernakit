/**
 * The one browser the regression suite runs, resolved the same way by the fingerprint step and the
 * suite.
 *
 * bun.lock pins puppeteer exactly, and puppeteer pins its Chrome for Testing build
 * (pinnedChromeRevision()). The suite uses that managed executable and nothing else: an
 * ambient PUPPETEER_* override or a .puppeteerrc file could point it at a different browser while
 * the lockfile still read the same, so both are refused. The launched browser's version must equal
 * the pinned revision.
 *
 * `.regression/fingerprint.json` records what was actually launched, and the suite's cache key
 * reads it. It must be byte-identical for an unchanged runtime: fixed keys in a fixed order, and no
 * time, process id, path or duration.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';
import * as puppeteerModule from 'puppeteer';

import { REPO_ROOT } from './instance.ts';

export const FINGERPRINT_PATH = join(REPO_ROOT, '.regression', 'fingerprint.json');
/** puppeteer exports PUPPETEER_REVISIONS at runtime but not in its typings, so read it with a guard. */
export function pinnedChromeRevision(): string {
	const revisions: unknown = (puppeteerModule as Record<string, unknown>)['PUPPETEER_REVISIONS'];
	const chrome =
		typeof revisions === 'object' && revisions !== null
			? (revisions as Record<string, unknown>)['chrome']
			: undefined;
	if (typeof chrome !== 'string')
		throw new Error('puppeteer does not say which Chrome build it pins.');
	return chrome;
}

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

export interface Fingerprint {
	browser: string;
	bun: string;
	chromeRevision: string;
	puppeteer: string;
}

/** The managed browser's path, refusing anything that would make it a different one. */
export async function managedExecutable(): Promise<string> {
	const overrides = Object.keys(process.env).filter((name) => /^PUPPETEER_/iu.test(name));
	if (overrides.length > 0) {
		throw new Error(
			`${overrides.join(', ')} would choose a browser outside the lockfile; unset it.`,
		);
	}
	const rc = readdirSync(REPO_ROOT).filter(
		(name) => /^\.puppeteerrc/u.test(name) || name === 'puppeteer.config.cjs',
	);
	if (rc.length > 0)
		throw new Error(`${rc.join(', ')} would configure puppeteer outside the lockfile.`);
	return puppeteer.executablePath();
}

/** Launch the managed browser headless and check it is the pinned revision. */
export async function launchManaged(): Promise<Browser> {
	const executablePath = await managedExecutable();
	const browser = await puppeteer.launch({ args: LAUNCH_ARGS, executablePath, headless: true });
	const version = await browser.version();
	if (!version.endsWith(`/${pinnedChromeRevision()}`)) {
		await browser.close();
		throw new Error(
			`the launched browser is ${version}, but puppeteer pins ${pinnedChromeRevision()}.`,
		);
	}
	return browser;
}

function puppeteerVersion(): string {
	const manifest = JSON.parse(
		readFileSync(join(REPO_ROOT, 'node_modules', 'puppeteer', 'package.json'), 'utf8'),
	) as {
		version?: string;
	};
	return manifest.version ?? 'unknown';
}

/** What the runtime is right now. */
export async function currentFingerprint(): Promise<Fingerprint> {
	const browser = await launchManaged();
	try {
		return {
			browser: await browser.version(),
			bun: Bun.version,
			chromeRevision: pinnedChromeRevision(),
			puppeteer: puppeteerVersion(),
		};
	} finally {
		await browser.close();
	}
}

export function serialize(fingerprint: Fingerprint): string {
	const ordered = {
		browser: fingerprint.browser,
		bun: fingerprint.bun,
		chromeRevision: fingerprint.chromeRevision,
		puppeteer: fingerprint.puppeteer,
	};
	return `${JSON.stringify(ordered, null, '\t')}\n`;
}

export function writeFingerprint(fingerprint: Fingerprint): void {
	mkdirSync(join(REPO_ROOT, '.regression'), { recursive: true });
	const text = serialize(fingerprint);
	// Rewrite only on change, so an unchanged runtime leaves the file, and the suite's key, alone.
	if (existsSync(FINGERPRINT_PATH) && readFileSync(FINGERPRINT_PATH, 'utf8') === text) return;
	writeFileSync(FINGERPRINT_PATH, text);
}

/** The recorded fingerprint, or why the suite must refuse to run. */
export function readFingerprint(): Fingerprint | string {
	if (!existsSync(FINGERPRINT_PATH)) {
		return '.regression/fingerprint.json is missing; the regression:fingerprint step runs first.';
	}
	try {
		return JSON.parse(readFileSync(FINGERPRINT_PATH, 'utf8')) as Fingerprint;
	} catch {
		return '.regression/fingerprint.json is not readable JSON; rerun regression:fingerprint.';
	}
}
