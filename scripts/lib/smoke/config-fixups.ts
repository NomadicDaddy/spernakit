/**
 * Config and filesystem preparation helpers for smoke test modes.
 *
 * Handles rate-limit disabling for crawl-heavy modes and docker volume mount
 * preparation for docker-local / docker-prod runs.
 */
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Disable `rateLimit.enabled` and `rateLimit.authEnabled` in the config at `configPath`.
 * Used by both docker-prod (on the mount copy) and dev-mode crawl (on the real file,
 * via {@link disableDevRateLimit}) to keep crawltest's rapid-fire navigation from
 * tripping the 429 cascade that fails content assertions and degrades page loads.
 */
function writeRateLimitDisable(configPath: string): void {
	try {
		const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
		if (cfg.rateLimit) {
			cfg.rateLimit.enabled = false;
			cfg.rateLimit.authEnabled = false;
			writeFileSync(configPath, JSON.stringify(cfg, null, '\t'));
		}
	} catch {
		// Non-fatal — crawltest may hit 429s but won't crash
	}
}

/**
 * Backup `config/{slug}.json` and disable its rate limiter in-place. The backup is
 * written to a sibling `.pre-crawl-bak` file so a crashed smoke run can be recovered
 * on the next invocation via {@link recoverDevRateLimitBackup}. Returns the restore
 * function the caller must invoke (directly and/or via process exit handlers).
 */
export function disableDevRateLimit(projectRoot: string): () => void {
	const appSlug = process.env.APP_SLUG ?? '';
	if (!appSlug) return () => {};

	const configPath = join(projectRoot, 'config', `${appSlug}.json`);
	if (!existsSync(configPath)) return () => {};

	const backupPath = `${configPath}.pre-crawl-bak`;
	const original = readFileSync(configPath, 'utf-8');
	writeFileSync(backupPath, original, 'utf-8');
	writeRateLimitDisable(configPath);

	let restored = false;
	return () => {
		if (restored) return;
		restored = true;
		if (existsSync(backupPath)) {
			writeFileSync(configPath, readFileSync(backupPath, 'utf-8'), 'utf-8');
			unlinkSync(backupPath);
		}
	};
}

/**
 * Recover a stale `.pre-crawl-bak` left behind by a previous smoke run that crashed
 * before its restore handler ran. Runs at smoke startup so a new run always begins
 * with the real config in place.
 */
export function recoverDevRateLimitBackup(projectRoot: string): void {
	const appSlug = process.env.APP_SLUG ?? '';
	if (!appSlug) return;

	const configPath = join(projectRoot, 'config', `${appSlug}.json`);
	const backupPath = `${configPath}.pre-crawl-bak`;
	if (!existsSync(backupPath)) return;

	console.log('Recovering config from previous crashed crawl run...');
	writeFileSync(configPath, readFileSync(backupPath, 'utf-8'), 'utf-8');
	unlinkSync(backupPath);
}

/**
 * Ensure docker volume mount directories exist on the host for docker-local and
 * docker-prod modes. Both mount the `${APPDATA_ROOT}/${APP_SLUG}/...` layout — local
 * via docker-compose.test.yml overlay, prod via docker-compose.production.yml.
 */
export function ensureDockerTestDirs(projectRoot: string): void {
	const appSlug = process.env.APP_SLUG ?? '';
	const appdataRoot = process.env.APPDATA_ROOT ?? '';
	const backupsRoot = process.env.BACKUPS_ROOT ?? '';

	if (!appSlug || !appdataRoot) return;

	const dirs = [
		join(appdataRoot, appSlug, 'config'),
		join(appdataRoot, appSlug, 'data'),
		join(appdataRoot, appSlug, 'logs'),
		// docker-compose.test.yml mounts ${APPDATA_ROOT}/${APP_SLUG}/backups; production uses
		// ${BACKUPS_ROOT}/${APP_SLUG}. Create both layouts so the bind mount is writable either way.
		join(appdataRoot, appSlug, 'backups'),
		join(backupsRoot || appdataRoot, appSlug),
	];

	for (const dir of dirs) {
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		// The container runs as the non-root `bun` user, whose uid differs from the host
		// process that created these dirs. Make them world-writable so the bind-mounted
		// SQLite DB, logs, and backups are writable inside the container — without this,
		// Linux CI leaves fresh mount points root-owned and the container crash-loops with
		// "unable to open database file". chmod is a no-op on Windows bind mounts.
		try {
			chmodSync(dir, 0o777);
		} catch {
			// best-effort: a pre-existing dir owned by another user can't be re-chmod'd here
		}
	}

	// Skip config/secrets sync when running against a persistent staging mount.
	// The staging config is authored to hold true production posture (nodeEnv=production,
	// cookieSecure, real secrets, allowedOrigins) and must not be clobbered by the local
	// dev config every run. Detected by 'staging' segment in the appdata path.
	const isStagingMount = /[\\/]staging[\\/]/i.test(appdataRoot);

	if (!isStagingMount) {
		// Sync every config/*.json file into the docker-prod config mount so the container
		// starts with current dev config. Walks the directory rather than hardcoding
		// {slug}.json + {slug}.secrets.json — apps frequently ship supplemental configs
		// (e.g. a derived app's domain-config.json) that must travel alongside the canonicals.
		// example.json is excluded — it's a template artifact, not runtime config.
		const srcConfigDir = join(projectRoot, 'config');
		if (existsSync(srcConfigDir)) {
			const mainConfig = `${appSlug}.json`;
			for (const entry of readdirSync(srcConfigDir)) {
				if (!entry.endsWith('.json') || entry === 'example.json') continue;
				const src = join(srcConfigDir, entry);
				const dest = join(appdataRoot, appSlug, 'config', entry);
				copyFileSync(src, dest);
				if (entry === mainConfig) {
					writeRateLimitDisable(dest);
				}
			}
		}
	} else {
		console.log(`   Staging mount detected at ${appdataRoot} — skipping config sync`);
		// On a fresh STG wipe (no config yet) leave a marker so docker/start.sh applies
		// the staging-specific CORS overrides (cors.inheritFrontendUrl=true,
		// cors.frontendDevOrigins=[]) when it creates the initial config from defaults.
		// Real production should set allowedOrigins explicitly and not need the marker.
		const stgConfigPath = join(appdataRoot, appSlug, 'config', `${appSlug}.json`);
		if (!existsSync(stgConfigPath)) {
			const markerPath = join(appdataRoot, appSlug, 'config', '.stg-bootstrap');
			writeFileSync(markerPath, 'STG bootstrap marker — consumed by docker/start.sh\n');
			console.log(`   Fresh STG config — wrote bootstrap marker`);
		}
	}

	// Reset docker-prod data directory so container starts from a clean database
	const dataDir = join(appdataRoot, appSlug, 'data');
	if (existsSync(dataDir)) {
		const files = readdirSync(dataDir);
		let removed = 0;
		for (const file of files) {
			if (
				file.endsWith('.db') ||
				file.endsWith('.db-shm') ||
				file.endsWith('.db-wal') ||
				file === '.seeded'
			) {
				unlinkSync(join(dataDir, file));
				removed++;
			}
		}
		if (removed > 0) {
			console.log(`   Reset docker-prod data: cleared ${removed} file(s)`);
		}
	}
}
