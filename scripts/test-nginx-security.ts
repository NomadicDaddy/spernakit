#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { nginxSecurityFindings } from './lib/nginx-security.ts';

const source = readFileSync(resolve('docker', 'nginx.conf'), 'utf8');
if (nginxSecurityFindings(source).length > 0) throw new Error('Real nginx policy is incomplete');
const missingCorp = source.replace(
	'add_header Cross-Origin-Resource-Policy same-origin always;',
	'# removed by regression fixture',
);
if (
	!nginxSecurityFindings(missingCorp).some(
		(finding) => finding.includes('CORP') || finding.includes('Resource'),
	)
) {
	throw new Error('Checker accepted a frontend block without CORP');
}
const forcedCoep = source.replace(
	'add_header Cross-Origin-Opener-Policy same-origin always;',
	'add_header Cross-Origin-Opener-Policy same-origin always;\n            add_header Cross-Origin-Embedder-Policy require-corp always;',
);
if (!nginxSecurityFindings(forcedCoep).some((finding) => finding.includes('COEP'))) {
	throw new Error('Checker accepted unconditional COEP');
}
console.log('[OK] nginx security policy fails closed for missing COOP/CORP and forced COEP');
