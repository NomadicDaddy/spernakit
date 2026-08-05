/**
 * Verifies license inventory coverage against the BUILT Docker image, not the development tree.
 *
 *   bun scripts/check-image-licenses.ts --image <tag>            # verify
 *   bun scripts/check-image-licenses.ts --image <tag> --update   # refresh the base inventory
 *
 * Two things the npm-only checks cannot know:
 *
 * 1. Whether the notices actually reached the artifact. They did not, twice: the image carried
 *    no license file at all, and later `.dockerignore` silently excluded the notice markdown
 *    from the build context so the COPY could not have worked. Both were invisible until an
 *    image was built and opened.
 * 2. What the base image contributes. Alpine ships GPL-2.0 and GPL-3.0 programs (busybox and
 *    friends). They are unmodified OS components alongside the application rather than linked
 *    into it, but a derived project needs an exact inventory before choosing to distribute.
 *
 * Needs a built image and a working docker daemon, so it runs in the docker smoke modes rather
 * than in `smoke:qc`, which must stay static.
 */

import { join } from 'node:path';
import { cwd, exit } from 'node:process';

import { collectRuntimeClosure } from './lib/third-party-licenses/closure.ts';
import { workspaceNames } from './lib/third-party-licenses/collect.ts';
import {
	collectBasePackages,
	collectImagePackages,
	renderInventory,
	runInImage,
	storeDirName,
} from './lib/third-party-licenses/image-inventory.ts';
import { formatMarkdown } from './lib/third-party-licenses/render.ts';

const INVENTORY = join('licenses', 'base-image-packages.md');
const WORKSPACES = ['backend', 'frontend', 'shared'];

const REQUIRED_IN_IMAGE = [
	'/app/LICENSE',
	'/app/THIRD_PARTY_LICENSES.md',
	'/app/THIRD_PARTY_NOTICES.md',
	'/app/licenses/GPL-2.0.txt',
	'/app/licenses/GPL-3.0.txt',
	'/app/licenses/LGPL-2.0.txt',
	'/app/licenses/LGPL-2.1.txt',
	'/app/licenses/LGPL-3.0.txt',
	'/app/licenses/BUN-LICENSE.md',
	'/app/licenses/CONTAINER-DISTRIBUTION.md',
	'/app/licenses/base-image-packages.md',
];

interface Args {
	image: string;
	update: boolean;
}

/**
 * The local verification tag this project builds, derived the same way docker-image.ts derives
 * it: `<package name>-test`. A hardcoded tag would be wrong in every derived app, which builds
 * `<its-slug>-test` and would otherwise check a spernakit image that is stale or absent.
 */
async function defaultImageTag(root: string): Promise<string> {
	const manifest = (await Bun.file(join(root, 'package.json')).json()) as { name?: string };
	if (!manifest.name) {
		console.error('Cannot derive the image tag: package.json has no name.');
		exit(1);
	}
	return `${manifest.name}-test:latest`;
}

async function parseArgs(argv: string[], root: string): Promise<Args> {
	const index = argv.indexOf('--image');
	const image = index >= 0 ? argv[index + 1] : await defaultImageTag(root);
	if (!image) {
		console.error('Usage: bun scripts/check-image-licenses.ts [--image <tag>] [--update]');
		exit(1);
	}
	return { image, update: argv.includes('--update') };
}

async function assertNoticesPresent(image: string): Promise<void> {
	const output = await runInImage(
		image,
		REQUIRED_IN_IMAGE.map((path) => `[ -e ${path} ] || echo MISSING ${path}`).join('; '),
	);
	const missing = output
		.split('\n')
		.filter((line) => line.startsWith('MISSING'))
		.map((line) => line.replace('MISSING ', '').trim());

	if (missing.length > 0) {
		console.error(`${image} is missing license notices:`);
		for (const path of missing) console.error(`  - ${path}`);
		console.error('');
		console.error('The image ships Bun and GPL/LGPL Alpine components. Check the Dockerfile');
		console.error('COPY lines and ensure .dockerignore preserves the notices and guidance.');
		exit(1);
	}
	console.log(`${image}: notices present (${REQUIRED_IN_IMAGE.length} files).`);
}

