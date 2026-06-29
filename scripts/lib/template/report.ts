/**
 * Human-readable reporting for the template drift checker.
 *
 * Extracted from check-template-drift.ts so the entry script stays under the
 * 300-line gate. `printReport` renders the per-category summary and returns the
 * failing drift count (pure/branded drift + security-infrastructure drift +
 * missing files); advisory `infrastructure` drift is reported as a non-failing
 * WARNING and excluded from the total.
 */
import type { FileResult } from './types.ts';

const countByStatus = (items: FileResult[], status: FileResult['status']): number =>
	items.filter((r) => r.status === status).length;

const pad = (n: number, width: number): string => String(n).padStart(width);

/** Render the count block for one classification category. */
function printCategoryCounts(
	heading: string,
	items: FileResult[],
	identicalLabel: string,
	driftedLabel: string
): void {
	const checked = items.filter((r) => r.status !== 'missing-in-template').length;
	console.log(`   ${heading} (${checked} checked)`);
	const identical = countByStatus(items, 'identical');
	const drifted = countByStatus(items, 'drifted');
	const missing = countByStatus(items, 'missing-in-app');
	const suppressed = countByStatus(items, 'suppressed');
	console.log(`     ${pad(identical, 3)} ${identicalLabel}`);
	if (drifted > 0) console.log(`     ${pad(drifted, 3)} ${driftedLabel}`);
	if (missing > 0) console.log(`     ${pad(missing, 3)} missing`);
	if (suppressed > 0) console.log(`     ${pad(suppressed, 3)} suppressed`);
	console.log('');
}

/** List a set of result files with a trailing parenthetical label. */
function printFileList(results: FileResult[], label: (r: FileResult) => string): void {
	for (const r of results) {
		console.log(`     ${r.filePath.padEnd(40)} (${label(r)})`);
	}
}

export function printReport(results: FileResult[], version: string): number {
	const pure = results.filter((r) => r.category === 'pure');
	const branded = results.filter((r) => r.category === 'branded');
	const infra = results.filter((r) => r.category === 'infrastructure');
	const security = results.filter((r) => r.category === 'security-infrastructure');

	console.log(`Template Drift Report (spernakit v${version})`);
	console.log('');

	printCategoryCounts('Pure Template Files', pure, 'identical', 'drifted');
	printCategoryCounts('Branded Files', branded, 'identical (after normalization)', 'drifted');
	printCategoryCounts(
		'Infrastructure Files',
		infra,
		'match baseline',
		'have domain customizations'
	);
	// Security-infrastructure files (auth routes, security config, create-api-app).
	// Unlike advisory infrastructure drift, drift or removal here FAILS the gate.
	printCategoryCounts(
		'Security-Infrastructure Files',
		security,
		'match baseline',
		'drifted (failing)'
	);

	// Detail sections
	const drifted = results.filter(
		(r) =>
			r.status === 'drifted' &&
			r.category !== 'infrastructure' &&
			r.category !== 'security-infrastructure'
	);
	const securityDriftedFiles = security.filter((r) => r.status === 'drifted');
	const securityMissingFiles = security.filter((r) => r.status === 'missing-in-app');
	const infraDriftedFiles = infra.filter((r) => r.status === 'drifted');
	const missing = results.filter((r) => r.status === 'missing-in-app');

	if (drifted.length > 0) {
		console.log('   Drifted files:');
		printFileList(drifted, (r) =>
			r.category === 'pure'
				? `${r.category} — should match template`
				: `${r.category} — differs beyond branding`
		);
		console.log('');
	}

	// Security-infrastructure drift/removal is a hard failure: a gutted or
	// materially altered auth route, security config schema, or create-api-app
	// in a derived app must break the gate. Intentional customizations have to
	// be acknowledged explicitly via .templateoverrides (they surface as
	// 'suppressed', not as failures).
	if (securityDriftedFiles.length > 0 || securityMissingFiles.length > 0) {
		console.log(
			`   SECURITY DRIFT (${securityDriftedFiles.length + securityMissingFiles.length} file(s), FAILING):`
		);
		printFileList(
			securityDriftedFiles,
			() => 'security-infrastructure — differs from baseline'
		);
		printFileList(securityMissingFiles, () => 'security-infrastructure — missing in app');
		console.log('     Restore the template baseline, or acknowledge an intentional');
		console.log('     change via .templateoverrides (SKIP/KEEP) to suppress it.');
		console.log('');
	}

	// Infrastructure drift is expected to carry domain customizations, so it
	// does not fail the check — but it must stay visible so intentional and
	// accidental divergence from the template baseline can be told apart.
	if (infraDriftedFiles.length > 0) {
		console.log(
			`   WARNING: Infrastructure drift (${infraDriftedFiles.length} file(s), not failing):`
		);
		printFileList(infraDriftedFiles, () => 'infrastructure — differs from baseline');
		console.log('     Review these when upgrading the template version.');
		console.log('');
	}

	// Security-infrastructure misses are already reported (and counted) under
	// the SECURITY DRIFT banner above; list the rest here.
	const otherMissing = missing.filter((r) => r.category !== 'security-infrastructure');
	if (otherMissing.length > 0) {
		console.log('   Missing files:');
		printFileList(otherMissing, () => 'exists in template but not in app');
		console.log('');
	}

	const suppressed = results.filter((r) => r.status === 'suppressed');
	if (suppressed.length > 0) {
		console.log(`   Suppressed (${suppressed.length}, per .templateoverrides):`);
		for (const r of suppressed) {
			const action = r.suppression?.action ?? 'SKIP';
			const reason = r.suppression?.reason ?? '';
			const tail = reason ? ` — ${reason}` : '';
			console.log(`     ${r.filePath.padEnd(40)} [${action}]${tail}`);
		}
		console.log('');
	}

	// Failing total: pure/branded drift + security-infrastructure drift +
	// all missing files (missing already includes security-infrastructure
	// misses). Advisory infrastructure drift is intentionally excluded.
	const totalDrift = drifted.length + securityDriftedFiles.length + missing.length;
	if (totalDrift === 0) {
		console.log('   No template drift detected.');
	} else {
		console.log(`   ${totalDrift} file(s) need attention.`);
		console.log('   Run /template-refactor to review and fix drift.');
	}
	return totalDrift;
}
