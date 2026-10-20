/**
 * The shared-core group shape as the template's drift governance reads it.
 *
 * Defined here rather than imported from scripts/lib/shared-core/manifest.ts because a derived
 * app ships this module but not shared-core: a type-only import would still satisfy the app's
 * typecheck (the scripts tsconfig includes every script file), which has no manifest module to
 * resolve. The template's own manifest module is structurally identical, so the runtime cast in
 * shared-core-governed.ts stays sound (Roger 8152a9be).
 */

export interface SharedCoreGroup {
	files: { source: string; target?: string }[];
	targetRoot: string;
	targets: { model: string };
}
