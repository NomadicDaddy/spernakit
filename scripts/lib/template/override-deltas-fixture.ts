/**
 * The fixture harness for `scripts/test-override-deltas.ts`.
 *
 * The gap this covers was never in the arithmetic — a unit test of the line-membership test would
 * have passed on the day the `docker/nginx.conf` override started withholding the source-map deny
 * block. It was that nothing ever performed the comparison. The assertions therefore grade the real
 * CLI on its exit code and output, which needs a real template repo with two real tags, a real app
 * that carries frozen copies, and a real `.templateoverrides` file.
 *
 * The app is a reconstruction of the case found during the 2026-07-27 dance: a `SKIP` taken for one
 * CSP token, sitting on a file that has since gained a security block, with a reason that describes
 * only what the app ADDED.
 *
 * Fixtures are built under `<repo>/tmp/`, which is gitignored, so a crashed run leaves nothing
 * tracked. Callers must invoke `cleanup()` in a `finally`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const NGINX = 'docker/nginx.conf';
export const DOCKERFILE = 'Dockerfile';
/** Scaffold-mapped: `scaffolding/.prettierignore` in the template, `.prettierignore` in the app. */
export const SCAFFOLD = '.prettierignore';
export const AGREED = 'backend/src/utils/agreed.ts';
export const DROPPED = 'backend/src/routes/auth/mfa-rate-limit.ts';
export const PRESENCE = '.nvmrc';

/** The line one derived app's nginx override withheld for a whole release cycle. */
export const DENY_MAPS = 'location ~ \\.map$ {';
/** The build instruction seven apps' Dockerfiles were missing at the same dance. */
export const REQUIRE_BUN = 'COPY scripts/require-bun.ts scripts/';
export const WITHHELD_SCAFFOLD_LINE = 'coverage/';
export const APP_CSP_LINE = `default "default-src 'self'; font-src 'self' data:";`;
export const TEMPLATE_CSP_LINE = `default "default-src 'self'; font-src 'self'";`;
export const NGINX_REASON = 'relaxed CSP: font-src adds data: for base64 woff2 fonts';

/** `docker/nginx.conf` as v9.1.0 ships it — the bytes the override is holding the app away from. */
export const TARGET_NGINX = `# nginx configuration
map $uri $csp_policy {
    ${TEMPLATE_CSP_LINE}
}

server {
    gzip_static on;

    location /assets/ {
        expires 1y;
    }

    # Deny source maps.
    ${DENY_MAPS}
        deny all;
    }
}
`;

const APP_NGINX = `# nginx configuration
map $uri $csp_policy {
    ${APP_CSP_LINE}
}

server {
    location /assets/ {
        expires 1y;
    }
}
`;

const dockerfile = (title: string, description: string, requireBun: boolean): string =>
	[
		'FROM oven/bun:1 AS base',
		`LABEL org.opencontainers.image.title="${title}"`,
		`LABEL org.opencontainers.image.description="${description}"`,
		'WORKDIR /app',
		...(requireBun ? [REQUIRE_BUN] : []),
		'EXPOSE 3330',
		'',
	].join('\n');

export const APP_NAME = 'Fixture App';
export const APP_DESCRIPTION = 'A fixture application';
const TEMPLATE_NAME = 'Spernakit v3';
const TEMPLATE_DESCRIPTION = 'Spernakit v3 - Self-Hosted Multi-User Application Template';

/** Template contents at v9.0.0, keyed by their path IN THE TEMPLATE. */
const TEMPLATE_V9_0_0: Readonly<Record<string, string>> = {
	[AGREED]: 'export const agreed = true;\n',
	[DOCKERFILE]: dockerfile(TEMPLATE_NAME, TEMPLATE_DESCRIPTION, false),
	[DROPPED]: 'export const mfaRateLimit = 5;\n',
	[NGINX]: APP_NGINX.replace(APP_CSP_LINE, TEMPLATE_CSP_LINE),
	[PRESENCE]: '22\n',
	'scaffolding/.prettierignore': 'dist/\n',
	'scripts/template-manifest.json': `{"branded": ["${DOCKERFILE}"], "infrastructure": []}\n`,
};

/** What v9.1.0 changes: the security block, the build instruction, one ignore line, one deletion. */
const TEMPLATE_V9_1_0: Readonly<Record<string, string>> = {
	[DOCKERFILE]: dockerfile(TEMPLATE_NAME, TEMPLATE_DESCRIPTION, true),
	[NGINX]: TARGET_NGINX,
	'scaffolding/.prettierignore': `dist/\n${WITHHELD_SCAFFOLD_LINE}\n`,
};

