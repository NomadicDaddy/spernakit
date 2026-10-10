#!/usr/bin/env bun
/**
 * Regression self-test for card 001c42b9: a repository where no guard runs, and explicit hook setup.
 *
 * A repository with no core.hooksPath and no hook in .git/hooks runs nothing at commit. The check
 * read that as a foreign dispatcher declining our guards, `unmanaged-dispatch` plus `not-applicable`,
 * so deeper.project and three redesign trees looked covered while no guard ever ran. And summon arms
 * its hooks through an explicit `setup:hooks` by design (Morgan #7916), which the check reported as
 * a missing `prepare`. This pins both: the first is `unguarded`, non-fatal and unwritable; the second
 * satisfies `prepare` only when the setup it runs is really the guard's.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

import { build, makeRepo } from './lib/shared-core-write/fixture.ts';
import { check, equal, verdict } from './lib/shared-core-write/harness.ts';
import { checkGroup, isFatal } from './lib/shared-core/check.ts';
import { wiringFindings } from './lib/shared-core/wiring.ts';

function run(): void {
	const { fleet, group, owner } = build();
	try {
		// Committed and discoverable, but nothing dispatches pre-push: no hooksPath, no .git/hooks.
		makeRepo(join(fleet, 'bare'), { '.aidd/keep': 'x' }, 'bare');
		const findings = checkGroup(group, fleet, owner).findings;
		const of = (target: string): string[] =>
			findings.filter((f) => f.target === target).map((f) => f.kind);

		equal(
			'a repository where nothing runs is unguarded',
			of('bare').join(),
			'unguarded,uncovered',
		);
		check(
			'and it is not read as a foreign dispatcher declining the guard',
			!of('bare').includes('unmanaged-dispatch') && !of('bare').includes('not-applicable'),
		);
		const unguarded = findings.find((f) => f.target === 'bare' && f.kind === 'unguarded');
		check('unguarded names why nothing runs', unguarded?.detail.includes('unset') === true);
		check('unguarded is unwritable', unguarded !== undefined && !('destination' in unguarded));
		check('unguarded does not fail the gate', unguarded !== undefined && !isFatal(unguarded));
		// A real foreign dispatcher is still read as one, which is what keeps this rule narrow.
		check(
			'a foreign dispatcher is still unmanaged',
			of('reached').includes('unmanaged-dispatch'),
		);
		check('and never unguarded', !of('reached').includes('unguarded'));

		const wired = { ...group, wiring: { prepare: 'bun run-bash.ts .githooks/guard-setup.sh' } };
		const repo = join(fleet, 'explicit');
		mkdirSync(join(repo, 'scripts'), { recursive: true });
		writeFileSync(join(repo, 'scripts', 'setup.ts'), "run('.githooks/guard-setup.sh');\n");
		writeFileSync(join(repo, 'scripts', 'other.ts'), "run('.githooks/something-else.sh');\n");
		const target = { directory: 'explicit', path: repo };
		const unwired = (scripts: Record<string, string>): number =>
			wiringFindings(wired, target, scripts).length;

		equal(
			'setup:hooks running the guard setup satisfies prepare',
			unwired({ 'setup:hooks': 'bun scripts/setup.ts' }),
			0,
		);
		equal(
			'one running something else does not',
			unwired({ 'setup:hooks': 'bun scripts/other.ts' }),
			1,
		);
		equal('without either, prepare is unwired', unwired({}), 1);
		// Roger on dab78ef: a mention is not a call, in the command or in the file it names.
		writeFileSync(
			join(repo, 'scripts', 'noted.ts'),
			"// Runs .githooks/guard-setup.sh\n/* .githooks/guard-setup.sh */\nconsole.log('x');\n",
		);
		equal(
			'a file naming the setup only in comments does not satisfy prepare',
			unwired({ 'setup:hooks': 'bun scripts/noted.ts' }),
			1,
		);
		equal(
			'a command that only echoes the wrapper does not run it',
			unwired({ 'setup:hooks': 'echo scripts/setup.ts' }),
			1,
		);
		// Roger on 7afa482: a runner word after echo is still only echoed.
		equal(
			'echoing a runner and the wrapper runs neither',
			unwired({ 'setup:hooks': 'echo bun scripts/setup.ts' }),
			1,
		);
		equal(
			'echoing the required command itself does not run it',
			unwired({ 'setup:hooks': 'echo bun run-bash.ts .githooks/guard-setup.sh' }),
			1,
		);
		equal(
			'the required command as a later step does',
			unwired({ 'setup:hooks': 'echo arming && bun run-bash.ts .githooks/guard-setup.sh' }),
			0,
		);
		equal(
			'bun run on the wrapper does run it',
			unwired({ 'setup:hooks': 'bun run scripts/setup.ts' }),
			0,
		);
		equal(
			'a prepare that runs something else stays unwired',
			unwired({ prepare: 'echo hi', 'setup:hooks': 'bun scripts/setup.ts' }),
			1,
		);
	} finally {
		if (existsSync(fleet)) rmSync(fleet, { force: true, recursive: true });
	}
}

run();
exit(verdict('shared-core dispatch self-test'));
