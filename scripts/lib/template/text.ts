/**
 * Small text utilities shared across template drift/sync modules.
 */

export function normalizeLineEndings(content: string): string {
	return content.replace(/\r\n/g, '\n');
}

export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip a single trailing comma so the v3.31.0 `trailingComma: all` reflow cannot masquerade as
 * removed content. Applied to BOTH sides of every membership test and never to displayed output: a
 * finding prints the line the file actually had.
 *
 * Without it the reflow drowns the signal outright — it rewrites the last line of every multi-line
 * argument list, parameter list, array and object in the tree, and each of those reads as one line
 * removed and one line added.
 */
export function normalizeLine(line: string): string {
	return line.trimEnd().replace(/,$/, '');
}

/**
 * Lines present in `before` whose normalized form appears nowhere in `after`.
 *
 * Membership is against the whole file rather than the diff hunk, so a line that merely moved is not
 * a removal. Blank lines carry no evidence, and duplicates collapse to their first occurrence.
 *
 * Two callers ask this same question of different pairs of texts: the lost-lines audit asks it of an
 * app file before and after an upgrade commit, and the override-delta report asks it of the template
 * at a target version against the app copy an override has frozen.
 */
export function findRemovedLines(before: string, after: string): string[] {
	const kept = new Set(after.split('\n').map(normalizeLine));
	const seen = new Set<string>();
	const removed: string[] = [];
	for (const line of before.split('\n')) {
		const normalized = normalizeLine(line);
		if (normalized.trim() === '' || kept.has(normalized) || seen.has(normalized)) continue;
		seen.add(normalized);
		removed.push(line.trimEnd());
	}
	return removed;
}
