import http from 'node:http';
import https from 'node:https';
import { promisify } from 'node:util';
import { brotliDecompress, gunzip } from 'node:zlib';

const brotli = promisify(brotliDecompress);
const unzip = promisify(gunzip);
const colors: Record<string, string> = {
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	reset: '\x1b[0m',
	yellow: '\x1b[33m',
};

interface ProbeResult {
	body: Buffer;
	cacheControl?: string | undefined;
	compressedBytes: number;
	contentEncoding?: string | undefined;
	contentType?: string | undefined;
	crossOriginOpenerPolicy?: string | undefined;
	crossOriginResourcePolicy?: string | undefined;
	decodedBytes: number;
	ratio: number;
	reachable: true;
	status: number;
}
type ProbeOutcome = { reachable: false } | ProbeResult;
type StaticResourceKind = 'css' | 'html' | 'javascript' | 'source-map';

function log(message: string, color = 'reset'): void {
	console.log(`${colors[color] ?? colors['reset']}${message}${colors['reset']}`);
}
const logSuccess = (message: string): void => log(`✓ ${message}`, 'green');
const logError = (message: string): void => log(`✗ ${message}`, 'red');
const logWarning = (message: string): void => log(`⚠ ${message}`, 'yellow');
const logInfo = (message: string): void => log(`ℹ ${message}`, 'cyan');

async function decodeBody(body: Buffer, encoding?: string): Promise<Buffer> {
	if (!encoding || encoding === 'identity') return body;
	if (encoding === 'gzip') return unzip(body);
	if (encoding === 'br') return brotli(body);
	throw new Error(`Unsupported Content-Encoding: ${encoding}`);
}

function stringHeader(value: string | string[] | undefined): string | undefined {
	return typeof value === 'string' ? value : value?.[0];
}

/** Probe a URL while preserving compressed response chunks as bytes until explicit decoding. */
async function probeCompression(probeUrl: URL): Promise<ProbeOutcome> {
	return new Promise((resolve) => {
		const protocol = probeUrl.protocol === 'https:' ? https : http;
		logInfo(`Testing: ${probeUrl.href}`);
		const req = protocol.request(
			{
				headers: { 'Accept-Encoding': 'br, gzip' },
				hostname: probeUrl.hostname,
				method: 'GET',
				path: `${probeUrl.pathname}${probeUrl.search}`,
				port: probeUrl.port,
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
				res.on('end', async () => {
					try {
						const body = Buffer.concat(chunks);
						const contentEncoding = stringHeader(res.headers['content-encoding']);
						const decoded = await decodeBody(body, contentEncoding);
						const ratio = decoded.length === 0 ? 0 : 1 - body.length / decoded.length;
						const result: ProbeResult = {
							body: decoded,
							cacheControl: stringHeader(res.headers['cache-control']),
							compressedBytes: body.length,
							contentEncoding,
							contentType: stringHeader(res.headers['content-type']),
							crossOriginOpenerPolicy: stringHeader(
								res.headers['cross-origin-opener-policy'],
							),
							crossOriginResourcePolicy: stringHeader(
								res.headers['cross-origin-resource-policy'],
							),
							decodedBytes: decoded.length,
							ratio,
							reachable: true,
							status: res.statusCode ?? 0,
						};
						logInfo(
							`status=${result.status} encoding=${contentEncoding ?? 'identity'} ` +
								`type=${result.contentType ?? 'none'} cache=${result.cacheControl ?? 'none'} ` +
								`compressed=${body.length} decoded=${decoded.length} ratio=${(ratio * 100).toFixed(1)}%`,
						);
						resolve(result);
					} catch (err) {
						logWarning(
							`${probeUrl.href} could not be decoded: ${(err as Error).message}`,
						);
						resolve({ reachable: false });
					}
				});
			},
		);
		req.on('error', (error) => {
			logWarning(`${probeUrl.href} unreachable: ${error.message}`);
			resolve({ reachable: false });
		});
		req.end();
	});
}

function staticDeliveryFindings(kind: StaticResourceKind, result: ProbeResult): string[] {
	const findings: string[] = [];
	if (result.crossOriginOpenerPolicy !== 'same-origin') findings.push('COOP');
	if (result.crossOriginResourcePolicy !== 'same-origin') findings.push('CORP');
	if (kind === 'source-map') {
		if (result.status !== 403 && result.status !== 404) findings.push('source-map status');
		return findings;
	}
	if (result.status !== 200) findings.push('status');
	const expectedType =
		kind === 'html' ? /^text\/html\b/i : kind === 'css' ? /^text\/css\b/i : /javascript/i;
	if (!expectedType.test(result.contentType ?? '')) findings.push('Content-Type');
	const expectedCache = kind === 'html' ? 'no-cache' : 'immutable';
	if (!result.cacheControl?.includes(expectedCache)) findings.push('Cache-Control');
	if (
		result.decodedBytes >= 1024 &&
		(!result.contentEncoding || result.compressedBytes >= result.decodedBytes)
	) {
		findings.push('compression savings');
	}
	return findings;
}

export {
	decodeBody,
	log,
	logError,
	logInfo,
	logSuccess,
	logWarning,
	probeCompression,
	staticDeliveryFindings,
};
export type { ProbeOutcome, ProbeResult, StaticResourceKind };
