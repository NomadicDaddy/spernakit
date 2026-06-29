/**
 * File Upload Security Validation Service
 *
 * This module provides security-focused validation for file uploads:
 * - Magic byte verification for binary files (images, PDFs, archives)
 * - Content validation for text-based uploads (JSON, CSV, plain text)
 * - Detection of malicious content patterns (HTML injection, obfuscated scripts)
 * - DoS prevention via line length and content size limits
 *
 * Security Considerations:
 * - Text files (text/plain, text/csv) cannot be reliably validated by magic bytes
 *   because they lack consistent signatures. We use pattern matching instead.
 * - HTML/script detection patterns cover common obfuscation techniques but
 *   may not catch all attack vectors. Consider additional sanitization at display time.
 * - CSV validation checks for consistent column structure but does not validate
 *   cell content for malicious payloads.
 * - Line length limits prevent DoS attacks via extremely long lines that could
 *   cause memory issues during processing.
 * - For production environments with high security requirements, consider:
 *   - Virus/malware scanning integration (ClamAV, VirusTotal API)
 *   - Content Security Policy enforcement at display time
 *   - File quarantine for manual review of suspicious uploads
 *
 * @module fileValidation
 */

import { getConfig } from '../../config/configLoader.ts';
import { BYTES_PER_MB, MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES } from '../../constants/files.ts';
import {
	BLOCKED_EXTENSIONS,
	BLOCKED_MIME_TYPES,
	COMPATIBLE_MIME_TYPES,
	DANGEROUS_CONTENT_PATTERN,
	DANGEROUS_HTML_TAGS,
	ENCODED_PATTERNS,
	MAGIC_BYTES,
	MAX_LINE_LENGTH,
	MAX_LINES_TO_SCAN,
	MIME_TO_EXTENSIONS,
} from './validationPatterns.ts';

/** Maximum text content size to validate (in bytes) for performance. */
const MAX_TEXT_VALIDATION_SIZE = 10 * BYTES_PER_MB;

/**
 * Detect MIME type from file content magic bytes.
 *
 * @param data - File buffer to inspect
 * @param minBufferLength
 * @returns Detected MIME type or null if unrecognized
 */
export function detectMimeType(data: Buffer, minBufferLength: number): null | string {
	if (data.length < minBufferLength) return null;

	for (const sig of MAGIC_BYTES) {
		const match = sig.bytes.every((b, i) => data[i] === b);
		if (match) {
			// RIFF container: verify it's specifically WEBP
			if (sig.mime === 'image/webp') {
				const isWebp =
					data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50;
				return isWebp ? 'image/webp' : null;
			}
			return sig.mime;
		}
	}

	return null;
}

// Parse a single CSV line into columns, respecting quoted fields and escaped quotes.
function parseCsvLine(line: string): string[] {
	const columns: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if ((char === ',' || char === '\t') && !inQuotes) {
			columns.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	columns.push(current);
	return columns;
}

// Validate CSV file structure — checks all rows have the same column count.
function validateCsvStructure(text: string): null | string {
	const lines = text.split('\n').slice(0, MAX_LINES_TO_SCAN);
	if (lines.length === 0) return null;

	const headerColumns = parseCsvLine(lines[0] ?? '');
	const expectedColumnCount = headerColumns.length;

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (!line || line.trim() === '') continue;

		const columns = parseCsvLine(line);
		if (columns.length !== expectedColumnCount) {
			return `CSV structure invalid: row ${i + 1} has ${columns.length} columns, expected ${expectedColumnCount}`;
		}
	}

	return null;
}

// Validate line lengths in text content to prevent DoS attacks.
function validateLineLengths(text: string): null | string {
	const lines = text.split('\n').slice(0, MAX_LINES_TO_SCAN);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line && line.length > MAX_LINE_LENGTH) {
			return `Line ${i + 1} exceeds maximum length of ${MAX_LINE_LENGTH} characters (found ${line.length})`;
		}
	}
	return null;
}

function validateJsonContent(text: string): null | string {
	try {
		JSON.parse(text);
		return null;
	} catch {
		return 'File content is not valid JSON';
	}
}

function validateCsvContent(text: string): null | string {
	if (DANGEROUS_CONTENT_PATTERN.test(text)) {
		return 'CSV file contains HTML/script content not consistent with text/csv';
	}
	return validateCsvStructure(text);
}

