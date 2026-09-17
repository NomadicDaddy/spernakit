#!/usr/bin/env bun
/**
 * Regression test for the comparison between a derived app's `scripts/smoke.json` and the
 * template's copy at the version that app declares.
 *
 * The failure this guards produced no output of any kind. An app that overrides `scripts/smoke.json`
 * keeps its own runbook, and an override suppresses drift detection for that path, so every qc step
 * the template added afterwards was simply absent and every gate stayed green over the shorter list.
 * Nothing compared the two files. A unit test over set arithmetic would have passed throughout, so
 * these assertions drive the shipped CLI against real git tags, and the last one drives it against a
 * real derived app rather than a fixture.
 *
 * Usage:
 *   bun scripts/test-smoke-steps.ts
 */
import { join } from 'node:path';
import { exit } from 'node:process';

import {
	ADDED_DOCKER,
	ADDED_QC,
	APP_ONLY_QC,
	APP_SCRIPTS,
	APP_SMOKE_MERGED,
	createSmokeStepFixture,
	TEMPLATE_ONLY_QC,
} from './lib/smoke-steps/fixture.ts';
import { proveAgainstRealApp } from './lib/smoke-steps/real-app.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const repoRoot = join(import.meta.dir, '..');
const fixture = createSmokeStepFixture(repoRoot);

