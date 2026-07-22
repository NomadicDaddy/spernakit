#!/usr/bin/env bun
/**
 * Clear Logs Script
 *
 * Removes all .log and .pid files from the logs/ directory.
 * Used by smoke:dev to ensure a clean slate before starting services.
 *
 * Usage:
 *   bun scripts/clear-logs.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const logsDir = path.resolve(import.meta.dirname, '..', 'logs');

if (!fs.existsSync(logsDir)) {
	console.log('   No logs/ directory found — nothing to clear.');
	process.exit(0);
}

const files = fs.readdirSync(logsDir);
let removed = 0;

for (const file of files) {
	if (file.endsWith('.log') || file.endsWith('.pid')) {
		fs.unlinkSync(path.join(logsDir, file));
		removed++;
	}
}

console.log(`   Cleared ${removed} log/pid file${removed !== 1 ? 's' : ''} from logs/`);
