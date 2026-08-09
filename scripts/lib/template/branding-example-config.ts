import type { BrandingValues } from './types.ts';

/**
 * Branding normalizer for `config/example.json`, the one tracked config a fresh clone of a derived
 * app actually has (the live `config/<slug>.json` is gitignored) and the one `README.md` tells an
 * operator to copy into place.
 *
 * It cannot reuse `normalizeDefaultsJson`. That function is an eraser: it assigns `{{SLUG}}`, the
 * cookie names, the ports and the database url unconditionally, so a file still carrying the
 * template's values normalizes to exactly the same text as a correctly branded one. Applied here it
 * would report every unbranded example config as clean, which is the precise failure this file
 * exists to catch — ten of the eleven derived apps ship an example config still declaring slug
 * `spernakit`, cookie `spernakit_auth` and `file:./data/spernakit.db`, six of them byte-identical
 * to the template's, because `config/` sat in the drift checker's excluded directories and the
 * manifest entry classifying this path as branded described a comparison that never ran.
 *
 * So this one asserts instead. Each side substitutes only its own declared branding — the template
 * side gets `TEMPLATE_BRANDING`, the app side gets whatever `loadAppBrandingValues` read out of the
 * app's live config — and a field is replaced with its placeholder only when it already holds the
 * value that side claims. A field holding anything else keeps its literal text and survives into
 * the comparison, so an app whose example config was never branded drifts, and an app whose example
 * config disagrees with its own running config drifts too. That is the same shape `normalizeReadme`
 * and `normalizeIndexHtml` use, and the reason those two catch branding faults that the defaults
 * normalizer structurally cannot.
 *
 * `app.name` and `app.description` are the deliberate exceptions, erased rather than asserted. A
 * display name and a one-line description drift from the live config as a matter of course
 * (fshr-infra-dash and g5 both do today) and that is an editorial difference, not a branding fault
 * that would collide two apps on one machine.
 */

/** Replace `obj[key]` with `placeholder`, but only where it still holds `expected`. */
function assertValue(
	obj: Record<string, unknown> | undefined,
	key: string,
	expected: unknown,
	placeholder: string,
): void {
	if (obj && obj[key] === expected) obj[key] = placeholder;
}

const COOKIE_FIELDS: readonly (readonly [string, string])[] = [
	['authCookieName', '_auth'],
	['csrfCookieName', '_csrf'],
	['refreshCookieName', '_refresh'],
];

export function normalizeExampleConfig(content: string, values: BrandingValues): string {
	try {
		const config = JSON.parse(content) as Record<string, unknown>;
		const section = (key: string): Record<string, unknown> | undefined =>
			config[key] as Record<string, unknown> | undefined;

		const app = section('app');
		if (app) {
			app['name'] = '{{NAME}}';
			app['description'] = '{{DESCRIPTION}}';
			assertValue(app, 'slug', values.slug, '{{SLUG}}');
		}

		const server = section('server');
		assertValue(server, 'frontendPort', Number(values.frontendPort), '{{FRONTEND_PORT}}');
		assertValue(server, 'backendPort', Number(values.backendPort), '{{BACKEND_PORT}}');
		assertValue(
			server,
			'frontendUrl',
			`http://localhost:${values.frontendPort}`,
			'http://localhost:{{FRONTEND_PORT}}',
		);
		assertValue(
			server,
			'backendUrl',
			`http://localhost:${values.backendPort}`,
			'http://localhost:{{BACKEND_PORT}}',
		);

		const security = section('security');
		for (const [field, suffix] of COOKIE_FIELDS) {
			assertValue(security, field, `${values.slug}${suffix}`, `{{SLUG}}${suffix}`);
		}

		assertValue(
			section('database'),
			'url',
			`file:./data/${values.slug}.db`,
			'file:./data/{{SLUG}}.db',
		);

		// The dev origin list is the one branded field that is not a scalar. Only the exact one-entry
		// list setup writes normalizes; an app that added a second origin keeps both and drifts, which
		// is the right answer for a CORS allowlist.
		const cors = section('cors');
		const origins = cors?.['frontendDevOrigins'];
		if (
			cors &&
			Array.isArray(origins) &&
			origins.length === 1 &&
			origins[0] === `http://localhost:${values.frontendPort}`
		) {
			cors['frontendDevOrigins'] = ['http://localhost:{{FRONTEND_PORT}}'];
		}

		return JSON.stringify(config, null, '\t');
	} catch {
		return content;
	}
}
