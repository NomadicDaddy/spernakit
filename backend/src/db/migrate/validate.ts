import { type Database } from 'bun:sqlite';

function validateDatabaseIntegrity(db: Database): string[] {
	const errors: string[] = [];

	const integrityResult = db
		.query<{ integrity_check: string }, []>('PRAGMA integrity_check')
		.all();
	for (const row of integrityResult) {
		if (row.integrity_check !== 'ok') {
			errors.push(`Integrity check failed: ${row.integrity_check}`);
		}
	}

	const fkResult = db.query<{ foreign_key_check: string }, []>('PRAGMA foreign_key_check').all();
	if (fkResult.length > 0) {
		errors.push(`Foreign key constraint violations found: ${fkResult.length} row(s)`);
	}

	return errors;
}

export { validateDatabaseIntegrity };
