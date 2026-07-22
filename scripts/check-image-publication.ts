#!/usr/bin/env bun

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PackageJson {
	name?: string;
	scripts?: Record<string, string>;
}

interface Finding {
	file: string;
	reason: string;
}

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJson;

/**
 * A derived project MAY publish its image — that is its owner's decision, and taking the
 * capability away would only push them into hand-rolling a push that no gate sees. What it may
 * not do is publish blind: giving an image to another party makes that project the distributor
 * of the GPL/LGPL components inside it (Bun with statically linked JavaScriptCore, and the
 * Alpine base packages), and those licenses require an offer of corresponding source.
 *
 * So the policy inverts by project: the template must have no publish path at all, while a
 * derived project that HAS one must have completed its source offer.
 */
if (manifest.name !== 'spernakit') {
	const canPublish =
		Object.values(manifest.scripts ?? {}).some((command) =>
			/\bdocker\s+(?:compose\s+)?push\b|docker-image\.ts\s+push/.test(command)
		) || Boolean((manifest.scripts ?? {})['docker:image:push']);

	if (!canPublish) {
		console.log('[OK] No container-image publication path; nothing to satisfy.');
		process.exit(0);
	}

	const offerPath = join(root, 'licenses/SOURCE-OFFER.md');
	if (!existsSync(offerPath)) {
		console.error(
			'This project can publish a container image but has no licenses/SOURCE-OFFER.md.'
		);
		console.error(
			'Publishing makes you the distributor of the GPL/LGPL components in the image'
		);
		console.error(
			'(Bun with statically linked JavaScriptCore, and the Alpine base packages), and'
		);
		console.error(
			'they require you to offer corresponding source. Complete the offer, or remove'
		);
		console.error('the publication path. See licenses/CONTAINER-DISTRIBUTION.md.');
		process.exit(1);
	}

	const offer = readFileSync(offerPath, 'utf8');
	const placeholders = [...new Set(offer.match(/<[A-Z][A-Z _-]+>/g) ?? [])];
	if (placeholders.length > 0) {
		console.error('licenses/SOURCE-OFFER.md still contains placeholders:');
		for (const placeholder of placeholders) console.error(`  - ${placeholder}`);
		console.error('An offer a recipient cannot act on is not an offer.');
		process.exit(1);
	}

	console.log('[OK] Publication path present and the source offer is complete.');
	process.exit(0);
}

const findings: Finding[] = [];
const scripts = manifest.scripts ?? {};
for (const forbiddenName of ['docker:image:push', 'release:publish']) {
	if (scripts[forbiddenName]) {
		findings.push({ file: 'package.json', reason: `forbidden script ${forbiddenName}` });
	}
}
for (const [name, command] of Object.entries(scripts)) {
	if (/\bdocker\s+(?:compose\s+)?push\b|docker-image\.ts\s+push/.test(command)) {
		findings.push({ file: 'package.json', reason: `${name} can push a container image` });
	}
}

const workflowPatterns = [
	{ pattern: /packages:\s*write/, reason: 'grants package-write permission' },
	{ pattern: /push:\s*true/, reason: 'enables a container push' },
	{ pattern: /docker\/login-action/, reason: 'logs in to a container registry' },
	{ pattern: /docker\/build-push-action/, reason: 'uses a container publication action' },
	{ pattern: /ghcr\.io/, reason: 'references GHCR from an executable workflow' },
];
for (const extension of ['yml', 'yaml']) {
	const glob = new Bun.Glob(`*.${extension}`);
	for await (const relative of glob.scan({ cwd: join(root, '.github/workflows') })) {
		const file = `.github/workflows/${relative}`;
		const content = readFileSync(join(root, file), 'utf8');
		for (const check of workflowPatterns) {
			if (check.pattern.test(content)) findings.push({ file, reason: check.reason });
		}
	}
}

// docker-image.ts carries a push path on purpose: a DERIVED project may publish, and it should
// do so through the reviewed script rather than a hand-rolled `docker push`. What protects the
// template is that the script refuses to run it here. So the invariant is not "no push code"
// (that would force derived apps off the guarded path); it is "the template cannot reach it".
const helper = readFileSync(join(root, 'scripts/docker-image.ts'), 'utf8');
if (!/pkg\.name === 'spernakit'/.test(helper)) {
	findings.push({
		file: 'scripts/docker-image.ts',
		reason: 'no template refusal: push must be unreachable for spernakit itself',
	});
}
if (/ghcr\.io\/[a-z]/i.test(helper)) {
	findings.push({
		file: 'scripts/docker-image.ts',
		reason: 'hardcodes a registry; a derived project names its own via IMAGE_REGISTRY',
	});
}

if (findings.length > 0) {
	console.error('Spernakit must build container images locally without publishing them:');
	for (const finding of findings) console.error(`  - ${finding.file}: ${finding.reason}`);
	process.exit(1);
}

console.log('[OK] Spernakit has no executable container-image publication path.');