/** The name half of the `<name>@<version>` identity the attribution uses throughout. */
function packageNameOf(entry: string): string {
	return entry.slice(0, entry.lastIndexOf('@'));
}

/**
 * The file under `/app/licenses` that carries this SPDX identifier's text. `-only` and `-or-later`
 * choose which versions of the licence may be applied; both point at the same document.
 */
function licenseTextPath(spdx: string): string {
	return `/app/licenses/${spdx.replace(/-(?:only|or-later)$/, '')}.txt`;
}

/**
 * Reads the `license` field each package declares in the image. Deliberately takes the whole
 * remainder of the line rather than the first word, so a compound SPDX expression stays intact and
 * fails the coverage test below instead of silently matching on one of its halves.
 */
async function readDeclaredLicenses(
	image: string,
	entries: string[],
): Promise<Map<string, string>> {
	const script = entries
		.map((entry) => {
			const dir = `/app/node_modules/.bun/${storeDirName(entry)}/node_modules`;
			const manifest = `${dir}/${packageNameOf(entry)}/package.json`;
			const read = `sed -n 's/.*"license": *"\\([^"]*\\)".*/\\1/p' ${manifest} 2>/dev/null | head -1`;
			return `echo "DECLARED ${entry} $(${read})"`;
		})
		.join('; ');

	const declared = new Map<string, string>();
	for (const line of (await runInImage(image, script)).split('\n')) {
		if (!line.startsWith('DECLARED ')) continue;
		const rest = line.slice('DECLARED '.length).trim();
		const separator = rest.indexOf(' ');
		if (separator > 0) declared.set(rest.slice(0, separator), rest.slice(separator + 1).trim());
	}
	return declared;
}

/**
 * For a package the generating machine cannot install, the attribution has to be verified where it
 * actually ships. Bun lays each package out at `.bun/<name>@<version>/node_modules/<name>/`, so the
 * package's own LICENSE travels with the binary; this confirms it arrived.
 *
 * Shipping no license file is not by itself a gap. sharp's prebuilt libvips binaries publish `lib`,
 * `versions.json` and a README carrying the third-party table, and name their terms only in the
 * `license` field of package.json. The image already carries the full text of every GPL and LGPL
 * variant, so that pairing is complete: the manifest names the terms and the artifact supplies
 * them. Accept it rather than demanding a file the publisher does not produce, and fail when the
 * terms reach the image nowhere at all. Membership in `REQUIRED_IN_IMAGE` is proof the text is
 * present because `assertNoticesPresent` has already checked every one of those paths on disk.
 */
async function assertImageCarriesLicenses(image: string, entries: string[]): Promise<void> {
	const script = entries
		.map((entry) => {
			const dir = `/app/node_modules/.bun/${storeDirName(entry)}/node_modules`;
			const find = `find ${dir} -maxdepth 3 -iname 'licen[cs]e*' -print -quit 2>/dev/null`;
			return `[ -n "$(${find})" ] || echo "MISSING ${entry}"`;
		})
		.join('; ');

	const missing = (await runInImage(image, script))
		.split('\n')
		.filter((line) => line.startsWith('MISSING'))
		.map((line) => line.replace('MISSING ', '').trim());

	if (missing.length === 0) return;

	const declared = await readDeclaredLicenses(image, missing);
	const uncovered = missing.filter((entry) => {
		const spdx = declared.get(entry);
		return spdx === undefined || !REQUIRED_IN_IMAGE.includes(licenseTextPath(spdx));
	});

	if (uncovered.length > 0) {
		console.error(
			`${image} ships ${uncovered.length} package(s) with no license terms at all:`,
		);
		for (const entry of uncovered) {
			console.error(`  - ${entry} (declares ${declared.get(entry) ?? 'nothing'})`);
		}
		console.error('');
		console.error('These are built for a platform this machine does not install, so the');
		console.error(
			'notices name them rather than reproducing their terms. The image is then the',
		);
		console.error('only place their license text can travel, and it did not arrive. Either');
		console.error('the package must carry its own license file or the image must ship the');
		console.error('text of the licence it declares under /app/licenses.');
		exit(1);
	}

	console.log(
		`${image}: ${missing.length} package(s) ship no license file; /app/licenses carries their terms:`,
	);
	for (const entry of missing) console.log(`  - ${entry} (${declared.get(entry)})`);
}

