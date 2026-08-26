/**
 * The self-test's resident tier: the two defects `auditResidentRecords` grades ahead of every skip.
 *
 * Split from `expectations.ts`, which grades a plan. These expectations grade the opposite — a gate
 * that must fire before any plan exists, at a version skew and with no template checkout at all —
 * and each of the three cases needs its probe written, exercised across every skip, and removed
 * again, which is most of the file.
 */
import { assert } from './assert.ts';
import { readJson, removePath, runSync, TEMPLATE_VERSION, writeJson } from './fixture.ts';

const PROBE = 'remediation-20991231-probe';
const GAMMA = '.aidd/features/gamma-feature/feature.json';

/** The leak half: a copy of a template process record is wrong at every version, template or not. */
function expectLeakedRecordFails(templateRoot: string, appRoot: string): void {
	writeJson(appRoot, `.aidd/features/${PROBE}/feature.json`, {
		id: PROBE,
		spernakit_version: TEMPLATE_VERSION,
	});

	let run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 1 && run.text.includes('wrong at any template version'),
		`A leaked process record must fail the app:\n${run.text}`,
	);
	assert(run.text.includes(PROBE), `The failure must name the record:\n${run.text}`);

	// The reason this tier exists: at a skew the content gate skips, and the leak must still fail.
	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: '9.1.0' });
	run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 1 && !run.text.includes('[SKIP]'),
		`A version skew must not hide a leaked record behind the parity skip:\n${run.text}`,
	);
	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: TEMPLATE_VERSION });

	// And it needs no template checkout at all, unlike every other comparison the tool makes.
	run = runSync(appRoot, ['--template', `${appRoot}/absent-template`, '--check']);
	assert(
		run.exitCode === 1 && run.text.includes(PROBE),
		`An unresolvable template must not hide a leaked record either:\n${run.text}`,
	);

	removePath(appRoot, `.aidd/features/${PROBE}`);
}

/** Both shapes `EPHEMERAL` matches, authored by the app: no stamp, no counterpart upstream. */
const APP_REMEDIATION = 'remediation-20260826-app-authored';
const APP_AUDIT = 'audit-ui-1790000000-app-authored';
const APP_AUTHORED = [APP_REMEDIATION, APP_AUDIT];

/**
 * The other half of the leak check, and the reason it cannot be a name test: an application may
 * author a finding of its own and name it the way every aidd pipeline names one. Neither probe is
 * stamped and neither exists in the template, so no evidence connects either to upstream.
 */
function expectAppAuthoredProcessRecordsPass(templateRoot: string, appRoot: string): void {
	for (const dirName of APP_AUTHORED) {
		writeJson(appRoot, `.aidd/features/${dirName}/feature.json`, { id: dirName });
	}

	let run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 0,
		`An app-authored process record must not fail its own application:\n${run.text}`,
	);

	// The two skips the resident tier deliberately runs ahead of. Passing has to survive both, or
	// the check would merely have moved the false failure behind a version bump.
	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: '9.1.0' });
	run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 0,
		`A version skew must not condemn an app-authored record:\n${run.text}`,
	);
	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: TEMPLATE_VERSION });

	run = runSync(appRoot, ['--template', `${appRoot}/absent-template`, '--check']);
	assert(
		run.exitCode === 0,
		`With no template to compare against, an unstamped record must still pass:\n${run.text}`,
	);

	// The stamp alone convicts: same directory, same absent template, one field added.
	writeJson(appRoot, `.aidd/features/${APP_REMEDIATION}/feature.json`, {
		id: APP_REMEDIATION,
		spernakit_version: TEMPLATE_VERSION,
	});
	run = runSync(appRoot, ['--template', `${appRoot}/absent-template`, '--check']);
	assert(
		run.exitCode === 1 && run.text.includes(APP_REMEDIATION),
		`A stamped process record must still fail with no template checkout:\n${run.text}`,
	);

	for (const dirName of APP_AUTHORED) removePath(appRoot, `.aidd/features/${dirName}`);
}

/**
 * The version-independent defects, checked ahead of every skip. Expects a fully-synced app at
 * parity, and leaves it in that state.
 */
export function expectResidentTier(templateRoot: string, appRoot: string): void {
	expectLeakedRecordFails(templateRoot, appRoot);
	expectAppAuthoredProcessRecordsPass(templateRoot, appRoot);

	// `spernakit_version` marks the version that introduced a record and is never bumped on
	// revision, so a value the template does not carry can only have been typed by hand.
	const gamma = readJson(appRoot, GAMMA);
	writeJson(appRoot, GAMMA, { ...gamma, spernakit_version: '8.0.0' });
	let run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(
		run.exitCode === 1 && run.text.includes('spernakit_version is 8.0.0'),
		`A hand-edited stamp must fail and print both values:\n${run.text}`,
	);
	writeJson(appRoot, GAMMA, gamma);

	run = runSync(appRoot, ['--template', templateRoot, '--check']);
	assert(run.exitCode === 0, `Restoring the record must return the app to green:\n${run.text}`);
}
