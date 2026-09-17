#!/usr/bin/env bun
import { resolve } from 'node:path';

import {
	collectConfiguredSecrets,
	redactText,
	SecretScrubber,
} from './lib/process/secret-scrubber.ts';

const secret = 'line-one\nline-two/token=value';
const escaped = JSON.stringify(secret).slice(1, -1);
const scrubber = new SecretScrubber([secret, escaped]);
const chunks = [
	'password=hunter2\nAuthorization: Bea',
	'rer abc.def.ghi\nexact=line-one\nli',
	'ne-two/token=value\nescaped=line-one\\nline-two/token=value\n',
];
const output =
	chunks.map((chunk) => scrubber.push(Buffer.from(chunk))).join('') + scrubber.finish();
const failures: string[] = [];

for (const leaked of ['hunter2', 'abc.def.ghi', secret, escaped]) {
	if (output.includes(leaked)) failures.push(`output retained ${JSON.stringify(leaked)}`);
}
if ((output.match(/\[REDACTED\]/g) ?? []).length < 4) {
	failures.push(`expected all secret shapes to be redacted: ${JSON.stringify(output)}`);
}
const assignment = redactText('token = split-token-value', []);
if (assignment.includes('split-token-value')) failures.push('token assignment was not redacted');

const encryptionKey = 'e'.repeat(64);
const backupEncryptionKey = 'b'.repeat(64);
const collected = collectConfiguredSecrets(resolve(import.meta.dir, '..'), {
	security: { backupEncryptionKey, encryptionKey },
});
if (!collected.includes(encryptionKey)) failures.push('encryptionKey was not collected');
if (!collected.includes(backupEncryptionKey)) {
	failures.push('backupEncryptionKey was not collected');
}

if (failures.length > 0) {
	console.error('[FAIL] child-output-redaction');
	for (const failure of failures) console.error(` - ${failure}`);
	process.exit(1);
}
console.log(
	'[OK] chunked, multiline, escaped, bearer, assignment, and encryption-key secrets are redacted',
);
