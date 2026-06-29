/**
 * SQL statement handling for migrations: splitting, idempotency rewrites,
 * foreign-key handling, execution, and post-migration integrity checks.
 */
import type { Database } from 'bun:sqlite';

/**
 * Split SQL into statements using drizzle breakpoints.
 * Drizzle uses --> statement-breakpoint as a delimiter.
 */
export function splitStatements(sql: string): string[] {
	return sql
		.split('--> statement-breakpoint')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Make a DDL statement idempotent by adding IF [NOT] EXISTS where applicable.
 * This prevents failures when re-running a partially-applied migration
 * (e.g. after a process crash mid-migration in Docker).
 *
 * NOTE: SQLite DDL statements (CREATE TABLE, ALTER TABLE, DROP TABLE) implicitly
 * commit any pending transaction, so a multi-DDL migration is NOT truly atomic.
 * This function mitigates the risk by making each statement safe to re-run.
 *
 * Handles:
 * - CREATE TABLE -> CREATE TABLE IF NOT EXISTS
 * - CREATE INDEX -> CREATE INDEX IF NOT EXISTS
 * - CREATE UNIQUE INDEX -> CREATE UNIQUE INDEX IF NOT EXISTS
 * - DROP TABLE -> DROP TABLE IF EXISTS
 * - DROP INDEX -> DROP INDEX IF EXISTS
 */
function makeStatementIdempotent(statement: string): string {
	// Skip if already has IF NOT EXISTS or IF EXISTS
	if (/IF\s+(?:NOT\s+)?EXISTS/i.test(statement)) {
		return statement;
	}

	// CREATE TABLE `name` -> CREATE TABLE IF NOT EXISTS `name`
	if (/^CREATE\s+TABLE\s+/i.test(statement)) {
		return statement.replace(/^CREATE\s+TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
	}

	// CREATE UNIQUE INDEX `name` -> CREATE UNIQUE INDEX IF NOT EXISTS `name`
	if (/^CREATE\s+UNIQUE\s+INDEX\s+/i.test(statement)) {
		return statement.replace(
			/^CREATE\s+UNIQUE\s+INDEX\s+/i,
			'CREATE UNIQUE INDEX IF NOT EXISTS '
		);
	}

	// CREATE INDEX `name` -> CREATE INDEX IF NOT EXISTS `name`
	if (/^CREATE\s+INDEX\s+/i.test(statement)) {
		return statement.replace(/^CREATE\s+INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');
	}

	// DROP TABLE `name` -> DROP TABLE IF EXISTS `name`
	if (/^DROP\s+TABLE\s+/i.test(statement)) {
		return statement.replace(/^DROP\s+TABLE\s+/i, 'DROP TABLE IF EXISTS ');
	}

	// DROP INDEX `name` -> DROP INDEX IF EXISTS `name`
	if (/^DROP\s+INDEX\s+/i.test(statement)) {
		return statement.replace(/^DROP\s+INDEX\s+/i, 'DROP INDEX IF EXISTS ');
	}

	return statement;
}

/**
 * Check if an ALTER TABLE ADD COLUMN statement targets a column that already exists.
 * Returns true if the column already exists (statement should be skipped).
 */
function alterColumnExists(db: Database, statement: string): boolean {
	const match = statement.match(
		/^ALTER\s+TABLE\s+[`"']?(\w+)[`"']?\s+ADD\s+(?:COLUMN\s+)?[`"']?(\w+)[`"']?/i
	);
	if (!match) {
		return false;
	}

	const [, tableName, columnName] = match;
	try {
		const columns = db.query<{ name: string }, []>(`PRAGMA table_info(\`${tableName}\`)`).all();
		return columns.some((col) => col.name === columnName);
	} catch {
		return false;
	}
}

/**
 * Disable foreign keys before running migrations that contain the Drizzle
 * table-recreation pattern. Returns true if they were disabled so the caller
 * can restore them afterward.
 */
export function prepareForeignKeys(db: Database, statements: string[]): boolean {
	const hasFkOff = statements.some((s) => /^PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(s));
	if (hasFkOff) {
		db.exec('PRAGMA foreign_keys = OFF');
	}
	return hasFkOff;
}

/** Re-enable foreign keys after a migration that disabled them. No-op otherwise. */
export function restoreForeignKeys(db: Database, wereDisabled: boolean): void {
	if (wereDisabled) {
		db.exec('PRAGMA foreign_keys = ON');
	}
}

/**
 * Execute a migration's statements inside the current transaction. Skips
 * PRAGMA foreign_keys (handled out-of-transaction) and idempotently skips
 * ALTER TABLE ADD COLUMN when the column already exists. Returns the
 * count of statements processed (including skipped ones).
 */
export function executeStatements(db: Database, statements: string[]): number {
	let statementCount = 0;
	for (const statement of statements) {
		if (/^PRAGMA\s+foreign_keys/i.test(statement)) {
			statementCount++;
			continue;
		}
		if (/^ALTER\s+TABLE\s+/i.test(statement) && alterColumnExists(db, statement)) {
			console.log(`    Skipped (already exists): ${statement.substring(0, 80)}...`);
			statementCount++;
			continue;
		}
		try {
			db.exec(makeStatementIdempotent(statement));
			statementCount++;
		} catch (err) {
			console.error(`    Failed statement: ${statement.substring(0, 100)}...`);
			throw err;
		}
	}
	return statementCount;
}

/**
 * Post-migration integrity check. Runs after COMMIT because SQLite DDL
 * statements implicitly commit; a partial failure may leave the database in
 * an inconsistent state that a later ROLLBACK cannot undo, so we detect it
 * early rather than carrying forward.
 */
export function assertPostMigrationIntegrity(db: Database, tag: string): void {
	const integrityResult = db.query('PRAGMA integrity_check').get() as {
		integrity_check: string;
	} | null;
	if (integrityResult?.integrity_check !== 'ok') {
		console.error(
			`    ❌ Integrity check failed after migration ${tag}: ${integrityResult?.integrity_check ?? 'unknown'}`
		);
		throw new Error(`Database integrity check failed after migration ${tag}`);
	}
}
