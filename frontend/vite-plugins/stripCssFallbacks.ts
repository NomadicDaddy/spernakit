import type { Plugin } from 'vite';

/**
 * Strips CSS browser compatibility fallback blocks from the build output.
 *
 * Tailwind CSS v4 generates `@supports` blocks for `color-mix()` and `@property`
 * fallbacks for older browsers. Since this application targets modern browsers only
 * (Chrome 111+, Firefox 128+, Safari 16.4+), these fallbacks add ~7KB of unnecessary
 * CSS to the bundle.
 *
 * Removes:
 * 1. `@layer properties{@supports ... {...}}` — old browser fallback for `@property`
 * 2. `@supports (color:color-mix(...))` — unwraps content inline, removes preceding
 *    fallback declarations that the color-mix version overrides
 * 3. `@supports (not ((-webkit-appearance:...))) or (...)` — placeholder color fallback
 * 4. Unused `@property` declarations — properties registered but never referenced
 * 5. Empty `@layer components;` declaration
 */
const stripCssFallbacksPlugin = (): Plugin => {
	return {
		apply: 'build',
		enforce: 'post',
		generateBundle(_options, bundle) {
			for (const [fileName, chunk] of Object.entries(bundle)) {
				if (chunk.type !== 'asset' || !fileName.endsWith('.css')) continue;
				if (typeof chunk.source !== 'string') continue;

				let css = chunk.source;
				css = stripLayerPropertiesFallback(css);
				css = stripSupportsBlocks(css);
				css = stripUnusedPropertyDeclarations(css);
				css = stripUnusedBaseRules(css);
				css = css.replace('@layer components;', '');
				chunk.source = css;
			}
		},
		name: 'strip-css-fallbacks',
	};
};

/**
 * Removes the `@layer properties{@supports ...{...}}` fallback block.
 * Provides fallback CSS variable initial values for browsers without `@property` support.
 */
function stripLayerPropertiesFallback(css: string): string {
	const marker = '@layer properties{';
	const start = css.indexOf(marker);
	if (start === -1) return css;

	const end = findMatchingBrace(css, start + marker.length - 1);
	if (end === -1) return css;

	return css.substring(0, start) + css.substring(end + 1);
}

/**
 * Processes all `@supports` blocks iteratively until none remain.
 * Outer blocks may contain nested `@supports` blocks that are exposed when
 * the outer block is unwrapped. Iterating handles this case.
 *
 * For each block: unwrap (keep inner content), remove preceding fallback declaration.
 * Processes from end to start to maintain correct string indices.
 */
function stripSupportsBlocks(css: string): string {
	let result = css;
	let prevLength = -1;

	// Iterate until no more @supports blocks are found (handles nested blocks)
	while (result.includes('@supports') && result.length !== prevLength) {
		prevLength = result.length;
		const blocks = collectSupportsBlocks(result);
		if (blocks.length === 0) break;

		for (let i = blocks.length - 1; i >= 0; i--) {
			const { end, inner, start } = blocks[i];
			const fallbackRange = findPrecedingFallback(result, start, inner);

			// Replace @supports block with just its inner content
			result = result.substring(0, start) + inner + result.substring(end + 1);

			// Remove the preceding fallback declaration
			if (fallbackRange) {
				result =
					result.substring(0, fallbackRange.start) + result.substring(fallbackRange.end);
			}
		}
	}

	return result;
}

/** Collects all @supports blocks with their positions and inner content. */
function collectSupportsBlocks(css: string): { end: number; inner: string; start: number }[] {
	const blocks: { end: number; inner: string; start: number }[] = [];
	let idx = 0;

	while (true) {
		const start = css.indexOf('@supports', idx);
		if (start === -1) break;

		// Find the opening brace of this @supports block
		const braceStart = css.indexOf('{', start);
		if (braceStart === -1) break;

		const end = findMatchingBrace(css, braceStart);
		if (end === -1) break;

		const inner = css.substring(braceStart + 1, end);
		blocks.push({ end, inner, start });
		idx = end + 1;
	}

	return blocks;
}

/**
 * Finds the preceding fallback declaration for a @supports block.
 * The fallback is the CSS rule immediately before the @supports block
 * with the same selector but without the modern feature (color-mix, etc.).
 *
 * Returns the range to remove, or null if no fallback found.
 */
