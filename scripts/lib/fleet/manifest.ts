import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

type JsonObject = Record<string, unknown>;

export interface FleetEntry {
	appName: string;
	backendPort: number;
	description: string;
	frontendPort: number;
	slug: string;
	spernakitVersion?: string;
	version: string;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const ALLOWED_FIELDS = new Set([
	'appName',
	'backendPort',
	'description',
	'frontendPort',
	'spernakit_version',
	'version',
]);

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
	if (!isObject(value)) throw new Error(`${label} must be an object`);
	return value;
}

function requireString(
	object: JsonObject,
	field: string,
	label: string,
	allowEmpty = false,
): string {
	const value = object[field];
	if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
		throw new Error(`${label}.${field} must be a non-empty string`);
	}
	return value;
}

function requirePort(object: JsonObject, field: string, label: string): number {
	const value = object[field];
	if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 65_535) {
		throw new Error(`${label}.${field} must be an integer from 1 through 65535`);
	}
	return value as number;
}

function requireSemver(value: string, label: string): string {
	if (!SEMVER.test(value)) {
		throw new Error(`${label} must be a concrete semantic version; received "${value}"`);
	}
	return value;
}

function decode(output: Uint8Array | undefined): string {
	return output === undefined ? '' : new TextDecoder().decode(output).trim();
}

function importPowerShellDataFile(manifestPath: string): unknown {
	const readerPath = resolve(import.meta.dir, '..', '..', 'read-fleet-manifest.ps1');
	let processResult: ReturnType<typeof Bun.spawnSync>;
	try {
		processResult = Bun.spawnSync(
			['pwsh', '-NoLogo', '-NoProfile', '-File', readerPath, '-Path', resolve(manifestPath)],
			{ stderr: 'pipe', stdout: 'pipe' },
		);
	} catch (err) {
		throw new Error(
			`Unable to start pwsh for ${manifestPath}: ${
				err instanceof Error ? err.message : String(err)
			}`,
			{ cause: err },
		);
	}
	if (processResult.exitCode !== 0) {
		throw new Error(decode(processResult.stderr) || `pwsh exited ${processResult.exitCode}`);
	}
	const output = decode(processResult.stdout);
	if (output.length === 0) throw new Error(`PowerShell returned no data for ${manifestPath}`);
	try {
		return JSON.parse(output) as unknown;
	} catch {
		throw new Error(`PowerShell returned invalid JSON for ${manifestPath}`);
	}
}

function normalizeEntry(slug: string, value: unknown): FleetEntry {
	if (!SLUG.test(slug)) throw new Error(`Invalid fleet key "${slug}"`);
	const label = `ExpectedConfigs.${slug}`;
	const raw = requireObject(value, label);
	for (const field of Object.keys(raw)) {
		if (!ALLOWED_FIELDS.has(field)) throw new Error(`${label}.${field} is not supported`);
	}

	const version = requireSemver(requireString(raw, 'version', label), `${label}.version`);
	const templateValue = raw['spernakit_version'];

	const common = {
		appName: requireString(raw, 'appName', label),
		backendPort: requirePort(raw, 'backendPort', label),
		description: requireString(raw, 'description', label),
		frontendPort: requirePort(raw, 'frontendPort', label),
		slug,
		version,
	};
	if (slug === 'spernakit') {
		if (templateValue !== undefined) {
			throw new Error(`${label}.spernakit_version is not valid on the template entry`);
		}
		return common;
	}

	const spernakitVersion = requireSemver(
		requireString(raw, 'spernakit_version', label),
		`${label}.spernakit_version`,
	);
	return { ...common, spernakitVersion };
}

