/**
 * Fleet manifest (spernakit.psd1) helpers for the initializer: port allocation and registry
 * entry add/remove. A real PowerShell parse would need PowerShell; the manifest's shape is fixed,
 * so text scans keep this runnable under plain Bun on any OS.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface RegistryFields {
	backendPort: number;
	description: string;
	frontendPort: number;
	name: string;
	slug: string;
	templateVersion: string;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** All frontend/backend ports already assigned in the manifest text. */
export function manifestUsedPorts(text: string): Set<number> {
	const used = new Set<number>();
	for (const match of text.matchAll(/(?:frontendPort|backendPort)\s*=\s*(\d+)/g)) {
		used.add(Number(match[1]));
	}
	return used;
}

/** Next free 33x0/33x1 pair from 3340 (3330/3331 are reserved for the template's own dev server). */
export function nextPortPair(used: Set<number>): { backendPort: number; frontendPort: number } {
	for (let frontendPort = 3340; frontendPort < 9000; frontendPort += 10) {
		if (!used.has(frontendPort) && !used.has(frontendPort + 1)) {
			return { backendPort: frontendPort + 1, frontendPort };
		}
	}
	throw new Error('No free Spernakit port pair found between 3340 and 8991');
}

export function manifestHasSlug(text: string, slug: string): boolean {
	return new RegExp(`'${escapeRegex(slug)}'\\s*=\\s*@\\{`, 'i').test(text);
}

/** Append a fleet-registry entry before the ExpectedConfigs closing block, matching init.ps1. */
export function registerApp(manifestPath: string, fields: RegistryFields): void {
	const content = readFileSync(manifestPath, 'utf8');
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const closing = /(\r?\n\t\}\r?\n\})\s*$/;
	if (!closing.test(content)) {
		throw new Error(`Unable to find ExpectedConfigs closing block in ${manifestPath}`);
	}
	const esc = (value: string): string => value.replace(/'/g, "''");
	const entry = [
		`\t\t'${fields.slug}'        = @{`,
		`\t\t\tfrontendPort      = ${fields.frontendPort}`,
		`\t\t\tbackendPort       = ${fields.backendPort}`,
		`\t\t\tappName           = '${esc(fields.name)}'`,
		`\t\t\tdescription       = '${esc(fields.description)}'`,
		`\t\t\tversion           = '0.1.0'`,
		`\t\t\tspernakit_version = '${esc(fields.templateVersion)}'`,
		`\t\t}`,
	].join(eol);
	writeFileSync(manifestPath, content.replace(closing, `${eol}${entry}$1`));
}

/** Roll back a registry entry added earlier this run (best-effort). */
export function unregisterApp(manifestPath: string, slug: string): boolean {
	if (!existsSync(manifestPath)) return false;
	const content = readFileSync(manifestPath, 'utf8');
	const pattern = new RegExp(
		`\\r?\\n\\t\\t'${escapeRegex(slug)}'\\s*=\\s*@\\{[\\s\\S]*?\\r?\\n\\t\\t\\}`
	);
	if (!pattern.test(content)) return false;
	writeFileSync(manifestPath, content.replace(pattern, ''));
	return true;
}
