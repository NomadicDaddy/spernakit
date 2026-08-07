#!/usr/bin/env bun
/**
 * Regression test for the backup decompression guard in
 * `backend/src/services/backup/backupCompressionService.ts`.
 *
 * The guard caps a restore's decompressed output at the SMALLER of a 1 GiB absolute ceiling and
 * `compressedSize * MAX_COMPRESSION_RATIO`, so a crafted archive cannot fill the disk on its way
 * through a restore. Two properties matter and neither is visible from the type system: the guard
 * has to fire on the ratio (not just the ceiling), and the aborted attempt has to leave nothing
 * behind — `prepareForRestore` learns the output path only after decompression resolves, so a
 * partial file orphaned here is a partial file nobody ever deletes.
 *
 * Also pinned here: the `spernakit-backup-encryption` HKDF info string. That literal looks like
 * branding and its file is listed in the `branded` set of `scripts/template-manifest.json`, so the
 * drift tooling's branding normalizer runs over it. It is not branding — it is key-derivation
 * input, and rebranding it in a derived app would change every derived key and make that app's
 * existing backups undecryptable.
 *
 * Fixtures live under `<repo>/tmp/`, which is gitignored, so a crashed run leaves nothing tracked.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

import {
	compressBackupFile,
	decompressBackupFile,
	MAX_COMPRESSION_RATIO,
	MAX_DECOMPRESSED_SIZE,
} from '../backend/src/services/backup/backupCompressionService.ts';
import { normalizeBranding } from './lib/template/branding.ts';
import { type BrandingValues, TEMPLATE_BRANDING } from './lib/template/types.ts';

/**
 * Both bounds come from the service rather than being restated here. They used to be local copies
 * under comments saying they mirrored it, which holds only until one side changes: a raised ratio
 * would have left this file sizing its bomb against the old bound and reporting a pass.
 */
const EXPECTED_RATIO = MAX_COMPRESSION_RATIO;
const EXPECTED_CEILING = MAX_DECOMPRESSED_SIZE;

/**
 * The HKDF info string stays written out here on purpose. This is the one value the test must NOT
 * import: the assertions below read the service's source text and check that this literal is in it
 * and survives branding normalization, so importing the constant would compare the file with
 * itself and pass no matter what the file said.
 */
const HKDF_INFO = 'spernakit-backup-encryption';
const ENCRYPTION_SERVICE = 'backend/src/services/backup/backupEncryptionService.ts';

/**
 * A payload that is both enormously compressible and instantly recognizable, so the ratio branch
 * of the guard fires and the abort message can be checked for archive-content leakage.
 */
const BOMB_MARKER = 'CONFIDENTIAL-BACKUP-PAYLOAD-';
const BOMB_PAYLOAD = BOMB_MARKER.repeat(200_000);

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

/**
 * Deterministic, near-incompressible filler standing in for the page data of a real SQLite backup.
 * A repetitive placeholder would gzip past 100:1 and trip the guard, quietly turning the
 * happy-path case into a second copy of the rejection case.
 *
 * @param length - Byte count to generate.
 * @returns Pseudo-random bytes from a fixed seed, identical on every run.
 */
function pseudoRandomBytes(length: number): Uint8Array {
	const out = new Uint8Array(length);
	let state = 0x2545f491;
	for (let i = 0; i < length; i++) {
		state = (state * 1664525 + 1013904223) >>> 0;
		out[i] = (state >>> 24) & 0xff;
	}
	return out;
}

/**
 * Drive a decompression that is expected to fail and hand back its error message.
 *
 * @param inputPath - Archive to decompress.
 * @param outputPath - Destination the guard must not leave behind.
 * @returns The rejection message.
 */
async function expectRejection(inputPath: string, outputPath: string): Promise<string> {
	try {
		await decompressBackupFile(inputPath, outputPath);
	} catch (err) {
		return err instanceof Error ? err.message : String(err);
	}
	throw new Error(`decompressBackupFile resolved for ${inputPath} but was expected to reject`);
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'backup-compression-'));

const fixture = (name: string): string => join(fixtureRoot, name);

