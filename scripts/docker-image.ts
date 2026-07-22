#!/usr/bin/env bun
/**
 * Build the project's local verification image, and — for a derived project that chooses to —
 * publish it.
 *
 * `build` tags `<name>-test:{latest,version}` locally. The smoke runner passes the versioned
 * local tag to docker-compose.production.yml so smoke:docker-prod and the dance pipeline can
 * exercise it without contacting a registry.
 *
 * `push` is deliberately not symmetrical with `build`, because distribution is what triggers the
 * GPL/LGPL obligations of the Bun runtime and the Alpine base packages:
 *
 * - The template refuses outright. Spernakit distributes nothing, which is what lets it carry
 *   guidance instead of a corresponding-source offer (see licenses/CONTAINER-DISTRIBUTION.md).
 * - A derived project may publish, but must say where (IMAGE_REGISTRY) and must have completed
 *   its source offer first. Giving an image to another party makes you the distributor of every
 *   third-party component inside it; this refuses to let that happen by accident.
 *
 * Usage:
 *   bun scripts/docker-image.ts build   # local build, both tags
 *   IMAGE_REGISTRY=<your-registry> bun scripts/docker-image.ts push
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const subcommand = process.argv[2];
if (subcommand !== 'build' && subcommand !== 'push') {
	console.error('Usage: bun scripts/docker-image.ts <build|push>');
	process.exit(1);
}

interface PackageJson {
	name?: string;
	version?: string;
}

const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8')) as PackageJson;
if (!pkg.name || !pkg.version) {
	console.error('package.json must have name and version');
	process.exit(1);
}

const localImage = `${pkg.name}-test`;
const tags = ['latest', pkg.version];

function run(args: string[]): void {
	const result = spawnSync('docker', args, { cwd: projectRoot, shell: true, stdio: 'inherit' });
	if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

if (subcommand === 'build') {
	const args = ['build'];
	for (const tag of tags) args.push('-t', `${localImage}:${tag}`);
	args.push('.');
	run(args);
	process.exit(0);
}

// --- push ---

if (pkg.name === 'spernakit') {
	console.error('The template does not publish container images.');
	console.error('Spernakit builds images as local verification artifacts only; distributing one');
	console.error('would trigger the GPL/LGPL obligations of Bun and the Alpine base packages.');
	console.error('See licenses/CONTAINER-DISTRIBUTION.md.');
	process.exit(1);
}

const registry = process.env.IMAGE_REGISTRY;
if (!registry) {
	console.error(
		'IMAGE_REGISTRY is required to publish (for example a GHCR or ECR namespace you control).'
	);
	console.error('The template names no registry for you; publishing is your decision.');
	process.exit(1);
}

// Publishing makes this project the distributor of every third-party component in the image.
// The offer is the thing a recipient relies on, so it has to be real before the image ships.
const offerPath = join(projectRoot, 'licenses', 'SOURCE-OFFER.md');
if (!existsSync(offerPath)) {
	console.error('licenses/SOURCE-OFFER.md is missing.');
	console.error('Publishing this image makes you the distributor of the GPL/LGPL components it');
	console.error('contains (Bun with statically linked JavaScriptCore, and Alpine packages), and');
	console.error('they require you to offer corresponding source. Complete the offer first; see');
	console.error('licenses/CONTAINER-DISTRIBUTION.md.');
	process.exit(1);
}

const offer = readFileSync(offerPath, 'utf-8');
const placeholders = offer.match(/<[A-Z][A-Z _-]+>/g) ?? [];
if (placeholders.length > 0) {
	console.error('licenses/SOURCE-OFFER.md still contains placeholders:');
	for (const placeholder of [...new Set(placeholders)]) console.error(`  - ${placeholder}`);
	console.error('An offer a recipient cannot act on is not an offer. Fill these in first.');
	process.exit(1);
}

for (const tag of tags) {
	run(['tag', `${localImage}:${tag}`, `${registry}/${pkg.name}:${tag}`]);
	run(['push', `${registry}/${pkg.name}:${tag}`]);
}
console.log(`Pushed ${registry}/${pkg.name}:${tags.join(', ')}`);
