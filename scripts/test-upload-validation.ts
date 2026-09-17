#!/usr/bin/env bun
/**
 * Regression coverage for upload content validation and the request-body ceiling.
 *
 * The defect this gate was written for: `validateTextContent` ran the text line-length check over
 * every upload that carried a buffer, before the switch that decided which text format was being
 * validated. A binary body has no newline for long stretches, so a 50 KB PDF was rejected with
 * "Line 1 exceeds maximum length of 10000 characters" -- a constraint that does not apply to the
 * format the uploader sent. The check now runs only for a MIME type listed in the one map that
 * decides what counts as text, and this gate holds five properties:
 *
 *  1. A binary upload of an allowed type is accepted whatever its size up to storage.maxFileSize,
 *     and is never rejected for a line-length reason.
 *  2. The line-length check still applies to every text format, and its message still names the
 *     line and the limit.
 *  3. The text decision is made once. The sweep quantifies over the configured allowed MIME list
 *     rather than a hand-kept one and reads the text set from the module, so a MIME type added to
 *     either side moves both together: line-length rejection happens exactly for a text type.
 *  4. The transport ceiling leaves room above storage.maxFileSize, so an oversize upload is
 *     answered by the route with a described 400 instead of the connection closing mid-body.
 *  5. Every allowed image and PDF body has a recognized signature; arbitrary bytes and bodies
 *     too short for reliable detection fail closed while valid text remains unaffected.
 *
 * The magic-byte check is exercised alongside them, because the fix narrows what the text path
 * inspects and the content-vs-claimed-type check is the one that must still reject a mislabelled
 * binary.
 */
import { exit } from 'node:process';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { resolveMaxRequestBodySize } from '../backend/src/config/requestBodyLimit.ts';
import { BYTES_PER_MB, MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES } from '../backend/src/constants/files.ts';
import { TEXT_CONTENT_MIME_TYPES, validateFile } from '../backend/src/services/file/validation.ts';
import { MAX_LINE_LENGTH } from '../backend/src/services/file/validationPatterns.ts';

/** Long enough that its single line is five times the limit, small enough to build in memory. */
const LONG_LINE_BYTES = 5 * MAX_LINE_LENGTH;

/** Formats whose validators exist today. The list may grow; losing one is a regression. */
const REQUIRED_TEXT_TYPES = ['application/json', 'text/csv', 'text/plain'] as const;

const PDF_MAGIC = Buffer.from('%PDF-1.7');

