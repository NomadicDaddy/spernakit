/**
 * Command-line parsing for sync-template-features.ts, kept apart so the entrypoint stays under the
 * line cap. The options and their validation are unchanged.
 */
import { parseArgs } from 'node:util';

export interface CliOptions {
	adopt: boolean;
	all: boolean;
	apps: string[];
	check: boolean;
	json: boolean;
	overwriteAppText: boolean;
	prune: boolean;
	template: string | undefined;
}

/** Parse the command line; defaults to this process's own arguments, read here beside parseArgs. */
export function parseTemplateFeatureArgs(args: string[] = Bun.argv.slice(2)): CliOptions {
	const { values } = parseArgs({
		args,
		options: {
			adopt: { type: 'boolean' },
			all: { type: 'boolean' },
			app: { multiple: true, type: 'string' },
			check: { type: 'boolean' },
			json: { type: 'boolean' },
			'no-prune': { type: 'boolean' },
			'overwrite-app-text': { type: 'boolean' },
			template: { type: 'string' },
		},
		strict: true,
	});
	// parseArgs takes the token after a path flag as that flag's value even when the token is
	// itself a flag, so `--app --check` would name a directory nothing matches and push nowhere.
	for (const path of [...(values.app ?? []), values.template ?? '.']) {
		if (path.trim() === '' || path.startsWith('-')) {
			throw new Error('--app and --template each require a path.');
		}
	}
	return {
		adopt: values.adopt === true,
		all: values.all === true,
		apps: values.app ?? [],
		check: values.check === true,
		json: values.json === true,
		overwriteAppText: values['overwrite-app-text'] === true,
		prune: values['no-prune'] !== true,
		template: values.template,
	};
}