try {
	// 1. A normal backup round-trips byte-for-byte. The guard must not interfere with real restores.
	const plainSource = fixture('plain.db');
	const plainContents = Buffer.concat([
		Buffer.from('SQLite format 3'),
		Buffer.from(pseudoRandomBytes(64 * 1024)),
	]);
	writeFileSync(plainSource, plainContents);

	const plainArchive = fixture('plain.db.gz');
	compressBackupFile(plainSource, plainArchive);
	const plainRestored = fixture('plain.restored.db');
	await decompressBackupFile(plainArchive, plainRestored);
	assert(existsSync(plainRestored), 'A normal archive must produce its decompressed output');
	assert(
		plainContents.equals(readFileSync(plainRestored)),
		'A normal archive must round-trip byte-for-byte through compress/decompress',
	);

	// 2. A high-ratio archive is rejected, and the fixture really does exceed the ratio (a payload
	//    that happened to compress poorly would make the rest of this block pass vacuously).
	const bombSource = fixture('bomb.db');
	writeFileSync(bombSource, BOMB_PAYLOAD);
	const bombArchive = fixture('bomb.db.gz');
	compressBackupFile(bombSource, bombArchive);

	const compressedSize = readFileSync(bombArchive).byteLength;
	const effectiveLimit = Math.min(EXPECTED_CEILING, compressedSize * EXPECTED_RATIO);
	assert(
		effectiveLimit < BOMB_PAYLOAD.length,
		`Fixture does not exceed the guard: limit ${effectiveLimit} >= payload ${BOMB_PAYLOAD.length}`,
	);
	assert(
		effectiveLimit < EXPECTED_CEILING,
		'Fixture must exercise the ratio branch, not the 1 GiB ceiling',
	);

	const bombOutput = fixture('bomb.restored.db');
	const abortMessage = await expectRejection(bombArchive, bombOutput);

	// 3. The abort names the effective limit and the ratio, and nothing else.
	assert(
		abortMessage.includes(`${effectiveLimit} bytes`),
		`Abort message must name the effective byte limit ${effectiveLimit}: ${abortMessage}`,
	);
	assert(
		abortMessage.includes(`ratio ${EXPECTED_RATIO}:1`),
		`Abort message must name the compression ratio: ${abortMessage}`,
	);
	assert(!abortMessage.includes(BOMB_MARKER), 'Abort message must not echo archive contents');
	assert(
		!abortMessage.includes(fixtureRoot) && !abortMessage.includes(bombOutput),
		'Abort message must not disclose filesystem paths',
	);

	// 4. The rejected attempt leaves nothing on disk. This is the whole point: the caller never
	//    learns this path when decompression throws, so the service is the only place that can.
	assert(
		!existsSync(bombOutput),
		'A rejected decompression must remove its partial output before returning',
	);

	// 5. The same cleanup contract holds for a failure the guard never sees. A corrupt archive
	//    fails inside gunzip, on a path that predates the guard entirely.
	const corruptArchive = fixture('corrupt.db.gz');
	writeFileSync(corruptArchive, 'this is not gzip data, not even close');
	const corruptOutput = fixture('corrupt.restored.db');
	const corruptMessage = await expectRejection(corruptArchive, corruptOutput);
	assert(corruptMessage.length > 0, 'A corrupt archive must reject with a message');
	assert(
		!existsSync(corruptOutput),
		'A corrupt archive must not leave its partial output behind',
	);

	// 6. The HKDF info string is intact in the source, and survives branding normalization under
	//    both the template's own branding and a derived app's.
	const encryptionSource = readFileSync(join(repoRoot, ENCRYPTION_SERVICE), 'utf8');
	assert(
		encryptionSource.includes(`'${HKDF_INFO}'`),
		`${ENCRYPTION_SERVICE} must still derive backup keys with the '${HKDF_INFO}' info string`,
	);

	const derivedBranding: BrandingValues = {
		backendPort: '4001',
		description: 'A derived application',
		frontendPort: '4000',
		name: 'Derived App',
		slug: 'derivedapp',
	};
	for (const branding of [TEMPLATE_BRANDING, derivedBranding]) {
		const normalized = normalizeBranding(encryptionSource, branding, ENCRYPTION_SERVICE);
		assert(
			normalized.includes(HKDF_INFO),
			`Branding normalization for slug '${branding.slug}' must leave '${HKDF_INFO}' alone`,
		);
	}

	console.log(`Backup compression guard regression test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
