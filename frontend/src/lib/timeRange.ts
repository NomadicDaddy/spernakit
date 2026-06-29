/**
 * Parses a time range string (e.g., "6h", "2d") to a number of hours.
 * Returns a default of 6 hours for unrecognized formats.
 */
export function parseTimeRangeToHours(timeRange: string): number {
	const match = /^(\d+)(h|d)$/.exec(timeRange);
	if (!match) return 6;
	const [, numStr, unit] = match;
	const num = Number(numStr);
	return unit === 'd' ? num * 24 : num;
}
