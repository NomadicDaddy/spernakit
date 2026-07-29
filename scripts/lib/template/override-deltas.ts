/**
 * What each accepted `.templateoverrides` entry is currently holding back.
 *
 * `check-template-drift.ts` answers "does the app still match what the template ships?", and a
 * `SKIP` or `KEEP` line answers it with "stop asking about this path". That is the whole point of an
 * override, and it is also the hole: from the moment the line is written, every later template
 * change to that file is invisible for as long as the override stands. The drift report shows the
 * path as `suppressed` and the reason its author typed, and nothing anywhere shows what the app is
 * no longer receiving.
 *
 * During the 2026-07-27 fleet dance a `SKIP docker/nginx.conf` taken for a single CSP token
 * (`data:` in `font-src`, for base64 woff2 fonts) had also withheld the template's brotli module
 * loads, `gzip_static`, and its `location ~ \.map$` deny block — the one that stops a stray source
 * map exposing the original TypeScript. Two other entries in the same file had frozen a settings tab
 * and a `sideEffects: false`. All three were recovered by a human re-reading the override text
 * against the new target, which is not a gate.
 *
 * The question this asks is therefore the inverse of drift's: not "how does the app differ", but
 * "what does the target version have here that the app does not". The answer is computed per entry
 * against a named target version, so it can be read before an upgrade rather than reconstructed
 * after one.
 *
 * `DELETED` entries are listed but never compared. They are presence overrides — they acknowledge
 * that a path is absent from one side on purpose (see overrides.ts) — so there is no app copy to
 * diff, and treating one as unreadable would fail the report for the state it exists to declare.
 */
import type {
	BrandingValues,
	ClassificationOverrides,
	DriftCategory,
	TemplateOverrideAction,
	TemplateOverrides,
} from './types.ts';

import { normalizeBranding } from './branding.ts';
import { classifyFile, toTemplatePath } from './classify.ts';
import { isSecurityRelevantPath } from './security.ts';
import { findRemovedLines, normalizeLineEndings } from './text.ts';
import { TEMPLATE_BRANDING } from './types.ts';

/**
 * - `delta`       the target version has content this entry withholds
 * - `empty`       the entry resolves and withholds nothing — a candidate for deletion
 * - `presence`    a `DELETED` entry, listed but not compared
 * - `unavailable` the comparison could not be made; the report fails closed rather than guess
 */
export type OverrideDeltaStatus = 'delta' | 'empty' | 'presence' | 'unavailable';

export interface OverrideDelta {
	action: TemplateOverrideAction;
	/** Lines the app copy has that the target does not. Context for review, never the verdict. */
	appOnly: string[];
	appPath: string;
	category: DriftCategory;
	/** The reason text recorded on the `.templateoverrides` line, verbatim. */
	reason: string;
	/** True when the path carries a security posture (see isSecurityRelevantPath). Sorts first. */
	security: boolean;
	status: OverrideDeltaStatus;
	/** The path the app copy is compared against — scaffold-mapped where that applies. */
	templatePath: string;
	/** When status === 'unavailable', what could not be read. */
	unavailable?: string;
	/** Lines the target version has that the app copy does not: what the override withholds. */
	withheld: string[];
}

export interface OverrideDeltaInput {
	/** The app's branding values, so a branded path is not reported for its own name and ports. */
	appBranding: BrandingValues | null;
	/** branded / infrastructure / security classification at the target version. */
	classification: ClassificationOverrides;
	overrides: TemplateOverrides;
	/** Read the app's copy of an app-relative path; null when the app does not carry it. */
	readApp: (appPath: string) => null | string;
	/** Read `git show v<target>:<templatePath>`; null when that tree has no such path. */
	readTemplate: (templatePath: string) => null | string;
}

/**
 * Put both sides into the form the drift checker compares.
 *
 * Branded paths go through `normalizeBranding` exactly as `checkFile` does, so an app's own name,
 * slug, ports and description are not reported as content the override withholds. A branded
 * classification never suppresses the entry itself: `Dockerfile` is branded, and a missing
 * `COPY scripts/require-bun.ts scripts/` survives normalization and is reported like any other line.
 *
 * `values` is null when branding must not be applied — either the path is not branded, or the app's
 * own values could not be resolved. In the second case NEITHER side is normalized: normalizing only
 * the template would replace its name and ports with placeholders the app copy has no way to match,
 * and report every one of them as withheld content.
 */
function normalizeForComparison(
	content: string,
	appPath: string,
	values: BrandingValues | null,
): string {
	if (values) return normalizeBranding(content, values, appPath);
	return normalizeLineEndings(content);
}

/** Compare one KEEP/SKIP entry against the target version. */
function compareEntry(
	appPath: string,
	action: TemplateOverrideAction,
	reason: string,
	input: OverrideDeltaInput,
): OverrideDelta {
	const templatePath = toTemplatePath(appPath);
	const category = classifyFile(appPath, input.classification);
	const base = {
		action,
		appOnly: [],
		appPath,
		category,
		reason,
		security: isSecurityRelevantPath(appPath),
		templatePath,
		withheld: [],
	};

	const templateContent = input.readTemplate(templatePath);
	if (templateContent === null) {
		return {
			...base,
			status: 'unavailable',
			unavailable: `the target version has no ${templatePath}`,
		};
	}
	const appContent = input.readApp(appPath);
	if (appContent === null) {
		return { ...base, status: 'unavailable', unavailable: `the app has no ${appPath}` };
	}

	const branded = category === 'branded' && input.appBranding !== null;
	const template = normalizeForComparison(
		templateContent,
		appPath,
		branded ? TEMPLATE_BRANDING : null,
	);
	const app = normalizeForComparison(appContent, appPath, branded ? input.appBranding : null);
	const withheld = findRemovedLines(template, app);
	return {
		...base,
		appOnly: findRemovedLines(app, template),
		status: withheld.length > 0 ? 'delta' : 'empty',
		withheld,
	};
}

/**
 * Order the report so the entries that matter are read first: security-relevant paths, then
 * alphabetically. Sorting is total and depends on nothing outside the entry, so two runs over the
 * same tree print the same report.
 */
function bySeverityThenPath(a: OverrideDelta, b: OverrideDelta): number {
	if (a.security !== b.security) return a.security ? -1 : 1;
	return a.appPath.localeCompare(b.appPath);
}

/**
 * One entry per `.templateoverrides` line, sorted security-first.
 *
 * Every entry in the file is accounted for, including the `DELETED` ones — an override the report
 * silently dropped would be an override nobody reviews, which is the failure this exists to end.
 */
export function computeOverrideDeltas(input: OverrideDeltaInput): OverrideDelta[] {
	const compared: OverrideDelta[] = [];
	const entries: [TemplateOverrideAction, Map<string, string>][] = [
		['KEEP', input.overrides.keep],
		['SKIP', input.overrides.skip],
	];
	for (const [action, map] of entries) {
		for (const [appPath, reason] of map) {
			compared.push(compareEntry(appPath, action, reason, input));
		}
	}

	const presence: OverrideDelta[] = [...input.overrides.deleted].map(([appPath, reason]) => ({
		action: 'DELETED',
		appOnly: [],
		appPath,
		category: classifyFile(appPath, input.classification),
		reason,
		security: isSecurityRelevantPath(appPath),
		status: 'presence',
		templatePath: toTemplatePath(appPath),
		withheld: [],
	}));

	return [...compared.sort(bySeverityThenPath), ...presence.sort(bySeverityThenPath)];
}
