/**
 * The two things about a built image that can only be learned by opening it: whether the notices
 * arrived, and whether every package that ships carries its terms somewhere.
 *
 * Extracted from scripts/check-image-licenses.ts (max-lines split). Nothing here exits the process;
 * each verification prints its own report and returns whether it passed, so the gate keeps sole
 * ownership of the exit code.
 */
import { runInImage, storeDirName } from './image-inventory.ts';

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

/** The name half of the `<name>@<version>` identity the attribution uses throughout. */
function packageNameOf(entry: string): string {
	return entry.slice(0, entry.lastIndexOf('@'));
}

/**
 * The file under `/app/licenses` that carries this SPDX identifier's text. `-only` and `-or-later`
 * choose which versions of the licence may be applied; both point at the same document.
 */
function licenseTextPath(spdx: string): string {
	return `/app/licenses/${spdx.replace(/-(?:only|or-later)$/, '')}.txt`;
}

/**
 * Reads the `license` field each package declares in the image. Deliberately takes the whole
 * remainder of the line rather than the first word, so a compound SPDX expression stays intact and
 * fails the coverage test below instead of silently matching on one of its halves.
 */
async function readDeclaredLicenses(
	image: string,
	entries: string[],
): Promise<Map<string, string>> {
	const script = entries
		.map((entry) => {
			const dir = `/app/node_modules/.bun/${storeDirName(entry)}/node_modules`;
			const manifest = `${dir}/${packageNameOf(entry)}/package.json`;
			const read = `sed -n 's/.*"license": *"\\([^"]*\\)".*/\\1/p' ${manifest} 2>/dev/null | head -1`;
			return `echo "DECLARED ${entry} $(${read})"`;
		})
		.join('; ');

	const declared = new Map<string, string>();
	for (const line of (await runInImage(image, script)).split('\n')) {
		if (!line.startsWith('DECLARED ')) continue;
		const rest = line.slice('DECLARED '.length).trim();
		const separator = rest.indexOf(' ');
		if (separator > 0) declared.set(rest.slice(0, separator), rest.slice(separator + 1).trim());
	}
	return declared;
}

/**
 * For a package the generating machine cannot install, the attribution has to be verified where it
 * actually ships. Bun lays each package out at `.bun/<name>@<version>/node_modules/<name>/`, so the
 * package's own LICENSE travels with the binary; this confirms it arrived.
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
): Promise<boolean> {
	const script = entries
		.map((entry) => {
			const dir = `/app/node_modules/.bun/${storeDirName(entry)}/node_modules`;
			const find = `find ${dir} -maxdepth 3 -iname 'licen[cs]e*' -print -quit 2>/dev/null`;
			return `[ -n "$(${find})" ] || echo "MISSING ${entry}"`;
		})
		.join('; ');

	const missing = (await runInImage(image, script))
		.split('\n')
		.filter((line) => line.startsWith('MISSING'))
		.map((line) => line.replace('MISSING ', '').trim());

	if (missing.length === 0) return true;

	const declared = await readDeclaredLicenses(image, missing);
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
