/**
 * Legal materials setup writes for a derived project: the container-distribution guidance it
 * rewrites in the project's own name, and the corresponding-source offer it drops in unfilled.
 *
 * Split from file-updates.ts, which is the branding pass. These are neither branding nor
 * customization — they are the compliance artifacts a project needs before it may publish an image.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import type { SetupSettings } from './config-writer.ts';

import { updateFile, updateJsonFile } from './json-files.ts';

/** Placeholder written when nobody can be named; the owner has to replace it. */
export const COPYRIGHT_HOLDER_PLACEHOLDER = '<COPYRIGHT HOLDER>';

/** Where a derived app keeps the template's MIT notice, which MIT requires it to retain. */
export const TEMPLATE_LICENSE_COPY = 'licenses/SPERNAKIT-LICENSE.txt';

/**
 * Who owns a new derived app: the person running init, by their git identity. The template's own
 * copyright line names the template's author, who is not the owner of someone else's app. Without
 * a git identity there is nobody to name, so the LICENSE carries a placeholder the owner must fill.
 */
/**
 * The variables `git config user.name` reads: where to find the program, where the user's global
 * config lives, and git's own overrides. Nothing else from this process reaches git.
 */
const GIT_IDENTITY_ENV = [
	'APPDATA',
	'GIT_CONFIG_GLOBAL',
	'GIT_CONFIG_NOSYSTEM',
	'GIT_CONFIG_SYSTEM',
	'HOME',
	'HOMEDRIVE',
	'HOMEPATH',
	'PATH',
	'Path',
	'SystemRoot',
	'USERPROFILE',
	'XDG_CONFIG_HOME',
];

function gitIdentityEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key of GIT_IDENTITY_ENV) {
		const value = process.env[key];
		if (value !== undefined) env[key] = value;
	}
	return env;
}

function appCopyrightHolder(): string {
	try {
		const result = Bun.spawnSync(['git', 'config', 'user.name'], {
			// Passed explicitly and narrowed: Bun otherwise hands the child the whole environment this
			// process started with, not the current one.
			env: gitIdentityEnv(),
			stderr: 'ignore',
			windowsHide: true,
		});
		const name = result.exitCode === 0 ? result.stdout.toString().trim() : '';
		if (name) return name;
	} catch {
		// git is not installed; there is still nobody to name.
	}
	return COPYRIGHT_HOLDER_PLACEHOLDER;
}

/**
 * Replace the template's MIT attestation with a license the app owns.
 *
 * The MIT `LICENSE` belongs to Spernakit, the template. init copies it verbatim, so every derived
 * app used to declare itself MIT without anyone choosing that, and because nothing marked the file
 * as the app's own, each template upgrade treated a replacement as drift and restored MIT. A
 * derived app starts all-rights-reserved instead, declared `UNLICENSED` in package.json, until its
 * owner picks a license. init seeds `KEEP LICENSE` so upgrades leave the result alone.
 *
 * That same `KEEP` is the owner's opt-out: an app that carries it, or whose LICENSE is no longer
 * the template's MIT text, has already made its decision and is not touched on a re-run.
 *
 * The app is built from Spernakit, so it contains a substantial portion of MIT-licensed software
 * and has to keep that notice. The template's LICENSE moves to `licenses/SPERNAKIT-LICENSE.txt` rather than
 * being discarded, and the app's LICENSE points to it.
 */
function claimAppLicense(s: SetupSettings): void {
	const overrides = existsSync('.templateoverrides')
		? readFileSync('.templateoverrides', 'utf8')
		: '';
	if (/^KEEP\s+LICENSE(?:\s|$)/m.test(overrides)) return;
	const inherited = existsSync('LICENSE') ? readFileSync('LICENSE', 'utf8') : '';
	if (!inherited.startsWith('MIT License')) return;
	if (!/^Copyright \(c\) \d{4} .+$/m.test(inherited))
		throw new Error('LICENSE is the MIT template text but names no copyright holder.');
	writeFileSync(TEMPLATE_LICENSE_COPY, inherited);
	const holder = appCopyrightHolder();
	const year = new Date().getFullYear();
	writeFileSync(
		'LICENSE',
		`Copyright (c) ${year} ${holder}. All rights reserved.\n\n` +
			`${s.appName} is proprietary software. No license is granted to use, copy, modify, merge,\n` +
			'publish, distribute, sublicense or sell it, in whole or in part, without the prior written\n' +
			'permission of the copyright holder.\n\n' +
			'Third-party components keep their own licenses. See THIRD_PARTY_LICENSES.md and\n' +
			'THIRD_PARTY_NOTICES.md.\n\n' +
			'This project was created from the Spernakit template, which is licensed under the MIT\n' +
			`License. That notice is retained in ${TEMPLATE_LICENSE_COPY}.\n`,
	);
	console.log('✅ Updated: LICENSE (all rights reserved)');
	console.log(`✅ Kept: ${TEMPLATE_LICENSE_COPY} (the template's MIT notice)`);
	if (holder === COPYRIGHT_HOLDER_PLACEHOLDER)
		console.log(
			`⚠️  LICENSE names no owner: replace ${COPYRIGHT_HOLDER_PLACEHOLDER} (git user.name was not set).`,
		);
	updateJsonFile('package.json', (pkg) => {
		pkg['license'] = 'UNLICENSED';
	});
}

