/**
 * Legal materials setup writes for a derived project: the container-distribution guidance it
 * rewrites in the project's own name, and the corresponding-source offer it drops in unfilled.
 *
 * Split from file-updates.ts, which is the branding pass. These are neither branding nor
 * customization — they are the compliance artifacts a project needs before it may publish an image.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import type { SetupSettings } from './config-writer.ts';

import { updateFile } from './json-files.ts';

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
	updateFile('licenses/CONTAINER-DISTRIBUTION.md', {
		"Derived-project owners should obtain legal advice for their own distribution model. Spernakit's\nlocal build and image checks prove buildability and inventory coverage; they do not grant a\nderived project permission to publish an image or fulfill that project's source obligations.": `If you publish an image, complete \`licenses/SOURCE-OFFER.md\` first: \`check:image-publication\`\nand \`docker:image:push\` both refuse to ship an image while it is missing or still contains\nplaceholders. If you never publish, delete that file and the publication scripts instead —\nnothing obliges you to make an offer for software you do not distribute. Obtain legal advice for\nyour own distribution model; the build and image checks prove buildability and inventory\ncoverage, not compliance.`,
		'Spernakit builds container images only as local verification artifacts. The template project\ndoes not publish, supply, or offer those images to downstream users. This document is guidance,\nnot a corresponding-source offer by NomadicDaddy.': `${s.appName} builds container images with \`bun run docker:image:build\`. Whether it publishes\nthem is this project's decision. This document is guidance, not a corresponding-source offer by\nthe Spernakit template or its author.`,
	});

	// Consuming the template is a one-way step, so this pass has to survive being re-run. `reset`
	// re-invokes setup on an already-initialized project, where the template is long gone and the
	// offer may carry the owner's real legal entity and contact address. Regenerating from a
	// missing template would throw; regenerating from a present one would silently discard those
	// answers. Once the offer exists, it is the owner's file and setup leaves it alone.
	if (!existsSync('licenses/SOURCE-OFFER.template.md')) {
		if (existsSync('licenses/SOURCE-OFFER.md')) return;
		throw new Error(
			'licenses/SOURCE-OFFER.md and licenses/SOURCE-OFFER.template.md are both missing; ' +
				'restore one from the template before running setup.',
		);
	}

	// The offer arrives unfilled on purpose: it only binds a project that actually distributes,
	// and the remaining placeholders (<LEGAL ENTITY>, <CONTACT ADDRESS>) are decisions its owner
	// has to make. Both gates refuse to ship an image while any of them survive.
	const template = readFileSync('licenses/SOURCE-OFFER.template.md', 'utf8');
	const offer = template
		.replace(/<!--[\s\S]*?-->\n\n/, '') // the template-only preamble
		.replaceAll('<PROJECT NAME>', s.appName);
	writeFileSync('licenses/SOURCE-OFFER.md', offer);
	rmSync('licenses/SOURCE-OFFER.template.md', { force: true });
}
