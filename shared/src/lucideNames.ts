/**
 * The single kebab-case mapping for lucide icon names, shared by the vite import-rewrite
 * plugin and the check:lucide-imports gate so the two can never disagree (Room #37805:
 * they once did, around digits - Columns3Cog and Grid2X2 loaded different files than the
 * gate verified). Splits after a digit before a capital, after a lowercase before a
 * capital, inside acronym boundaries, and between a letter and a digit, then strips a
 * trailing Icon suffix.
 */

export function lucideIconKebab(name: string): string {
	const baseName = name.endsWith('Icon') ? name.slice(0, -4) : name;
	return baseName
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
		.replace(/([a-zA-Z])([0-9])/g, '$1-$2')
		.toLowerCase();
}
