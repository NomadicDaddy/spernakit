/**
 * Writer half of the fleet-manifest contract.
 *
 * `spernakit.psd1` is bookkeeping: every value in it is owned somewhere else. Each app's tracked
 * `package.json` owns `version` and `spernakit_version`, and its runtime `config/<slug>.json` owns
 * the display name, description, and port pair. This module resolves those authoritative values and
 * rewrites the manifest text in place, so the release path can restate the manifest instead of
 * leaving it to be reconciled by hand after the fact.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FleetEntry } from './manifest.ts';

type JsonObject = Record<string, unknown>;

export interface FleetSyncPlan {
	problems: string[];
	resolved: FleetEntry[];
}

export interface FleetRender {
	changes: string[];
	missing: string[];
	text: string;
}

interface FieldChange {
	from: number | string;
	literal: string;
	to: number | string;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const ENTRY_OPEN = /^\s*'([a-z0-9][a-z0-9-]*)'\s*=\s*@\{\s*$/;
const BLOCK_CLOSE = /^\s*\}\s*$/;
const FIELD_LINE =
	/^(\s*)(appName|backendPort|description|frontendPort|spernakit_version|version)(\s*=\s*)(.*)$/;

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(path: string, label: string, problems: string[]): JsonObject | undefined {
	if (!existsSync(path)) {
		problems.push(`${label} is missing: ${path}`);
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
		if (!isObject(parsed)) throw new Error('must be an object');
		return parsed;
	} catch (err) {
		problems.push(
			`${label} is unreadable: ${err instanceof Error ? err.message : String(err)}`,
		);
		return undefined;
	}
}

function takeSemver(value: unknown, label: string, problems: string[]): string {
	if (typeof value !== 'string' || !SEMVER.test(value)) {
		problems.push(
			`${label} must be a concrete semantic version; received ${JSON.stringify(value)}`,
		);
		return '';
	}
	return value;
}

function takeString(value: unknown, label: string, problems: string[]): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		problems.push(`${label} must be a non-empty string; received ${JSON.stringify(value)}`);
		return '';
	}
	return value;
}

function takePort(value: unknown, label: string, problems: string[]): number {
	if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 65_535) {
		problems.push(
			`${label} must be an integer from 1 through 65535; received ${JSON.stringify(value)}`,
		);
		return 0;
	}
	return value as number;
}

function resolveEntry(
	entry: FleetEntry,
	applicationsRoot: string,
	problems: string[],
): FleetEntry | undefined {
	const before = problems.length;
	const appRoot = join(applicationsRoot, entry.slug);
	if (!existsSync(appRoot)) {
		problems.push(`${entry.slug} directory is missing: ${appRoot}`);
		return undefined;
	}

	const pkg = readJson(join(appRoot, 'package.json'), `${entry.slug} package.json`, problems);
	if (pkg === undefined) return undefined;
	const version = takeSemver(pkg['version'], `${entry.slug} package.json version`, problems);
	const isTemplate = entry.slug === 'spernakit';
	const spernakitVersion = isTemplate
		? undefined
		: takeSemver(
				pkg['spernakit_version'],
				`${entry.slug} package.json spernakit_version`,
				problems,
			);

	const defaults = readJson(
		join(appRoot, 'backend', 'src', 'config', 'defaults.json'),
		`${entry.slug} config defaults`,
		problems,
	);
	if (defaults === undefined) return undefined;
	const defaultsApp = isObject(defaults['app']) ? defaults['app'] : {};
	const runtimeSlug = defaultsApp['slug'];
	if (typeof runtimeSlug !== 'string' || !SLUG.test(runtimeSlug)) {
		problems.push(`${entry.slug} config defaults app.slug is not a valid slug`);
		return undefined;
	}

	const configPath = join(appRoot, 'config', `${runtimeSlug}.json`);
	if (!existsSync(configPath)) {
		problems.push(
			`${entry.slug} runtime config is missing: ${configPath}; the entry is unverifiable`,
		);
		return undefined;
	}
	const config = readJson(configPath, `${entry.slug} runtime config`, problems);
	if (config === undefined) return undefined;
	const app = isObject(config['app']) ? config['app'] : {};
	const server = isObject(config['server']) ? config['server'] : {};

	const resolved: FleetEntry = {
		appName: takeString(app['name'], `${entry.slug} runtime config app.name`, problems),
		backendPort: takePort(
			server['backendPort'],
			`${entry.slug} runtime config server.backendPort`,
			problems,
		),
		description: takeString(
			app['description'],
			`${entry.slug} runtime config app.description`,
			problems,
		),
		frontendPort: takePort(
			server['frontendPort'],
			`${entry.slug} runtime config server.frontendPort`,
			problems,
		),
		slug: entry.slug,
		version,
		...(spernakitVersion === undefined ? {} : { spernakitVersion }),
	};
	return problems.length === before ? resolved : undefined;
}

/**
 * Resolves the authoritative value of every manifest entry. Problems are collected across all
 * entries rather than thrown, so a caller can report the full picture and then refuse the entire
 * write; a partially resolved fleet must never be written.
 */
