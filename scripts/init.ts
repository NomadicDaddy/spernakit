#!/usr/bin/env bun
/**
 * Spernakit application initializer (cross-platform).
 *
 * Generates a new derived application from the spernakit template: copy the template surface into a
 * target directory, brand it (bun run setup), initialize its database, refresh generated artifacts,
 * run the quality gate, and commit an initial git history. Optionally registers the app in the fleet
 * manifest (spernakit.psd1) with an allocated port pair.
 *
 * This is the sole generator. It is pure Bun/Node (no robocopy, no PowerShell) so it runs on any OS;
 * init.ps1 is a thin wrapper that resolves the sibling target and delegates here.
 *
 * Usage:
 *   bun scripts/init.ts --application myapp --target ../myapp --description "My app"
 *   bun scripts/init.ts --application myapp --target /abs/path/myapp \
 *     --name "My App" --description "…" --frontend-port 3340 --backend-port 3341
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import {
	manifestHasSlug,
	manifestUsedPorts,
	nextPortPair,
	registerApp,
	unregisterApp,
} from './lib/init/fleet.ts';
import {
	chmodHooks,
	copyTemplateTree,
	defaultAppName,
	log,
	prepareTarget,
	readTemplateVersion,
	run,
	seedTemplateOverrides,
} from './lib/init/scaffold.ts';

interface Args {
	application?: string;
	backendPort?: number;
	description?: string;
	force: boolean;
	frontendPort?: number;
	manifest?: string;
	name?: string;
	registerFleet: boolean;
	source?: string;
	target?: string;
	version?: string;
}

function fail(message: string): never {
	console.error(`init: ${message}`);
	process.exit(1);
}

function parseArgs(argv: string[]): Args {
	const args: Args = { force: false, registerFleet: true };
	for (let i = 0; i < argv.length; i++) {
		const value = (): string => {
			const next = argv[++i];
			if (next === undefined) fail(`Missing value for ${argv[i - 1]}`);
			return next;
		};
		switch (argv[i]) {
			case '--application':
				args.application = value();
				break;
			case '--backend-port':
				args.backendPort = Number(value());
				break;
			case '--description':
				args.description = value();
				break;
			case '--force':
				args.force = true;
				break;
			case '--frontend-port':
				args.frontendPort = Number(value());
				break;
			case '--manifest':
				args.manifest = value();
				break;
			case '--name':
				args.name = value();
				break;
			case '--no-register-fleet':
				args.registerFleet = false;
				break;
			case '--source':
				args.source = value();
				break;
			case '--target':
				args.target = value();
				break;
			case '--version':
				args.version = value();
				break;
			default:
				fail(`Unknown option: ${argv[i]}`);
		}
	}
	return args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const source = resolve(args.source ?? join(import.meta.dir, '..'));
	if (!args.application) fail('--application <slug> is required');
	if (!args.target) fail('--target <dir> is required');
	const slug = args.application;
	if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
		fail(`Invalid application slug "${slug}" (lowercase letters, digits, and dashes only)`);
	}
	const target = resolve(args.target);
	// Guard against a destructive --target: the target must not be, contain, or live inside the
	// template source. Without this, `--target . --force` from the template would wipe the template.
	const overlaps = (outer: string, inner: string): boolean =>
		inner === outer || inner.startsWith(outer + sep);
	if (overlaps(target, source) || overlaps(source, target)) {
		fail(
			`--target (${target}) overlaps the template source (${source}); choose a separate directory`
		);
	}
	const manifestPath = resolve(args.manifest ?? join(source, 'spernakit.psd1'));

	const name = args.name ?? defaultAppName(slug);
	// setup.ts prompts interactively when description is empty, which would hang a headless run;
	// fall back to the app name so a value is always supplied.
	const description = args.description && args.description.trim() ? args.description : name;
	const appVersion = args.version ?? '0.1.0';
	const templateVersion = readTemplateVersion(source);

	log(`\n=== Spernakit initializer: ${slug} ===`);
	log(`  source: ${source}`);
	log(`  target: ${target}`);

	// Seed the manifest from its example on a fresh clone (the real psd1 is gitignored).
	if (args.registerFleet && !existsSync(manifestPath) && existsSync(`${manifestPath}.example`)) {
		copyFileSync(`${manifestPath}.example`, manifestPath);
		log(`  seeded ${manifestPath} from example`);
	}
	const manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : '';

	// aidd allocates ports and passes them; the manifest scan is the standalone/human fallback.
	const pair =
		args.frontendPort && args.backendPort
			? { backendPort: args.backendPort, frontendPort: args.frontendPort }
			: nextPortPair(manifestUsedPorts(manifestText));
	const frontendPort = args.frontendPort ?? pair.frontendPort;
	const backendPort = args.backendPort ?? pair.backendPort;

	let registryAdded = false;
	if (args.registerFleet && existsSync(manifestPath) && !manifestHasSlug(manifestText, slug)) {
		registerApp(manifestPath, {
			backendPort,
			description,
			frontendPort,
			name,
			slug,
			templateVersion,
		});
		registryAdded = true;
		log(`  registered '${slug}' in ${manifestPath} (ports ${frontendPort}/${backendPort})`);
	}

	try {
		prepareTarget(target, args.force);
		log(`Copied ${copyTemplateTree(source, target)} template files.`);

		run(['bun', 'i', '--frozen-lockfile'], target);
		// setup may exit non-zero via check-application even when it succeeded (mirrors init.ps1).
		run(
			[
				'bun',
				'run',
				'setup',
				'--slug',
				slug,
				'--name',
				name,
				'--description',
				description,
				'--frontend-port',
				String(frontendPort),
				'--backend-port',
				String(backendPort),
				'--version',
				appVersion,
			],
			target,
			{ allowFailure: true }
		);
		run(['bun', 'run', 'db:migrate'], target);
		run(['bun', 'run', '--cwd', 'backend', 'db:seed'], target);
		run(['bun', 'run', 'licenses:generate'], target);
		seedTemplateOverrides(target);
		run(['bun', 'run', 'format'], target);
		// Branded drift is advisory at scaffold time: init's own transforms exceed the drift
		// checker's branding normalization. Pure/security/missing drift stays strict.
		run(['bun', 'run', 'smoke:qc'], target, { env: { DRIFT_BRANDED_ADVISORY: '1' } });

		run(['git', 'init'], target);
		run(['git', 'config', 'core.hooksPath', '.githooks'], target);
		run(['git', 'add', '-A'], target);
		chmodHooks(target);
		run(['git', 'commit', '-m', 'init'], target);
		run(['git', 'branch', '-M', 'main'], target);

		log(`\n✅ Application '${slug}' initialized at ${target}`);
		log(`   Frontend: http://localhost:${frontendPort}`);
		log(`   Backend:  http://localhost:${backendPort}`);
	} catch (err) {
		if (registryAdded && unregisterApp(manifestPath, slug)) {
			log(`Rolled back fleet registry entry for '${slug}'.`);
		}
		throw err;
	}
}

if (import.meta.main) {
	try {
		main();
	} catch (err) {
		console.error(`\n❌ init failed: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
}