/**
 * License materials a derived project needs before it can publish an image.
 *
 * The template ships guidance and no offer, because it distributes nothing. A derived project
 * that publishes DOES distribute, so it needs its own offer — and shipping the template's
 * guidance verbatim would be worse than shipping nothing: it names Spernakit and NomadicDaddy,
 * and an owner could reasonably read it as covering them. So setup rewrites the guidance for
 * this project and drops in the offer template, with placeholders that the publication guard and
 * `docker:image:push` both refuse to ship.
 */
export function updateLicenseFiles(s: SetupSettings): void {
	claimAppLicense(s);
	updateFile('licenses/CONTAINER-DISTRIBUTION.md', {
		"Derived-project owners should obtain legal advice for their own distribution model. Spernakit's\nlocal build and image checks prove buildability and inventory coverage; they do not grant a\nderived project permission to publish an image or fulfill that project's source obligations.": `If you publish an image, complete \`licenses/SOURCE-OFFER.md\` first: \`check:image-publication\`\nand \`docker:image:push\` both refuse to ship an image while it is missing or still contains\nplaceholders. If you never publish, delete that file and the publication scripts instead —\nnothing obliges you to make an offer for software you do not distribute. Obtain legal advice for\nyour own distribution model; the build and image checks prove buildability and inventory\ncoverage, not compliance.`,
		'Spernakit builds container images only as local verification artifacts. The template project\ndoes not publish, supply, or offer those images to downstream users. This document is guidance,\nnot a corresponding-source offer by NomadicDaddy.': `${s.appName} builds container images with \`bun run docker:image:build\`. Whether it publishes\nthem is this project's decision. This document is guidance, not a corresponding-source offer by\nthe Spernakit template or its author.`,
	});

	// Consuming the template is a one-way step, so this pass has to survive being re-run. `reset`
	// re-invokes setup on an already-initialized project, where the offer may carry the owner's real
	// legal entity and contact address. Once it exists it is the owner's file and setup leaves it
	// alone — tested BEFORE the template, because the two can coexist: an interrupted run that wrote
	// the offer but had not yet deleted the template leaves both on disk, as does a template upgrade
	// that re-adds the template file to a project whose offer is long since filled in. Deciding by
	// the template's presence would discard the owner's answers in exactly those cases.
	if (existsSync('licenses/SOURCE-OFFER.md')) return;
	if (!existsSync('licenses/SOURCE-OFFER.template.md')) {
		throw new Error(
			'licenses/SOURCE-OFFER.md and licenses/SOURCE-OFFER.template.md are both missing; ' +
				'restore one from the template before running setup.',
		);
	}

	// The offer arrives unfilled on purpose: it only binds a project that actually distributes,
	// and the remaining placeholders (<LEGAL ENTITY>, <CONTACT ADDRESS>) are decisions its owner
	// has to make. Both gates refuse to ship an image while any of them survive.
	const template = readFileSync('licenses/SOURCE-OFFER.template.md', 'utf8');
	// The template carries one comment block addressed to whoever is reading the TEMPLATE, which has
	// no place in a project's actual offer. It is cut by locating that block's delimiters rather than
	// by pattern-replacing HTML: this removes one known section from a file the repository ships, and
	// writing it as a replace invites reading it as sanitization of untrusted markup, which it is not.
	const open = template.indexOf('<!--');
	const close = open === -1 ? -1 : template.indexOf('-->', open);
	const body =
		close === -1
			? template
			: template.slice(0, open) + template.slice(close + '-->'.length).replace(/^\n+/, '');
	// The replacement is a function for the same reason updateFile's is: a string replacement
	// honours `$&` and friends, so a project name carrying one would rewrite the legal document
	// around it instead of appearing in it.
	const offer = body.replaceAll('<PROJECT NAME>', () => s.appName);
	writeFileSync('licenses/SOURCE-OFFER.md', offer);
	rmSync('licenses/SOURCE-OFFER.template.md', { force: true });
}