try {
	// ===== 1. THE REGRESSION. The app is frozen at v9.0.0's runbook; both later steps are named. =====
	fixture.writeApp({ version: '9.1.0' });
	const frozen = fixture.run();
	assert(frozen.exitCode === 1, `A short runbook must fail, not skip:\n${frozen.output}`);
	assert(
		frozen.output.includes(ADDED_QC),
		`The missing qc step must be named in full:\n${frozen.output}`,
	);
	assert(
		frozen.output.includes('Upload validation'),
		`The step's description must travel with it, so the reader knows what stopped running`,
	);

	// ===== 2. Every mode is compared, not qc alone. =====
	assert(
		frozen.output.includes(ADDED_DOCKER),
		`A step added to docker-prod must be reported too:\n${frozen.output}`,
	);
	assert(
		frozen.output.includes('mode "docker-prod"'),
		`Each finding must name the mode the step belongs in:\n${frozen.output}`,
	);
	assert(
		frozen.output.includes('scripts/smoke.json:'),
		'Findings must cite the app file and the line the step has to be inserted near',
	);

	// ===== 3. An override on scripts/smoke.json is what hides the gap, so it cannot suppress this. =====
	fixture.writeApp({
		overrides: [
			'KEEP scripts/smoke.json  # this app owns its runbook',
			'SKIP scripts/smoke.md',
		],
		version: '9.1.0',
	});
	const overridden = fixture.run();
	assert(
		overridden.exitCode === 1,
		`A KEEP on scripts/smoke.json must not suppress the finding:\n${overridden.output}`,
	);
	assert(
		overridden.output.includes(ADDED_QC) && overridden.output.includes(ADDED_DOCKER),
		'Both missing steps must survive the override, not just one',
	);

	// ===== 4. The comparison runs one way. An app's own step is never reported. =====
	assert(
		!overridden.output.includes(APP_ONLY_QC),
		`An app-only step must never be reported as drift:\n${overridden.output}`,
	);

	// ===== 5. A merged runbook passes, and says what it examined. =====
	fixture.write('scripts/smoke.json', APP_SMOKE_MERGED);
	fixture.writeApp({ version: '9.1.0' });
	const merged = fixture.run();
	assert(merged.exitCode === 0, `A merged runbook must pass:\n${merged.output}`);
	assert(
		merged.output.includes('[OK] check:smoke-steps'),
		`A pass must print an [OK] line:\n${merged.output}`,
	);
	assert(
		merged.output.includes('5 template step(s) examined across 2 mode(s)'),
		`The [OK] line must state what it compared, not just that it passed:\n${merged.output}`,
	);
	assert(
		merged.output.includes('1 app-only step(s) ignored'),
		`The count of ignored app steps must be stated rather than hidden:\n${merged.output}`,
	);

	// ===== 6. A step wired to no package.json key fails by name. =====
	const withoutKey = { ...APP_SCRIPTS };
	delete (withoutKey as Record<string, string>)['test:upload-validation'];
	fixture.writeApp({ scripts: withoutKey, version: '9.1.0' });
	const unwired = fixture.run();
	assert(unwired.exitCode === 1, `A step with no script behind it must fail:\n${unwired.output}`);
	assert(
		unwired.output.includes('declares no "test:upload-validation" script'),
		`The unwired key must be named:\n${unwired.output}`,
	);

	// A spernakit-only step has its key withheld by init on purpose, and the app still carries the
	// step because the runner skips it at run time. Reporting those would fail every app in the
	// fleet on sixteen steps it is meant to have.
	assert(
		!unwired.output.includes('check:fleet-manifest'),
		`A spernakit-only step must not be reported as unwired:\n${unwired.output}`,
	);
	assert(
		!unwired.output.includes(TEMPLATE_ONLY_QC),
		'A spernakit-only step must not appear in the wiring findings at all',
	);

	// ===== 7. Preconditions skip, and DRIFT_REQUIRED=1 turns each skip into a failure. =====
	fixture.writeApp({ version: '9.9.9' });
	const noTag = fixture.run();
	assert(noTag.exitCode === 0, `An unknown template tag must skip, not fail:\n${noTag.output}`);
	assert(
		noTag.output.includes('[SKIP]') && noTag.output.includes('v9.9.9'),
		`The skip must name the tag it could not read:\n${noTag.output}`,
	);
	const noTagRequired = fixture.run([], { DRIFT_REQUIRED: '1' });
	assert(
		noTagRequired.exitCode === 1 && noTagRequired.output.includes('[FAIL]'),
		`DRIFT_REQUIRED=1 must turn a skipped tag into a failure:\n${noTagRequired.output}`,
	);

	fixture.write('package.json', `${JSON.stringify({ name: 'fixture-app' }, null, '\t')}\n`);
	const noVersion = fixture.run();
	assert(
		noVersion.exitCode === 0 && noVersion.output.includes('spernakit_version'),
		`An app with no declared version must skip and say so:\n${noVersion.output}`,
	);
	assert(
		fixture.run([], { DRIFT_REQUIRED: '1' }).exitCode === 1,
		'DRIFT_REQUIRED=1 must turn a missing spernakit_version into a failure',
	);

	fixture.writeApp({ version: '9.1.0' });
	const noTemplate = fixture.run(['--template', join(repoRoot, 'tmp', 'not-a-repo')]);
	assert(
		noTemplate.exitCode === 0 && noTemplate.output.includes('[SKIP]'),
		`An unreachable template must skip:\n${noTemplate.output}`,
	);

	// ===== 8. A mistyped flag is a usage error, not a clean pass over the wrong comparison. =====
	const badFlag = fixture.run(['--tempalte', repoRoot]);
	assert(badFlag.exitCode === 2, `An unknown flag must exit 2:\n${badFlag.output}`);
	assert(
		badFlag.output.includes('Usage: check-smoke-steps'),
		`A usage error must print the usage line:\n${badFlag.output}`,
	);

	// ===== 9. Non-vacuity against a real derived app, not the fixture the gate was written beside. =====
	const proof = proveAgainstRealApp(repoRoot);
	if ('reason' in proof) {
		console.log(`[SKIP] real-app proof -- ${proof.reason}.`);
	} else {
		assert(
			proof.shortened.exitCode === 1,
			`Removing "${proof.step}" from ${proof.app}'s runbook must fail the gate:\n${
				proof.shortened.output
			}`,
		);
		assert(
			proof.shortened.output.includes(proof.step),
			`The gate must name the step removed from ${proof.app}:\n${proof.shortened.output}`,
		);
		assert(
			proof.restored.exitCode === 0,
			`Restoring the step must return ${proof.app} to green:\n${proof.restored.output}`,
		);
		console.log(
			`Real-app proof: ${proof.app} at v${proof.version}, removed "${proof.step}", ` +
				'gate failed naming it and passed once restored.',
		);
	}

	console.log(`Smoke step comparison test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	fixture.cleanup();
}
