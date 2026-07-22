/**
 * Generates THIRD_PARTY_LICENSES.md from the locked dependency graph.
 *
 *   bun scripts/generate-third-party-licenses.ts           # write the file
 *   bun scripts/generate-third-party-licenses.ts --check   # fail if it drifted
 *
 * The output enumerates direct packages and reproduces their notices. --check runs
 * in smoke:qc and CI to enforce alignment with the lockfile.
 */

import { join } from 'node:path';
import { cwd, exit } from 'node:process';

import { collectRuntimeClosure, summarizeClosure } from './lib/third-party-licenses/closure.ts';
import { collectDirectDependencies, workspaceNames } from './lib/third-party-licenses/collect.ts';
import {
	GROUPS,
	intro,
	NOTICES_INTRO,
	scopeSections,
	type GeneratedDocuments,
} from './lib/third-party-licenses/documents.ts';
import { renderNotices } from './lib/third-party-licenses/notices-doc.ts';
import { FLAGGED_ANALYSIS } from './lib/third-party-licenses/notices.ts';
import { formatMarkdown, render, unreviewedLicenses } from './lib/third-party-licenses/render.ts';
import { assertRuntimeLicenseFiles } from './lib/third-party-licenses/runtime-materials.ts';

const WORKSPACES = ['backend', 'frontend', 'shared'];
const OUTPUT = 'THIRD_PARTY_LICENSES.md';
const NOTICES_OUTPUT = 'THIRD_PARTY_NOTICES.md';

function flaggedNoteFor(flagged: { license: string; name: string }[]): string {
	const unanalyzed = flagged.filter((entry) => !(entry.name in FLAGGED_ANALYSIS));
	if (unanalyzed.length > 0) {
		console.error('Copyleft/weak-copyleft package in the distributed set with no analysis:');
		for (const entry of unanalyzed) console.error(`  - ${entry.name} (${entry.license})`);
		console.error('Review its distribution and add an entry to FLAGGED_ANALYSIS.');
		exit(1);
	}
	return flagged.map((entry) => FLAGGED_ANALYSIS[entry.name]).join('\n\n');
}

/**
 * The Bun version the local verification image contains, read from the repo rather than hardcoded:
 * a stale runtime version in an LGPL notice is the same class of bug as the stale package
 * versions this generator exists to prevent.
 */
async function pinnedBunVersion(root: string): Promise<string> {
	const manifest = (await Bun.file(join(root, 'package.json')).json()) as {
		packageManager?: string;
	};
	const pinned = manifest.packageManager?.match(/^bun@(.+)$/)?.[1];
	if (!pinned) {
		console.error('Cannot determine the pinned Bun version from package.json packageManager.');
		exit(1);
	}
	return pinned;
}

export async function generate(root: string): Promise<GeneratedDocuments> {
	await assertRuntimeLicenseFiles(root);
	const { dependencies, unresolved } = await collectDirectDependencies(root, WORKSPACES);

	if (unresolved.length > 0) {
		console.error('Cannot resolve installed package(s); run `bun install` first:');
		for (const entry of unresolved) console.error(`  - ${entry}`);
		exit(1);
	}

	const { closure, unresolved: unresolvedClosure } = await collectRuntimeClosure(
		root,
		WORKSPACES,
		await workspaceNames(root, WORKSPACES)
	);

	// A package we ship but cannot locate is a package whose license we never read. That is a
	// hole in the attribution, so it fails the generator rather than shrinking the appendix.
	if (unresolvedClosure.length > 0) {
		console.error('Cannot resolve packages in the runtime closure (run `bun install` first):');
		for (const entry of unresolvedClosure) console.error(`  - ${entry}`);
		exit(1);
	}

	const attributed = [...dependencies, ...closure];
	const unreviewed = unreviewedLicenses(attributed);
	if (unreviewed.length > 0) {
		console.error('Distributed package uses a license with no reviewed notice text:');
		for (const license of unreviewed) {
			const users = attributed
				.filter((entry) => entry.license === license)
				.map((entry) => entry.name);
			console.error(`  - ${license} (${[...new Set(users)].join(', ')})`);
		}
		console.error(
			'Add it to scripts/lib/third-party-licenses/notices.ts after reviewing its terms.'
		);
		exit(1);
	}

	// Identity comes from the project, not from a hardcoded "Spernakit"/"MIT": a derived app
	// regenerating these documents must describe itself, not the template it was scaffolded from.
	const identity = (await Bun.file(join(root, 'package.json')).json()) as {
		license?: string;
		name?: string;
	};
	// package.json carries a slug ("spernakit"); the prose wants a name ("Spernakit").
	const slug = identity.name ?? 'this project';
	const appName = slug.charAt(0).toUpperCase() + slug.slice(1);
	const appLicense = identity.license ?? 'UNKNOWN';

	const graph = summarizeClosure(closure);
	const summary = render({
		dependencies,
		flaggedNote: flaggedNoteFor(graph.flagged),
		graph,
		groups: GROUPS,
		intro: intro(appName, appLicense),
		scopeSections: scopeSections(await pinnedBunVersion(root), appName, appLicense),
		title: 'Third-Party Licenses',
	});

	const notices = renderNotices({
		closure,
		intro: NOTICES_INTRO,
		title: 'Third-Party Notices',
	});

	return {
		notices: await formatMarkdown(notices, root),
		summary: await formatMarkdown(summary, root),
	};
}

/**
 * The notices only satisfy anything if they reach whoever receives the image. The Bun base
 * image statically links LGPL libraries and includes GPL/LGPL Alpine packages, so the Dockerfile
 * has to copy the license files and downstream guidance into the production stage. A refactor that
 * quietly drops that COPY would put us back where we started, silently.
 */
async function assertImageCarriesNotices(root: string): Promise<void> {
	const dockerfile = await Bun.file(join(root, 'Dockerfile'))
		.text()
		.catch(() => '');

	const required = ['LICENSE', 'THIRD_PARTY_LICENSES.md', 'THIRD_PARTY_NOTICES.md', 'licenses/'];
	const missing = required.filter(
		(asset) => !new RegExp(`^COPY .*${asset}`, 'm').test(dockerfile)
	);

	if (missing.length > 0) {
		console.error('Dockerfile does not copy the license notices into the production image:');
		for (const asset of missing) console.error(`  - ${asset}`);
		console.error('The image contains Bun and GPL/LGPL Alpine components; their notices and');
		console.error('distribution guidance must remain available. Restore the production COPY.');
		exit(1);
	}
}

async function main(): Promise<void> {
	const root = cwd();
	const check = Bun.argv.includes('--check');
	const generated = await generate(root);
	const documents = [
		{ content: generated.summary, name: OUTPUT },
		{ content: generated.notices, name: NOTICES_OUTPUT },
	];

	if (!check) {
		for (const document of documents) {
			await Bun.write(join(root, document.name), document.content);
			console.log(`Wrote ${document.name}`);
		}
		return;
	}

	await assertImageCarriesNotices(root);

	for (const document of documents) {
		const committed = await Bun.file(join(root, document.name))
			.text()
			.catch(() => '');

		if (committed !== document.content) {
			console.error(`${document.name} is out of date with the locked dependency graph.`);
			console.error('Run `bun run licenses:generate` and commit the result.');
			exit(1);
		}
	}

	console.log(`${OUTPUT} and ${NOTICES_OUTPUT} match the locked dependency graph.`);
}

if (import.meta.main) {
	await main();
}