export function planFleetSync(entries: FleetEntry[], applicationsRoot: string): FleetSyncPlan {
	const problems: string[] = [];
	const resolved: FleetEntry[] = [];
	for (const entry of entries) {
		const value = resolveEntry(entry, applicationsRoot, problems);
		if (value !== undefined) resolved.push(value);
	}
	return { problems, resolved };
}

function quote(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function show(value: number | string): string {
	return typeof value === 'number' ? String(value) : quote(value);
}

/**
 * Compares parsed values rather than the raw literals, so a field whose value already matches keeps
 * whatever quoting style the file uses. Only a value that genuinely moved is rewritten.
 */
function changedFields(before: FleetEntry, after: FleetEntry): Map<string, FieldChange> {
	const pairs: [string, number | string | undefined, number | string | undefined][] = [
		['appName', before.appName, after.appName],
		['backendPort', before.backendPort, after.backendPort],
		['description', before.description, after.description],
		['frontendPort', before.frontendPort, after.frontendPort],
		['spernakit_version', before.spernakitVersion, after.spernakitVersion],
		['version', before.version, after.version],
	];
	const changes = new Map<string, FieldChange>();
	for (const [name, from, to] of pairs) {
		if (from === undefined || to === undefined || from === to) continue;
		changes.set(name, { from, literal: show(to), to });
	}
	return changes;
}

/**
 * Rewrites only the scalar values that moved. The comment header, entry order, field order,
 * indentation, and `=` alignment all come from the original text and are never regenerated, so a
 * diff of a synced manifest shows nothing but the values that actually changed. A planned change
 * with no matching line is reported through `missing` rather than dropped.
 */
export function renderFleetManifest(
	text: string,
	current: FleetEntry[],
	resolved: FleetEntry[],
): FleetRender {
	const after = new Map(resolved.map((entry) => [entry.slug, entry]));
	const planned = new Map<string, Map<string, FieldChange>>();
	for (const entry of current) {
		const target = after.get(entry.slug);
		if (target !== undefined) planned.set(entry.slug, changedFields(entry, target));
	}

	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const changes: string[] = [];
	const applied = new Set<string>();
	let slug: string | undefined;

	const lines = text.split(/\r?\n/).map((line) => {
		const opened = ENTRY_OPEN.exec(line);
		if (opened !== null) {
			slug = opened[1];
			return line;
		}
		if (slug !== undefined && BLOCK_CLOSE.test(line)) {
			slug = undefined;
			return line;
		}
		const fields = slug === undefined ? undefined : planned.get(slug);
		const field = fields === undefined ? null : FIELD_LINE.exec(line);
		if (field === null || fields === undefined) return line;

		const name = field[2] ?? '';
		const change = fields.get(name);
		if (change === undefined) return line;
		applied.add(`${slug ?? ''}.${name}`);
		changes.push(`${slug ?? ''}.${name}: ${show(change.from)} -> ${change.literal}`);
		return `${field[1] ?? ''}${name}${field[3] ?? ''}${change.literal}`;
	});

	const missing: string[] = [];
	for (const [entrySlug, fields] of planned) {
		for (const name of fields.keys()) {
			const key = `${entrySlug}.${name}`;
			if (!applied.has(key)) missing.push(`${key} has no assignment line in spernakit.psd1`);
		}
	}

	return { changes, missing, text: lines.join(eol) };
}
