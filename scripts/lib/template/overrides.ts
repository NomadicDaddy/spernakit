/**
 * `.templateoverrides` parsing and application for the template drift/sync tooling.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { FileResult, TemplateOverrideAction, TemplateOverrides } from './types.ts';

const VALID_OVERRIDE_ACTIONS = new Set<TemplateOverrideAction>(['DELETED', 'KEEP', 'SKIP']);

/**
 * Parse the app's `.templateoverrides` file (if present) into action maps.
 *
 * File format (line-based):
 *   # comment
 *   ACTION  PATH  [# REASON]
 *
 * Where ACTION is one of: DELETED, SKIP, KEEP.
 *   - SKIP / KEEP: drift detection treats this file as 'suppressed' instead of 'drifted'
 *   - DELETED:     drift detection treats a missing-in-app file as 'suppressed' instead of 'missing'
 *
 * Returns empty maps if the file is absent, blank, or unparseable.
 */
export function loadTemplateOverrides(repoRoot: string): TemplateOverrides {
	const overrides: TemplateOverrides = {
		deleted: new Map(),
		keep: new Map(),
		skip: new Map(),
	};
	const filePath = path.join(repoRoot, '.templateoverrides');
	let content: string;
	try {
		content = fs.readFileSync(filePath, 'utf8');
	} catch {
		return overrides;
	}

	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		if (!raw) continue;
		const line = raw.trim();
		if (line.length === 0 || line.startsWith('#')) continue;

		// Split into action + rest, then peel off optional inline `# reason`
		const firstSpace = line.search(/\s/);
		if (firstSpace === -1) {
			console.log(
				`   Warning: .templateoverrides line ${i + 1} is missing a path: "${line}"`
			);
			continue;
		}
		const action = line.slice(0, firstSpace).toUpperCase() as TemplateOverrideAction;
		if (!VALID_OVERRIDE_ACTIONS.has(action)) {
			console.log(
				`   Warning: .templateoverrides line ${i + 1} has unknown action "${action}" (expected DELETED, SKIP, or KEEP)`
			);
			continue;
		}
		const rest = line.slice(firstSpace).trim();
		const reasonStart = rest.indexOf('#');
		const filePathPart = (reasonStart === -1 ? rest : rest.slice(0, reasonStart)).trim();
		const reason = reasonStart === -1 ? '' : rest.slice(reasonStart + 1).trim();
		if (filePathPart.length === 0) {
			console.log(
				`   Warning: .templateoverrides line ${i + 1} has an empty path after action "${action}"`
			);
			continue;
		}

		// Normalise to forward-slash paths so it matches enumerateTemplateFiles output
		const normalisedPath = filePathPart.replace(/\\/g, '/');
		const target =
			action === 'DELETED'
				? overrides.deleted
				: action === 'KEEP'
					? overrides.keep
					: overrides.skip;
		target.set(normalisedPath, reason);
	}

	return overrides;
}

/**
 * Apply `.templateoverrides` to a list of file results, converting drifted
 * SKIP/KEEP entries and missing DELETED entries to status 'suppressed'.
 */
export function applyTemplateOverrides(
	results: FileResult[],
	overrides: TemplateOverrides
): FileResult[] {
	return results.map((r) => {
		if (r.status === 'drifted') {
			const skipReason = overrides.skip.get(r.filePath);
			if (skipReason !== undefined) {
				return {
					...r,
					status: 'suppressed',
					suppression: { action: 'SKIP', reason: skipReason },
				};
			}
			const keepReason = overrides.keep.get(r.filePath);
			if (keepReason !== undefined) {
				return {
					...r,
					status: 'suppressed',
					suppression: { action: 'KEEP', reason: keepReason },
				};
			}
		}
		if (r.status === 'missing-in-app') {
			const deletedReason = overrides.deleted.get(r.filePath);
			if (deletedReason !== undefined) {
				return {
					...r,
					status: 'suppressed',
					suppression: { action: 'DELETED', reason: deletedReason },
				};
			}
		}
		return r;
	});
}
