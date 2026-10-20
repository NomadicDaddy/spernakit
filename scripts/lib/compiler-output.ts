/**
 * React Compiler output check: proves the compiler actually ran on the app's own components.
 *
 * Spernakit forbids manual memo, useMemo and useCallback because React Compiler memoizes instead
 * (scripts/lib/feature-integration/compiler-memoization.ts). That leaves nothing memoized at all if
 * the compiler is silently not running - which is exactly what happened when
 * `react({ babel: { plugins: [...] } })` outlived @vitejs/plugin-react 6, whose options no longer
 * include `babel`. The build passed, every gate passed, and not one component was compiled.
 *
 * Every compiled component checks its memo cache slots against
 * `Symbol.for('react.memo_cache_sentinel')`, so that string appears in compiled chunks and in no
 * hand-written code. React's own runtime defines it as well, which is why the runtime chunk is not
 * counted: a build with the compiler switched off still has exactly that one occurrence.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BudgetResult } from './critical-path-budget.ts';

export const MEMO_CACHE_SENTINEL = 'react.memo_cache_sentinel';

export interface JsChunk {
	name: string;
	source: string;
}

/** Every built .js chunk, sorted so results cannot depend on platform readdir order. */
export function readJsChunks(assetsDir: string): JsChunk[] {
	return readdirSync(assetsDir)
		.filter((file) => file.endsWith('.js'))
		.sort()
		.map((name) => ({ name, source: readFileSync(join(assetsDir, name), 'utf-8') }));
}

/** Fails unless at least one chunk other than the React runtime carries compiled output. */
export function evaluateCompilerOutput(
	chunks: readonly JsChunk[],
	runtimeChunk: null | string,
): BudgetResult {
	const compiled = chunks.filter(
		(chunk) => chunk.name !== runtimeChunk && chunk.source.includes(MEMO_CACHE_SENTINEL),
	).length;
	if (compiled > 0) {
		return {
			lines: [{ color: 'green', text: `[OK] React Compiler output in ${compiled} chunk(s)` }],
			ok: true,
		};
	}
	return {
		lines: [
			{
				color: 'red',
				text: '[FAIL] No chunk outside the React runtime carries compiled output',
			},
			{
				color: 'yellow',
				text: '  React Compiler is not running. In frontend/vite.config.ts it runs through',
			},
			{
				color: 'yellow',
				text: '  @rolldown/plugin-babel with reactCompilerPreset(), not a react({ babel }) option.',
			},
		],
		ok: false,
	};
}