export interface OverrideRun {
	exitCode: number;
	output: string;
}

export interface OverrideDeltaFixture {
	cleanup: () => void;
	/** Run the real override-delta CLI from inside the fixture app. */
	run: (args: string[]) => OverrideRun;
	/** Write an app-relative path. */
	write: (relPath: string, content: string) => void;
	/** Replace the app's `.templateoverrides` with these lines. */
	writeOverrides: (lines: string[]) => void;
}

function writeFile(root: string, relPath: string, content: string): void {
	const full = join(root, relPath);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, content, 'utf-8');
}

/** The app's frozen copies: each one is what an override has been holding at v9.0.0. */
function seedApp(write: (relPath: string, content: string) => void): void {
	write(AGREED, TEMPLATE_V9_0_0[AGREED] ?? '');
	write(DROPPED, TEMPLATE_V9_0_0[DROPPED] ?? '');
	write(NGINX, APP_NGINX);
	// Branded: the app's own title and description, and missing the target's build instruction.
	// Both differences are present at once so a reported delta proves branding was normalized away.
	write(DOCKERFILE, dockerfile(APP_NAME, APP_DESCRIPTION, false));
	write(SCAFFOLD, 'dist/\n');
	write('package.json', '{"name": "fixture-app", "spernakit_version": "9.0.0"}\n');
	// Branding resolution loads (and would otherwise auto-create) config/{slug}.json. Supplying it
	// keeps the fixture from generating fresh keys on every run. config/ is drift-excluded, so this
	// file never enters either comparison.
	write(
		'config/fixture-app.json',
		JSON.stringify({
			app: { description: APP_DESCRIPTION, name: APP_NAME, slug: 'fixture-app' },
			server: { backendPort: 3331, frontendPort: 3330 },
		}),
	);
}

/**
 * Build a template repo tagged v9.0.0 and v9.1.0, plus an app frozen at v9.0.0 by its overrides.
 *
 * v9.1.0 adds a security block to `docker/nginx.conf`, a build instruction to the branded
 * `Dockerfile`, a line to the scaffold-mapped ignore file, and drops one path entirely — so a single
 * run exercises the security case, the branded case, the scaffold-mapped case, and the stale entry.
 */
export function createOverrideDeltaFixture(repoRoot: string): OverrideDeltaFixture {
	const script = join(repoRoot, 'scripts', 'check-override-deltas.ts');
	const fixtureParent = join(repoRoot, 'tmp');
	mkdirSync(fixtureParent, { recursive: true });
	const fixtureRoot = mkdtempSync(join(fixtureParent, 'override-deltas-'));
	const templateDir = join(fixtureRoot, 'template');
	const appDir = join(fixtureRoot, 'app');

	const git = (...args: string[]): void => {
		const result = Bun.spawnSync(
			['git', '-C', templateDir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
			{ stderr: 'pipe', stdout: 'pipe', windowsHide: true },
		);
		if (result.exitCode !== 0) {
			throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
		}
	};

	mkdirSync(templateDir, { recursive: true });
	git('init', '-b', 'main');
	for (const [relPath, content] of Object.entries(TEMPLATE_V9_0_0)) {
		writeFile(templateDir, relPath, content);
	}
	git('add', '-A');
	git('commit', '-m', 'v9.0.0');
	git('tag', 'v9.0.0');

	for (const [relPath, content] of Object.entries(TEMPLATE_V9_1_0)) {
		writeFile(templateDir, relPath, content);
	}
	rmSync(join(templateDir, DROPPED));
	git('add', '-A');
	git('commit', '-m', 'v9.1.0');
	git('tag', 'v9.1.0');

	const write = (relPath: string, content: string): void => writeFile(appDir, relPath, content);
	seedApp(write);

	return {
		cleanup: (): void => rmSync(fixtureRoot, { force: true, recursive: true }),
		/**
		 * APP_SLUG is supplied because branding resolution exits the process outright when it
		 * cannot name the app.
		 */
		run: (args): OverrideRun => {
			const result = Bun.spawnSync(['bun', script, '--template', templateDir, ...args], {
				cwd: appDir,
				env: { ...process.env, APP_SLUG: 'fixture-app' },
				stderr: 'pipe',
				stdout: 'pipe',
			});
			return {
				exitCode: result.exitCode,
				output: `${result.stdout.toString()}${result.stderr.toString()}`,
			};
		},
		write,
		writeOverrides: (lines): void => write('.templateoverrides', `${lines.join('\n')}\n`),
	};
}
