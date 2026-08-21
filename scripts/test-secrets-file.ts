#!/usr/bin/env bun
/**
 * Regression coverage for the split-secrets loader (`backend/src/config/configSecretsFile.ts`).
 *
 * Drives `loadSecretsFile` against temporary config directories so the checks never touch the
 * repository's own `config/`: a missing file yields an empty namespace, a present file is addressable
 * by dot-path through `getSecret`/`requireSecret`/`resolveSecretRef`, malformed files fail loudly,
 * the namespace is frozen, and `assertSecretRefsResolve` rejects a config whose `*Ref` fields point
 * at keys the file does not declare. Also pins the template's own `.example` companion to the shape
 * the OAuth `clientSecretRef` fields are documented against.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	assertSecretRefsResolve,
	findDanglingSecretRefs,
	getSecret,
	getSecretsFileStatus,
	hasSecret,
	isNamespaceDeepFrozen,
	listSecretPaths,
	loadSecretsFile,
	requireSecret,
	resolveSecretRef,
} from '../backend/src/config/configSecretsFile.ts';
import { projectRoot } from '../backend/src/config/configUtils.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

function throws(fn: () => unknown, needle: string, message: string): void {
	try {
		fn();
	} catch (err) {
		const text = err instanceof Error ? err.message : String(err);
		assert(text.includes(needle), `${message}: error "${text}" lacks "${needle}"`);
		return;
	}
	throw new Error(`${message}: expected a throw`);
}

function withTempConfigDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), 'spernakit-secrets-'));
	try {
		run(dir);
	} finally {
		rmSync(dir, { force: true, recursive: true });
	}
}

function testMissingFile(): void {
	withTempConfigDir((dir) => {
		const status = loadSecretsFile('testapp', dir);
		assert(!status.present, 'missing file reports present=false');
		assert(status.leafCount === 0, 'missing file reports zero leaves');
		assert(getSecret('anything.at.all') === undefined, 'getSecret is undefined without a file');
		assert(!hasSecret('anything'), 'hasSecret is false without a file');
		assert(resolveSecretRef('') === undefined, 'empty ref resolves to undefined');
		assert(resolveSecretRef(undefined) === undefined, 'undefined ref resolves to undefined');
		throws(
			() => requireSecret('oauth.github.clientSecret'),
			'not present',
			'requireSecret names the missing file',
		);
		assertSecretRefsResolve({ oauth: { github: { clientSecretRef: '' } } });
		checks++;
	});
}

function testPresentFile(): void {
	withTempConfigDir((dir) => {
		writeFileSync(
			join(dir, 'testapp.secrets.json'),
			JSON.stringify({
				_comment: 'placeholder',
				integrations: {
					widgets: {
						apiKey: 'k-123',
						enabled: true,
						hosts: ['a.example', { name: 'b' }],
					},
				},
				oauth: { github: { clientSecret: 'gh-secret' } },
			}),
		);
		const status = loadSecretsFile('testapp', dir);
		assert(status.present, 'present file reports present=true');
		assert(status.leafCount === 3, `string leaves counted (got ${String(status.leafCount)})`);
		assert(
			isNamespaceDeepFrozen(),
			'namespace is deep-frozen, including nested arrays and objects inside arrays',
		);
		assert(
			getSecret('oauth.github.clientSecret') === 'gh-secret',
			'dot-path lookup returns the leaf',
		);
		assert(getSecret('oauth.github') === undefined, 'object node is not a secret');
		assert(
			getSecret('integrations.widgets.enabled') === undefined,
			'non-string leaf is not a secret',
		);
		assert(
			getSecret('oauth.github.clientSecret.extra') === undefined,
			'descending through a leaf is undefined',
		);
		assert(
			resolveSecretRef('oauth.github.clientSecret') === 'gh-secret',
			'resolveSecretRef returns the leaf',
		);
		throws(
			() => resolveSecretRef('oauth.google.clientSecret'),
			'oauth.google.clientSecret',
			'dangling ref names the path',
		);
		assert(
			listSecretPaths().join(',') ===
				'_comment,integrations.widgets.apiKey,oauth.github.clientSecret',
			'listSecretPaths enumerates sorted leaf paths',
		);
		assert(
			getSecretsFileStatus()?.path === join(dir, 'testapp.secrets.json'),
			'status carries the path',
		);

		const dangling = findDanglingSecretRefs({
			oauth: {
				github: { clientSecret: '', clientSecretRef: 'oauth.github.clientSecret' },
				google: { clientSecret: '', clientSecretRef: 'oauth.google.clientSecret' },
			},
			other: { tokenRef: '' },
		});
		assert(dangling.length === 1, `one dangling ref (got ${String(dangling.length)})`);
		assert(
			dangling[0]?.configPath === 'oauth.google.clientSecretRef',
			'dangling config path reported',
		);
		throws(
			() =>
				assertSecretRefsResolve({
					oauth: { google: { clientSecretRef: 'oauth.google.clientSecret' } },
				}),
			'oauth.google.clientSecretRef -> "oauth.google.clientSecret"',
			'assertSecretRefsResolve lists the dangling pair',
		);
	});
}

function testMalformedFiles(): void {
	withTempConfigDir((dir) => {
		writeFileSync(join(dir, 'testapp.secrets.json'), '{ not json');
		throws(() => loadSecretsFile('testapp', dir), 'not valid JSON', 'invalid JSON is rejected');
	});
	withTempConfigDir((dir) => {
		writeFileSync(join(dir, 'testapp.secrets.json'), '["a", "b"]');
		throws(
			() => loadSecretsFile('testapp', dir),
			'JSON object at the top level',
			'array is rejected',
		);
	});
}

function testExampleCompanion(): void {
	const examplePath = join(projectRoot, 'config', 'spernakit.secrets.json.example');
	const example = JSON.parse(readFileSync(examplePath, 'utf8')) as Record<string, unknown>;
	withTempConfigDir((dir) => {
		writeFileSync(join(dir, 'spernakit.secrets.json'), JSON.stringify(example));
		loadSecretsFile('spernakit', dir);
		for (const provider of ['github', 'google', 'microsoft']) {
			assert(
				hasSecret(`oauth.${provider}.clientSecret`),
				`.example declares oauth.${provider}.clientSecret`,
			);
		}
		const values = listSecretPaths().map((p) => getSecret(p));
		assert(
			values.every((v) => v === undefined || v === 'replace-me' || isExampleComment(v)),
			'.example holds placeholders only',
		);
	});
}

function isExampleComment(value: string): boolean {
	return value.startsWith('Split-secrets file template');
}

testMissingFile();
testPresentFile();
testMalformedFiles();
testExampleCompanion();

console.log(`[OK] secrets-file loader: ${String(checks)} checks passed`);
