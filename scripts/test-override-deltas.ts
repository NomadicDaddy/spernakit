#!/usr/bin/env bun
/**
 * Regression test for the report of what each `.templateoverrides` entry is holding back.
 *
 * The bug this guards is silent by construction. A `SKIP` or `KEEP` line tells drift detection to
 * stop asking about a path, so from that moment every template change to the file is invisible: the
 * drift report prints the path as `suppressed` with the reason its author typed, and every gate
 * stays green. During the 2026-07-27 dance a `SKIP docker/nginx.conf` taken for one CSP token had
 * also withheld the template's `location ~ \.map$` deny block for a full release cycle, and it was
 * found by a human re-reading the override text — not by anything that runs.
 *
 * The assertions drive the shipped CLI against real git tags rather than the line arithmetic alone,
 * because the failure was never arithmetic: it was that nobody performed the comparison. The fixture
 * harness lives in `lib/template/override-deltas-fixture.ts` and reconstructs the nginx case beside
 * a branded file, a scaffold-mapped file, an obsolete entry, and a stale one.
 */

import { join } from 'node:path';
import { exit } from 'node:process';

import type { TemplateOverrides } from './lib/template/types.ts';

import {
	AGREED,
	APP_CSP_LINE,
	APP_DESCRIPTION,
	APP_NAME,
	createOverrideDeltaFixture,
	DENY_MAPS,
	DOCKERFILE,
	DROPPED,
	NGINX,
	NGINX_REASON,
	PRESENCE,
	REQUIRE_BUN,
	SCAFFOLD,
	TARGET_NGINX,
	TEMPLATE_CSP_LINE,
	WITHHELD_SCAFFOLD_LINE,
} from './lib/template/override-deltas-fixture.ts';
import { computeOverrideDeltas } from './lib/template/override-deltas.ts';
import { isSecurityRelevantPath, SECURITY_INFRASTRUCTURE_FILES } from './lib/template/security.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const BASE_OVERRIDES = [
	'# app-specific template sync exclusions',
	`SKIP  ${NGINX}  # ${NGINX_REASON}`,
	`KEEP  ${DOCKERFILE}  # app image labels`,
	`SKIP  ${SCAFFOLD}`,
	`KEEP  ${AGREED}  # kept in sync by hand`,
	`DELETED  ${PRESENCE}  # Bun-only toolchain`,
];

const fixture = createOverrideDeltaFixture(join(import.meta.dir, '..'));

