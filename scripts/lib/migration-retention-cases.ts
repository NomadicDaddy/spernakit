/**
 * Cases 11 and 12 of scripts/test-migration-runner-safety.ts: retention of the CLI runner's
 * pre-migration backups (scripts/lib/migrate/backups.ts). Kept in their own module so the gate
 * stays under the 300-line cap.
 */
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { prunePreMigrateBackups } from './migrate/backups.ts';
import {
	type ApplyModule,
	BASE_SQL,
	tempRoot,
	writeMigrations,
} from './migration-safety-fixtures.ts';

type Assert = (condition: boolean, message: string) => void;

/**
 * 11. A migrating run keeps the newest five timestamped pre-migration backups, of both the
 * runner's and the old entrypoint's naming, and leaves the startup runner's fixed-name backup and
 * unrelated files alone.
 */
export function retentionCase(cli: ApplyModule, assert: Assert): void {
	const paths = writeMigrations(tempRoot('retention'), { '0001_base': BASE_SQL });
	const dir = dirname(paths.database);
	const old = [
		'test.db.pre-migrate-2026-01-01T00-00-00-000Z.bak',
		'test.db.pre-migrate.20260102000000.bak',
		'test.db.pre-migrate-2026-01-03T00-00-00-000Z.bak',
		'test.db.pre-migrate.20260104000000.bak',
		'test.db.pre-migrate-2026-01-05T00-00-00-000Z.bak',
		'test.db.pre-migrate.20260106000000.bak',
		'test.db.pre-migrate-2026-01-07T00-00-00-000Z.bak',
	];
	const untouched = ['test.db.pre-migrate.bak', 'test.db.other.bak'];
	old.forEach((name, day) => {
		const file = join(dir, name);
		writeFileSync(file, 'old backup');
		const when = new Date(Date.UTC(2026, 0, day + 1));
		utimesSync(file, when, when);
	});
	for (const name of untouched) writeFileSync(join(dir, name), 'keep');
	cli.runMigrations(paths);

	const timestamped = readdirSync(dir).filter(
		(name) => /\.pre-migrate[.-].+\.bak$/.test(name) && name !== 'test.db.pre-migrate.bak',
	);
	assert(
		timestamped.length === 5,
		`11: five backups should remain, got ${timestamped.join(', ')}`,
	);
	assert(
		old.slice(3).every((name) => timestamped.includes(name)),
		`11: the four newest old backups should be kept, got ${timestamped.join(', ')}`,
	);
	assert(
		untouched.every((name) => existsSync(join(dir, name))),
		"11: the startup runner's backup and unrelated files must be left alone",
	);
}

/** 12. The just-taken backup always survives, and an unlistable directory never throws. */
export function retentionGuardsCase(assert: Assert): void {
	const dir = tempRoot('retention-guards');
	const database = join(dir, 'test.db');
	const names = [1, 2, 3, 4, 5, 6].map(
		(day) => `test.db.pre-migrate-2026-02-0${String(day)}T00-00-00-000Z.bak`,
	);
	names.forEach((name, index) => {
		const file = join(dir, name);
		writeFileSync(file, 'backup');
		// The first one is the run's own backup, dated oldest as if the clock had gone back.
		const when = new Date(Date.UTC(2026, 1, index + 1));
		utimesSync(file, when, when);
	});
	// A directory that matches the name pattern, dated newest, must not take a backup's slot.
	const impostor = join(dir, 'test.db.pre-migrate-2026-03-01T00-00-00-000Z.bak');
	mkdirSync(impostor);
	const current = join(dir, names[0] ?? '');
	prunePreMigrateBackups(database, current);
	assert(existsSync(current), '12: the backup the run just took must never be pruned');
	const left = readdirSync(dir).filter(
		(name) => name.endsWith('.bak') && join(dir, name) !== impostor,
	);
	assert(left.length === 5, `12: five real backups should remain, got ${left.join(', ')}`);
	assert(existsSync(impostor), '12: a matching directory is not a backup and is left alone');

	let threw = false;
	try {
		prunePreMigrateBackups(
			join(dir, 'missing-dir', 'test.db'),
			join(dir, 'missing-dir', 'x.bak'),
		);
	} catch {
		threw = true;
	}
	assert(!threw, '12: an unlistable directory must not throw');
}
