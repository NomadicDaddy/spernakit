/**
 * Branding/customization passes applied by setup to package.json files,
 * Docker files, frontend index.html, and README.md.
 *
 * Extracted from scripts/setup.ts.
 */
import type { SetupSettings } from './config-writer.ts';

import { updateFile, updateJsonFile } from './json-files.ts';

/**
 * Shared helper for package.json spernakit_version ordering logic.
 * Re-orders keys so spernakit_version appears immediately after version.
 */
function applySpernakitVersionOrdering(
	pkg: Record<string, unknown>,
	appSlug: string,
	spernakitVersion: string
): void {
	const shouldWrite = appSlug !== 'spernakit';
	if (shouldWrite) {
		pkg['spernakit_version'] = spernakitVersion;
	} else {
		delete pkg['spernakit_version'];
	}

	const ordered: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(pkg)) {
		if (key === 'spernakit_version') continue;
		ordered[key] = value;
		if (key === 'version' && shouldWrite) {
			ordered['spernakit_version'] = spernakitVersion;
		}
	}
	if (shouldWrite && !('spernakit_version' in ordered)) {
		ordered['spernakit_version'] = spernakitVersion;
	}
	for (const key of Object.keys(pkg)) delete pkg[key];
	Object.assign(pkg, ordered);
}

export function updatePackageJsonFiles(s: SetupSettings): void {
	const githubBase = `https://github.com/NomadicDaddy/${s.appSlug}`;
	const githubMeta = {
		bugs: { url: `${githubBase}/issues` },
		homepage: `${githubBase}#readme`,
		repository: { type: 'git', url: `${githubBase}.git` },
	};

	updateJsonFile('package.json', (pkg) => {
		const spernakitVersion =
			(pkg['spernakit_version'] as string | undefined) ??
			(pkg['version'] as string | undefined) ??
			'1.0.0';
		pkg['name'] = s.appSlug;
		if (s.appVersion) pkg['version'] = s.appVersion;
		pkg['description'] = s.appDescription;
		applySpernakitVersionOrdering(pkg, s.appSlug, spernakitVersion);
		Object.assign(pkg, githubMeta);

		const scripts = pkg['scripts'] as Record<string, string> | undefined;
		if (scripts) {
			if (scripts['docker:image:build']) {
				scripts['docker:image:build'] =
					`docker build -t ghcr.io/nomadicdaddy/${s.appSlug}:latest .`;
			}
			if (scripts['docker:image:push']) {
				scripts['docker:image:push'] =
					`docker push ghcr.io/nomadicdaddy/${s.appSlug}:latest`;
			}
		}
	});

	updateJsonFile('backend/package.json', (pkg) => {
		pkg['name'] = `${s.appSlug}-backend`;
		pkg['description'] = `Backend API for ${s.appName}`;
		delete pkg['version'];
		delete pkg['spernakit_version'];
	});

	updateJsonFile('frontend/package.json', (pkg) => {
		pkg['name'] = `${s.appSlug}-frontend`;
		pkg['description'] = `Frontend application for ${s.appName}`;
		delete pkg['version'];
		delete pkg['spernakit_version'];
	});
}

export function updateDockerFiles(s: SetupSettings): void {
	updateFile('Dockerfile', {
		'# Spernakit v3 - Multi-stage Docker Build': `# ${s.appName} - Multi-stage Docker Build`,
		'EXPOSE 3330': `EXPOSE ${s.frontendPort}`,
		'http://127\\.0\\.0\\.1:3330/api/v1/health': `http://127.0.0.1:${s.frontendPort}/api/v1/health`,
	});

	updateFile('docker-compose.yml', {
		"- '3330:3330'": `- '${s.frontendPort}:${s.frontendPort}'`,
		'- BACKEND_PORT=3331': `- BACKEND_PORT=${s.backendPort}`,
		'- FRONTEND_PORT=3330': `- FRONTEND_PORT=${s.frontendPort}`,
		'container_name: spernakit-dev': `container_name: ${s.appSlug}-dev`,
		'http://127\\.0\\.0\\.1:3330/api/v1/health': `http://127.0.0.1:${s.frontendPort}/api/v1/health`,
		'services:\\r?\\n    spernakit:': `services:\n    ${s.appSlug}:`,
	});

	// start.sh now discovers the slug from defaults.json dynamically

	updateFile('docker-compose.production.yml', {
		'- BACKEND_PORT=3331': `- BACKEND_PORT=${s.backendPort}`,
		'- FRONTEND_PORT=3330': `- FRONTEND_PORT=${s.frontendPort}`,
		'APP_SLUG:-spernakit': `APP_SLUG:-${s.appSlug}`,
		'FRONTEND_PORT:-3330': `FRONTEND_PORT:-${s.frontendPort}`,
		'http://127\\.0\\.0\\.1:3330/api/v1/health': `http://127.0.0.1:${s.frontendPort}/api/v1/health`,
		'services:\\r?\\n    spernakit:': `services:\n    ${s.appSlug}:`,
	});
}

export function updateBackendFiles(_s: SetupSettings): void {
	// Cookie names (test-helpers, auth tests) are now config-driven via getConfig().security
	// settings-smtp.ts was consolidated into settings routes in v3 — no branding needed
}

export function updateFrontendFiles(s: SetupSettings): void {
	// storageKeys, correlationId, Sidebar, MobileNav now use Vite define
	// (__APP_SLUG__, __APP_NAME__) injected from defaults.json at build time.

	// Note: Patterns must handle multi-line formatting in the template
	// Note: Object keys must be sorted alphabetically for linting
	updateFile('frontend/index.html', {
		// JSON-LD structured data
		'"name": "Spernakit v3"': `"name": "${s.appName}"`,

		// Meta tags with author/app name
		'"Spernakit v3" name="apple-mobile-web-app-title"': `"${s.appName}" name="apple-mobile-web-app-title"`,
		'"Spernakit v3" name="application-name"': `"${s.appName}" name="application-name"`,
		'"Spernakit v3" name="author"': `"${s.appName}" name="author"`,
		'"Spernakit v3" name="twitter:title"': `"${s.appName}" name="twitter:title"`,
		'"Spernakit v3" property="og:site_name"': `"${s.appName}" property="og:site_name"`,
		'"Spernakit v3" property="og:title"': `"${s.appName}" property="og:title"`,

		// Page title
		'>Spernakit v3</title>': `>${s.appName}</title>`,

		// og:description and twitter:description
		'Self-Hosted Multi-User Application Template': `${s.appDescription}`,

		// SEO meta description (with prefix)
		'Spernakit v3 - Self-Hosted Multi-User Application Template': `${s.appName} - ${s.appDescription}`,
	});
}

export function updateMiscFiles(s: SetupSettings): void {
	updateFile('README.md', {
		'# Spernakit v3': `# ${s.appName}`,
		'config/spernakit\\.json': `config/${s.appSlug}.json`,
		'spernakit/': `${s.appSlug}/`,
		'Spernakit v3 is a': `${s.appName} is a`,
	});

	// smoke.json now uses {{FRONTEND_PORT}}/{{BACKEND_PORT}} tokens
	// substituted at runtime by smoke.ts from app config.
}
