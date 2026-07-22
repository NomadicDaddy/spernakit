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

async function runInImage(image: string, script: string): Promise<string> {
	const proc = Bun.spawn(['docker', 'run', '--rm', '--entrypoint', 'sh', image, '-c', script], {
		env: { ...process.env },
		stderr: 'pipe',
		stdout: 'pipe',
	});
	const stdout = await new Response(proc.stdout).text();
	const code = await proc.exited;
	if (code !== 0) {
		const stderr = await new Response(proc.stderr).text();
		console.error(`docker run failed against ${image}:`);
		console.error(stderr.trim() || stdout.trim());
		exit(1);
	}
	return stdout;
}

async function assertNoticesPresent(image: string): Promise<void> {
	const output = await runInImage(
		image,
		REQUIRED_IN_IMAGE.map((path) => `[ -e ${path} ] || echo MISSING ${path}`).join('; ')
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

/** Reads name, version and license of every apk package from the image's package database. */
async function collectBasePackages(image: string): Promise<string[]> {
	const output = await runInImage(
		image,
		'awk -F: \'/^P:/{p=$2} /^V:/{v=$2} /^L:/{print p "|" v "|" $2}\' /lib/apk/db/installed'
	);
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.sort();
}

function renderInventory(packages: string[]): string {
	const rows = packages.map((entry) => {
		const [name, version, license] = entry.split('|');
		return `| ${name} | ${version} | ${license || 'UNKNOWN'} |`;
	});

	const copyleft = packages.filter((entry) => /GPL/i.test(entry.split('|')[2] ?? ''));

	return [
		'# Base image packages',
		'',
		'Operating-system packages present in the local production-shaped container image, read from',
		"the image's own apk database. Generated by `bun run licenses:image`; do not edit by hand.",
		'',
		`The image is built on the Bun Alpine base image and contains **${packages.length}** apk`,
		'packages. These are unmodified components of the base operating system included',
		'alongside the application rather than linked into it. The local verification image carries',
		'the applicable GPL/LGPL texts and downstream guidance in',
		'[`CONTAINER-DISTRIBUTION.md`](./CONTAINER-DISTRIBUTION.md). Alpine publishes source at',
		'<https://gitlab.alpinelinux.org/alpine/aports>.',
		'',
		'## Copyleft packages in the image',
		'',
		`**${copyleft.length}** of them carry a GPL-family license (busybox and friends are the`,
		'usual ones). They are separate programs in the same image, not libraries linked into the',
		'application. Their licenses apply to those components rather than the application code.',
		'',
		...copyleft.map((entry) => {
			const [name, version, license] = entry.split('|');
			return `- \`${name}@${version}\` (${license})`;
		}),
		'',
		'## All base image packages',
		'',
		'| Package | Version | License |',
		'| ------- | ------- | ------- |',
		...rows,
		'',
	].join('\n');
}

/**
 * Every npm package directory present in the image, read from bun's store directory names.
 * This is the exact installed runtime set. The conservative closure remains broader because it
 * also covers frontend bundle inputs without package directories in the final image.
 */
async function collectImagePackages(image: string): Promise<string[]> {
	const output = await runInImage(image, 'ls /app/node_modules/.bun 2>/dev/null || true');
	return (
		output
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.includes('@') && !line.startsWith('.'))
			// bun encodes scoped names as @scope+name@version; normalise to @scope/name@version.
			.map((entry) => entry.replace('+', '/'))
			.sort()
	);
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

	const { closure } = await collectRuntimeClosure(
		root,
		WORKSPACES,
		await workspaceNames(root, WORKSPACES)
	);
	const attributed = new Set(closure.map((pkg) => `${pkg.name}@${pkg.version}`));

	// Version is part of the attribution identity. A name-only fallback could accept a notice for
	// a different release whose copyright, NOTICE, or license terms changed.
	const missing = inImage.filter((entry) => !attributed.has(entry));

	if (missing.length > 0) {
		console.error(`${image} ships ${missing.length} package(s) the notices do not attribute:`);
		for (const entry of missing.slice(0, 25)) console.error(`  - ${entry}`);
		if (missing.length > 25) console.error(`  ... and ${missing.length - 25} more`);
		console.error('');
		console.error('Either the image is installing more than the production dependencies, or');
		console.error('THIRD_PARTY_NOTICES.md is stale. The notices must cover what ships.');
		exit(1);
	}

	console.log(`${image}: all ${inImage.length} npm packages have exact notice matches.`);
}

async function main(): Promise<void> {
	const root = cwd();
	const args = await parseArgs(Bun.argv.slice(2), root);

	await assertNoticesPresent(args.image);
	await assertNoticesCoverImage(root, args.image);

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

	if (args.update) {
		await Bun.write(target, generated);
		console.log(`Wrote ${INVENTORY} (${packages.length} packages).`);
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
}

if (import.meta.main) {
	await main();
}
