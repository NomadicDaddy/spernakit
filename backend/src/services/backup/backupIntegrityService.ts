import { Database } from 'bun:sqlite';

interface IntegrityCheckResult {
	durationMs: number;
	healthy: boolean;
	message: string;
}

/**
 * Verify database integrity using SQLite PRAGMA.
 *
 * @param dbPath - Path to database file to verify
 * @param mode - Check mode: 'quick' for fast basic validation, 'full' for thorough check
 * @returns Object with healthy status, message, and duration
 */
export function verifyDatabaseIntegrity(
	dbPath: string,
	mode: 'full' | 'quick' = 'quick'
): IntegrityCheckResult {
	const startTime = performance.now();
	try {
		const db = new Database(dbPath, { readonly: true });
		const pragma = mode === 'quick' ? 'PRAGMA quick_check' : 'PRAGMA integrity_check';
		const result = db.query<Record<string, string>, []>(pragma).get();
		db.close();

		const durationMs = Math.round(performance.now() - startTime);
		// PRAGMA quick_check returns column "quick_check", integrity_check returns "integrity_check"
		const value = result ? Object.values(result)[0] : undefined;
		const isHealthy = value === 'ok';
		return {
			durationMs,
			healthy: isHealthy,
			message: value ?? 'No result from integrity check',
		};
	} catch (err) {
		const durationMs = Math.round(performance.now() - startTime);
		return {
			durationMs,
			healthy: false,
			message: err instanceof Error ? err.message : 'Unknown error during integrity check',
		};
	}
}
