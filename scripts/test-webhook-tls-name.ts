#!/usr/bin/env bun
/**
 * Regression coverage for the certificate name an alert webhook is verified against.
 *
 * An alert webhook is sent to the IP address that passed the SSRF check, with the original name in
 * the Host header, so a second DNS answer cannot redirect it. Nothing told the TLS layer which
 * name to verify, so it verified the IP, which no public certificate names, and every HTTPS
 * webhook to a hostname failed with a certificate error.
 *
 * This gate runs offline. It holds that the name handed to TLS is the configured hostname exactly
 * when the request is pinned and HTTPS, and that the request really carries it. The end-to-end
 * behaviour needs a certificate a public authority signed, so it was measured by hand against a
 * real host when the fix landed rather than in this gate.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tlsServerName } from '../backend/src/services/notification/alertWebhook.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures: string[] = [];
let checks = 0;

function equal(actual: unknown, expected: unknown, message: string): void {
	checks += 1;
	if (actual !== expected) {
		failures.push(`${message}: expected ${String(expected)}, got ${String(actual)}`);
	}
}

equal(
	tlsServerName('https://hooks.example.com/services/abc', true),
	'hooks.example.com',
	'A pinned HTTPS webhook is verified against its hostname',
);
equal(
	tlsServerName('https://hooks.example.com:8443/x', true),
	'hooks.example.com',
	'The port is not part of the name',
);
equal(
	tlsServerName('http://hooks.example.com/x', true),
	undefined,
	'A plain HTTP webhook has no certificate to verify',
);
equal(
	tlsServerName('https://203.0.113.10/x', false),
	undefined,
	'A webhook configured as an IP is not rewritten, so the default check applies',
);

const source = readFileSync(
	join(repoRoot, 'backend', 'src', 'services', 'notification', 'alertWebhook.ts'),
	'utf8',
);
equal(
	/tls:\s*\{\s*serverName\s*\}/.test(source),
	true,
	'The webhook request must pass the server name to TLS',
);
equal(
	/tlsServerName\(alerting\.webhook\.url, validation\.originalHost !== undefined\)/.test(source),
	true,
	'The sender must derive the name from the configured URL and whether it was pinned',
);

if (failures.length === 0) {
	console.log(`Webhook TLS name checks passed (${String(checks)} assertions).`);
} else {
	console.error('[FAIL] Webhook TLS name regression:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}
