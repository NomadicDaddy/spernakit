/**
 * Format a duration in milliseconds to a human-readable string.
 * Returns only the coarsest time unit (e.g., 90 min → "1 hour", not "1 hour 30 minutes").
 *
 * @param milliseconds - Duration in milliseconds (must be positive)
 * @returns Human-readable duration string (e.g., "1 hour", "24 hours", "15 minutes")
 */
function formatDuration(milliseconds: number): string {
	if (milliseconds < 1000) {
		return 'less than a second';
	}

	const seconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return days === 1 ? '1 day' : `${days} days`;
	}

	if (hours > 0) {
		return hours === 1 ? '1 hour' : `${hours} hours`;
	}

	if (minutes > 0) {
		return minutes === 1 ? '1 minute' : `${minutes} minutes`;
	}

	return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

export { formatDuration };
