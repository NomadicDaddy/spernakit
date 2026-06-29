/**
 * Vite plugin to remove non-critical modulepreload hints from the production
 * build output. Prevents chunks that are only needed on specific lazy-loaded
 * pages (e.g., grid-layout) from being eagerly loaded on every page.
 *
 * Chunks listed in `excludeChunks` will have their `<link rel="modulepreload">`
 * removed from dist/index.html. The chunk is still available for dynamic import
 * when the lazy-loaded page is navigated to.
 */
import type { Plugin } from 'vite';

interface RemovePreloadOptions {
	chunks: string[];
}

function removeModulePreloadPlugin(options: RemovePreloadOptions): Plugin {
	const excludePatterns = options.chunks.map((c) => new RegExp(c));

	return {
		apply: 'build',
		name: 'remove-module-preload',

		transformIndexHtml(html: string): string {
			let result = html;

			for (const pattern of excludePatterns) {
				// Remove modulepreload links matching the pattern
				result = result.replace(
					new RegExp(
						`\\s*<link rel="modulepreload"[^>]*href="[^"]*${pattern.source}[^"]*"[^>]*/?>`,
						'g'
					),
					''
				);
				// Remove stylesheet links matching the pattern (CSS from lazy-loaded chunks)
				result = result.replace(
					new RegExp(
						`\\s*<link rel="stylesheet"[^>]*href="[^"]*${pattern.source}[^"]*"[^>]*/?>`,
						'g'
					),
					''
				);
			}

			return result;
		},
	};
}

export { removeModulePreloadPlugin };
