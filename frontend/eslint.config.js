import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import perfectionist from 'eslint-plugin-perfectionist';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

/**
 * Inline plugin replacing eslint-plugin-import (incompatible with ESLint 10).
 * Only the no-default-export rule is needed.
 */
const noDefaultExportPlugin = {
	rules: {
		'no-default-export': {
			create(context) {
				return {
					ExportDefaultDeclaration(node) {
						context.report({ message: 'Prefer named exports.', node });
					},
				};
			},
			meta: { schema: [], type: 'suggestion' },
		},
	},
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
	{
		ignores: [
			'dist',
			'dev-dist',
			'eslint.config.js',
			'tailwind.config.js',
			'vite.config.ts',
			'artifacts/**/*',
			'node_modules',
		],
	},
	{
		extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			ecmaVersion: 2022,
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				project: ['./tsconfig.node.json', './tsconfig.app.json'],
				tsconfigRootDir: __dirname,
			},
		},
		plugins: {
			import: noDefaultExportPlugin,
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
			perfectionist,
		},
		rules: {
			...reactHooks.configs.flat.recommended.rules,

			'@typescript-eslint/array-type': ['error', { default: 'array' }],
			'@typescript-eslint/ban-ts-comment': 'error',
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ fixStyle: 'inline-type-imports', prefer: 'type-imports' },
			],
			'@typescript-eslint/no-explicit-any': 'error',

			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],

			'@typescript-eslint/require-await': 'off',
			'@typescript-eslint/no-floating-promises': 'warn',
			'@typescript-eslint/no-misused-promises': 'warn',

			eqeqeq: ['error', 'always'],
			'import/no-default-export': 'error',
			'no-console': ['error', { allow: ['debug', 'info', 'warn', 'error'] }],
			'prefer-const': 'error',

			'react-hooks/rules-of-hooks': 'warn',
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

			'perfectionist/sort-array-includes': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-enums': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-exports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-heritage-clauses': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-imports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-interfaces': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-intersection-types': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-jsx-props': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-maps': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-named-exports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-named-imports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-object-types': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-objects': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-sets': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-switch-case': ['error', { order: 'asc', type: 'alphabetical' }],
			'perfectionist/sort-union-types': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'sort-keys': 'off',
		},
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			ecmaVersion: 2022,
			globals: { ...globals.node, ...globals.es2021 },
			sourceType: 'module',
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
	{
		files: ['src/contexts/**/*.{ts,tsx}'],
		rules: {
			'react-refresh/only-export-components': 'off',
		},
	},
	{
		files: ['src/hooks/*.{ts,tsx}'],
		rules: {
			'react-refresh/only-export-components': 'off',
		},
	},
	{
		files: ['src/components/ui/**/*.{ts,tsx}'],
		rules: {
			'react-refresh/only-export-components': 'off',
		},
	},
	{
		files: ['src/**/*.{ts,tsx}'],
		rules: {
			// Theme tokens are OKLCH values, not HSL channel triplets. Stock shadcn snippets
			// ship `hsl(var(--token))`, which here produces invalid CSS the browser silently
			// drops — the failure is a missing border or a transparent surface, not an error.
			// Reference the token directly: `var(--token)`, or use the Tailwind token class.
			'no-restricted-syntax': [
				'error',
				{
					message:
						'Theme tokens are OKLCH, not HSL triplets — use var(--token) or the Tailwind token class, not hsl(var(--token)).',
					selector: 'Literal[value=/hsl\\(\\s*var\\(/]',
				},
				{
					message:
						'Theme tokens are OKLCH, not HSL triplets — use var(--token) or the Tailwind token class, not hsl(var(--token)).',
					selector: 'TemplateElement[value.raw=/hsl\\(\\s*var\\(/]',
				},
			],
		},
	},
]);
