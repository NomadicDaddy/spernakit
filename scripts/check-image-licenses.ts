/**
 * Enforces: the notices the BUILT Docker image's contents require are present in that image.
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
import { parseArgs } from 'node:util';

import { collectRuntimeClosure } from './lib/third-party-licenses/closure.ts';
import { workspaceNames } from './lib/third-party-licenses/collect.ts';
import {
	collectBasePackages,
	collectImagePackages,
	renderInventory,
} from './lib/third-party-licenses/image-inventory.ts';
import {
	verifyImageCarriesLicenses,
	verifyNoticesPresent,
} from './lib/third-party-licenses/image-notices.ts';
import { formatMarkdown } from './lib/third-party-licenses/render.ts';

const INVENTORY = join('licenses', 'base-image-packages.md');
const WORKSPACES = ['backend', 'frontend', 'shared'];

export interface ImageLicenseOptions {
	/** Absent means the tag this project builds locally, derived from its own package name. */
	image?: string | undefined;
	update: boolean;
}

export function parseImageLicenseArgs(args: string[]): ImageLicenseOptions {
	const { values } = parseArgs({
		args,
		options: { image: { type: 'string' }, update: { type: 'boolean' } },
		strict: true,
	});
	// parseArgs takes the token after `--image` as its value even when that token is itself a flag,
	// so `--image --update` would check a tag no daemon has and report a missing image instead of
	// the bad argument that caused it.
	if (
		values.image !== undefined &&
		(values.image.trim() === '' || values.image.startsWith('-'))
	) {
		throw new Error('--image requires a tag (e.g. --image spernakit-test:latest).');
	}
	return { image: values.image, update: values.update === true };
}

/**
 * The local verification tag this project builds, derived the same way docker-image.ts derives
 * it: `<package name>-test`. A hardcoded tag would be wrong in every derived app, which builds
 * `<its-slug>-test` and would otherwise check a spernakit image that is stale or absent.
 */
async function defaultImageTag(root: string): Promise<string> {
	const manifest = (await Bun.file(join(root, 'package.json')).json()) as { name?: string };
	if (!manifest.name) throw new Error('cannot derive the image tag: package.json has no name.');
	return `${manifest.name}-test:latest`;
}

/**
 * The notices must cover what the image ships. This comparison fails on any package in the image
 * that the attribution appendix does not include.
 */
async function verifyNoticesCoverImage(root: string, image: string): Promise<boolean> {
	const inImage = await collectImagePackages(image);
	if (inImage.length === 0) {
		console.log('[SKIP] No bun store found in the image; skipping closure comparison.');
		return true;
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
		console.error(
			`[FAIL] ${image} ships ${missing.length} package(s) the notices do not attribute:`,
		);
		for (const entry of missing.slice(0, 25)) console.error(`  - ${entry}`);
		if (missing.length > 25) console.error(`  ... and ${missing.length - 25} more`);
		console.error('');
		console.error('Either the image is installing more than the production dependencies, or');
		console.error('THIRD_PARTY_NOTICES.md is stale. The notices must cover what ships.');
		return false;
	}

	if (fromOtherPlatform.length > 0) {
		if (!(await verifyImageCarriesLicenses(image, fromOtherPlatform))) return false;
		console.log(
			`[OK] ${image}: ${fromOtherPlatform.length} platform-gated package(s) verified against ` +
				'the image:',
		);
		for (const entry of fromOtherPlatform) console.log(`  - ${entry}`);
	}

	const matched = inImage.length - fromOtherPlatform.length;
	console.log(`[OK] ${image}: all ${matched} npm packages have exact notice matches.`);
	return true;
}

/** Refresh or verify the base inventory. Returns whether the file on disk is current. */
async function reconcileInventory(root: string, image: string, update: boolean): Promise<boolean> {
	const packages = await collectBasePackages(image);
	if (packages.length === 0) {
		throw new Error(`read no apk packages from ${image}; is it the production image?`);
	}

	// Formatted with the repo's prettier config for the same reason the other generated docs
	// are: `format:check` reflows markdown tables, and an unformatted generator output would
	// report drift against its own file forever.
	const generated = await formatMarkdown(renderInventory(packages), root);
	const target = join(root, INVENTORY);

	if (update) {
		await Bun.write(target, generated);
		console.log(`[OK] Wrote ${INVENTORY} (${packages.length} packages).`);
		return true;
	}

	const committed = await Bun.file(target)
		.text()
		.catch(() => '');
	if (committed !== generated) {
		console.error(`[FAIL] ${INVENTORY} is out of date with the built image.`);
		console.error('Run `bun run licenses:image` and commit the result.');
		return false;
	}

	console.log(`[OK] ${INVENTORY} matches the built image (${packages.length} packages).`);
	return true;
}

export async function runImageLicenses(options: ImageLicenseOptions): Promise<number> {
	const root = cwd();
	try {
		const image = options.image ?? (await defaultImageTag(root));
		if (!(await verifyNoticesPresent(image))) return 1;

		// The inventory is written before the npm coverage check, not after. The two answer different
		// questions — apk packages in the base image, npm packages in the closure — and checking
		// coverage first made `licenses:image` unable to refresh the inventory while any gap was
		// open, including gaps whose repair is regenerating this very file. Coverage still runs on
		// the way out, so `--update` cannot pass a check it should fail.
		const inventoryOk = await reconcileInventory(root, image, options.update);
		const coverageOk = await verifyNoticesCoverImage(root, image);
		return inventoryOk && coverageOk ? 0 : 1;
	} catch (err) {
		console.error(
			`[FAIL] check-image-licenses: ${err instanceof Error ? err.message : String(err)}`,
		);
		return 1;
	}
}

if (import.meta.main) {
	// `--update` rewrites a committed file, so a mistyped flag must not fall through to a run that
	// silently verifies the default tag instead. Bad arguments exit 2, findings exit 1.
	let options: ImageLicenseOptions;
	try {
		options = parseImageLicenseArgs(Bun.argv.slice(2));
	} catch (err) {
		console.error(
			`[FAIL] check-image-licenses: ${err instanceof Error ? err.message : String(err)}`,
		);
		console.error('Usage: bun scripts/check-image-licenses.ts [--image <tag>] [--update]');
		exit(2);
	}
	exit(await runImageLicenses(options));
}
