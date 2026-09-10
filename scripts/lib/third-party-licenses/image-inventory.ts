/**
 * Reads a built container image and renders the inventory of what its base operating system
 * contributes.
 *
 * Everything here needs a docker daemon and an image that already exists, which is what separates
 * it from the rest of this directory: the other modules answer questions about the lockfile and the
 * development tree, and can run in `smoke:qc`. These answer questions about the artifact, and only
 * run in the docker smoke modes.
 */

import { exit, env as parentEnv } from 'node:process';

/**
 * What the `docker` CLI needs to find its daemon and its config, and nothing else (ASSERT-038).
 *
 * This used to spread the whole parent environment, which was both the widest possible answer and a
 * no-op: `Bun.spawn` already inherits the parent environment when the `env` option is omitted, so
 * the spread was spelling out the default rather than choosing it. The list below was verified
 * against a running daemon before it replaced the spread — `docker version` answers with only these
 * set, and nothing in the docker smoke modes depends on a variable outside it.
 *
 * The `DOCKER_*` entries are the CLI's documented context and TLS selectors. None of them is set in
 * this development environment, which is exactly why they belong here: a machine that does set
 * `DOCKER_HOST` would otherwise silently talk to the wrong daemon once the spread was narrowed.
 */
const DOCKER_ENV_KEYS = [
	'DOCKER_CERT_PATH',
	'DOCKER_CONFIG',
	'DOCKER_CONTEXT',
	'DOCKER_HOST',
	'DOCKER_TLS_VERIFY',
	'HOME',
	'PATH',
	'SystemRoot',
	'TEMP',
	'TMP',
	'USERPROFILE',
] as const;

function dockerEnv(): Record<string, string> {
	const selected: Record<string, string> = {};
	for (const key of DOCKER_ENV_KEYS) {
		const value = parentEnv[key];
		if (value !== undefined) selected[key] = value;
	}
	return selected;
}

/** Runs a shell script inside the image and returns its stdout, failing loudly on a nonzero exit. */
export async function runInImage(image: string, script: string): Promise<string> {
	const proc = Bun.spawn(['docker', 'run', '--rm', '--entrypoint', 'sh', image, '-c', script], {
		env: dockerEnv(),
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

/** Reads name, version and license of every apk package from the image's package database. */
export async function collectBasePackages(image: string): Promise<string[]> {
	const output = await runInImage(
		image,
		'awk -F: \'/^P:/{p=$2} /^V:/{v=$2} /^L:/{print p "|" v "|" $2}\' /lib/apk/db/installed',
	);
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.sort();
}

/**
 * Every npm package directory present in the image, read from bun's store directory names.
 * This is the exact installed runtime set. The conservative closure remains broader because it
 * also covers frontend bundle inputs without package directories in the final image.
 */
export async function collectImagePackages(image: string): Promise<string[]> {
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

/** Bun's store directory name for a package: `@scope/name@version` becomes `@scope+name@version`. */
export function storeDirName(entry: string): string {
	return entry.replace('/', '+');
}

/**
 * Where the production image records the exact version of every apk package it contains. The
 * Dockerfile writes it from the image's own apk database after the last package change, one
 * `<name>@<version> <license>` line per package.
 */
export const IMAGE_VERSIONS = '/app/licenses/base-image-versions.txt';

/** A `name|version|license` entry in the line format of the image's version record. */
export function versionLine(entry: string): string {
	const [name, version, license] = entry.split('|');
	return `${name}@${version} ${license ?? ''}`.trimEnd();
}

/**
 * Names and licenses only. Versions stay out of the committed file on purpose: the packages the
 * production stage adds on top of the pinned base come from the live Alpine repository, which
 * replaces a patch release rather than keeping it, so a committed version list went stale whenever
 * Alpine shipped one and failed CI on a tree nobody had touched. The set of packages and their
 * licenses changes only when the Dockerfile or the base image does, which is when this file should
 * need review. Exact versions travel in the image itself, at IMAGE_VERSIONS.
 */
export function renderInventory(packages: string[]): string {
	const fields = packages.map((entry) => {
		const [name, , license] = entry.split('|');
		return { license: license || 'UNKNOWN', name: name ?? '' };
	});
	const copyleft = fields.filter((pkg) => /GPL/i.test(pkg.license));

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
		'Versions are deliberately not listed here. The packages added on top of the pinned base image',
		'come from the live Alpine repository, which replaces a patch release rather than keeping it, so',
		'a committed version list goes stale on its own. Each built image records the exact version of',
		`every package in \`${IMAGE_VERSIONS}\`, written from its apk database at`,
		'build time; identify an image by its digest and read its versions from that file.',
		'',
		'## Copyleft packages in the image',
		'',
		`**${copyleft.length}** of them carry a GPL-family license (busybox and friends are the`,
		'usual ones). They are separate programs in the same image, not libraries linked into the',
		'application. Their licenses apply to those components rather than the application code.',
		'',
		...copyleft.map((pkg) => `- \`${pkg.name}\` (${pkg.license})`),
		'',
		'## All base image packages',
		'',
		'| Package | License |',
		'| ------- | ------- |',
		...fields.map((pkg) => `| ${pkg.name} | ${pkg.license} |`),
		'',
	].join('\n');
}
