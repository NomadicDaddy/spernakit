#!/usr/bin/env bun
/** The tagged template packet must leave Smokestack's owner tree to its own delivery. */
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { enumerateTemplateFiles } from './lib/template/classify.ts';

const template = mkdtempSync(join(tmpdir(), 'spernakit-owner-packet-'));

function write(path: string, text: string): void {
	const target = join(template, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, text);
}

function git(...args: string[]): void {
	const result = Bun.spawnSync(
		[
			'git',
			'-C',
			template,
			'-c',
			'user.email=test@example.invalid',
			'-c',
			'user.name=Test',
			...args,
		],
		{ stderr: 'pipe', stdout: 'pipe', windowsHide: true },
	);
	assert.equal(result.exitCode, 0, `git ${args.join(' ')}: ${result.stderr.toString()}`);
}

try {
	git('init', '-b', 'main');
	write('scripts/smokestack/hooks/pre-commit', 'owner hook\n');
	write('scripts/smokestack/run-bash.ts', 'owner runner\n');
	write('scripts/smokestack/smokestack.lock', '{}\n');
	write('scripts/smoke.json', '{}\n');
	write('backend/src/app.ts', 'export {};\n');
	git('add', '-A');
	git('commit', '-m', 'fixture');
	git('tag', 'v9.0.0');

	const packet = enumerateTemplateFiles(template, '9.0.0');
	assert(
		packet.includes('scripts/smoke.json'),
		'app-owned smoke runbook must remain in the packet',
	);
	assert(
		packet.includes('backend/src/app.ts'),
		'ordinary template source must remain in the packet',
	);
	assert(
		packet.every((file) => !file.startsWith('scripts/smokestack/')),
		`Smokestack owner files leaked into the packet: ${packet.join(', ')}`,
	);
	console.log('Template owner exclusion test passed.');
} finally {
	rmSync(template, { force: true, recursive: true });
}
