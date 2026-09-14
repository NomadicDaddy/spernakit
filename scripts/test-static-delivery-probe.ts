#!/usr/bin/env bun
import { brotliCompressSync, gzipSync } from 'node:zlib';

import type { ProbeResult, StaticResourceKind } from './lib/compression-probe.ts';

import { decodeBody, staticDeliveryFindings } from './lib/compression-probe.ts';

const source = Buffer.from('binary\0payload\u0001'.repeat(200));
const gzip = gzipSync(source);
const brotli = brotliCompressSync(source);
const decodedGzip = await decodeBody(gzip, 'gzip');
const decodedBrotli = await decodeBody(brotli, 'br');
if (!decodedGzip.equals(source) || !decodedBrotli.equals(source)) {
	throw new Error('Binary compression bodies did not round-trip byte-for-byte');
}
if (!(gzip.length < source.length && brotli.length < source.length)) {
	throw new Error('Fixture must prove meaningful compressed-byte savings');
}
let rejected = false;
try {
	await decodeBody(source, 'compress');
} catch {
	rejected = true;
}
if (!rejected) throw new Error('Unsupported encodings must fail closed');

const base: ProbeResult = {
	body: source,
	cacheControl: 'public, immutable',
	compressedBytes: gzip.length,
	contentEncoding: 'gzip',
	contentType: 'application/javascript; charset=utf-8',
	crossOriginOpenerPolicy: 'same-origin',
	crossOriginResourcePolicy: 'same-origin',
	decodedBytes: source.length,
	ratio: 1 - gzip.length / source.length,
	reachable: true,
	status: 200,
};
const fixtures: [StaticResourceKind, ProbeResult][] = [
	['javascript', base],
	['css', { ...base, contentType: 'text/css' }],
	['html', { ...base, cacheControl: 'no-cache', contentType: 'text/html' }],
	['source-map', { ...base, cacheControl: undefined, status: 403 }],
];
for (const [kind, fixture] of fixtures) {
	if (staticDeliveryFindings(kind, fixture).length > 0) throw new Error(`${kind} fixture failed`);
}
if (
	!staticDeliveryFindings('css', { ...base, contentType: 'text/plain' }).includes('Content-Type')
) {
	throw new Error('CSS media-type branch did not fail closed');
}
if (
	!staticDeliveryFindings('html', { ...base, cacheControl: 'immutable' }).includes(
		'Cache-Control',
	)
) {
	throw new Error('SPA cache branch did not fail closed');
}
if (
	!staticDeliveryFindings('javascript', { ...base, contentEncoding: undefined }).includes(
		'compression savings',
	)
) {
	throw new Error('Eligible asset compression branch did not fail closed');
}
if (!staticDeliveryFindings('source-map', { ...base, status: 200 }).includes('source-map status')) {
	throw new Error('Source-map denial branch did not fail closed');
}
console.log('[OK] raw compression and every static delivery header-policy branch fail closed');
