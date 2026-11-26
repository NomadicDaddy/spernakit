/**
 * The two things about a built image that can only be learned by opening it: whether the notices
 * arrived, and whether every package that ships carries its terms somewhere.
 *
 * Extracted from scripts/check-image-licenses.ts (max-lines split). Nothing here exits the process;
 * each verification prints its own report and returns whether it passed, so the gate keeps sole
 * ownership of the exit code.
 */
import { runInImage } from './image-inventory.ts';
import { packageDir, type StorePackage } from './image-store.ts';

export const REQUIRED_IN_IMAGE = [
	'/app/LICENSE',
	'/app/THIRD_PARTY_LICENSES.md',
	'/app/THIRD_PARTY_NOTICES.md',
	'/app/licenses/GPL-2.0.txt',
	'/app/licenses/GPL-3.0.txt',
	'/app/licenses/LGPL-2.0.txt',
	'/app/licenses/LGPL-2.1.txt',
	'/app/licenses/LGPL-3.0.txt',
	'/app/licenses/BUN-LICENSE.md',
	'/app/licenses/CONTAINER-DISTRIBUTION.md',
	'/app/licenses/base-image-packages.md',
	'/app/licenses/base-image-versions.txt',
];

export async function verifyNoticesPresent(image: string): Promise<boolean> {
	const output = await runInImage(
		image,
		REQUIRED_IN_IMAGE.map((path) => `[ -e ${path} ] || echo MISSING ${path}`).join('; '),
	);
	const missing = output
		.split('\n')
		.filter((line) => line.startsWith('MISSING'))
		.map((line) => line.replace('MISSING ', '').trim());

	if (missing.length > 0) {
		console.error(`[FAIL] ${image} is missing license notices:`);
		for (const path of missing) console.error(`  - ${path}`);
		console.error('');
		console.error('The image ships Bun and GPL/LGPL Alpine components. Check the Dockerfile');
		console.error('COPY lines and ensure .dockerignore preserves the notices and guidance.');
		return false;
	}
	console.log(`[OK] ${image}: notices present (${REQUIRED_IN_IMAGE.length} files).`);
	return true;
}

/**
 * The file under `/app/licenses` that carries this SPDX identifier's text. `-only` and `-or-later`
 * choose which versions of the licence may be applied; both point at the same document.
 */
function licenseTextPath(spdx: string): string {
	return `/app/licenses/${spdx.replace(/-(?:only|or-later)$/, '')}.txt`;
}

/**
 * The shell probe for license files: one test per store directory of each entry, inside the
 * package's own directory (`.bun/<store dir>/node_modules/<name>`), never the `node_modules` above
 * it, where the dependencies linked beside the package would lend it their LICENSE. Each line it
 * prints names an entry and the directory that lacked one. Pure, so its paths can be tested.
 */
export function licenseProbeScript(
	entries: readonly string[],
	packages: ReadonlyMap<string, StorePackage>,
): string {
	return entries
		.flatMap((entry) => {
			const pkg = packages.get(entry);
			if (pkg === undefined) throw new Error(`no store directory was read for ${entry}`);
			return pkg.dirs.map((dir) => {
				const find = `find ${packageDir(dir, pkg.name)} -maxdepth 2 -iname 'licen[cs]e*' -print -quit 2>/dev/null`;
				return `[ -n "$(${find})" ] || echo "MISSING ${entry} ${dir}"`;
			});
		})
		.join('; ');
}

/**
 * For a package the generating machine cannot install, the attribution has to be verified where it
 * actually ships. Bun lays each package out at `.bun/<store dir>/node_modules/<name>/`, so the
 * package's own LICENSE travels with the binary; this confirms it arrived in every store directory
 * holding the release, since each peer variant is a separate copy.
 *
 * Shipping no license file is not by itself a gap. sharp's prebuilt libvips binaries publish `lib`,
 * `versions.json` and a README carrying the third-party table, and name their terms only in the
 * `license` field of package.json. The image already carries the full text of every GPL and LGPL
 * variant, so that pairing is complete: the manifest names the terms and the artifact supplies
 * them. Accept it rather than demanding a file the publisher does not produce, and fail when the
 * terms reach the image nowhere at all. Membership in `REQUIRED_IN_IMAGE` is proof the text is
 * present because `verifyNoticesPresent` has already checked every one of those paths on disk.
 */
export async function verifyImageCarriesLicenses(
	image: string,
	entries: string[],
	packages: ReadonlyMap<string, StorePackage>,
): Promise<boolean> {
	const lines = (await runInImage(image, licenseProbeScript(entries, packages))).split('\n');
	const missing = [
		...new Set(
			lines
				.filter((line) => line.startsWith('MISSING '))
				.map((line) => line.split(' ')[1] ?? ''),
		),
	].filter(Boolean);

	if (missing.length === 0) return true;

	// The `license` field each manifest declares, read whole when the store was collected, so a
	// compound SPDX expression stays intact and fails coverage instead of matching on one half.
	const declared = new Map<string, string>();
	for (const entry of missing) {
		const license = packages.get(entry)?.license;
		if (license !== undefined && license !== '') declared.set(entry, license);
	}
	const uncovered = missing.filter((entry) => {
		const spdx = declared.get(entry);
		return spdx === undefined || !REQUIRED_IN_IMAGE.includes(licenseTextPath(spdx));
	});

	if (uncovered.length > 0) {
		console.error(
			`[FAIL] ${image} ships ${uncovered.length} package(s) with no license terms at all:`,
		);
		for (const entry of uncovered) {
			console.error(`  - ${entry} (declares ${declared.get(entry) ?? 'nothing'})`);
		}
		console.error('');
		console.error('These are built for a platform this machine does not install, so the');
		console.error(
			'notices name them rather than reproducing their terms. The image is then the',
		);
		console.error('only place their license text can travel, and it did not arrive. Either');
		console.error('the package must carry its own license file or the image must ship the');
		console.error('text of the licence it declares under /app/licenses.');
		return false;
	}

	console.log(
		`[OK] ${image}: ${missing.length} package(s) ship no license file; /app/licenses carries ` +
			'their terms:',
	);
	for (const entry of missing) console.log(`  - ${entry} (${declared.get(entry)})`);
	return true;
}
