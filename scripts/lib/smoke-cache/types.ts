/**
 * Shared shape for a smoke cache step's dependency declaration.
 *
 * Split out from `dependencies.ts` so the step maps and the collector can both depend on the type
 * without importing each other.
 */

export interface StepDependencies {
	collector?: 'prettier';
	directoryGlobs?: string[];
	/**
	 * Scan hidden directories. Bun.Glob skips anything under a dot-segment unless this is set, so a
	 * step whose inputs live in `.aidd/` collects an empty file list — and therefore a constant hash
	 * — without it. Only set it for globs rooted at a specific hidden directory: enabling it for a
	 * broad `**` scan also walks node_modules' dotfiles and is roughly ten times slower.
	 */
	dot?: boolean;
	excludes: string[];
	globs: string[];
	outputs?: string[];
}
