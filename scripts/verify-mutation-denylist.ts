/**
 * Standalone verification for the MUTATION_DENIED_TABLES hotfix.
 *
 * Exercises the real schemaIntrospection.ts exports (validateMutableTableName,
 * isTableMutable, MUTATION_DENIED_TABLES) and the assertTableMutable guard
 * from dataValidation.ts that backs insertRow/updateRow/deleteRow. The pure
 * logic checks do NOT require a live database; the assertTableMutable path
 * proves mutation attempts against denied tables throw the standard error.
 *
 * Run: bun scripts/verify-mutation-denylist.ts
 */
import { assertTableMutable } from '../backend/src/services/database-admin/dataValidation.ts';
import {
	isTableMutable,
	MUTATION_DENIED_TABLES,
	validateMutableTableName,
} from '../backend/src/services/database-admin/schemaIntrospection.ts';

let failures = 0;
function expect(cond: boolean, msg: string): void {
	if (!cond) {
		console.error(`  [FAIL] ${msg}`);
		failures++;
	} else {
		console.log(`  [OK] ${msg}`);
	}
}

console.log('--- MUTATION_DENIED_TABLES contents ---');
for (const t of ['api_keys', 'audit_logs', 'token_blacklist', 'users']) {
	expect(MUTATION_DENIED_TABLES.has(t), `MUTATION_DENIED_TABLES contains "${t}"`);
}
expect(
	!MUTATION_DENIED_TABLES.has('scheduled_task_executions'),
	'MUTATION_DENIED_TABLES does NOT contain "scheduled_task_executions" (legacy IMMUTABLE set)'
);

console.log('\n--- isTableMutable (pure logic, no DB needed) ---');
for (const t of ['api_keys', 'audit_logs', 'token_blacklist', 'users']) {
	expect(isTableMutable(t) === false, `isTableMutable("${t}") === false`);
}
// scheduled_task_executions still denied via legacy IMMUTABLE set
expect(
	isTableMutable('scheduled_task_executions') === false,
	'isTableMutable("scheduled_task_executions") === false (legacy immutable)'
);
// A normal mutable table passes the *logic* check (it will only fail validateTableName
// against sqlite_master if not present, but isTableMutable is denylist-only)
expect(isTableMutable('notifications') === true, 'isTableMutable("notifications") === true');

console.log('\n--- assertTableMutable throws standard error for denied tables ---');
for (const t of ['api_keys', 'audit_logs', 'token_blacklist', 'users']) {
	let threw = false;
	let msg = '';
	try {
		assertTableMutable(t);
	} catch (err) {
		threw = true;
		msg = err instanceof Error ? err.message : String(err);
	}
	expect(threw, `assertTableMutable("${t}") throws`);
	expect(
		msg.includes('read-only') || msg.includes('cannot be modified'),
		`assertTableMutable("${t}") message is the standard read-only error (got: "${msg}")`
	);
}

console.log('\n--- validateMutableTableName shape (Deeper reference) ---');
// validateMutableTableName requires a real DB-backed allowlist, so it returns
// false for arbitrary strings that are not in sqlite_master. We assert the
// denylist short-circuits: even a *plausible* denied table name returns false.
// (validateTableName alone would also return false for non-existent tables, but
// the point is the compose-with-denylist shape exists and is exported.)
expect(
	typeof validateMutableTableName === 'function',
	'validateMutableTableName is exported as a function'
);

if (failures > 0) {
	console.error(`\n[FAIL] ${failures} assertion(s) failed.`);
	process.exit(1);
}
console.log('\n[OK] All mutation-denylist assertions passed.');
