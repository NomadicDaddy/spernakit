/**
 * The override-delta assertions that need no git fixture.
 *
 * `test-override-deltas.ts` drives the shipped CLI against real tags, because the failure it guards
 * was never arithmetic — it was that nobody performed the comparison. These three are the opposite
 * shape: they call `computeOverrideDeltas` directly with synthetic readers, because what they pin
 * down is a decision the function makes rather than a comparison it performs, and a fixture built
 * from real tags cannot isolate any of them. They live here so the suite that runs them stays
 * inside the 300-line limit as it grows.
 */
import type { TemplateOverrides } from './types.ts';

import { computeOverrideDeltas } from './override-deltas.ts';
import { isSecurityRelevantPath, SECURITY_INFRASTRUCTURE_FILES } from './security.ts';

/** The suite's own assertion counter, passed in so every check lands in one total. */
export type Assert = (condition: boolean, message: string) => void;

const NO_CLASSIFICATION = {
	branded: [],
	buildCriticalBranded: [],
	infrastructure: [],
	securityInfrastructure: [],
};

/** Security relevance is derived from the checker's own rules, not from the manifest. */
export function assertSecurityRanking(assert: Assert, dockerfile: string): void {
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
		!isSecurityRelevantPath('frontend/src/App.tsx') && !isSecurityRelevantPath(dockerfile),
		'Ordinary application files must not be ranked security-relevant',
	);
}

/** Ordering the CLI fixture cannot isolate: two security paths sort by path. */
export function assertOrdering(assert: Assert): void {
	const ordered = computeOverrideDeltas({
		appBranding: null,
		classification: NO_CLASSIFICATION,
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
}

/**
 * Withholding nothing is not the same as being redundant.
 *
 * An app that has every template line and adds its own is the case an override exists for. Reporting
 * it as `empty` reads as "safe to delete", and deleting it makes drift detection report the path on
 * every run from then on. deeper carried 21 of these into its v3.38.0 upgrade under that heading.
 */
export function assertSupersetIsNotEmpty(assert: Assert): void {
	const [extended] = computeOverrideDeltas({
		appBranding: null,
		classification: NO_CLASSIFICATION,
		overrides: {
			deleted: new Map(),
			keep: new Map(),
			skip: new Map([['backend/src/constants/scheduler.ts', 'adds the app schedule']]),
		} satisfies TemplateOverrides,
		readApp: () => 'shared\nappOwned\n',
		readTemplate: () => 'shared\n',
	});
	assert(
		extended?.status === 'superset',
		`An app copy that adds lines must not report as empty: ${String(extended?.status)}`,
	);
	assert(
		extended?.withheld.length === 0 && extended.appOnly.join(',') === 'appOwned',
		'A superset entry withholds nothing and reports exactly the app-only lines',
	);
}