try {
	fixture.writeOverrides(BASE_OVERRIDES);

	// ===== 1. THE REGRESSION. The SKIP taken for a CSP token is withholding a security block. =====
	const report = fixture.run(['--target-version', '9.1.0']);
	assert(
		report.output.includes(NGINX),
		`The report must name the overridden path:\n${report.output}`,
	);
	assert(
		report.output.includes(DENY_MAPS),
		`The withheld security block must be printed line for line:\n${report.output}`,
	);
	assert(
		report.output.includes('gzip_static on;'),
		`Every withheld line must be printed, not just the first:\n${report.output}`,
	);
	assert(
		report.output.includes('WITHHELD BY OVERRIDE'),
		'Withheld deltas need their own banner, distinct from drift and from missing files',
	);

	// ===== 2. The recorded reason is printed beside the delta, so stale text is visible. =====
	assert(
		report.output.includes(NGINX_REASON),
		`Each entry must print its .templateoverrides reason:\n${report.output}`,
	);
	assert(
		report.output.indexOf(NGINX_REASON) < report.output.indexOf(DENY_MAPS),
		'The reason must be read before the delta it failed to mention',
	);
	assert(
		report.output.includes('(none recorded)'),
		`An entry with no reason must say so rather than print a blank:\n${report.output}`,
	);

	// ===== 3. Security relevance ranks the report, and comes from the checker, not the manifest. =====
	assert(
		report.output.includes('SECURITY'),
		`A docker/ path must be tagged security-relevant:\n${report.output}`,
	);
	assert(
		report.output.indexOf(NGINX) < report.output.indexOf(SCAFFOLD),
		`Security entries must sort first, ahead of ${SCAFFOLD}:\n${report.output}`,
	);
	assert(
		report.output.indexOf(NGINX) < report.output.indexOf(DOCKERFILE),
		'Security entries must sort ahead of non-security entries regardless of path order',
	);

	// ===== 4. A branded path still emits a delta; its branding does not become one. =====
	assert(
		report.output.includes(REQUIRE_BUN),
		`A branded file's structural delta must survive branding normalization:\n${report.output}`,
	);
	assert(
		!report.output.includes(APP_NAME),
		`A branded file's own name must not be reported as withheld content:\n${report.output}`,
	);

	// ===== 5. Scaffold-mapped entries are compared against their scaffolding/ counterpart. =====
	assert(
		report.output.includes(WITHHELD_SCAFFOLD_LINE),
		`A scaffold-mapped ignore file must be compared, not skipped:\n${report.output}`,
	);
	assert(
		report.output.includes('compared against: scaffolding/.prettierignore'),
		`The report must name the mapped template path it read:\n${report.output}`,
	);

	// ===== 6. KEEP and SKIP are treated alike; DELETED is listed but never compared. =====
	assert(
		report.output.includes('[SKIP') && report.output.includes('[KEEP'),
		`Both suppressing actions must appear in the report:\n${report.output}`,
	);
	assert(
		report.output.includes('PRESENCE OVERRIDES') && report.output.includes(PRESENCE),
		`A DELETED entry must be listed so no override goes unreviewed:\n${report.output}`,
	);
	assert(
		report.output.indexOf(PRESENCE) > report.output.indexOf('PRESENCE OVERRIDES'),
		'A DELETED entry must not be reported as a withheld delta or as unresolved',
	);

	// ===== 7. An override that withholds nothing is named, so it can be deleted. =====
	assert(
		report.output.includes('WITHHOLDING NOTHING') && report.output.includes(AGREED),
		`An override matching the target line for line must be named as obsolete:\n${report.output}`,
	);

	// ===== 8. Advisory by default; --fail-on-delta is what blocks. =====
	assert(report.exitCode === 0, `The report must be advisory by default:\n${report.output}`);
	const blocking = fixture.run(['--target-version', '9.1.0', '--fail-on-delta']);
	assert(
		blocking.exitCode !== 0,
		`--fail-on-delta must fail when an override withholds content:\n${blocking.output}`,
	);

	// ===== 9. Fail closed: no target version, no such tag, no such path at the target. =====
	const noTarget = fixture.run([]);
	assert(
		noTarget.exitCode !== 0 && noTarget.output.includes('--target-version is required'),
		`Without --target-version the check must fail, never fall back:\n${noTarget.output}`,
	);
	assert(
		!noTarget.output.includes('9.0.0'),
		"Falling back to the app's recorded baseline would report every override as clean",
	);
	const badTag = fixture.run(['--target-version', '99.0.0']);
	assert(
		badTag.exitCode !== 0 && badTag.output.includes('unavailable tag v99.0.0'),
		`An unresolvable target tag must fail and name the tag:\n${badTag.output}`,
	);

	fixture.writeOverrides([...BASE_OVERRIDES, `SKIP  ${DROPPED}  # legacy admin route`]);
	const stale = fixture.run(['--target-version', '9.1.0']);
	assert(
		stale.exitCode !== 0,
		`An entry that cannot be compared must fail even without --fail-on-delta:\n${stale.output}`,
	);
	assert(
		stale.output.includes('UNRESOLVED') &&
			stale.output.includes(`the target version has no ${DROPPED}`),
		`An unresolvable entry must name the mapped template path:\n${stale.output}`,
	);
	fixture.writeOverrides(BASE_OVERRIDES);

	// ===== 10. NEGATIVE CONTROL: re-merging the withheld lines clears those findings. =====
	// Without this the assertions above could all pass on a report that flags everything forever.
	// The app takes v9.1.0 wholesale except for the one line its reason documents.
	fixture.write(NGINX, TARGET_NGINX.replace(TEMPLATE_CSP_LINE, APP_CSP_LINE));
	fixture.write(
		DOCKERFILE,
		`FROM oven/bun:1 AS base
LABEL org.opencontainers.image.title="${APP_NAME}"
LABEL org.opencontainers.image.description="${APP_DESCRIPTION}"
WORKDIR /app
${REQUIRE_BUN}
EXPOSE 3330
`,
	);
	fixture.write(SCAFFOLD, `dist/\n${WITHHELD_SCAFFOLD_LINE}\n`);
	const remerged = fixture.run(['--target-version', '9.1.0']);
	assert(
		!remerged.output.includes(DENY_MAPS) && !remerged.output.includes('gzip_static'),
		`A re-merged line must stop being reported as withheld:\n${remerged.output}`,
	);
	assert(
		remerged.output.includes('WITHHOLDING NOTHING') &&
			remerged.output.includes(REQUIRE_BUN) === false,
		`A re-merged branded file must move to the obsolete list:\n${remerged.output}`,
	);
	// What survives is exactly the divergence the reason documents: the template's own CSP line,
	// which this app replaced on purpose. An override that withholds only what its reason explains
	// is the state the report is trying to leave every entry in.
	assert(
		remerged.output.includes('1 line v9.1.0 has and this app does not') &&
			remerged.output.includes(`font-src 'self'";`),
		`The documented divergence must remain the one reported line:\n${remerged.output}`,
	);

	// ===== 11. A copy that matches the target line for line clears the report entirely. =====
	fixture.write(NGINX, TARGET_NGINX);
	const clean = fixture.run(['--target-version', '9.1.0', '--fail-on-delta']);
	assert(clean.exitCode === 0, `An app matching the target must pass:\n${clean.output}`);
	assert(
		clean.output.includes('No override is withholding template content at v9.1.0'),
		`A clean run must say so explicitly:\n${clean.output}`,
	);
	assert(
		!clean.output.includes('WITHHELD BY OVERRIDE'),
		'A clean run must not print the withholding banner',
	);

	// ===== 12. Security relevance is derived from the checker's own rules. =====
	for (const securityFile of SECURITY_INFRASTRUCTURE_FILES) {
		assert(
			isSecurityRelevantPath(securityFile),
			`Every security-infrastructure file must rank as security-relevant: ${securityFile}`,
		);
	}
	assert(
		isSecurityRelevantPath('docker/nginx.conf') &&
			isSecurityRelevantPath('backend/src/plugins/csrf.ts') &&
			isSecurityRelevantPath('backend/src/guards/role.ts') &&
			isSecurityRelevantPath('.githooks/leak-guard.sh'),
		'docker/, plugin, and guard paths must rank as security-relevant',
	);
	assert(
		!isSecurityRelevantPath('frontend/src/App.tsx') && !isSecurityRelevantPath(DOCKERFILE),
		'Ordinary application files must not be ranked security-relevant',
	);

	// ===== 13. Ordering the CLI fixture cannot isolate: two security paths sort by path. =====
	const ordered = computeOverrideDeltas({
		appBranding: null,
		classification: {
			branded: [],
			buildCriticalBranded: [],
			infrastructure: [],
			securityInfrastructure: [],
		},
		overrides: {
			deleted: new Map(),
			keep: new Map([['docker/start.sh', '']]),
			skip: new Map([
				['docker/nginx.conf', ''],
				['frontend/src/App.tsx', ''],
			]),
		} satisfies TemplateOverrides,
		readApp: () => 'same\n',
		readTemplate: () => 'same\n',
	});
	assert(
		ordered.map((e) => e.appPath).join(',') ===
			'docker/nginx.conf,docker/start.sh,frontend/src/App.tsx',
		`Entries must sort security-first then by path: ${ordered.map((e) => e.appPath).join(',')}`,
	);
	assert(
		ordered.every((e) => e.status === 'empty'),
		'Identical content must resolve to an empty delta, whichever action declared it',
	);

	console.log(`Override delta report test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	fixture.cleanup();
}
