/**
 * The npm packages a built image ships, read from Bun's store under `/app/node_modules/.bun`.
 *
 * A store directory's name is not a reliable identity. Bun spells a scoped package
 * `@scope+name@version`, and from Bun 1.4.5 it adds `+<16 hex digits>` to a release installed once
 * per distinct set of peers. A real semver build tag can look exactly like that suffix, so no
 * reading of the name alone can tell them apart. Each package's own package.json can, so the
 * identity here is the manifest's `<name>@<version>`, and the directory name only says where to
 * look. Every function except collectImagePackages is pure, so the parsing is testable without a
 * docker daemon.
 */

import { runInImage } from './image-inventory.ts';

export const STORE = '/app/node_modules/.bun';

/** One release in the image: its manifest name, version and license, and every directory holding it. */
export interface StorePackage {
	dirs: string[];
	license: string;
	name: string;
	version: string;
}

/**
 * The package name a store directory holds, read from the directory's name: `@scope+name@…` holds
 * `@scope/name`, and `name@…` holds `name`. Entries that are not packages (`.cache`, `node_modules`)
 * give undefined. collectImagePackages checks the answer against the manifest it finds there.
 */
export function storeDirPackageName(dir: string): string | undefined {
	if (dir.startsWith('.') || !dir.includes('@')) return undefined;
	if (!dir.startsWith('@')) return dir.slice(0, dir.indexOf('@'));
	const plus = dir.indexOf('+');
	const at = dir.indexOf('@', 1);
	if (plus < 0 || at < 0 || plus > at)
		throw new Error(`unrecognised store directory name: ${dir}`);
	return `${dir.slice(0, plus)}/${dir.slice(plus + 1, at)}`;
}

/** Where a store directory keeps the package itself, as opposed to the dependencies linked beside it. */
export function packageDir(dir: string, name: string): string {
	return `${STORE}/${dir}/node_modules/${name}`;
}

/** A store directory's package.json, which must be a JSON object. */
function parseManifest(dir: string, text: string): Record<string, unknown> {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`${dir} has no readable package.json`);
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${dir}'s package.json is not an object`);
	}
	return value as Record<string, unknown>;
}

/**
 * Groups `<store dir>\t<package.json on one line>` records into releases keyed `<name>@<version>`
 * from each manifest. Peer variants of one release collapse into one entry with all their
 * directories; two releases whose directory names differ only by a 16-hex build tag stay apart. A
 * manifest naming a different package than its directory, variants of one release declaring
 * different licenses, or a line that isn't a directory, a tab and a JSON object (a name holding a
 * line break, or a missing package.json) fail loudly rather than being attributed on a guess.
 */
export function groupStoreManifests(records: string): Map<string, StorePackage> {
	const packages = new Map<string, StorePackage>();
	for (const line of records.split('\n')) {
		if (line.trim() === '') continue;
		const tab = line.indexOf('\t');
		if (tab <= 0) throw new Error(`unexpected store record: ${JSON.stringify(line)}`);
		const dir = line.slice(0, tab).trim();
		const manifest = parseManifest(dir, line.slice(tab + 1));
		const expected = storeDirPackageName(dir);
		if (expected === undefined) throw new Error(`not a package store directory: ${dir}`);
		if (manifest.name !== expected || typeof manifest.version !== 'string') {
			throw new Error(
				`${dir} holds a manifest for ${String(manifest.name)}, not ${expected}`,
			);
		}
		const license = typeof manifest.license === 'string' ? manifest.license : '';
		const identity = `${expected}@${manifest.version}`;
		const known = packages.get(identity);
		if (known === undefined) {
			packages.set(identity, {
				dirs: [dir],
				license,
				name: expected,
				version: manifest.version,
			});
		} else if (known.license !== license) {
			throw new Error(`${identity}: ${known.dirs[0]} and ${dir} declare different licenses`);
		} else {
			known.dirs.push(dir);
		}
	}
	return new Map([...packages].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * The shell that walks a store: for each package directory it prints the directory name, a tab,
 * and the package's package.json with its line breaks removed (JSON allows them only between
 * tokens). It derives the package name the same way storeDirPackageName does, and
 * groupStoreManifests checks it against the manifest.
 */
export function storeManifestScript(store: string): string {
	return [
		`cd ${store} 2>/dev/null || exit 0`,
		'for d in *@*; do',
		'[ -d "$d" ] || continue',
		'case $d in @*) r=${d#*+}; n="${d%%+*}/${r%%@*}";; *) n=${d%%@*};; esac',
		'printf "%s\\t" "$d"',
		'tr -d "\\r\\n" < "$d/node_modules/$n/package.json"',
		'echo',
		'done',
	].join('\n');
}

/** Every npm release in the image, keyed `<name>@<version>` from its own manifest, in one `docker run`. */
export async function collectImagePackages(image: string): Promise<Map<string, StorePackage>> {
	return groupStoreManifests(await runInImage(image, storeManifestScript(STORE)));
}
