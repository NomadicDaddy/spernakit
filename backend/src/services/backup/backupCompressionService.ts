import {
	createReadStream,
	createWriteStream,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const MAX_DECOMPRESSED_SIZE = 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

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
							`(${sizeLimit} bytes, ratio ${MAX_COMPRESSION_RATIO}:1)`
					)
				);
				return;
			}
			callback(null, chunk);
		},
	});

	await pipeline(
		createReadStream(inputPath),
		createGunzip(),
		sizeGuard,
		createWriteStream(outputPath)
	);
}

export { compressBackupFile, decompressBackupFile };
