#!/usr/bin/env bun
/**
 * Enforces: every nginx frontend response block emits COOP and CORP, while COEP remains opt-in.
 * No assertion ID; this is the production frontend half of the security-header contract.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exit } from 'node:process';

import { nginxSecurityFindings } from './lib/nginx-security.ts';

export function runNginxSecurity(root = process.cwd()): number {
	const findings = nginxSecurityFindings(
		readFileSync(resolve(root, 'docker', 'nginx.conf'), 'utf8'),
	);
	if (findings.length > 0) {
		for (const finding of findings) console.error(`- docker/nginx.conf ${finding}`);
		console.log(`[FAIL] check:nginx-security -- ${findings.length} policy gap(s)`);
		return 1;
	}
	console.log('[OK] check:nginx-security -- 6 frontend response blocks retain COOP/CORP policy');
	return 0;
}

if (import.meta.main) exit(runNginxSecurity());
