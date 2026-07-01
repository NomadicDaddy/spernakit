#!/usr/bin/env bun
/**
 * Build / push the project's container image with both the floating `:latest`
 * tag and the explicit `:{package.version}` tag.
 *
 * docker-compose.production.yml requires APP_VERSION to be set (no :latest
 * fallback) so smoke:docker-prod and the dance pipeline can compose-up the
 * locally-built image without operators having to tag-and-push manually.
 *
 * Usage:
 *   bun scripts/docker-image.ts build   # docker build with both tags
 *   bun scripts/docker-image.ts push    # docker push both tags
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

const image = `ghcr.io/nomadicdaddy/${pkg.name}`;
const tags = ['latest', pkg.version];

if (subcommand === 'build') {
	const args = ['build'];
	for (const tag of tags) {
		args.push('-t', `${image}:${tag}`);
	}
	args.push('.');
	const r = spawnSync('docker', args, { cwd: projectRoot, shell: true, stdio: 'inherit' });
	process.exit(r.status ?? 1);
}

for (const tag of tags) {
	const r = spawnSync('docker', ['push', `${image}:${tag}`], {
		cwd: projectRoot,
		shell: true,
		stdio: 'inherit',
	});
	if (r.status !== 0) {
		process.exit(r.status ?? 1);
	}
}
