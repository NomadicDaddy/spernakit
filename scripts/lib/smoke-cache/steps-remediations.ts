/** Cache inputs for the focused template remediations landed together in September 2026. */
import { COMMON_EXCLUDES } from './globs.ts';
import { type StepDependencies } from './types.ts';

export const REMEDIATION_STEP_DEPENDENCIES: Record<string, StepDependencies> = {
	'test:audit-plugin-lifecycle': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/src/plugins/audit.ts', 'scripts/test-audit-plugin-lifecycle.ts'],
	},
	'test:child-output-redaction': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'scripts/dev-with-logs.ts',
			'scripts/lib/process/scrubbed-child.ts',
			'scripts/lib/process/secret-scrubber.ts',
			'scripts/lib/process/spawn-background.ts',
			'scripts/test-child-output-redaction.ts',
		],
	},
	'test:field-encryption-rotation': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/drizzle/**',
			'backend/src/config/**',
			'backend/src/db/schema/**',
			'backend/src/services/fieldEncryptionRotationService.ts',
			'backend/src/utils/encryption.ts',
			'scripts/test-field-encryption-rotation.ts',
		],
	},
	'test:lockout-refresh': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'backend/drizzle/**',
			'backend/src/routes/auth/refresh.ts',
			'backend/src/utils/auth/**',
			'scripts/test-lockout-refresh.ts',
		],
	},
	'test:nginx-security': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'docker/nginx.conf',
			'scripts/lib/nginx-security.ts',
			'scripts/test-nginx-security.ts',
		],
	},
	'test:prettier-cache': {
		excludes: COMMON_EXCLUDES,
		globs: ['.prettierrc', 'package.json', 'scripts/test-prettier-cache.ts'],
	},
	'test:secret-permissions': {
		excludes: COMMON_EXCLUDES,
		globs: ['backend/src/config/secretPermissions.ts', 'scripts/test-secret-permissions.ts'],
	},
	'test:static-delivery-probe': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'scripts/lib/compression-probe.ts',
			'scripts/lib/static-delivery.ts',
			'scripts/test-static-delivery-probe.ts',
			'scripts/verify-compression.ts',
		],
	},
	'test:vendored-licenses': {
		excludes: COMMON_EXCLUDES,
		globs: [
			'frontend/src/components/ui/**/*.tsx',
			'licenses/shadcn-ui-MIT.txt',
			'licenses/vendored-materials.json',
			'scripts/lib/third-party-licenses/vendored.ts',
			'scripts/test-vendored-licenses.ts',
		],
	},
};
