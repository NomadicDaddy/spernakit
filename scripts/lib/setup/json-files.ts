/**
 * JSON/text file read and rewrite helpers for the setup script.
 *
 * Extracted from scripts/setup.ts.
 */
import fs from 'node:fs';

export function readJsonObjectOrNull(filePath: string): null | Record<string, unknown> {
	if (!fs.existsSync(filePath)) {
		return null;
	}
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed !== 'object' || parsed === null) {
			return null;
		}
		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function readStringFromObject(
	obj: Record<string, unknown>,
	key: string
): string | undefined {
	const value = obj[key];
	return typeof value === 'string' ? value : undefined;
}

export function readNumberFromObject(
	obj: Record<string, unknown>,
	key: string
): number | undefined {
	const value = obj[key];
	return typeof value === 'number' ? value : undefined;
}

export function updateFile(filePath: string, replacements: Record<string, string>): void {
	if (!fs.existsSync(filePath)) {
		console.log(`⚠️  File not found: ${filePath}`);
		return;
	}

	let content = fs.readFileSync(filePath, 'utf8');

	for (const [search, replace] of Object.entries(replacements)) {
		content = content.replace(new RegExp(search, 'g'), replace);
	}

	fs.writeFileSync(filePath, content);
	console.log(`✅ Updated: ${filePath}`);
}

export function updateJsonFile(
	filePath: string,
	updater: (json: Record<string, unknown>) => void
): void {
	if (!fs.existsSync(filePath)) {
		console.log(`⚠️  File not found: ${filePath}`);
		return;
	}

	const raw = fs.readFileSync(filePath, 'utf8');
	const json = JSON.parse(raw) as Record<string, unknown>;
	updater(json);
	fs.writeFileSync(filePath, `${JSON.stringify(json, null, '\t')}\n`, 'utf8');
	console.log(`✅ Updated: ${filePath}`);
}
