/**
 * JSON reading and assertion helpers for the application consistency checker.
 *
 * Extracted from scripts/check-application.ts (max-lines split). Pure helpers
 * with no side effects beyond throwing on assertion failure.
 */
import fs from 'node:fs';

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null;
}

export function readJsonFileOrThrow(filePath: string): unknown {
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
	} catch (err: unknown) {
		throw new Error(`Failed to read JSON file: ${filePath}. ${String(err)}`, { cause: err });
	}
}

export function assertEqual<T>(label: string, actual: T, expected: T): void {
	if (actual !== expected) {
		throw new Error(
			`${label} mismatch. Expected: ${String(expected)}, Found: ${String(actual)}`
		);
	}
}

export function assertDefined<T>(label: string, value: null | T | undefined): T {
	if (value === undefined || value === null) {
		throw new Error(`${label} is missing`);
	}
	return value;
}

export function normalizeRelPath(p: string): string {
	return p.replace(/\\/g, '/');
}

export function readString(json: UnknownRecord, key: string): string | undefined {
	const value = json[key];
	return typeof value === 'string' ? value : undefined;
}

/**
 * Get a nested value from an object using a dot-separated path.
 */
export function getNestedValue(obj: UnknownRecord, dotPath: string): string | undefined {
	const segments = dotPath.split('.');
	let current: unknown = obj;
	for (const segment of segments) {
		if (current === null || current === undefined || typeof current !== 'object')
			return undefined;
		current = (current as UnknownRecord)[segment];
	}
	return typeof current === 'string' ? current : undefined;
}