/**
 * The notices must cover what the image ships. This comparison fails on any package in the image
 * that the attribution appendix does not include.
 */
async function assertNoticesCoverImage(root: string, image: string): Promise<void> {
	const inImage = await collectImagePackages(image);
	if (inImage.length === 0) {
		console.log('No bun store found in the image; skipping closure comparison.');
		return;
	}

	const { closure, elsewhere } = await collectRuntimeClosure(
		root,
		WORKSPACES,
		await workspaceNames(root, WORKSPACES),
	);
	const attributed = new Set(closure.map((pkg) => `${pkg.name}@${pkg.version}`));
	const platformGated = new Set(elsewhere);

	// Version is part of the attribution identity. A name-only fallback could accept a notice for
	// a different release whose copyright, NOTICE, or license terms changed.
	const unattributed = inImage.filter((entry) => !attributed.has(entry));

	// The image is built for Linux and this check usually runs somewhere else, so a native
	// dependency reaches the image in a variant the local install skipped. The notices cannot
	// reproduce terms that were never on this disk, and demanding it would only mean generating
	// the attribution from nothing. Those packages are verified against the image instead.
	const fromOtherPlatform = unattributed.filter((entry) => platformGated.has(entry));
	const missing = unattributed.filter((entry) => !platformGated.has(entry));

	if (missing.length > 0) {
		console.error(`${image} ships ${missing.length} package(s) the notices do not attribute:`);
		for (const entry of missing.slice(0, 25)) console.error(`  - ${entry}`);
		if (missing.length > 25) console.error(`  ... and ${missing.length - 25} more`);
		console.error('');
		console.error('Either the image is installing more than the production dependencies, or');
		console.error('THIRD_PARTY_NOTICES.md is stale. The notices must cover what ships.');
		exit(1);
	}

	if (fromOtherPlatform.length > 0) {
		await assertImageCarriesLicenses(image, fromOtherPlatform);
		console.log(
			`${image}: ${fromOtherPlatform.length} platform-gated package(s) verified against the image:`,
		);
		for (const entry of fromOtherPlatform) console.log(`  - ${entry}`);
	}

	const matched = inImage.length - fromOtherPlatform.length;
	console.log(`${image}: all ${matched} npm packages have exact notice matches.`);
}

async function main(): Promise<void> {
	const root = cwd();
	const args = await parseArgs(Bun.argv.slice(2), root);

	await assertNoticesPresent(args.image);

	const packages = await collectBasePackages(args.image);
	if (packages.length === 0) {
		console.error(`Read no apk packages from ${args.image}; is it the production image?`);
		exit(1);
	}

	// Formatted with the repo's prettier config for the same reason the other generated docs
	// are: `format:check` reflows markdown tables, and an unformatted generator output would
	// report drift against its own file forever.
	const generated = await formatMarkdown(renderInventory(packages), root);
	const target = join(root, INVENTORY);

	// The inventory is written before the npm coverage assert, not after. The two answer different
	// questions — apk packages in the base image, npm packages in the closure — and running the
	// assert first made `licenses:image` unable to refresh the inventory while any coverage gap was
	// open, including gaps whose repair is regenerating this very file. The assert still runs on
	// the way out, so `--update` cannot pass a check it should fail.
	if (args.update) {
		await Bun.write(target, generated);
		console.log(`Wrote ${INVENTORY} (${packages.length} packages).`);
		await assertNoticesCoverImage(root, args.image);
		return;
	}

	const committed = await Bun.file(target)
		.text()
		.catch(() => '');

	if (committed !== generated) {
		console.error(`${INVENTORY} is out of date with the built image.`);
		console.error('Run `bun run licenses:image` and commit the result.');
		exit(1);
	}

	console.log(`${INVENTORY} matches the built image (${packages.length} packages).`);
	await assertNoticesCoverImage(root, args.image);
}

if (import.meta.main) {
	await main();
}