const BINARY_SIGNATURE_CASES = [
	{ mime: 'application/pdf', prefix: Buffer.from('%PDF') },
	{ mime: 'image/gif', prefix: Buffer.from('GIF8') },
	{ mime: 'image/jpeg', prefix: Buffer.from([0xff, 0xd8, 0xff]) },
	{ mime: 'image/png', prefix: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
	{
		mime: 'image/webp',
		prefix: Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
	},
] as const;

const failures: string[] = [];
let checks = 0;

function assert(condition: boolean, message: string): void {
	if (condition) {
		checks++;
		return;
	}
	failures.push(message);
}

/** A body of `total` bytes with no newline in it, optionally carrying a format signature. */
function unbrokenBody(total: number, prefix?: Buffer): Buffer {
	const head = prefix ?? Buffer.alloc(0);
	return Buffer.concat([head, Buffer.alloc(Math.max(0, total - head.length), 0x61)]);
}

function describe(result: null | string): string {
	return result === null ? 'accepted' : `rejected with "${result}"`;
}

function checkBinaryUploadIsAccepted(): void {
	const pdf = unbrokenBody(LONG_LINE_BYTES, PDF_MAGIC);
	const result = validateFile('application/pdf', pdf.length, pdf);
	assert(
		result === null,
		`A ${String(pdf.length)}-byte PDF with no newline must be accepted, was ${describe(result)}`,
	);

	// The reported symptom, stated as its own assertion so a partial regression is legible.
	assert(
		!(result ?? '').includes('exceeds maximum length'),
		`A binary upload must never be rejected for a line-length reason, was ${describe(result)}`,
	);

	// A charset parameter must not route a binary type into the text path either.
	const withParam = validateFile('application/pdf; charset=binary', pdf.length, pdf);
	assert(
		withParam === null,
		`A PDF declared with a parameter must be accepted, was ${describe(withParam)}`,
	);
}

function checkTextLineLengthStillApplies(): void {
	for (const mime of REQUIRED_TEXT_TYPES) {
		assert(
			TEXT_CONTENT_MIME_TYPES.includes(mime),
			`${mime} must remain a text format; the line-length check follows that list`,
		);

		const body = unbrokenBody(LONG_LINE_BYTES);
		const result = validateFile(mime, body.length, body);
		assert(
			result !== null &&
				result.includes('Line 1') &&
				result.includes(String(MAX_LINE_LENGTH)),
			`A ${mime} body with an over-long line must be rejected naming the line and the limit, was ${describe(result)}`,
		);
	}
}

function checkFormatValidatorsStillRun(): void {
	const script = Buffer.from('<script>alert(1)</script>\n');
	const html = validateFile('text/plain', script.length, script);
	assert(
		html !== null && html.includes('HTML/script content'),
		`Short-line text must still reach its own validator, was ${describe(html)}`,
	);

	const notJson = Buffer.from('{ "unterminated": \n');
	const json = validateFile('application/json', notJson.length, notJson);
	assert(
		json !== null && json.includes('not valid JSON'),
		`Short-line JSON must still reach its own validator, was ${describe(json)}`,
	);
}

function checkMagicByteMismatchStillRejected(): void {
	const pdf = unbrokenBody(LONG_LINE_BYTES, PDF_MAGIC);
	const result = validateFile('image/png', pdf.length, pdf);
	assert(
		result !== null && result.includes('does not match claimed MIME type'),
		`PDF bytes declared as image/png must be rejected by the magic-byte check, was ${describe(result)}`,
	);
}

function checkRecognizedBinarySignaturesAreRequired(): void {
	for (const { mime, prefix } of BINARY_SIGNATURE_CASES) {
		const validBody = unbrokenBody(MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES, prefix);
		const validResult = validateFile(mime, validBody.length, validBody);
		assert(
			validResult === null,
			`Valid ${mime} signature must be accepted, was ${describe(validResult)}`,
		);

		const arbitraryBody = Buffer.alloc(MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES, 0x61);
		const arbitraryResult = validateFile(mime, arbitraryBody.length, arbitraryBody);
		assert(
			(arbitraryResult ?? '').includes('recognized signature'),
			`Arbitrary bytes declared as ${mime} must fail closed, were ${describe(arbitraryResult)}`,
		);

		const undersizedBody = prefix.subarray(
			0,
			Math.min(prefix.length, MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES - 1),
		);
		const undersizedResult = validateFile(mime, undersizedBody.length, undersizedBody);
		assert(
			(undersizedResult ?? '').includes('recognized signature'),
			`An undersized ${mime} body must fail closed, was ${describe(undersizedResult)}`,
		);
	}
}

function checkValidTextStillAccepted(): void {
	const cases = [
		{ body: Buffer.from('{"valid":true}\n'), mime: 'application/json' },
		{ body: Buffer.from('name,value\nfirst,1\n'), mime: 'text/csv' },
		{ body: Buffer.from('ordinary text\n'), mime: 'text/plain' },
	] as const;

	for (const { body, mime } of cases) {
		const result = validateFile(mime, body.length, body);
		assert(result === null, `Valid ${mime} must remain accepted, was ${describe(result)}`);
	}
}

/**
 * The property, quantified over the configured list rather than a hand-kept one: for every MIME
 * type this deployment allows, a body that is one long unbroken run of bytes is rejected for its
 * line length exactly when the module treats that type as text.
 */
function checkTextDecisionIsMadeOnce(): void {
	const { allowedMimeTypes } = getConfig().storage;
	assert(
		allowedMimeTypes.length > 0,
		'storage.allowedMimeTypes is empty, so the sweep would examine nothing',
	);

	let text = 0;
	let binary = 0;
	for (const mime of allowedMimeTypes) {
		const body = unbrokenBody(LONG_LINE_BYTES);
		const result = validateFile(mime, body.length, body);
		const rejectedForLineLength = (result ?? '').includes('exceeds maximum length');
		const isText = TEXT_CONTENT_MIME_TYPES.includes(mime);
		if (isText) text++;
		else binary++;
		assert(
			rejectedForLineLength === isText,
			isText
				? `${mime} is a text format and must be line-length checked, was ${describe(result)}`
				: `${mime} is not a text format and must not be line-length checked, was ${describe(result)}`,
		);
	}

	const swept = String(allowedMimeTypes.length);
	assert(text > 0, `The sweep found no text formats among ${swept} allowed types`);
	assert(binary > 0, `The sweep found no binary formats among ${swept} allowed types`);
	console.log(
		`   swept ${swept} allowed MIME type(s): ${String(text)} text, ${String(binary)} binary.`,
	);
}

function checkSizeLimitsAnswerRatherThanDrop(): void {
	const { server, storage } = getConfig();
	const effective = resolveMaxRequestBodySize(server.maxRequestBodySize, storage.maxFileSize);
	assert(
		effective > storage.maxFileSize,
		`The transport ceiling (${String(effective)}) must sit above storage.maxFileSize ` +
			`(${String(storage.maxFileSize)}), or an upload at the file limit is dropped before a route sees it`,
	);
	assert(
		effective >= server.maxRequestBodySize,
		'Resolving the ceiling must never lower a configured server.maxRequestBodySize',
	);
	assert(
		resolveMaxRequestBodySize(64 * BYTES_PER_MB, storage.maxFileSize) === 64 * BYTES_PER_MB,
		'A configured ceiling already above the file limit must be left as the operator set it',
	);

	// The application limit is the one that produces a described answer.
	const validPdfBody = unbrokenBody(MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES, PDF_MAGIC);
	const atLimit = validateFile('application/pdf', storage.maxFileSize, validPdfBody);
	assert(
		atLimit === null,
		`A file at exactly storage.maxFileSize must pass the size check, was ${describe(atLimit)}`,
	);
	const overLimit = validateFile('application/pdf', storage.maxFileSize + 1, validPdfBody);
	assert(
		overLimit !== null && overLimit.includes('exceeds maximum size'),
		`A file one byte over storage.maxFileSize must be rejected naming the limit, was ${describe(overLimit)}`,
	);
}

initializeConfig();
checkBinaryUploadIsAccepted();
checkTextLineLengthStillApplies();
checkFormatValidatorsStillRun();
checkMagicByteMismatchStillRejected();
checkRecognizedBinarySignaturesAreRequired();
checkValidTextStillAccepted();
checkTextDecisionIsMadeOnce();
checkSizeLimitsAnswerRatherThanDrop();

if (failures.length === 0) {
	console.log(`[OK] Upload validation checks passed (${String(checks)} assertions).`);
} else {
	console.error('[FAIL] Upload validation regression:');
	for (const failure of failures) console.error(' -', failure);
	exit(1);
}
