/**
 * File validation patterns, magic bytes, and constant tables.
 *
 * Separated from fileValidation.ts to keep the validation logic focused
 * on flow control while pattern data lives here.
 *
 * @module fileValidationPatterns
 */

/** Magic byte signatures for common file types. */
export const MAGIC_BYTES: readonly { bytes: readonly number[]; mime: string }[] = [
	{ bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
	{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png' },
	{ bytes: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
	{ bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' },
	{ bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
	{ bytes: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip' },
];

/** Maximum line length for text files (in characters) to prevent DoS. */
export const MAX_LINE_LENGTH = 10000;

/** Maximum number of lines to scan for security patterns. */
export const MAX_LINES_TO_SCAN = 1000;

/**
 * HTML-like tags that indicate potentially dangerous content in text uploads.
 * Covers structural HTML elements that should never appear in plain text/CSV files.
 */
export const DANGEROUS_HTML_TAGS =
	/<\s*(script|html|body|head|iframe|object|embed|form|link|meta|style|base|applet|frame|frameset|svg|math)\b/i;

/**
 * Event handler attributes that indicate JavaScript injection attempts.
 * Enumerates known HTML event handler names to avoid false positives
 * with words like "one=", "only=", "ongoing=" in CSV/text data.
 */
const DANGEROUS_EVENT_HANDLERS =
	/\b(?:onclick|ondblclick|onmousedown|onmouseup|onmouseover|onmousemove|onmouseout|onkeydown|onkeyup|onkeypress|onload|onerror|onabort|onunload|onresize|onscroll|onfocus|onblur|onsubmit|onreset|onchange|oninput|onselect|oncontextmenu|ondrag|ondragstart|ondragend|ondragover|ondragenter|ondragleave|ondrop|onpaste|oncut|oncopy|onbeforeunload|onhashchange|onpopstate|onmessage|onstorage|onanimationstart|onanimationend|ontransitionend)\s*=\s*["']?[^"'\s>]+/i;

/**
 * JavaScript protocol patterns including obfuscated variants.
 * Detects javascript:, vbscript:, data: URIs that could execute code.
 */
const DANGEROUS_PROTOCOLS = /(?:javascript|vbscript|data)\s*:/i;

/**
 * HTML entity encoded angle brackets and script-related entities used to bypass filters.
 * Targets numeric/hex encoding of < (&#60; / &#x3c;) and > (&#62; / &#x3e;) which are
 * the primary obfuscation vectors. Benign entities like &amp; or &copy; are not matched.
 */
export const ENCODED_PATTERNS = /&#(?:x0*(?:3[cCeE]|22|27)|0*(?:60|62|34|39));/;

/**
 * Combined pattern for comprehensive dangerous content detection.
 * Checks for HTML tags, event handlers, and dangerous protocols.
 */
export const DANGEROUS_CONTENT_PATTERN = new RegExp(
	`(?:${DANGEROUS_HTML_TAGS.source})|` +
		`(?:${DANGEROUS_EVENT_HANDLERS.source})|` +
		`(?:${DANGEROUS_PROTOCOLS.source})`,
	'i'
);

/** File extensions that are always blocked regardless of MIME type. */
export const BLOCKED_EXTENSIONS = new Set([
	'.asp',
	'.bat',
	'.cmd',
	'.exe',
	'.htm',
	'.html',
	'.js',
	'.jsp',
	'.mjs',
	'.php',
	'.ps1',
	'.sh',
	'.svg',
	'.xhtml',
	'.zip',
]);

/** Maps allowed MIME types to their valid file extensions. */
export const MIME_TO_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
	'application/json': ['.json'],
	'application/pdf': ['.pdf'],
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
	'image/gif': ['.gif'],
	'image/jpeg': ['.jpg', '.jpeg'],
	'image/jpg': ['.jpg', '.jpeg'],
	'image/png': ['.png'],
	'image/webp': ['.webp'],
	'text/csv': ['.csv'],
	'text/plain': ['.txt', '.log', '.md', '.csv'],
};

/** MIME types that must always be rejected regardless of configuration. */
export const BLOCKED_MIME_TYPES: readonly string[] = [
	'application/x-bat',
	'application/x-csh',
	'application/x-dosexec',
	'application/x-executable',
	'application/x-msdos-program',
	'application/x-msdownload',
	'application/x-sh',
];

/** Maps detected types to compatible claimed MIME types. */
export const COMPATIBLE_MIME_TYPES: Readonly<Record<string, readonly string[]>> = {
	'application/pdf': ['application/pdf'],
	'application/zip': [
		'application/zip',
		'application/x-zip-compressed',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	],
	'image/gif': ['image/gif'],
	'image/jpeg': ['image/jpeg', 'image/jpg'],
	'image/png': ['image/png'],
	'image/webp': ['image/webp'],
};
