/**
 * Which template-managed paths carry a security posture.
 *
 * Two questions live here because they must be answered from the same place and are not the same
 * question: which drift FAILS the gate, and which findings a human reads FIRST. Both are properties
 * of the checker rather than per-release data, which is why neither is read from
 * `scripts/template-manifest.json` — see the note on SECURITY_INFRASTRUCTURE_FILES.
 */
import path from 'node:path';

/**
 * Security-critical template-managed files whose drift or removal must FAIL the
 * drift gate in derived apps (a gutted auth route cannot pass silently), rather
 * than being reported as advisory `infrastructure` warnings.
 *
 * This set is a property of the drift checker itself, deliberately not a key in
 * scripts/template-manifest.json. Keeping the list here lets the security gate
 * harden across all derived apps without reclassifying the template manifest.
 * Files here take precedence over their `infrastructure` listing in the manifest.
 */
export const SECURITY_INFRASTRUCTURE_FILES: readonly string[] = [
	'backend/src/config/configSchemas/security.ts',
	'backend/src/create-api-app.ts',
	'backend/src/routes/auth/index.ts',
];

/**
 * True when template content at this path carries a security posture, so a report that ranks
 * findings must put it first.
 *
 * Deliberately WIDER than the `security-infrastructure` classification above, and for a different
 * job. That classification decides which drift FAILS the gate, so it is kept to three files whose
 * every line is security-critical. This predicate decides which findings a human reads FIRST, and
 * the 2026-07-27 dance showed the failure it has to catch: a `SKIP docker/nginx.conf` taken for one
 * CSP token silently withheld the template's `location ~ \.map$` deny block, which is not one of
 * those three files and never would be.
 *
 * The extra rules name the surfaces where that can happen: `docker/` (the reverse proxy, its CSP
 * map, and the image entrypoints), the request-pipeline plugins (`cors`, `csrf`, `rateLimit`,
 * `securityHeaders`), the route guards, and anything whose filename says guard — which is how the
 * git hooks' leak guard and `passwordChangeGuard.ts` are reached.
 *
 * It is computed here rather than read from `scripts/template-manifest.json`, which has no security
 * key and must not grow one: the manifest is per-release data an app inherits, and a security rule
 * an app could inherit stale is a rule that can be silently turned off.
 */
export function isSecurityRelevantPath(appPath: string): boolean {
	if (SECURITY_INFRASTRUCTURE_FILES.includes(appPath)) return true;
	if (appPath.startsWith('docker/')) return true;
	if (appPath.startsWith('backend/src/plugins/')) return true;
	if (appPath.startsWith('backend/src/guards/')) return true;
	return /guard/i.test(path.basename(appPath));
}
