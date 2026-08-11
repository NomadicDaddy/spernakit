import type { SnapshotValue } from '@/api/runtimeConfig';

/** Turn a camelCase config key into a human-readable label. */
function formatLabel(key: string): string {
	const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isPlainObject(value: SnapshotValue): value is Record<string, SnapshotValue> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Keep the fields whose label matches, plus any nested group that still has a match inside it.
 *
 * Returns `null` when nothing in the subtree matches, which is what lets a whole section card drop
 * out of the flow rather than render as an empty box.
 */
function filterFields(
	fields: Record<string, SnapshotValue>,
	query: string,
): null | Record<string, SnapshotValue> {
	const kept: Record<string, SnapshotValue> = {};

	for (const [key, value] of Object.entries(fields)) {
		if (formatLabel(key).toLowerCase().includes(query)) {
			kept[key] = value;
			continue;
		}
		if (isPlainObject(value)) {
			const nested = filterFields(value, query);
			if (nested) kept[key] = nested;
		}
	}

	return Object.keys(kept).length > 0 ? kept : null;
}

export { filterFields, formatLabel, isPlainObject };