function findPrecedingFallback(
	css: string,
	supportsStart: number,
	inner: string
): { end: number; start: number } | null {
	// Extract the selector from the inner content
	const selectorMatch = inner.match(/^([^{]+)\{/);
	if (!selectorMatch) return null;

	const selector = selectorMatch[1].trim();
	if (!selector) return null;

	// Look backwards from the @supports block for a declaration with the same selector
	const searchArea = css.substring(0, supportsStart);
	const lastIdx = searchArea.lastIndexOf(selector + '{');
	if (lastIdx === -1) return null;

	// Only match if it's close (within 300 chars — accounts for the fallback + whitespace)
	if (supportsStart - lastIdx > 300) return null;

	// Find the end of this fallback declaration
	const braceStart = searchArea.indexOf('{', lastIdx);
	if (braceStart === -1) return null;

	const braceEnd = findMatchingBrace(searchArea, braceStart);
	if (braceEnd === -1 || braceEnd >= supportsStart) return null;

	return { end: braceEnd + 1, start: lastIdx };
}

/**
 * Strips preflight/base reset rules for HTML elements not used by the application.
 * These are Tailwind CSS v4 preflight rules that normalize browser defaults for
 * specific input types. Safe to remove when the app doesn't use those input types.
 */
function stripUnusedBaseRules(css: string): string {
	// Datetime input reset rules — safe to remove when no <input type="date/time"> is used
	const datetimeRules = [
		'::-webkit-date-and-time-value{min-height:1lh;text-align:inherit}',
		'::-webkit-datetime-edit{display:inline-flex}',
		'::-webkit-datetime-edit-fields-wrapper{padding:0}',
		'::-webkit-datetime-edit{padding-block:0}',
		'::-webkit-datetime-edit-year-field{padding-block:0}',
		'::-webkit-datetime-edit-month-field{padding-block:0}',
		'::-webkit-datetime-edit-day-field{padding-block:0}',
		'::-webkit-datetime-edit-hour-field{padding-block:0}',
		'::-webkit-datetime-edit-minute-field{padding-block:0}',
		'::-webkit-datetime-edit-second-field{padding-block:0}',
		'::-webkit-datetime-edit-millisecond-field{padding-block:0}',
		'::-webkit-datetime-edit-meridiem-field{padding-block:0}',
		'::-webkit-calendar-picker-indicator{line-height:1}',
	];

	let result = css;
	for (const rule of datetimeRules) {
		result = result.replace(rule, '');
	}
	return result;
}

/**
 * Removes `@property` declarations for CSS custom properties that are never
 * referenced in the rest of the stylesheet (outside of other `@property` blocks).
 */
function stripUnusedPropertyDeclarations(css: string): string {
	// Collect all @property declarations
	const declarations: { end: number; name: string; start: number }[] = [];
	let idx = 0;
	while (true) {
		const start = css.indexOf('@property ', idx);
		if (start === -1) break;

		const nameEnd = css.indexOf('{', start);
		if (nameEnd === -1) break;

		const name = css.substring(start + '@property '.length, nameEnd).trim();
		const end = findMatchingBrace(css, nameEnd);
		if (end === -1) break;

		declarations.push({ end: end + 1, name, start });
		idx = end + 1;
	}

	// Build the CSS without @property blocks for reference checking
	let cssWithoutProps = css;
	for (let i = declarations.length - 1; i >= 0; i--) {
		const { end, start } = declarations[i];
		cssWithoutProps = cssWithoutProps.substring(0, start) + cssWithoutProps.substring(end);
	}

	// Find unused declarations and remove them (in reverse order)
	let result = css;
	for (let i = declarations.length - 1; i >= 0; i--) {
		const { end, name, start } = declarations[i];
		if (!cssWithoutProps.includes(name)) {
			result = result.substring(0, start) + result.substring(end);
		}
	}

	return result;
}

/** Finds the position of the closing brace that matches the opening brace at openPos. */
function findMatchingBrace(css: string, openPos: number): number {
	let depth = 0;
	for (let i = openPos; i < css.length; i++) {
		if (css[i] === '{') depth++;
		if (css[i] === '}') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

export { stripCssFallbacksPlugin };
