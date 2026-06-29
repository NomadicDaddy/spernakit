/**
 * HTTP compression probe and colored logging helpers.
 *
 * Extracted from scripts/verify-compression.ts (max-lines split).
 */
import http from 'node:http';
import https from 'node:https';

// ANSI color codes
const colors: Record<string, string> = {
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	reset: '\x1b[0m',
	yellow: '\x1b[33m',
};

export function log(message: string, color = 'reset'): void {
	console.log(`${colors[color] ?? colors['reset']}${message}${colors['reset']}`);
}

export function logSuccess(message: string): void {
	log(`✓ ${message}`, 'green');
}

export function logError(message: string): void {
	log(`✗ ${message}`, 'red');
}

export function logWarning(message: string): void {
	log(`⚠ ${message}`, 'yellow');
}

export function logInfo(message: string): void {
	log(`ℹ ${message}`, 'cyan');
}

export type ProbeOutcome = { contentEncoding?: string; reachable: true } | { reachable: false };

/**
 * Probe a single URL and report whether it was reachable plus any Content-Encoding header.
 */
export async function probeCompression(probeUrl: URL): Promise<ProbeOutcome> {
	return new Promise((resolve) => {
		const protocol = probeUrl.protocol === 'https:' ? https : http;

		const options: http.RequestOptions = {
			headers: {
				'Accept-Encoding': 'gzip, deflate, br',
			},
			hostname: probeUrl.hostname,
			method: 'GET',
			path: probeUrl.pathname,
			port: probeUrl.port,
		};

		logInfo(`Testing: ${probeUrl.href}`);

		const req = protocol.request(options, (res) => {
			const rawEncoding = res.headers['content-encoding'];
			const contentEncoding = typeof rawEncoding === 'string' ? rawEncoding : undefined;
			const contentLength = res.headers['content-length'];

			if (contentLength) {
				logInfo(`Content-Length: ${contentLength} bytes`);
			}

			let data = '';
			res.on('data', (chunk: Buffer) => {
				data += chunk.toString();
			});

			res.on('end', () => {
				const actualSize = Buffer.byteLength(data);
				logInfo(`Actual response size: ${actualSize} bytes`);

				if (contentEncoding && contentLength) {
					const ratio = ((1 - parseInt(contentLength, 10) / actualSize) * 100).toFixed(1);
					logInfo(`Compression ratio: ${ratio}%`);
				}

				resolve(
					contentEncoding ? { contentEncoding, reachable: true } : { reachable: true }
				);
			});
		});

		req.on('error', (error: Error) => {
			logWarning(`${probeUrl.href} unreachable: ${error.message}`);
			resolve({ reachable: false });
		});

		req.end();
	});
}
