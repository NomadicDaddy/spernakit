/**
 * Branding/customization passes applied by setup to package.json files,
 * Docker files, frontend index.html, and README.md.
 *
 * Extracted from scripts/setup.ts.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

import type { SetupSettings } from './config-writer.ts';

import { commandFileReferences } from '../../check-script-targets.ts';
import { updateFile, updateJsonFile } from './json-files.ts';

/**
 * Shared helper for package.json spernakit_version ordering logic.
 * Re-orders keys so spernakit_version appears immediately after version.
 */
function applySpernakitVersionOrdering(
	pkg: Record<string, unknown>,
	appSlug: string,
	spernakitVersion: string,
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
			// A task pointing at a file the app never received cannot run, and check:script-targets
			// fails on it in every new app. Naming those tasks here was the fragile half: the
			// fresh-release pair was removed by name, and when the shared-core group was withheld
			// from init later, its three tasks kept shipping and no longer resolved.
			//
			// Setup runs after the copy, so the tree itself answers which files arrived. That is
			// also the only question worth asking: re-deriving it from the copy predicate gets
			// `prepare` deleted, because .githooks/ reaches an app through scaffolding/ and its
			// own template path is init-excluded.
			for (const [task, command] of Object.entries(scripts)) {
				const missing = commandFileReferences(command).filter(
					(file) => !existsSync(file.replace(/^\.\//, '')),
				);
				if (missing.length > 0) {
					delete scripts[task];
				}
			}
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

	// Consuming the template is a one-way step, so this pass has to survive being re-run. `reset`
	// re-invokes setup on an already-initialized project, where the template is long gone and the
	// offer may carry the owner's real legal entity and contact address. Regenerating from a
	// missing template would throw; regenerating from a present one would silently discard those
	// answers. Once the offer exists, it is the owner's file and setup leaves it alone.
	if (!existsSync('licenses/SOURCE-OFFER.template.md')) {
		if (existsSync('licenses/SOURCE-OFFER.md')) return;
		throw new Error(
			'licenses/SOURCE-OFFER.md and licenses/SOURCE-OFFER.template.md are both missing; ' +
				'restore one from the template before running setup.',
		);
	}

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

	// The test overlay is applied as `-f docker-compose.yml -f docker-compose.test.yml`, so its
	// service key must name the same service the base file declares. A key still reading
	// `spernakit` in a derived app declares a SECOND service instead of overlaying the app's
	// volumes, and smoke:docker-local then runs against DEV's data/ — silently losing the
	// isolation the overlay exists to provide.
	updateFile('docker-compose.test.yml', {
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

export function updateBackendFiles(s: SetupSettings): void {
	// Backend identity and cookie names come from runtime config; no substitutions are needed.

	// The workspace README is the one backend file that states a name in prose. Both mentions are
	// the same literal, so one key rebrands the file whatever order the replacements run in.
	updateFile('backend/README.md', { 'Spernakit v3': s.appName });
}

export function updateFrontendFiles(s: SetupSettings): void {
	// storageKeys, correlationId, Sidebar, and MobileNav use Vite define
	// (__APP_SLUG__, __APP_NAME__) injected from defaults.json at build time.

	// The workspace README is the one frontend file that states a name in prose. Both mentions are
	// the same literal, so one key rebrands the file whatever order the replacements run in.
	updateFile('frontend/README.md', { 'Spernakit v3': s.appName });

	// Note: Patterns must handle multi-line formatting in the template
	// Note: Object keys must be sorted alphabetically for linting
	//
	// Every description pattern below is anchored to the attribute or JSON key it belongs to.
	// Anchoring is what makes them order-independent: the bare description string is a prefix-free
	// substring of the SEO description, so whichever ran first would consume the other's match.
	// Lint sorts these keys, so relying on declaration order is not an option.
	updateFile('frontend/index.html', {
		// JSON-LD structured data
		'"description": "Self-Hosted Multi-User Application Template"': `"description": "${s.appDescription}"`,
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
		'content="Self-Hosted Multi-User Application Template"': `content="${s.appDescription}"`,

		// SEO meta description (with prefix)
		'content="Spernakit v3 - Self-Hosted Multi-User Application Template"': `content="${s.appName} - ${s.appDescription}"`,
	});
}

export function updateMiscFiles(s: SetupSettings): void {
	// These three sites carry the stamped template version, not a bare `v3`: check-version-refs.ts
	// requires the README title, the baseline sentence, and the overview sentence to name the
	// current release, and rewrites them on every bump. Matching a literal `Spernakit v3` therefore
	// caught only the version prefix and left the digits behind — a new app's README opened with
	// `# myapp.43.0` and went on calling itself the template baseline. The patterns match the
	// stamped version so they keep working across bumps.
	updateFile('README.md', {
		'# Spernakit v\\d+\\.\\d+\\.\\d+': `# ${s.appName}`,
		'config/spernakit\\.json': `config/${s.appSlug}.json`,
		'spernakit/': `${s.appSlug}/`,
		'Spernakit v\\d+\\.\\d+\\.\\d+ is a full-stack': `${s.appName} is a full-stack`,
		'Spernakit v\\d+\\.\\d+\\.\\d+ is the current template baseline\\.': `${s.appName} is built on the Spernakit template.`,
	});

	// The bundle budget records the slug its numbers were measured for. The gate compares that
	// provenance against the app's own slug and refuses to enforce a budget belonging to another
	// app, so a copy still stamped `spernakit` leaves a derived app's bundle unmeasured until
	// someone regenerates it. The critical-path budget beside it carries no slug by design and is
	// enforced everywhere, so it is deliberately not rebranded here.
	updateJsonFile('scripts/bundle-budget.json', (budget) => {
		budget['appSlug'] = s.appSlug;
	});

	// The tracked secrets example ships under the template's own slug, but every consumer resolves
	// it by the app's: configSecretsFile.ts, check:secrets-shape, and test:secrets-file all look for
	// `config/{slug}.secrets.json.example`. Left as-is, a derived app carries a file no gate reads
	// beside a name every gate looks for and does not find — check:secrets-shape reports the
	// repository-wide no-files skip instead of grading the pair, and test:secrets-file exits 1.
	// Renaming is also what makes the DELETED entry the override seed writes for the template path
	// a true statement about the tree.
	if (s.appSlug !== 'spernakit') {
		const templateExample = 'config/spernakit.secrets.json.example';
		const appExample = `config/${s.appSlug}.secrets.json.example`;
		// `reset` re-invokes setup on an initialized project, where the rename already happened.
		if (existsSync(templateExample) && !existsSync(appExample)) {
			renameSync(templateExample, appExample);
			console.log(`✅ Renamed: ${templateExample} → ${appExample}`);
		} else if (existsSync(templateExample)) {
			rmSync(templateExample, { force: true });
			console.log(`✅ Removed template-named duplicate: ${templateExample}`);
		}
	}

	// smoke.ts replaces {{FRONTEND_PORT}}/{{BACKEND_PORT}} from app config at runtime.
}