function validatePlainTextContent(text: string): null | string {
	if (DANGEROUS_CONTENT_PATTERN.test(text)) {
		return 'Text file contains HTML/script content not consistent with text/plain';
	}
	if (ENCODED_PATTERNS.test(text) && DANGEROUS_HTML_TAGS.test(text)) {
		return 'Text file contains encoded HTML content that may be attempting to bypass filters';
	}
	return null;
}

/**
 * Validate content of text-based file uploads.
 * Rejects files whose content is inconsistent with the claimed MIME type.
 *
 * @param data - File buffer
 * @param claimedMime - Client-claimed MIME type (already normalized)
 * @returns Error message if content is invalid, null if acceptable
 */
export function validateTextContent(data: Buffer, claimedMime: string): null | string {
	if (data.length > MAX_TEXT_VALIDATION_SIZE) {
		const maxMb = Math.round(MAX_TEXT_VALIDATION_SIZE / BYTES_PER_MB);
		return `Text file exceeds maximum validation size of ${maxMb}MB`;
	}

	const fullText = data.toString('utf8');

	const lineError = validateLineLengths(fullText);
	if (lineError) return lineError;

	switch (claimedMime) {
		case 'application/json':
			return validateJsonContent(fullText);
		case 'text/csv':
			return validateCsvContent(fullText);
		case 'text/plain':
			return validatePlainTextContent(fullText);
		default:
			return null;
	}
}

/**
 * Validate that a file extension is safe and matches the claimed MIME type.
 *
 * @param extension - File extension including dot (e.g., '.png')
 * @param normalizedMimeType - The validated MIME type
 * @returns Error message or null if valid
 */
export function validateExtension(extension: string, normalizedMimeType: string): null | string {
	const ext = extension.toLowerCase();

	if (BLOCKED_EXTENSIONS.has(ext)) {
		return `File extension '${ext}' is blocked for security reasons`;
	}

	if (ext) {
		const allowedExtensions = MIME_TO_EXTENSIONS[normalizedMimeType];
		if (allowedExtensions && !allowedExtensions.includes(ext)) {
			return `File extension '${ext}' does not match MIME type '${normalizedMimeType}'`;
		}
	}

	return null;
}

/**
 * Normalize MIME type by stripping parameters like charset.
 * E.g., 'text/plain;charset=utf-8' -> 'text/plain'
 *
 * @param mimeType - The MIME type to normalize
 * @returns The normalized MIME type without parameters
 */
export function normalizeMimeType(mimeType: string): string {
	return mimeType.split(';')[0]?.trim() ?? mimeType;
}

/**
 * Validate a file against config constraints and verify content matches claimed type.
 *
 * @param mimeType - Client-provided MIME type
 * @param size - File size in bytes
 * @param data - File content buffer for magic byte validation
 * @returns Error message or null if valid
 */
export function validateFile(mimeType: string, size: number, data?: Buffer): null | string {
	const config = getConfig();
	const normalizedMimeType = normalizeMimeType(mimeType);

	if (size > config.storage.maxFileSize) {
		const maxMb = Math.round(config.storage.maxFileSize / BYTES_PER_MB);
		return `File exceeds maximum size of ${maxMb}MB`;
	}

	if (BLOCKED_MIME_TYPES.includes(normalizedMimeType)) {
		return `MIME type '${normalizedMimeType}' is blocked for security reasons`;
	}

	if (!config.storage.allowedMimeTypes.includes(normalizedMimeType)) {
		return `MIME type '${normalizedMimeType}' is not allowed`;
	}

	// Verify file content matches claimed MIME type via magic bytes
	if (data && data.length >= MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES) {
		const detectedMime = detectMimeType(data, MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES);
		if (detectedMime) {
			const compatible = COMPATIBLE_MIME_TYPES[detectedMime];
			if (compatible && !compatible.includes(normalizedMimeType)) {
				return `File content does not match claimed MIME type '${normalizedMimeType}'`;
			}
		}
	}

	// Validate text-based uploads for dangerous content (HTML injection, invalid JSON)
	if (data) {
		const textError = validateTextContent(data, normalizedMimeType);
		if (textError) return textError;
	}

	return null;
}
