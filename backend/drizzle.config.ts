import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'drizzle-kit';

/**
 * Resolve the app slug from defaults.json or the config directory.
 */
function getAppSlug(): string {
	try {
		const defaultsPath = resolve(__dirname, 'src', 'config', 'defaults.json');
		const defaults = JSON.parse(readFileSync(defaultsPath, 'utf8')) as {
			app?: { slug?: string };
		};
		if (defaults.app?.slug) return defaults.app.slug;
	} catch {
		// fall through to directory scan
	}

	const configDir = resolve(__dirname, '..', 'config');
	if (existsSync(configDir)) {
		const files = readdirSync(configDir).filter(
			(f) => f.endsWith('.json') && !f.startsWith('.')
		);
		if (files.length === 1 && files[0]) return files[0].replace(/\.json$/, '');
	}

	return 'spernakit';
}

/**
 * Read the database config from the application config file.
 * Falls back to 'sqlite' if the config is unreadable or dialect is not set.
 */
function getDbConfig(appSlug: string): { dialect: 'postgresql' | 'sqlite'; url: string } {
	try {
		const configPath = resolve(__dirname, '..', 'config', `${appSlug}.json`);
		const raw = readFileSync(configPath, 'utf8');
		const parsed = JSON.parse(raw) as { database?: { dialect?: string; url?: string } };
		const dialect = parsed.database?.dialect === 'postgres' ? 'postgresql' : 'sqlite';
		const url = parsed.database?.url ?? `file:../data/${appSlug}.db`;
		return { dialect, url };
	} catch {
		return { dialect: 'sqlite', url: `file:../data/${appSlug}.db` };
	}
}

const appSlug = getAppSlug();
const dbConfig = getDbConfig(appSlug);

// eslint-disable-next-line import/no-default-export
export default defineConfig({
	breakpoints: true,
	dbCredentials: {
		url: dbConfig.dialect === 'sqlite' ? `../data/${appSlug}.db` : dbConfig.url,
	},
	dialect: dbConfig.dialect,
	migrations: {
		prefix: 'timestamp',
		table: '__drizzle_migrations',
	},
	out: dbConfig.dialect === 'sqlite' ? './drizzle' : './drizzle-pg',
	schema: dbConfig.dialect === 'sqlite' ? './src/db/schema' : './src/db/schema-pg',
	strict: true,
	verbose: true,
});
