/**
 * Scaffolding steps for the initializer: subprocess runner, template copy, and the small on-disk
 * transforms init applies to a freshly-copied app (target prep, .templateoverrides seed, hook
 * executability).
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { applyPlan } from '../template-features/apply.ts';
import { validateTemplateCorpus } from '../template-features/source.ts';
import { buildSyncPlan } from '../template-features/sync.ts';
import { enumerateInitFiles, toTemplatePath } from '../template/classify.ts';

export function log(message: string): void {
	console.log(message);
}

/** Run a subcommand with inherited stdio; throw on non-zero unless allowFailure. */
export function run(
	cmd: string[],
	cwd: string,
	opts: { allowFailure?: boolean; env?: Record<string, string> } = {},
): void {
	log(`  → ${cmd.join(' ')}`);
	const base = { cwd, stderr: 'inherit', stdin: 'inherit', stdout: 'inherit' } as const;
	const proc = Bun.spawnSync(
		cmd,
		opts.env
			? { ...base, env: { ...(process.env as Record<string, string>), ...opts.env } }
			: base,
	);
	if (proc.exitCode !== 0 && !opts.allowFailure) {
		throw new Error(`Command failed (exit ${proc.exitCode}): ${cmd.join(' ')}`);
	}
}

/** Title-case a slug: "my-cool_app" → "My Cool App". Mirrors init.ps1 ConvertTo-DefaultAppName. */
export function defaultAppName(slug: string): string {
	return slug
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) =>
			part.length <= 1 ? part.toUpperCase() : part[0]!.toUpperCase() + part.slice(1),
		)
		.join(' ');
}

export function readTemplateVersion(source: string): string {
	const packagePath = join(source, 'package.json');
	try {
		const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as {
			spernakit_version?: string;
			version?: string;
		};
		const version = pkg.spernakit_version ?? pkg.version;
		if (
			typeof version === 'string' &&
			/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
		) {
			return version;
		}
		throw new Error('package.json has no concrete semantic version');
	} catch (err) {
		throw new Error(
			`Unable to determine a concrete version from ${packagePath}: ${
				err instanceof Error ? err.message : String(err)
			}`,
			{ cause: err },
		);
	}
}

/** Copy the template surface (enumerateInitFiles) from source into target. Returns file count. */
export function copyTemplateTree(source: string, target: string): number {
	let copied = 0;
	for (const appPath of enumerateInitFiles(source)) {
		const srcAbs = join(source, toTemplatePath(appPath));
		if (!existsSync(srcAbs)) continue;
		const dstAbs = join(target, appPath);
		mkdirSync(dirname(dstAbs), { recursive: true });
		copyFileSync(srcAbs, dstAbs);
		copied++;
	}
	return copied;
}

export function prepareTarget(target: string, force: boolean): void {
	if (!existsSync(target)) return;
	const entries = readdirSync(target);
	if (entries.length === 0) return;
	if (!force)
		throw new Error(`Target exists and is not empty: ${target} (pass --force to replace)`);
	// Never recursively delete a directory that looks like a real project/repository — a --force
	// aimed at a populated, tracked tree would otherwise erase it.
	if (existsSync(join(target, '.git'))) {
		throw new Error(`Refusing to --force-replace ${target}: it contains a .git directory`);
	}
	rmSync(target, { force: true, recursive: true });
}

const TEMPLATE_OVERRIDES = [
	'# .templateoverrides — acknowledge intentional divergence from the Spernakit template baseline.',
	'# Format:  ACTION  PATH  [# REASON]   (ACTION = SKIP | KEEP | DELETED)',
	'',
	"# Seeded by init.ts: these branded files diverge from the tagged baseline by init's own",
	'# transforms (app branding, port assignment, version reset, license ownership).',
	'KEEP  Dockerfile                     # init branding + port assignment',
	'KEEP  README.md                      # init branding',
	'KEEP  backend/README.md              # init branding',
	'KEEP  docker-compose.yml             # init branding + ports',
	'KEEP  docker-compose.production.yml  # init branding + ports',
	'KEEP  docker-compose.test.yml        # init branding + ports',
	'KEEP  frontend/README.md             # init branding',
	'KEEP  frontend/index.html            # init branding',
	'KEEP  licenses/CONTAINER-DISTRIBUTION.md  # init distribution guidance',
	'KEEP  package.json                   # init version reset + app release scripts',
	'DELETED  licenses/SOURCE-OFFER.template.md  # init creates app-owned SOURCE-OFFER.md',
];

export function seedTemplateOverrides(target: string): void {
	const path = join(target, '.templateoverrides');
	if (existsSync(path)) return;
	writeFileSync(path, `${TEMPLATE_OVERRIDES.join('\n')}\n`);
}

/**
 * Copy the template's durable feature records and roadmap into a freshly scaffolded app.
 *
 * `copyTemplateTree` cannot do this: it enumerates through git, and `.aidd/` is gitignored in the
 * template, so every derived app was born with an empty feature corpus and stayed that way until
 * someone ran the upgrade skill's Phase 9a by hand. Seeding here is what makes
 * `check:template-features` a meaningful gate on day one rather than a wall of missing records.
 *
 * The source corpus is validated first and any problem throws: an init that produced an app failing
 * its own quality gate would be worse than one that stopped and said why.
 *
 * Returns `null` when the source carries no `.aidd/features/` at all, which is not a corpus problem
 * but a property of the checkout: `/.aidd/` is gitignored here, so a clone of the published
 * repository has none. Scaffolding an app is the thing this repository exists to do, and it must not
 * stop because the optional blueprint is unavailable — the caller says so loudly and continues.
 */
export async function seedTemplateFeatures(source: string, target: string): Promise<null | number> {
	if (!existsSync(join(source, '.aidd', 'features'))) return null;

	const problems = validateTemplateCorpus(source);
	if (problems.length > 0) {
		throw new Error(`Template feature corpus at ${source} is not fit to seed from:
  ${problems.join('\n  ')}`);
	}

	const outcome = buildSyncPlan(source, target, { adopt: false, prune: true });
	if (outcome.plan.errors.length > 0) {
		throw new Error(`Seeding template features failed:
  ${outcome.plan.errors.join('\n  ')}`);
	}

	const result = await applyPlan(target, outcome.plan, { overwriteAppText: false });
	// A freshly copied app has no authored text yet, so a blocked record means the plan is not the
	// one this function thinks it is building.
	if (result.blocked.length > 0) {
		throw new Error(
			`Seeding declined to overwrite app text in a new app: ${result.blocked.join(', ')}`,
		);
	}
	return result.written.length;
}

/**
 * Re-stage every hook as executable. `git add -A` records hooks 100644 under core.fileMode=false,
 * and POSIX git refuses to run a non-executable hook — so without this the commit bakes in hooks
 * that never fire. The index --chmod is the only part that survives a clone.
 */
export function chmodHooks(target: string): void {
	const hookDir = join(target, '.githooks');
	if (!existsSync(hookDir)) return;
	for (const entry of readdirSync(hookDir, { withFileTypes: true })) {
		if (entry.isFile()) {
			run(['git', 'update-index', '--chmod=+x', `.githooks/${entry.name}`], target);
		}
	}
}
