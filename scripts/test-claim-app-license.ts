#!/usr/bin/env bun
/**
 * Regression test for the LICENSE a derived app is given at init.
 *
 * Setup used to copy the copyright holder from the template's MIT line, so every app built from the
 * public template named the template's author as its owner, and it dropped the MIT notice the app is
 * required to keep. The holder now comes from the git identity of whoever runs init, with a
 * placeholder when there is none, and the template's notice is kept in licenses/SPERNAKIT-LICENSE.txt.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir, cwd, env, exit } from 'node:process';

import {
	COPYRIGHT_HOLDER_PLACEHOLDER,
	TEMPLATE_LICENSE_COPY,
	updateLicenseFiles,
} from './lib/setup/license-materials.ts';

const TEMPLATE_MIT =
	'MIT License\n\nCopyright (c) 2026 Template Author\n\nPermission is hereby granted...\n';

function git(dir: string, ...args: string[]): void {
	const result = Bun.spawnSync(['git', '-C', dir, ...args], { windowsHide: true });
	if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed`);
}

function project(root: string, name: string, userName: null | string): string {
	const dir = join(root, name);
	mkdirSync(join(dir, 'licenses'), { recursive: true });
	writeFileSync(join(dir, 'LICENSE'), TEMPLATE_MIT);
	writeFileSync(join(dir, 'package.json'), '{"name":"app","license":"MIT"}\n');
	writeFileSync(join(dir, 'licenses', 'SOURCE-OFFER.template.md'), 'Offer for <PROJECT NAME>.\n');
	git(dir, 'init', '-q');
	if (userName !== null) git(dir, 'config', 'user.name', userName);
	return dir;
}

function claim(dir: string): { license: string; notice: string; pkg: { license: string } } {
	const previous = cwd();
	chdir(dir);
	try {
		updateLicenseFiles({ appName: 'Derived App' } as Parameters<typeof updateLicenseFiles>[0]);
	} finally {
		chdir(previous);
	}
	return {
		license: readFileSync(join(dir, 'LICENSE'), 'utf8'),
		notice: readFileSync(join(dir, TEMPLATE_LICENSE_COPY), 'utf8'),
		pkg: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { license: string },
	};
}

function check(condition: boolean, message: string, failures: string[]): void {
	if (!condition) failures.push(message);
}

export function runClaimAppLicenseTest(): number {
	const root = mkdtempSync(join(tmpdir(), 'spernakit-claim-license-'));
	const saved = { global: env['GIT_CONFIG_GLOBAL'], nosystem: env['GIT_CONFIG_NOSYSTEM'] };
	const failures: string[] = [];
	try {
		// Isolate git from the machine's own identity, so the placeholder case is real.
		const emptyGlobal = join(root, 'empty-gitconfig');
		writeFileSync(emptyGlobal, '');
		env['GIT_CONFIG_GLOBAL'] = emptyGlobal;
		env['GIT_CONFIG_NOSYSTEM'] = '1';

		const named = claim(project(root, 'named', 'Dana Owner'));
		check(
			named.license.includes('Dana Owner. All rights reserved.'),
			'holder is not the git identity',
			failures,
		);
		check(
			!named.license.includes('Template Author'),
			'LICENSE still names the template author',
			failures,
		);
		check(
			named.notice === TEMPLATE_MIT,
			'the template MIT notice was not kept verbatim',
			failures,
		);
		check(
			named.license.includes(TEMPLATE_LICENSE_COPY),
			'LICENSE does not point to the kept notice',
			failures,
		);
		check(
			named.pkg.license === 'UNLICENSED',
			'package.json license is not UNLICENSED',
			failures,
		);

		const anonymous = claim(project(root, 'anonymous', null));
		check(
			anonymous.license.includes(`${COPYRIGHT_HOLDER_PLACEHOLDER}. All rights reserved.`),
			'with no git identity the holder is not the placeholder',
			failures,
		);
		check(
			!anonymous.license.includes('Template Author'),
			'placeholder case names the template author',
			failures,
		);
	} finally {
		if (saved.global === undefined) delete env['GIT_CONFIG_GLOBAL'];
		else env['GIT_CONFIG_GLOBAL'] = saved.global;
		if (saved.nosystem === undefined) delete env['GIT_CONFIG_NOSYSTEM'];
		else env['GIT_CONFIG_NOSYSTEM'] = saved.nosystem;
		rmSync(root, { force: true, recursive: true });
	}
	for (const failure of failures) console.error(`[FAIL] ${failure}`);
	if (failures.length === 0) console.log('[OK] test:claim-app-license -- 7 checks passed.');
	return failures.length === 0 ? 0 : 1;
}

if (import.meta.main) exit(runClaimAppLicenseTest());
