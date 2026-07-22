import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type PluginOption } from 'vite';
import { compression } from 'vite-plugin-compression2';

import { lucideDirectImportsPlugin } from './vite-plugins/lucideDirectImports.ts';
import { stripCssFallbacksPlugin } from './vite-plugins/stripCssFallbacks.ts';

const analyze = process.env.ANALYZE === 'true';
/**
 * Source maps are off by default. `sourcemap: 'hidden'` still emits .map files
 * next to each chunk; the Dockerfile copies dist/ out of the build stage
 * (COPY --from bypasses .dockerignore), and nginx served them from /assets/,
 * so the full original TypeScript source of any derived app was downloadable at
 * a guessable URL. Opt in with SOURCEMAP=true when you need to debug a
 * production build locally.
 */
const sourcemap = process.env.SOURCEMAP === 'true';
const configDir = dirname(fileURLToPath(import.meta.url));

/**
 * Read app metadata and dev server ports from defaults.json so derived apps
 * use configured values without requiring setup-time regex replacements.
 */
function getDefaultsMeta(): {
	appName: string;
	appSlug: string;
	appVersion: string;
	backendPort: number;
	csrfCookieName: string;
	frontendPort: number;
} {
	try {
		const defaultsPath = resolve(configDir, '..', 'backend', 'src', 'config', 'defaults.json');
		const defaults = JSON.parse(readFileSync(defaultsPath, 'utf8')) as {
			app?: { name?: string; slug?: string };
			security?: { csrfCookieName?: string };
			server?: { backendPort?: number; frontendPort?: number };
		};
		const packagePath = resolve(configDir, '..', 'package.json');
		const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string };
		const slug = defaults.app?.slug ?? 'app';
		return {
			appName: defaults.app?.name ?? 'Application',
			appSlug: slug,
			appVersion: pkg.version ?? '0.0.0',
			backendPort: defaults.server?.backendPort ?? 3331,
			csrfCookieName: defaults.security?.csrfCookieName ?? `${slug}_csrf`,
			frontendPort: defaults.server?.frontendPort ?? 3330,
		};
	} catch {
		return {
			appName: 'Application',
			appSlug: 'app',
			appVersion: '0.0.0',
			backendPort: 3331,
			csrfCookieName: 'app_csrf',
			frontendPort: 3330,
		};
	}
}

const { appName, appSlug, appVersion, backendPort, csrfCookieName, frontendPort } =
	getDefaultsMeta();

