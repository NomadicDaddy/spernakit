#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectDirectDependencies } from './lib/third-party-licenses/collect.ts';

const temp = mkdtempSync(join(tmpdir(), 'spernakit-license-collect-'));

function writeJson(path: string, value: unknown): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, JSON.stringify(value));
}

function installPackage(dir: string, name: string, version: string): void {
	writeJson(join(dir, 'node_modules', name, 'package.json'), {
		license: 'MIT',
		name,
		version,
	});
}

try {
	// Two workspaces declaring different versions of one package is what an ordinary dependency
	// update produces: the installer keeps one copy at the root and the other beside the
	// workspace that asked for it. The table must name the version each workspace actually runs.
	writeJson(join(temp, 'package.json'), { name: 'fixture' });
	writeJson(join(temp, 'backend', 'package.json'), {
		dependencies: { shared: '1.0.0' },
		name: 'fixture-backend',
	});
	writeJson(join(temp, 'shared', 'package.json'), {
		dependencies: { shared: '2.0.0' },
		name: 'fixture-shared',
	});
	installPackage(temp, 'shared', '1.0.0');
	installPackage(join(temp, 'shared'), 'shared', '2.0.0');

	const splitVersions = await collectDirectDependencies(temp, ['backend', 'shared']);
	if (splitVersions.unresolved.length > 0) {
		throw new Error(
			`expected no unresolved packages, got ${splitVersions.unresolved.join(', ')}`,
		);
	}
	const splitList = JSON.stringify(splitVersions.dependencies);
	if (
		!splitList.includes('"name":"shared","version":"1.0.0","workspace":"backend"') ||
		!splitList.includes('"name":"shared","version":"2.0.0","workspace":"shared"')
	) {
		throw new Error(
			`expected each workspace to report its own installed version, got ${splitList}`,
		);
	}

	writeJson(join(temp, 'cli', 'package.json'), {
		dependencies: { hoisted: '3.1.0' },
		name: 'fixture-cli',
	});
	installPackage(temp, 'hoisted', '3.1.0');

	const rootFallback = await collectDirectDependencies(temp, ['cli']);
	if (rootFallback.unresolved.length > 0) {
		throw new Error(
			`expected no unresolved packages, got ${rootFallback.unresolved.join(', ')}`,
		);
	}
	const fallbackList = JSON.stringify(rootFallback.dependencies);
	if (!fallbackList.includes('"name":"hoisted","version":"3.1.0","workspace":"cli"')) {
		throw new Error(`expected the root copy to serve the workspace, got ${fallbackList}`);
	}
} finally {
	// Even a failing run leaves nothing behind: the synthetic tree is removed on every path.
	try {
		rmSync(temp, { force: true, recursive: true });
	} catch {
		// Best-effort cleanup of a content-free synthetic tree.
	}
}
console.log(
	'[OK] licence collection resolves from the declaring workspace and falls back to the root',
);
