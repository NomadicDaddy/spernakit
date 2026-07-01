/**
 * Shared glob constants consumed by the smoke cache step dependency map.
 */

export const COMMON_EXCLUDES = [
	'**/node_modules/**',
	'**/dist/**',
	'.git/**',
	'logs/**',
	'backups/**',
	'artifacts/**',
	'.aidd/**',
	'.claude/**',
];

export const PACKAGE_GLOBS = [
	'package.json',
	'bun.lock',
	'backend/package.json',
	'frontend/package.json',
	'shared/package.json',
];

export const CONFIG_JSON_GLOBS = [
	'backend/src/config/**/*.json',
	'config/**/*.json',
	'config/**/*.json.example',
];

export const CONFIG_SCHEMA_GLOBS = [
	'backend/src/config/**/*.ts',
	...CONFIG_JSON_GLOBS,
	'package.json',
	'scripts/load-json-config.ts',
];

export const PRETTIER_CANDIDATE_GLOBS = [
	'**/*.css',
	'**/*.html',
	'**/*.js',
	'**/*.json',
	'**/*.jsx',
	'**/*.md',
	'**/*.toml',
	'**/*.ts',
	'**/*.tsx',
	'**/*.yaml',
	'**/*.yml',
];

export const FORMAT_GLOBS = ['.prettierrc', '.prettierignore', ...PACKAGE_GLOBS];

export const LINT_GLOBS = [
	'backend/src/**/*.ts',
	'frontend/**/*.js',
	'frontend/**/*.jsx',
	'frontend/**/*.ts',
	'frontend/**/*.tsx',
	'shared/src/**/*.ts',
	'scripts/**/*.ts',
	'eslint.config.js',
	'frontend/eslint.config.js',
	'frontend/tsconfig*.json',
	...PACKAGE_GLOBS,
];

export const SOURCE_GLOBS = [
	'backend/src/**/*.ts',
	'frontend/src/**/*.ts',
	'frontend/src/**/*.tsx',
	'shared/src/**/*.ts',
];

export const APPLICATION_CHECK_FILE_GLOBS = [
	'.env*',
	'backend/src/config/configUtils.ts',
	'backend/src/config/defaults.json',
	'backend/src/plugins/securityHeaders.ts',
	'backend/package.json',
	'config/**/*.json',
	'docker/nginx.conf',
	'frontend/index.html',
	'frontend/package.json',
	'package.json',
	'scripts/check-application.ts',
	'scripts/lib/app-config-types.ts',
	'scripts/lib/check-application/**/*.ts',
	'scripts/lib/crypto-keys.ts',
	'scripts/load-json-config.ts',
	'**/*.db',
];

export const APPLICATION_CHECK_DIRECTORY_GLOBS = [
	'backend/backup',
	'backend/backups',
	'backend/data',
	'frontend/backup',
	'frontend/backups',
	'frontend/data',
];