// https://vite.dev/config/
// eslint-disable-next-line import/no-default-export
export default defineConfig({
	define: {
		__APP_NAME__: JSON.stringify(appName),
		__APP_SLUG__: JSON.stringify(appSlug),
		__APP_VERSION__: JSON.stringify(appVersion),
		__BACKEND_PORT__: JSON.stringify(backendPort),
		__CSRF_COOKIE_NAME__: JSON.stringify(csrfCookieName),
	},
	build: {
		chunkSizeWarningLimit: 600,
		sourcemap: sourcemap ? 'hidden' : false,
		rollupOptions: {
			output: {
				// Rolldown's native chunking API. The predecessor `manualChunks(id)` callback
				// is only partially honoured under Vite 8/rolldown: it silently dropped the
				// `ui-utils` and `recharts-d3` groups entirely and placed the React runtime
				// (react, jsx-runtime, react-dom/index) into `grid-layout` instead of
				// `react-core`, which put react-grid-layout on every page's critical path
				// behind an extra round trip. `codeSplitting` groups are matched by explicit
				// `priority`, so the assignment below is the one the build actually applies.
				// (rolldown 1.1.5 renamed this option from `advancedChunks`, which now warns
				// on every build and is ignored outright if both are set.)
				//
				// Guard when editing: after any change, confirm the entry chunk does NOT
				// statically import ./grid-layout-*.js and that react-core owns react/*.
				codeSplitting: {
					groups: [
						// Core React runtime + zustand + radix (co-located to avoid circular
						// chunks). prop-types/fast-equals are transitive CJS deps of
						// react-grid-layout that are also reachable from the entry; keeping
						// them here stops shared runtime code landing in the grid-layout chunk.
						// Radix and its sidecar/positioning deps ride along because they are
						// reachable from the eagerly-imported AppShell -- splitting them into
						// their own chunk only adds a preload without removing any bytes.
						// One group per chunk name: two groups sharing a name emit two chunks.
						{
							name: 'react-core',
							priority: 100,
							test: /node_modules[\\/](?:react|react-dom|scheduler|use-sync-external-store|zustand|prop-types|fast-equals|@radix-ui|radix-ui|@floating-ui|sonner|cmdk|aria-hidden|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-sidecar|use-callback-ref|get-nonce)[\\/]/,
						},
						// React Router - split from core to allow parallel loading
						{
							name: 'react-routing',
							priority: 95,
							test: /node_modules[\\/]react-router(?:-dom)?[\\/]/,
						},
						// TanStack Query is needed at boot (App.tsx creates the QueryClient).
						{
							name: 'react-query',
							priority: 90,
							test: /node_modules[\\/]@tanstack[\\/](?:react-)?query/,
						},
						// TanStack Table/Virtual are only reached from lazy pages (DataTable).
						// Splitting them from Query keeps them off the critical path.
						{
							name: 'react-table',
							priority: 88,
							test: /node_modules[\\/]@tanstack[\\/](?:react-)?(?:table|virtual)/,
						},
						// UI utilities - small but commonly used (pure utilities only,
						// no React-dependent libs like sonner/cmdk which belong in react-core)
						{
							name: 'ui-utils',
							priority: 70,
							test: /node_modules[\\/](?:class-variance-authority|clsx|tailwind-merge)[\\/]/,
						},
						// Charting data layer - d3 math/scale/shape libs (recharts dependency)
						{
							name: 'recharts-d3',
							priority: 60,
							test: /node_modules[\\/](?:d3-[a-z]+|decimal\.js-light|internmap|victory-vendor)[\\/]/,
						},
						// Charting UI - recharts components and helpers (lazy-loaded on chart
						// pages). recharts 3.x pulls a redux store in as an implementation detail.
						{
							name: 'recharts',
							priority: 58,
							test: /node_modules[\\/](?:recharts|es-toolkit|eventemitter3|@reduxjs[\\/]toolkit|redux|react-redux|reselect|immer)[\\/]/,
						},
						// Grid layout - only loaded on CustomDashboardPage.
						{
							name: 'grid-layout',
							priority: 50,
							test: /node_modules[\\/](?:react-grid-layout|react-draggable|react-resizable)[\\/]/,
						},
					],
				},
			},
		},
	},
	optimizeDeps: {
		exclude: ['lucide-react'],
		include: ['react-grid-layout'],
	},
	plugins: [
		lucideDirectImportsPlugin(),
		react({
			babel: {
				plugins: ['babel-plugin-react-compiler'],
			},
		}),
		tailwindcss(),
		stripCssFallbacksPlugin(),
		compression({
			algorithms: ['gzip', 'brotliCompress'],
			threshold: 1024,
		}),
		...(analyze
			? [
					visualizer({
						filename: 'dist/bundle-analysis.html',
						gzipSize: true,
					}) as PluginOption,
				]
			: []),
	],
	// `vite preview` serves dist/ but does NOT inherit server.proxy, so without this
	// block every /api call 404s and the app cannot log in — which is why measuring
	// Web Vitals against a real production build was never actually possible.
	// In production nginx performs this proxying (docker/nginx.conf).
	preview: {
		port: frontendPort,
		proxy: {
			'/api': {
				changeOrigin: true,
				target: `http://localhost:${backendPort}`,
			},
			'/ws': {
				target: `ws://localhost:${backendPort}`,
				ws: true,
			},
		},
	},
	resolve: {
		alias: {
			'@': resolve(configDir, './src'),
		},
		dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
	},
	server: {
		port: frontendPort,
		proxy: {
			'/api': {
				changeOrigin: true,
				target: `http://localhost:${backendPort}`,
			},
			'/ws': {
				target: `ws://localhost:${backendPort}`,
				ws: true,
			},
		},
	},
});
