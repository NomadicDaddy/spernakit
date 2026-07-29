#!/usr/bin/env bun
/**
 * Real-CLI regression for the template feature sync.
 *
 * Every assertion drives `scripts/sync-template-features.ts` as a subprocess and grades its exit
 * code, its output, or the bytes it left on disk. Unit-testing the planner would not have caught the
 * failure this guards: the sync's whole risk is that it writes — silently overwriting app-authored
 * text, deleting a capability record it mistook for a finding, or churning timestamps in eleven
 * repositories forever. Those only show up when the tool actually runs.
 *
 * One fixture carries every row of the classification table at once, because a rule that passes in
 * isolation can still be unreachable in a real corpus. The classification and milestone-ladder
 * expectations live in `lib/template-features/expectations.ts`; this file is the sequence.
 */

import { join } from 'node:path';
import { exit } from 'node:process';

import type { Roadmap } from './lib/template-features/expectations.ts';

import {
	assert,
	assertionCount,
	expectGuardedWrite,
	expectInitialPlan,
	expectResidentTier,
	parsePlan,
} from './lib/template-features/expectations.ts';
import {
	createFeatureFixture,
	DURABLE_DIRS,
	readJson,
	readText,
	removePath,
	runSync,
	TEMPLATE_VERSION,
	writeJson,
} from './lib/template-features/fixture.ts';

const fixture = createFeatureFixture();
const { appRoot, templateRoot } = fixture;
const feature = (dirName: string): string => `.aidd/features/${dirName}/feature.json`;
const roadmapOf = (): Roadmap => readJson(appRoot, '.aidd/roadmap.json') as unknown as Roadmap;

