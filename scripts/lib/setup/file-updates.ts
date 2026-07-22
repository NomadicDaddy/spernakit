/**
 * Branding/customization passes applied by setup to package.json files,
 * Docker files, frontend index.html, and README.md.
 *
 * Extracted from scripts/setup.ts.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

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

		// A derived project MAY publish its image - that is its owner's call, and removing the
		// capability would just push them into hand-rolling a push. What the template removes is
		// its OWN publish path (it distributes nothing, so it triggers no GPL/LGPL obligation).
		// The derived app gets a publish path that names no registry by default, plus the
		// compliance materials it must complete first: check:image-publication enforces that a
		// project which CAN publish has a finished source offer. Publishing stays possible;
		// publishing blind does not.
		const scripts = pkg['scripts'] as Record<string, string> | undefined;
		if (scripts) {
			delete scripts['check:fresh-release'];
			delete scripts['test:fresh-release'];
			scripts['docker:image:push'] = 'bun scripts/docker-image.ts push';
			scripts['release:publish'] = 'bun run docker:image:push';
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

/**
 * License materials a derived project needs before it can publish an image.
 *
 * The template ships guidance and no offer, because it distributes nothing. A derived project
 * that publishes DOES distribute, so it needs its own offer — and shipping the template's
 * guidance verbatim would be worse than shipping nothing: it names Spernakit and NomadicDaddy,
 * and an owner could reasonably read it as covering them. So setup rewrites the guidance for
 * this project and drops in the offer template, with placeholders that the publication guard and
 * `docker:image:push` both refuse to ship.
 */
export function updateLicenseFiles(s: SetupSettings): void {
	updateFile('licenses/CONTAINER-DISTRIBUTION.md', {
		"Derived-project owners should obtain legal advice for their own distribution model. Spernakit's\nlocal build and image checks prove buildability and inventory coverage; they do not grant a\nderived project permission to publish an image or fulfill that project's source obligations.": `If you publish an image, complete \`licenses/SOURCE-OFFER.md\` first: \`check:image-publication\`\nand \`docker:image:push\` both refuse to ship an image while it is missing or still contains\nplaceholders. If you never publish, delete that file and the publication scripts instead —\nnothing obliges you to make an offer for software you do not distribute. Obtain legal advice for\nyour own distribution model; the build and image checks prove buildability and inventory\ncoverage, not compliance.`,
		'Spernakit builds container images only as local verification artifacts. The template project\ndoes not publish, supply, or offer those images to downstream users. This document is guidance,\nnot a corresponding-source offer by NomadicDaddy.': `${s.appName} builds container images with \`bun run docker:image:build\`. Whether it publishes\nthem is this project's decision. This document is guidance, not a corresponding-source offer by\nthe Spernakit template or its author.`,
	});

	// The offer arrives unfilled on purpose: it only binds a project that actually distributes,
	// and the remaining placeholders (<LEGAL ENTITY>, <CONTACT ADDRESS>) are decisions its owner
	// has to make. Both gates refuse to ship an image while any of them survive.
	const template = readFileSync('licenses/SOURCE-OFFER.template.md', 'utf8');
	const offer = template
		.replace(/<!--[\s\S]*?-->\n\n/, '') // the template-only preamble
		.replaceAll('<PROJECT NAME>', s.appName);
	writeFileSync('licenses/SOURCE-OFFER.md', offer);
	rmSync('licenses/SOURCE-OFFER.template.md', { force: true });
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

	// start.sh reads the slug from defaults.json.

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
	// Backend identity and cookie names come from runtime config; no substitutions are needed.
}

export function updateFrontendFiles(s: SetupSettings): void {
	// storageKeys, correlationId, Sidebar, and MobileNav use Vite define
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

	// smoke.ts replaces {{FRONTEND_PORT}}/{{BACKEND_PORT}} from app config at runtime.
}