function assertManifestInvariants(entries: FleetEntry[]): void {
	if (entries.length === 0) throw new Error('ExpectedConfigs must contain at least one entry');
	if (!entries.some((entry) => entry.slug === 'spernakit')) {
		throw new Error('ExpectedConfigs must contain the spernakit template entry');
	}

	const ports = new Map<number, string>();
	for (const entry of entries) {
		for (const [kind, port] of [
			['frontendPort', entry.frontendPort],
			['backendPort', entry.backendPort],
		] as const) {
			const existingPort = ports.get(port);
			if (existingPort !== undefined) {
				throw new Error(`${entry.slug}.${kind} duplicates port ${port} (${existingPort})`);
			}
			ports.set(port, `${entry.slug}.${kind}`);
		}
	}
}

export function loadFleetManifest(manifestPath: string): FleetEntry[] {
	const imported = requireObject(importPowerShellDataFile(manifestPath), 'manifest');
	const configs = requireObject(imported['ExpectedConfigs'], 'ExpectedConfigs');
	const entries = Object.entries(configs).map(([slug, value]) => normalizeEntry(slug, value));
	assertManifestInvariants(entries);
	return entries;
}

function readJson(path: string, label: string, problems: string[]): JsonObject | undefined {
	if (!existsSync(path)) {
		problems.push(`${label} is missing: ${path}`);
		return undefined;
	}
	try {
		return requireObject(JSON.parse(readFileSync(path, 'utf8')) as unknown, label);
	} catch (err) {
		problems.push(`${label} is invalid: ${err instanceof Error ? err.message : String(err)}`);
		return undefined;
	}
}

function compare(
	problems: string[],
	label: string,
	expected: number | string,
	actual: unknown,
): void {
	if (actual !== expected) {
		problems.push(
			`${label}: manifest=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)}`,
		);
	}
}

export function validateFleetManifest(entries: FleetEntry[], applicationsRoot: string): string[] {
	const problems: string[] = [];
	for (const entry of entries) {
		const appRoot = join(applicationsRoot, entry.slug);
		if (!existsSync(appRoot)) {
			problems.push(`${entry.slug} directory is missing: ${appRoot}`);
			continue;
		}
		const pkg = readJson(join(appRoot, 'package.json'), `${entry.slug} package.json`, problems);
		if (pkg !== undefined) {
			compare(problems, `${entry.slug}.version`, entry.version, pkg['version']);
			if (entry.slug === 'spernakit') {
				if ('spernakit_version' in pkg) {
					problems.push('spernakit package.json must not define spernakit_version');
				}
			} else {
				compare(
					problems,
					`${entry.slug}.spernakit_version`,
					entry.spernakitVersion!,
					pkg['spernakit_version'],
				);
			}
		}

		const defaults = readJson(
			join(appRoot, 'backend', 'src', 'config', 'defaults.json'),
			`${entry.slug} config defaults`,
			problems,
		);
		if (defaults === undefined) continue;
		const defaultsApp = isObject(defaults['app']) ? defaults['app'] : {};
		const runtimeSlug = defaultsApp['slug'];
		if (typeof runtimeSlug !== 'string' || !SLUG.test(runtimeSlug)) {
			problems.push(`${entry.slug} config defaults app.slug is not a valid slug`);
			continue;
		}

		const configPath = join(appRoot, 'config', `${runtimeSlug}.json`);
		const config = readJson(configPath, `${entry.slug} runtime config`, problems);
		if (config === undefined) continue;
		const app = isObject(config['app']) ? config['app'] : {};
		const server = isObject(config['server']) ? config['server'] : {};
		compare(problems, `${entry.slug}.runtimeSlug`, runtimeSlug, app['slug']);
		compare(problems, `${entry.slug}.appName`, entry.appName, app['name']);
		compare(problems, `${entry.slug}.description`, entry.description, app['description']);
		compare(problems, `${entry.slug}.frontendPort`, entry.frontendPort, server['frontendPort']);
		compare(problems, `${entry.slug}.backendPort`, entry.backendPort, server['backendPort']);
	}
	return problems;
}

export function applicationsRootForManifest(manifestPath: string): string {
	return dirname(dirname(resolve(manifestPath)));
}