try {
	expectInitialPlan(templateRoot, appRoot);

	// --- An app with no milestones cannot receive a new record -----------------------------------
	const savedRoadmap = readJson(appRoot, '.aidd/roadmap.json');
	writeJson(appRoot, '.aidd/roadmap.json', { features: {}, milestones: {} });
	let run = runSync(templateRoot, ['--app', appRoot, '--check']);
	assert(
		run.exitCode === 1,
		`A milestone-less app must fail rather than invent one:\n${run.text}`,
	);
	assert(
		run.text.includes('roadmap defines none'),
		`The failure must name the missing milestone vocabulary:\n${run.text}`,
	);
	writeJson(appRoot, '.aidd/roadmap.json', savedRoadmap);

	// --- A source its own repository gates reject -------------------------------------------------
	const gammaTemplate = readJson(templateRoot, feature('gamma-feature'));
	const stripped = { ...gammaTemplate };
	delete stripped['spernakit_version'];
	writeJson(templateRoot, feature('gamma-feature'), stripped);
	run = runSync(templateRoot, ['--app', appRoot, '--check']);
	assert(run.exitCode === 1, `An unmarked source record must refuse the sync:\n${run.text}`);
	assert(
		run.text.includes('not fit to sync from') &&
			run.text.includes('check:template-feature-versions'),
		`The refusal must name the gate that failed:\n${run.text}`,
	);
	assert(
		readText(appRoot, feature('alpha-feature')) === null,
		'A refused source must leave the application untouched.',
	);
	writeJson(templateRoot, feature('gamma-feature'), gammaTemplate);

	// --- A corpus that is real but entirely ephemeral ---------------------------------------------
	const ephemeralRoot = join(fixture.root, 'ephemeral-template');
	writeJson(ephemeralRoot, 'package.json', { name: 'spernakit', version: TEMPLATE_VERSION });
	writeJson(ephemeralRoot, feature('remediation-20991231-probe'), {
		id: 'remediation-20991231-probe',
		spernakit_version: TEMPLATE_VERSION,
	});
	writeJson(ephemeralRoot, '.aidd/roadmap.json', {
		features: { 'remediation-20991231-probe': { milestone: 'MVP' } },
		milestones: { MVP: { priority: 1 } },
	});
	run = runSync(ephemeralRoot, ['--app', appRoot, '--check']);
	assert(
		run.exitCode === 1 && run.text.includes('Every template feature record is ephemeral'),
		`A corpus with nothing durable must refuse to sync:\n${run.text}`,
	);

	// --- Wrong-way run -----------------------------------------------------------------------------
	run = runSync(appRoot, ['--app', templateRoot, '--check']);
	assert(
		run.exitCode === 1 && run.text.includes('is not spernakit'),
		`Pushing from a derived app must fail:\n${run.text}`,
	);

	// --- The write ---------------------------------------------------------------------------------
	const untouched = new Map(
		[
			'app-only-feature',
			'audit-change-history',
			'delta-feature',
			'epsilon-feature',
			'gamma-feature',
		].map((dirName) => [dirName, readText(appRoot, feature(dirName))]),
	);
	expectGuardedWrite(templateRoot, appRoot);

	assert(
		readJson(appRoot, feature('alpha-feature'))['priority'] === 3,
		'A new copy seeds priority from the template.',
	);
	assert(
		!Object.hasOwn(readJson(appRoot, feature('theta-feature')), 'shippedVersion'),
		"shippedVersion is the app's own release marker and is never seeded onto a new copy.",
	);
	const beta = readJson(appRoot, feature('beta-feature'));
	assert(beta['priority'] === 7, 'priority is app-local and survives an update.');
	assert(beta['shippedVersion'] === '1.2.0', 'shippedVersion survives an update.');
	assert(
		beta['updatedAt'] === '2026-05-05T00:00:00.000Z',
		"An app's updatedAt is never rewritten by the sync.",
	);
	assert(
		Bun.deepEquals(beta['spec'], ['Spec line one.', 'Spec line two.']),
		'The template spec overwrites a diverged app copy.',
	);
	assert(
		readJson(appRoot, feature('zeta-feature'))['spernakit_version'] === TEMPLATE_VERSION,
		'An adopted copy gains the ownership marker.',
	);
	assert(
		Bun.deepEquals(readJson(appRoot, feature('eta-feature'))['spec'], ['Eta spec line.']),
		'--adopt applies the overwrite that was refused without it.',
	);
	for (const [dirName, contents] of untouched) {
		assert(
			readText(appRoot, feature(dirName)) === contents,
			`${dirName} must be byte-identical after the sync.`,
		);
	}
	assert(
		readText(appRoot, feature('audit-logs')) !== null,
		'audit-logs is a capability record and must survive the ephemeral filter.',
	);
	assert(
		readText(appRoot, feature('stale-template-copy')) === null &&
			readText(appRoot, feature('remediation-20991231-probe')) === null,
		'A stranded template copy and a leaked finding are both pruned.',
	);
	assert(
		readText(appRoot, '.aidd/features/stale-blocked-copy/NOTES.md') !== null,
		'A blocked prune must delete nothing.',
	);

	const roadmap = roadmapOf();
	assert(
		Bun.deepEquals(roadmap.milestones, savedRoadmap['milestones']),
		'App milestone names are app-owned and are never touched.',
	);
	assert(
		roadmap.features['beta-feature']?.milestone === 'polish' &&
			Bun.deepEquals(roadmap.features['beta-feature']?.dependencies, ['alpha-feature']),
		'An existing entry keeps its milestone and takes the template dependencies.',
	);
	assert(
		Bun.deepEquals(roadmap.features['alpha-feature']?.dependencies, ['gamma-feature']),
		'A dependency naming a process artifact is dropped on the way down.',
	);
	assert(
		roadmap.features['alpha-feature']?.milestone === 'mvp-foundation',
		'A new entry lands on the milestone the ladder resolved.',
	);
	assert(
		!Object.hasOwn(roadmap.features, 'stale-template-copy'),
		'A pruned directory must leave no orphan roadmap entry.',
	);
	assert(
		Object.hasOwn(roadmap.features, 'stale-blocked-copy') &&
			roadmap.features['app-only-feature']?.milestone === 'polish',
		'Blocked prunes and app-owned entries keep their roadmap rows.',
	);

	// --- Idempotence -------------------------------------------------------------------------------
	// A blocked prune is a standing request for a human, so it keeps failing `--check` until someone
	// reviews the directory. Everything else must settle on the first run.
	run = runSync(templateRoot, ['--app', appRoot, '--check', '--json']);
	const second = parsePlan(run.stdout);
	assert(
		!second.roadmapChanged &&
			second.entries.every(
				(entry) =>
					entry.action === 'unchanged' ||
					(entry.dirName === 'stale-blocked-copy' && entry.action === 'prune-blocked'),
			),
		`A second run must find nothing left to do:\n${run.stdout}`,
	);
	assert(
		second.entries.filter((entry) => entry.action === 'unchanged').length ===
			DURABLE_DIRS.length,
		'Every durable record must read as unchanged on the second run.',
	);

	// Resolve the blocked prune the way an operator would, and the app goes fully green.
	removePath(appRoot, '.aidd/features/stale-blocked-copy');
	const resolved = roadmapOf();
	delete resolved.features['stale-blocked-copy'];
	writeJson(appRoot, '.aidd/roadmap.json', resolved);
	run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 0 && run.text.includes('Feature records are in sync'),
		`The pull-mode gate must pass at version parity:\n${run.text}`,
	);

	// --- Defects no version skew excuses -----------------------------------------------------------
	expectResidentTier(templateRoot, appRoot);

	// --- Version parity is what makes the gate honest ----------------------------------------------
	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: '9.1.0' });
	run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 0 && run.text.includes('SKIPPED') && run.text.includes('v9.1.0'),
		`A version mismatch must skip cleanly:\n${run.text}`,
	);
	run = runSync(appRoot, ['--template', templateRoot, '--check'], {
		TEMPLATE_FEATURES_REQUIRED: '1',
	});
	assert(
		run.exitCode === 1 && run.text.includes('TEMPLATE_FEATURES_REQUIRED=1'),
		`A fleet run must turn that skip into a failure:\n${run.text}`,
	);
	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: TEMPLATE_VERSION });

	// --- Seeding an app that has no roadmap at all (the init path) ---------------------------------
	removePath(appRoot, '.aidd/roadmap.json');
	run = runSync(templateRoot, ['--app', appRoot]);
	assert(run.exitCode === 0, `Seeding a roadmap must succeed:\n${run.text}`);
	const seeded = roadmapOf();
	assert(
		Bun.deepEquals(Object.keys(seeded.features).sort(), [...DURABLE_DIRS]),
		`A seeded roadmap maps every durable record and no ephemeral one: ${Object.keys(
			seeded.features,
		).join(', ')}`,
	);
	assert(
		Object.hasOwn(seeded.milestones, 'MVP'),
		"An app with no roadmap inherits the template's milestone block.",
	);

	console.log(`[OK] Template feature sync self-test passed (${assertionCount()} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	fixture.cleanup();
}
