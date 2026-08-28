/**
 * frontend-render.ts
 *
 * Enough of a browser for a gate under `scripts/` to import the frontend source tree and render a
 * page to static markup, without a headless browser and without a DOM library.
 *
 * Two things stand in the way of doing this directly. React is installed in `frontend/node_modules`
 * and is not hoisted to the repository root, so a script here cannot import it by name; and the
 * source tree reads Vite `define` globals at import time, so those have to exist before the first
 * module of it loads. Both are handled here so a gate can be about its own subject.
 *
 * What this is not: a DOM. Nothing here runs effects, lays anything out, or dispatches an event.
 * It is for asserting what a component renders, which is the question a gate can answer honestly
 * without a browser. Anything about interaction belongs in a crawl.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendDir = join(repoRoot, 'frontend');

/** The slice of React a static render needs. */
export interface ReactModule {
	createElement: (
		type: unknown,
		props?: null | Record<string, unknown>,
		...children: unknown[]
	) => unknown;
}

/** The slice of `react-dom/server` a static render needs. */
export interface ServerRenderModule {
	renderToStaticMarkup: (element: unknown) => string;
}

interface MemoryStorage {
	clear: () => void;
	getItem: (key: string) => null | string;
	key: (index: number) => null | string;
	length: number;
	removeItem: (key: string) => void;
	setItem: (key: string, value: string) => void;
}

/**
 * Build an in-memory stand-in for `localStorage` / `sessionStorage`.
 *
 * @returns A storage object carrying the Web Storage surface the frontend actually uses.
 */
function createStorage(): MemoryStorage {
	const entries = new Map<string, string>();
	return {
		clear: () => entries.clear(),
		getItem: (key) => entries.get(key) ?? null,
		key: (index) => [...entries.keys()][index] ?? null,
		get length() {
			return entries.size;
		},
		removeItem: (key) => {
			entries.delete(key);
		},
		setItem: (key, value) => {
			entries.set(key, value);
		},
	};
}

/**
 * Seed the globals the frontend expects from Vite and from a browser.
 *
 * The app slug comes from the same `defaults.json` the Vite config reads, so a derived app gets its
 * own value rather than the template's. Call this before importing anything under `frontend/src`:
 * `storageKeys.ts` reads `__APP_SLUG__` while it is being evaluated, and the API client builds every
 * request URL against `window.location.origin`.
 *
 * @param pathname - The path the page under test is being rendered at.
 */
export function seedBrowserGlobals(pathname: string): void {
	const defaults = JSON.parse(
		readFileSync(join(repoRoot, 'backend', 'src', 'config', 'defaults.json'), 'utf8'),
	) as { app?: { name?: string; slug?: string }; security?: { csrfCookieName?: string } };
	const slug = defaults.app?.slug ?? 'app';
	const scope = globalThis as unknown as Record<string, unknown>;

	scope.__APP_NAME__ = defaults.app?.name ?? 'Application';
	scope.__APP_SLUG__ = slug;
	scope.__APP_VERSION__ = '0.0.0';
	scope.__BACKEND_PORT__ = 0;
	scope.__CSRF_COOKIE_NAME__ = defaults.security?.csrfCookieName ?? `${slug}_csrf`;

	scope.localStorage = createStorage();
	scope.sessionStorage = createStorage();
	scope.window = {
		addEventListener: () => undefined,
		localStorage: scope.localStorage,
		location: { href: `http://localhost${pathname}`, origin: 'http://localhost', pathname },
		matchMedia: () => ({
			addEventListener: () => undefined,
			matches: false,
			removeEventListener: () => undefined,
		}),
		removeEventListener: () => undefined,
		sessionStorage: scope.sessionStorage,
	};
}

/**
 * Load a module the way the frontend would, resolving from the frontend workspace.
 *
 * Resolving there rather than from `scripts/` is what makes React importable at all, and it is also
 * what guarantees the gate and the component under test share one React and one query client. Two
 * copies of either would fail in ways that look like the component's fault.
 *
 * @param specifier - A package name, or a path relative to the frontend workspace.
 * @returns The loaded module.
 */
export async function loadFromFrontend<T>(specifier: string): Promise<T> {
	const path = specifier.startsWith('.')
		? join(frontendDir, specifier)
		: Bun.resolveSync(specifier, frontendDir);
	return (await import(path)) as T;
}

/**
 * Reduce markup to the text a reader would see, so an assertion can talk about that instead.
 *
 * @param markup - Rendered HTML.
 * @returns The collapsed text content of that markup.
 */
export function visibleText(markup: string): string {
	return markup
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}
