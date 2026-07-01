import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type PluginOption } from 'vite';
import { compression } from 'vite-plugin-compression2';

import { lucideDirectImportsPlugin } from './vite-plugins/lucideDirectImports.ts';
import { removeModulePreloadPlugin } from './vite-plugins/removeModulePreload.ts';
import { stripCssFallbacksPlugin } from './vite-plugins/stripCssFallbacks.ts';

const analyze = process.env.ANALYZE === 'true';
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
		sourcemap: 'hidden',
		rollupOptions: {
			output: {
				manualChunks(id) {
					// Core React runtime + zustand + radix (co-located to avoid circular chunks)
					// Note: /react/ check excludes scoped packages (e.g. @xyflow/react)
					// to prevent accidentally pulling large libraries into react-vendor
					if (
						(id.includes('/react/') && !id.includes('/@')) ||
						id.includes('/react-dom/') ||
						id.includes('/scheduler/') ||
						id.includes('/use-sync-external-store/') ||
						id.includes('/zustand/') ||
						id.includes('/@radix-ui/') ||
						id.includes('/radix-ui/')
					) {
						return 'react-core';
					}
					// React Router - split from core to allow parallel loading
					if (id.includes('/react-router-dom/') || id.includes('/react-router/')) {
						return 'react-routing';
					}
					// TanStack libraries - split to reduce initial critical path
					if (id.includes('/@tanstack/')) {
						return 'react-tanstack';
					}
					// UI utilities - small but commonly used (pure utilities only,
					// no React-dependent libs like sonner/cmdk which belong in react-core)
					if (
						id.includes('/class-variance-authority/') ||
						id.includes('/clsx/') ||
						id.includes('/tailwind-merge/')
					) {
						return 'ui-utils';
					}
					// React-dependent UI libs (sonner, cmdk) must stay with React.
					// Also includes transitive CJS dependencies from react-grid-layout
					// that would otherwise pull shared runtime code into the grid-layout chunk.
					if (
						id.includes('/sonner/') ||
						id.includes('/cmdk/') ||
						id.includes('/prop-types/') ||
						id.includes('/fast-equals/')
					) {
						return 'react-core';
					}
					// Charting data layer - d3 math/scale/shape libs (recharts dependency)
					if (
						id.includes('/d3-') ||
						id.includes('/decimal.js-light/') ||
						id.includes('/internmap/') ||
						id.includes('/victory-vendor/')
					) {
						return 'recharts-d3';
					}
					// Charting UI - recharts components and helpers (lazy-loaded on chart pages)
					if (
						id.includes('/recharts/') ||
						id.includes('/es-toolkit/') ||
						id.includes('/eventemitter3/')
					) {
						return 'recharts';
					}
					// Grid layout - only loaded on CustomDashboardPage.
					// Dependencies shared with the entry chunk (fast-equals, prop-types)
					// are routed to react-core above to avoid co-location.
					if (
						id.includes('/react-grid-layout/') ||
						id.includes('/react-draggable/') ||
						id.includes('/react-resizable/')
					) {
						return 'grid-layout';
					}
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
		removeModulePreloadPlugin({ chunks: ['grid-layout'] }),
		react({
			babel: {
				plugins: [
					'babel-plugin-react-compiler',
					['babel-plugin-transform-react-remove-prop-types', { removeImport: true }],
				],
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
