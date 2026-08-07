import {
	createReadStream,
	createWriteStream,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

/**
 * Exported so the guard's regression test asserts against the bound this module enforces rather
 * than a copy of it. A restated limit only agrees until one side moves: raising the ratio here
 * would otherwise leave the test pinning the old number and still passing.
 */
export const MAX_DECOMPRESSED_SIZE = 1024 * 1024 * 1024;
export const MAX_COMPRESSION_RATIO = 100;

function compressBackupFile(inputPath: string, outputPath: string): void {
	const data = readFileSync(inputPath);
	const compressed = Bun.gzipSync(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
	writeFileSync(outputPath, compressed);
}

async function decompressBackupFile(inputPath: string, outputPath: string): Promise<void> {
	const compressedSize = statSync(inputPath).size;
	const sizeLimit = Math.min(MAX_DECOMPRESSED_SIZE, compressedSize * MAX_COMPRESSION_RATIO);

	let bytesWritten = 0;
	const sizeGuard = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			bytesWritten += chunk.length;
			if (bytesWritten > sizeLimit) {
				callback(
					new Error(
						`Decompression aborted: output exceeds safe limit ` +
							`(${sizeLimit} bytes, ratio ${MAX_COMPRESSION_RATIO}:1)`,
					),
				);
				return;
			}
			callback(null, chunk);
		},
	});

	try {
		await pipeline(
			createReadStream(inputPath),
			createGunzip(),
			sizeGuard,
			createWriteStream(outputPath),
		);
	} catch (err) {
		// The guard aborts mid-stream, so whatever passed it is already on disk. Callers record the
		// output path only after this resolves, which means nothing downstream knows the partial file
		// exists — a decompression bomb would otherwise leave the guard's own limit worth of bytes in
		// the backup directory on every rejected attempt. Clean it up here, where the path is known.
		try {
			rmSync(outputPath, { force: true });
		} catch {
			// Best effort: the partial output is unusable either way, and the decompression failure
			// below is the error the caller needs to see.
		}
		throw err;
	}
}

export { compressBackupFile, decompressBackupFile };
