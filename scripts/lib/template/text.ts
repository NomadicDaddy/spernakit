/**
 * Small text utilities shared across template drift/sync modules.
 */

export function normalizeLineEndings(content: string): string {
	return content.replace(/\r\n/g, '\n');
}

export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
